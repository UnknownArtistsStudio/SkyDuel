"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addPlayer,
  botInput,
  cleanName,
  createGame,
  removePlayer,
  stepGame,
  type GameState,
  type PilotInput,
} from "../../lib/game-core";
import { PeerRoom } from "./peer-room";
import { pilotReadout, renderGame } from "./render-game";

type Screen = "menu" | "join" | "connecting" | "playing";
type Mode = "practice" | "host" | "guest" | null;
type NetworkMessage =
  | { type: "hello"; name: string }
  | { type: "input"; input: PilotInput }
  | { type: "welcome"; playerId: string; state: GameState }
  | { type: "snapshot"; state: GameState };

const neutralInput: PilotInput = { turn: 0, fire: false };

export function SkyDuel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(makeAttractGame());
  const roomRef = useRef<PeerRoom | null>(null);
  const localIdRef = useRef("");
  const inputRef = useRef<PilotInput>({ ...neutralInput });
  const remoteInputsRef = useRef<Record<string, PilotInput>>({});
  const lastSoundEventRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  const [screen, setScreen] = useState<Screen>("menu");
  const [mode, setMode] = useState<Mode>(null);
  const [callsign, setCallsign] = useState("ACE");
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [message, setMessage] = useState("Climb gently. Keep your airspeed.");
  const [error, setError] = useState("");
  const [hud, setHud] = useState<{
    readout: ReturnType<typeof pilotReadout>;
    pilots: Array<{ id: string; name: string; color: string; score: number }>;
  }>({
    readout: { speed: 0, altitude: 0, stalled: false, alive: false, respawnIn: 0 },
    pilots: [],
  });
  const [copied, setCopied] = useState(false);

  const { readout, pilots } = hud;

  const setupRoom = useCallback((room: PeerRoom, role: "host" | "guest") => {
    room.onStatus = (status) => setMessage(status);
    room.onPeerOpen = (peerId, name) => {
      if (role !== "host") return;
      if (!gameRef.current.players.some((player) => player.id === peerId)) {
        addPlayer(gameRef.current, peerId, name ?? "PILOT");
      }
      room.sendTo(peerId, {
        type: "welcome",
        playerId: peerId,
        state: gameRef.current,
      } satisfies NetworkMessage);
      setMessage(`${cleanName(name ?? "PILOT")} joined the formation.`);
    };
    room.onPeerClose = (peerId) => {
      if (role === "host") {
        removePlayer(gameRef.current, peerId);
        delete remoteInputsRef.current[peerId];
        setMessage("A pilot left the formation.");
      } else if (peerId === room.info.hostPeerId) {
        setError("The room closed when its lead pilot left.");
        setScreen("menu");
        setMode(null);
        gameRef.current = makeAttractGame();
      }
    };
    room.onMessage = (peerId, rawMessage) => {
      const incoming = rawMessage as NetworkMessage;
      if (!incoming || typeof incoming !== "object" || !("type" in incoming)) return;
      if (role === "host" && incoming.type === "input") {
        remoteInputsRef.current[peerId] = sanitizeInput(incoming.input);
      }
      if (role === "guest" && incoming.type === "welcome") {
        localIdRef.current = incoming.playerId;
        gameRef.current = incoming.state;
        setMode("guest");
        setScreen("playing");
        setMessage("Connected. Watch your airspeed.");
      }
      if (role === "guest" && incoming.type === "snapshot") {
        gameRef.current = incoming.state;
      }
    };
  }, []);

  const beginPractice = useCallback(() => {
    void roomRef.current?.close();
    roomRef.current = null;
    const state = createGame();
    const playerId = `pilot-${crypto.randomUUID()}`;
    addPlayer(state, playerId, cleanName(callsign));
    addPlayer(state, "practice-rival", "RIVAL");
    gameRef.current = state;
    localIdRef.current = playerId;
    remoteInputsRef.current = {};
    inputRef.current = { ...neutralInput };
    setMode("practice");
    setRoomCode("");
    setMessage("Practice duel · first to five is bragging rights.");
    setError("");
    setScreen("playing");
    wakeAudio(audioRef);
  }, [callsign]);

  const createRoom = useCallback(async () => {
    setError("");
    setMessage("Calling the tower…");
    setScreen("connecting");
    wakeAudio(audioRef);
    try {
      const room = await PeerRoom.create(cleanName(callsign));
      const state = createGame();
      addPlayer(state, room.info.peerId, room.info.name);
      gameRef.current = state;
      localIdRef.current = room.info.peerId;
      roomRef.current = room;
      remoteInputsRef.current = {};
      setupRoom(room, "host");
      setMode("host");
      setRoomCode(room.info.code);
      setMessage("Room open. Share the four-letter code.");
      setScreen("playing");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The tower did not answer.");
      setScreen("menu");
    }
  }, [callsign, setupRoom]);

  const joinRoom = useCallback(async () => {
    const code = joinCode.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    if (code.length !== 4) {
      setError("Enter the four-letter room code.");
      return;
    }
    setError("");
    setMessage("Looking for that formation…");
    setScreen("connecting");
    wakeAudio(audioRef);
    try {
      const room = await PeerRoom.join(code, cleanName(callsign));
      roomRef.current = room;
      localIdRef.current = room.info.peerId;
      setupRoom(room, "guest");
      setRoomCode(room.info.code);
      setMode("guest");
      setMessage("Negotiating a direct connection to the lead pilot…");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That room could not be joined.");
      setScreen("join");
    }
  }, [callsign, joinCode, setupRoom]);

  const leaveGame = useCallback(() => {
    void roomRef.current?.close();
    roomRef.current = null;
    gameRef.current = makeAttractGame();
    localIdRef.current = "";
    inputRef.current = { ...neutralInput };
    remoteInputsRef.current = {};
    setMode(null);
    setRoomCode("");
    setMessage("Climb gently. Keep your airspeed.");
    setScreen("menu");
  }, []);

  useEffect(() => {
    const keys = new Set<string>();
    const refreshInput = () => {
      const left = ["a", "arrowleft", "w", "arrowup"].some((key) => keys.has(key));
      const right = ["d", "arrowright", "s", "arrowdown"].some((key) => keys.has(key));
      inputRef.current = {
        turn: left === right ? 0 : left ? -1 : 1,
        fire: keys.has(" ") || keys.has("enter"),
      };
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["a", "d", "w", "s", "arrowleft", "arrowright", "arrowup", "arrowdown", " ", "enter"].includes(key)) {
        if (screen === "playing") event.preventDefault();
        keys.add(key);
        refreshInput();
      }
      if (key === "escape" && screen === "playing") leaveGame();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
      refreshInput();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", () => keys.clear());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [leaveGame, screen]);

  useEffect(() => {
    let animationFrame = 0;
    let previousTime = performance.now();
    let lastBroadcast = 0;
    let lastHud = 0;
    const frame = (time: number) => {
      const dt = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      const state = gameRef.current;

      if (screen !== "playing") {
        const inputs: Record<string, PilotInput> = {};
        for (const plane of state.players) inputs[plane.id] = botInput(state, plane.id);
        stepGame(state, inputs, dt);
      } else if (mode === "practice") {
        stepGame(state, {
          [localIdRef.current]: inputRef.current,
          "practice-rival": botInput(state, "practice-rival"),
        }, dt);
      } else if (mode === "host") {
        stepGame(state, {
          ...remoteInputsRef.current,
          [localIdRef.current]: inputRef.current,
        }, dt);
        if (time - lastBroadcast > 66) {
          roomRef.current?.broadcast({ type: "snapshot", state } satisfies NetworkMessage);
          lastBroadcast = time;
        }
      } else if (mode === "guest" && time - lastBroadcast > 45) {
        roomRef.current?.sendToHost({ type: "input", input: inputRef.current } satisfies NetworkMessage);
        lastBroadcast = time;
      }

      playNewSounds(state, lastSoundEventRef, audioRef);
      if (canvasRef.current) renderGame(canvasRef.current, state, localIdRef.current, time);
      if (time - lastHud > 100) {
        setHud({
          readout: pilotReadout(state, localIdRef.current),
          pilots: state.players
            .map(({ id, name, color, score }) => ({ id, name, color, score }))
            .sort((a, b) => b.score - a.score),
        });
        lastHud = time;
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [mode, screen]);

  useEffect(() => () => void roomRef.current?.close(), []);

  const touchControl = (field: "left" | "right" | "fire", pressed: boolean) => {
    if (field === "fire") inputRef.current = { ...inputRef.current, fire: pressed };
    if (field === "left") inputRef.current = { ...inputRef.current, turn: pressed ? -1 : 0 };
    if (field === "right") inputRef.current = { ...inputRef.current, turn: pressed ? 1 : 0 };
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="site-shell">
      <header className="masthead">
        <div className="brand-lockup" aria-label="Sky Duel">
          <span className="brand-kicker">BROWSER AIR COMBAT · 2–6 PILOTS</span>
          <h1>SKY <i>DUEL</i></h1>
        </div>
        <p className="masthead-note">One sky. Two controls. No upgrades.</p>
      </header>

      <section className="game-cabinet" aria-label="Sky Duel game">
        <div className="cabinet-topline">
          <span>{screen === "playing" ? modeLabel(mode) : "AIRFIELD 01"}</span>
          <span className="status-copy">{message}</span>
          <span>{roomCode ? `ROOM ${roomCode}` : "CLEAR SKIES"}</span>
        </div>

        <div className="screen-bezel">
          <canvas ref={canvasRef} className="game-canvas" aria-label="Biplane dogfight arena" />

          {screen === "playing" && (
            <>
              <div className="scoreboard" aria-label="Pilot scores">
                {pilots.map((pilot) => (
                  <div className="score-row" key={pilot.id} style={{ "--pilot": pilot.color } as React.CSSProperties}>
                    <span className="pilot-dot" />
                    <span className="pilot-name">{pilot.name}</span>
                    <strong>{pilot.score}</strong>
                  </div>
                ))}
              </div>

              {roomCode && (
                <button className="room-ticket" type="button" onClick={copyCode} aria-label="Copy room code">
                  <span>{copied ? "COPIED" : "ROOM CODE"}</span>
                  <strong>{roomCode}</strong>
                </button>
              )}

              <div className={`flight-readout ${readout.stalled ? "is-stalled" : ""}`}>
                <span>AIRSPEED <strong>{readout.speed}</strong></span>
                <span>{readout.stalled ? "STALL · NOSE DOWN" : "LIFT GOOD"}</span>
                <span>ALT <strong>{readout.altitude}</strong></span>
              </div>

              {!readout.alive && (
                <div className="respawn-card">
                  <span>SHOT DOWN</span>
                  <strong>BACK IN {Math.ceil(readout.respawnIn)}</strong>
                </div>
              )}

              <div className="touch-controls" aria-label="Touch flight controls">
                <button
                  type="button"
                  aria-label="Rotate left"
                  onPointerDown={() => touchControl("left", true)}
                  onPointerUp={() => touchControl("left", false)}
                  onPointerCancel={() => touchControl("left", false)}
                >
                  ↶
                </button>
                <button
                  className="touch-fire"
                  type="button"
                  aria-label="Fire"
                  onPointerDown={() => touchControl("fire", true)}
                  onPointerUp={() => touchControl("fire", false)}
                  onPointerCancel={() => touchControl("fire", false)}
                >
                  FIRE
                </button>
                <button
                  type="button"
                  aria-label="Rotate right"
                  onPointerDown={() => touchControl("right", true)}
                  onPointerUp={() => touchControl("right", false)}
                  onPointerCancel={() => touchControl("right", false)}
                >
                  ↷
                </button>
              </div>
            </>
          )}

          {screen !== "playing" && (
            <div className="hangar-overlay">
              {screen === "menu" && (
                <div className="menu-card">
                  <p className="menu-eyebrow">THE OLD RULES STILL APPLY</p>
                  <h2>Keep your speed.<br />Lead your shot.</h2>
                  <p className="menu-intro">
                    Constant engine power, one forward gun, and no magic recovery. Pull too hard and gravity wins.
                  </p>
                  <label className="callsign-field">
                    <span>CALL SIGN</span>
                    <input
                      value={callsign}
                      maxLength={12}
                      onChange={(event) => setCallsign(event.target.value)}
                      onBlur={() => setCallsign(cleanName(callsign))}
                      autoComplete="off"
                    />
                  </label>
                  <div className="menu-actions">
                    <button className="button-primary" type="button" onClick={beginPractice}>PRACTICE DUEL</button>
                    <button type="button" onClick={createRoom}>CREATE PRIVATE ROOM</button>
                    <button type="button" onClick={() => { setError(""); setScreen("join"); }}>JOIN A ROOM</button>
                  </div>
                  {error && <p className="form-error" role="alert">{error}</p>}
                </div>
              )}

              {screen === "join" && (
                <div className="menu-card join-card">
                  <p className="menu-eyebrow">JOIN A FORMATION</p>
                  <h2>Room code</h2>
                  <p className="menu-intro">Ask the lead pilot for the four letters shown over their airfield.</p>
                  <label className="callsign-field room-code-field">
                    <span>FOUR LETTERS</span>
                    <input
                      value={joinCode}
                      maxLength={4}
                      placeholder="WING"
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                      onKeyDown={(event) => { if (event.key === "Enter") void joinRoom(); }}
                    />
                  </label>
                  <div className="menu-actions two-up">
                    <button className="button-primary" type="button" onClick={joinRoom}>JOIN ROOM</button>
                    <button type="button" onClick={() => setScreen("menu")}>BACK</button>
                  </div>
                  {error && <p className="form-error" role="alert">{error}</p>}
                </div>
              )}

              {screen === "connecting" && (
                <div className="menu-card connecting-card" role="status">
                  <span className="radar-sweep" />
                  <p className="menu-eyebrow">RADIO CHECK</p>
                  <h2>{message}</h2>
                  <button type="button" onClick={leaveGame}>CANCEL</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="cabinet-controls">
          <div><kbd>A</kbd><kbd>D</kbd><span>ROTATE</span></div>
          <div><kbd>SPACE</kbd><span>FIRE</span></div>
          <div className="stall-note"><span>STALL RECOVERY</span><strong>Point the nose down. Rebuild speed. Ease back.</strong></div>
          {screen === "playing" && <button type="button" onClick={leaveGame}>LEAVE AIRFIELD</button>}
        </div>
      </section>

      <footer className="site-footer">
        <p>An original browser homage to early console dogfights.</p>
        <p>Private rooms connect pilots directly. The lead pilot keeps the match in sync.</p>
      </footer>
    </main>
  );
}

function makeAttractGame() {
  const state = createGame();
  addPlayer(state, "attract-one", "YELLOW");
  addPlayer(state, "attract-two", "RED");
  return state;
}

function sanitizeInput(input: PilotInput): PilotInput {
  return {
    turn: input?.turn === -1 || input?.turn === 1 ? input.turn : 0,
    fire: Boolean(input?.fire),
  };
}

function modeLabel(mode: Mode) {
  if (mode === "practice") return "PRACTICE DUEL";
  if (mode === "host") return "LEAD PILOT";
  if (mode === "guest") return "FORMATION PILOT";
  return "AIRFIELD 01";
}

function wakeAudio(audioRef: React.MutableRefObject<AudioContext | null>) {
  if (typeof window === "undefined" || !("AudioContext" in window)) return;
  audioRef.current ??= new AudioContext();
  void audioRef.current.resume();
}

function playNewSounds(
  state: GameState,
  lastEventRef: React.MutableRefObject<number>,
  audioRef: React.MutableRefObject<AudioContext | null>,
) {
  const context = audioRef.current;
  if (!context) return;
  for (const event of state.events) {
    if (event.id <= lastEventRef.current) continue;
    lastEventRef.current = event.id;
    if (event.type === "shot" && event.playerId === state.players.find((p) => p.id === event.playerId)?.id) {
      tone(context, 180, 0.035, "square", 0.018);
    }
    if (event.type === "crash") tone(context, 64, 0.22, "sawtooth", 0.055);
    if (event.type === "stall") tone(context, 120, 0.12, "triangle", 0.025);
  }
}

function tone(context: AudioContext, frequency: number, duration: number, type: OscillatorType, volume: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * 0.55), context.currentTime + duration);
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}
