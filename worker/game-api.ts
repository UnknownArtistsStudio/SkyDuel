import { cleanName, MAX_PLAYERS } from "../lib/game-core";

type GameEnv = { DB?: D1Database };
type GameContext = { waitUntil(promise: Promise<unknown>): void };

const ROOM_LIFETIME = 4 * 60 * 60 * 1000;
const SIGNAL_LIFETIME = 10 * 60 * 1000;
const SIGNAL_KINDS = new Set(["offer", "answer", "ice"]);
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};
let schemaReady: Promise<void> | undefined;
let lastCleanupAt = 0;

export async function handleGameApi(
  request: Request,
  env: GameEnv,
  context: GameContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/game/")) return null;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (!env.DB) return json({ error: "The room service is not available." }, 503);

  schemaReady ??= ensureSchema(env.DB);
  await schemaReady;
  if (Date.now() - lastCleanupAt > 5 * 60 * 1000) {
    lastCleanupAt = Date.now();
    context.waitUntil(cleanup(env.DB));
  }

  try {
    if (request.method === "POST" && url.pathname === "/api/game/create") {
      return createRoom(request, env.DB);
    }
    if (request.method === "POST" && url.pathname === "/api/game/join") {
      return joinRoom(request, env.DB);
    }
    if (request.method === "POST" && url.pathname === "/api/game/signal") {
      return sendSignal(request, env.DB);
    }
    if (request.method === "GET" && url.pathname === "/api/game/signals") {
      return receiveSignals(url, env.DB);
    }
    if (request.method === "POST" && url.pathname === "/api/game/leave") {
      return leaveRoom(request, env.DB);
    }
    if (request.method === "GET" && url.pathname === "/api/game/health") {
      return json({ ok: true });
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("Game room request failed", error);
    return json({ error: "The tower could not complete that request." }, 500);
  }
}

async function createRoom(request: Request, db: D1Database) {
  const body = await readJson(request);
  const name = cleanName(String(body.name ?? "PILOT"));
  const now = Date.now();
  const peerId = crypto.randomUUID();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = roomCode();
    const result = await db
      .prepare(
        "INSERT OR IGNORE INTO game_rooms (code, host_peer_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
      )
      .bind(code, peerId, now, now)
      .run();
    if ((result.meta.changes ?? 0) === 0) continue;
    await db
      .prepare(
        "INSERT INTO room_players (peer_id, room_code, name, joined_at) VALUES (?, ?, ?, ?)",
      )
      .bind(peerId, code, name, now)
      .run();
    return json({ code, peerId, hostPeerId: peerId, isHost: true, name });
  }
  return json({ error: "Could not open a room. Please try again." }, 503);
}

async function joinRoom(request: Request, db: D1Database) {
  const body = await readJson(request);
  const code = cleanCode(String(body.code ?? ""));
  const name = cleanName(String(body.name ?? "PILOT"));
  if (!code) return json({ error: "Enter a four-letter room code." }, 400);

  const room = await db
    .prepare("SELECT host_peer_id AS hostPeerId, last_seen_at AS lastSeenAt FROM game_rooms WHERE code = ?")
    .bind(code)
    .first<{ hostPeerId: string; lastSeenAt: number }>();
  if (!room || room.lastSeenAt < Date.now() - ROOM_LIFETIME) {
    return json({ error: "That room is no longer in the sky." }, 404);
  }
  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM room_players WHERE room_code = ?")
    .bind(code)
    .first<{ count: number }>();
  if ((count?.count ?? 0) >= MAX_PLAYERS) return json({ error: "That room already has six pilots." }, 409);

  const peerId = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db
      .prepare("INSERT INTO room_players (peer_id, room_code, name, joined_at) VALUES (?, ?, ?, ?)")
      .bind(peerId, code, name, now),
    db
      .prepare("UPDATE game_rooms SET last_seen_at = ? WHERE code = ?")
      .bind(now, code),
    db
      .prepare(
        "INSERT INTO room_signals (room_code, target_peer_id, sender_peer_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(code, room.hostPeerId, peerId, "peer-joined", JSON.stringify({ name }), now),
  ]);
  return json({ code, peerId, hostPeerId: room.hostPeerId, isHost: false, name });
}

