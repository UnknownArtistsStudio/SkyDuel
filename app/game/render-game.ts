import {
  groundY,
  planeSpeed,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type GameState,
  type Plane,
} from "../../lib/game-core";
import { wrapChatText } from "../../lib/chat";

type Burst = { x: number; y: number; born: number; color: string };
export type ChatBubble = { playerId: string; text: string; expiresAt: number };

const bursts = new Map<number, Burst>();
let lastEventId = 0;

export function renderGame(
  canvas: HTMLCanvasElement,
  state: GameState,
  viewerId: string,
  frameTime: number,
  chatBubbles: readonly ChatBubble[] = [],
) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const displayWidth = Math.max(1, canvas.clientWidth);
  const displayHeight = Math.max(1, canvas.clientHeight);
  const pixelWidth = Math.floor(displayWidth * ratio);
  const pixelHeight = Math.floor(displayHeight * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelWidth / WORLD_WIDTH, 0, 0, pixelHeight / WORLD_HEIGHT, 0, 0);
  context.imageSmoothingEnabled = false;

  drawSky(context);
  drawClouds(context, state.time);
  drawTerrain(context);
  drawBullets(context, state);
  captureBursts(state, frameTime);
  drawBursts(context, frameTime);
  for (const plane of state.players) {
    if (plane.alive) drawPlane(context, plane, plane.id === viewerId, state.time);
  }
  drawSpeechBubbles(context, state, chatBubbles, frameTime);
}

function drawSky(context: CanvasRenderingContext2D) {
  context.fillStyle = "#9b90f4";
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}

function drawClouds(context: CanvasRenderingContext2D, time: number) {
  const drift = (time * 1.2) % (WORLD_WIDTH + 260);
  drawPixelCloud(context, (155 + drift) % (WORLD_WIDTH + 260) - 130, 105, 1.2);
  drawPixelCloud(context, (905 + drift * 0.72) % (WORLD_WIDTH + 260) - 130, 205, 1);
}

function drawPixelCloud(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const unit = 10 * size;
  context.fillStyle = "#fffdf8";
  context.fillRect(x, y, unit * 8, unit * 4);
  context.fillRect(x + unit, y - unit, unit * 6, unit * 6);
  context.fillRect(x + unit * 2, y - unit * 2, unit * 4, unit * 8);
  context.fillRect(x - unit, y + unit, unit * 10, unit * 2);
}

function drawTerrain(context: CanvasRenderingContext2D) {
  const ground = groundY(0);
  context.fillStyle = "#f2a913";
  context.fillRect(0, ground, WORLD_WIDTH, WORLD_HEIGHT - ground);
  context.fillStyle = "#17131f";
  context.fillRect(0, ground, WORLD_WIDTH, 7);
  drawTower(context, WORLD_WIDTH / 2, ground);
}

function drawTower(context: CanvasRenderingContext2D, x: number, ground: number) {
  context.fillStyle = "#17131f";
  context.fillRect(x - 8, ground - 92, 16, 92);
  context.fillRect(x - 16, ground - 92, 32, 7);
  context.fillRect(x - 14, ground - 124, 28, 32);
  context.fillRect(x - 20, ground - 130, 40, 7);
  context.fillStyle = "#9b90f4";
  context.fillRect(x - 8, ground - 117, 16, 11);
  context.fillRect(x - 3, ground - 80, 6, 16);
  context.fillRect(x - 3, ground - 48, 6, 16);
}

function drawBullets(context: CanvasRenderingContext2D, state: GameState) {
  context.fillStyle = "#fffdf8";
  for (const bullet of state.bullets) {
    context.fillRect(Math.round(bullet.x) - 4, Math.round(bullet.y) - 2, 8, 4);
  }
}

function drawPlane(context: CanvasRenderingContext2D, plane: Plane, isViewer: boolean, time: number) {
  context.save();
  context.translate(plane.x, plane.y);
  context.rotate(plane.angle);
  context.scale(1, plane.liftSide);
  if (plane.invulnerableFor > 0 && Math.floor(time * 8) % 2 === 0) context.globalAlpha = 0.35;
  context.fillStyle = plane.color;
  context.fillRect(-18, -3, 34, 7);
  context.fillRect(-9, -9, 21, 4);
  context.fillRect(-10, 7, 22, 4);
  context.fillRect(-19, -8, 6, 6);
  context.fillRect(14, -1, 8, 3);
  context.fillStyle = "#17131f";
  context.fillRect(-2, -6, 6, 4);
  context.fillRect(-4, -5, 2, 12);
  context.fillRect(8, -5, 2, 12);
  context.fillStyle = "#fffdf8";
  const propeller = Math.floor(time * 16) % 2 === 0 ? -8 : -4;
  context.fillRect(22, propeller, 2, 12);
  context.restore();

  context.save();
  context.textAlign = "center";
  context.font = gameFont(9);
  context.fillStyle = plane.color;
  context.fillText(plane.name.toUpperCase(), plane.x, plane.y - 23);
  if (isViewer) {
    context.fillStyle = "#fffdf8";
    context.fillRect(plane.x - 3, plane.y + 18, 6, 6);
  }
  if (plane.stalled) {
    context.font = gameFont(9);
    context.fillStyle = "#fffdf8";
    context.fillText("STALL", plane.x, plane.y - 38);
  }
  context.restore();
}