async function sendSignal(request: Request, db: D1Database) {
  const body = await readJson(request);
  const code = cleanCode(String(body.code ?? ""));
  const senderPeerId = String(body.senderPeerId ?? "");
  const targetPeerId = String(body.targetPeerId ?? "");
  const kind = String(body.kind ?? "");
  const payload = JSON.stringify(body.payload ?? null);
  if (!code || !senderPeerId || !targetPeerId || !SIGNAL_KINDS.has(kind) || payload.length > 16_000) {
    return json({ error: "Invalid signal." }, 400);
  }

  const membership = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM room_players WHERE room_code = ? AND peer_id IN (?, ?)",
    )
    .bind(code, senderPeerId, targetPeerId)
    .first<{ count: number }>();
  if ((membership?.count ?? 0) !== 2) return json({ error: "Pilot is not in that room." }, 403);

  await db
    .prepare(
      "INSERT INTO room_signals (room_code, target_peer_id, sender_peer_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(code, targetPeerId, senderPeerId, kind, payload, Date.now())
    .run();
  return json({ ok: true });
}

async function receiveSignals(url: URL, db: D1Database) {
  const code = cleanCode(url.searchParams.get("code") ?? "");
  const peerId = url.searchParams.get("peer") ?? "";
  const after = Math.max(0, Number(url.searchParams.get("after") ?? 0) || 0);
  if (!code || !peerId) return json({ error: "Room and pilot are required." }, 400);

  const player = await db
    .prepare("SELECT 1 AS present FROM room_players WHERE room_code = ? AND peer_id = ?")
    .bind(code, peerId)
    .first();
  if (!player) return json({ error: "You are no longer in that room." }, 403);

  const result = await db
    .prepare(
      "SELECT id, sender_peer_id AS senderPeerId, kind, payload FROM room_signals WHERE room_code = ? AND target_peer_id = ? AND id > ? ORDER BY id ASC LIMIT 100",
    )
    .bind(code, peerId, after)
    .all<{ id: number; senderPeerId: string; kind: string; payload: string }>();
  const signals = result.results.map((signal) => ({
    ...signal,
    payload: JSON.parse(signal.payload),
  }));
  return json({ signals });
}

async function leaveRoom(request: Request, db: D1Database) {
  const body = await readJson(request);
  const code = cleanCode(String(body.code ?? ""));
  const peerId = String(body.peerId ?? "");
  if (!code || !peerId) return json({ ok: true });

  const room = await db
    .prepare("SELECT host_peer_id AS hostPeerId FROM game_rooms WHERE code = ?")
    .bind(code)
    .first<{ hostPeerId: string }>();
  if (!room) return json({ ok: true });

  if (room.hostPeerId === peerId) {
    await db.batch([
      db.prepare("DELETE FROM room_signals WHERE room_code = ?").bind(code),
      db.prepare("DELETE FROM room_players WHERE room_code = ?").bind(code),
      db.prepare("DELETE FROM game_rooms WHERE code = ?").bind(code),
    ]);
  } else {
    await db.batch([
      db.prepare("DELETE FROM room_players WHERE room_code = ? AND peer_id = ?").bind(code, peerId),
      db
        .prepare(
          "INSERT INTO room_signals (room_code, target_peer_id, sender_peer_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(code, room.hostPeerId, peerId, "peer-left", "{}", Date.now()),
    ]);
  }
  return json({ ok: true });
}

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS game_rooms (code TEXT PRIMARY KEY NOT NULL, host_peer_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS room_players (peer_id TEXT PRIMARY KEY NOT NULL, room_code TEXT NOT NULL, name TEXT NOT NULL, joined_at INTEGER NOT NULL)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS room_signals (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, room_code TEXT NOT NULL, target_peer_id TEXT NOT NULL, sender_peer_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL)",
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_room_players_room_code ON room_players (room_code)"),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_room_signals_target_after ON room_signals (room_code, target_peer_id, id)",
    ),
  ]);
}

async function cleanup(db: D1Database) {
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM room_signals WHERE created_at < ?").bind(now - SIGNAL_LIFETIME),
    db.prepare(
      "DELETE FROM room_players WHERE room_code IN (SELECT code FROM game_rooms WHERE last_seen_at < ?)",
    ).bind(now - ROOM_LIFETIME),
    db.prepare("DELETE FROM game_rooms WHERE last_seen_at < ?").bind(now - ROOM_LIFETIME),
  ]);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return {};
  return (await request.json()) as Record<string, unknown>;
}

function roomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function cleanCode(code: string): string {
  const cleaned = code.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  return cleaned.length === 4 ? cleaned : "";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS_HEADERS,
    },
  });
}