function drawSpeechBubbles(
  context: CanvasRenderingContext2D,
  state: GameState,
  chatBubbles: readonly ChatBubble[],
  frameTime: number,
) {
  const active = chatBubbles
    .filter((bubble) => bubble.expiresAt > frameTime)
    .sort((a, b) => {
      const aPlane = state.players.find((plane) => plane.id === a.playerId);
      const bPlane = state.players.find((plane) => plane.id === b.playerId);
      return (aPlane?.y ?? 0) - (bPlane?.y ?? 0);
    });

  for (const bubble of active) {
    const plane = state.players.find((candidate) => candidate.id === bubble.playerId);
    if (!plane?.alive) continue;
    const lines = wrapChatText(bubble.text);
    if (!lines.length) continue;

    context.save();
    context.font = gameFont(9);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.globalAlpha = Math.min(1, Math.max(0, (bubble.expiresAt - frameTime) / 600));

    const width = Math.min(
      224,
      Math.max(64, ...lines.map((line) => Math.ceil(context.measureText(line).width) + 20)),
    );
    const height = lines.length * 14 + 12;
    const abovePlane = plane.y > height + 64;
    const x = clamp(plane.x - width / 2, 7, WORLD_WIDTH - width - 7);
    const y = abovePlane
      ? plane.y - height - 45
      : Math.min(WORLD_HEIGHT - height - 8, plane.y + 34);
    const tailX = clamp(plane.x, x + 12, x + width - 12);

    context.fillStyle = "#17131f";
    context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
    context.fillStyle = "#fffdf8";
    context.fillRect(Math.round(x + 3), Math.round(y + 3), Math.round(width - 6), Math.round(height - 6));

    if (abovePlane) {
      context.fillStyle = "#17131f";
      context.fillRect(Math.round(tailX - 5), Math.round(y + height), 10, 8);
      context.fillStyle = "#fffdf8";
      context.fillRect(Math.round(tailX - 2), Math.round(y + height), 4, 4);
    } else {
      context.fillStyle = "#17131f";
      context.fillRect(Math.round(tailX - 5), Math.round(y - 8), 10, 8);
      context.fillStyle = "#fffdf8";
      context.fillRect(Math.round(tailX - 2), Math.round(y - 4), 4, 4);
    }

    context.fillStyle = "#17131f";
    lines.forEach((line, index) => {
      const lineY = y + 9 + index * 14;
      context.fillText(line, x + width / 2, lineY);
    });
    context.restore();
  }
}

function captureBursts(state: GameState, frameTime: number) {
  for (const event of state.events) {
    if (event.id <= lastEventId) continue;
    lastEventId = Math.max(lastEventId, event.id);
    if (event.type !== "crash") continue;
    const plane = state.players.find((candidate) => candidate.id === event.playerId);
    if (plane) bursts.set(event.id, { x: plane.x, y: plane.y, born: frameTime, color: plane.color });
  }
}

function drawBursts(context: CanvasRenderingContext2D, frameTime: number) {
  for (const [id, burst] of bursts) {
    const age = (frameTime - burst.born) / 1000;
    if (age > 0.8) {
      bursts.delete(id);
      continue;
    }
    const progress = age / 0.8;
    context.save();
    context.translate(burst.x, burst.y);
    context.globalAlpha = 1 - progress;
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const radius = 5 + progress * (18 + (index % 2) * 10);
      context.fillStyle = index % 2 === 0 ? "#f2a913" : burst.color;
      context.fillRect(Math.round(Math.cos(angle) * radius) - 4, Math.round(Math.sin(angle) * radius) - 4, 8, 8);
    }
    context.restore();
  }
}

function gameFont(size: number) {
  const family = getComputedStyle(document.body).fontFamily;
  return `${size}px ${family}`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function pilotReadout(state: GameState, pilotId: string) {
  const plane = state.players.find((candidate) => candidate.id === pilotId);
  if (!plane) {
    return { speed: 0, altitude: 0, stalled: false, protected: false, alive: false, respawnIn: 0 };
  }
  return {
    speed: Math.round(planeSpeed(plane)),
    altitude: Math.max(0, Math.round(groundY(plane.x) - plane.y)),
    stalled: plane.stalled,
    protected: plane.invulnerableFor > 0,
    alive: plane.alive,
    respawnIn: Math.max(0, plane.respawnIn),
  };
}
