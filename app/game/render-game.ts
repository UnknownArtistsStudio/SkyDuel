import {
  bombPowerUpPosition,
  CLOUD_COUNT,
  cloudPosition,
  groundY,
  planeInCloud,
  planeSpeed,
  ROLL_DURATION,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type GameState,
  type Plane,
} from "../../lib/game-core";
import { wrapChatText } from "../../lib/chat";

type Burst = {
  x: number;
  y: number;
  born: number;
  color: string;
  kind: "plane" | "bomb" | "missile" | "pilot" | "pilot-bomb" | "vapor" | "splash";
};
type MissileTrailPixel = { x: number; y: number; born: number };
export type ChatBubble = { playerId: string; text: string; expiresAt: number };

const bursts = new Map<number, Burst>();
const missileTrails = new Map<string, MissileTrailPixel[]>();
let lastEventId = 0;

export function resetRendererEffects() {
  lastEventId = 0;
  bursts.clear();
  missileTrails.clear();
}

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
  drawBombPowerUps(context, state);
  drawRevengePowerUp(context, state);
  drawTerrain(context, state);
  drawBombs(context, state);
  drawMissiles(context, state, frameTime);
  drawBullets(context, state);
  drawPilotBullets(context, state);
  captureBursts(state, frameTime);
  drawBursts(context, frameTime);
  for (const plane of state.players) {
    if (plane.alive && !planeInCloud(state, plane)) drawPlane(context, plane, plane.id === viewerId, state.time);
  }
  drawGroundPilots(context, state, viewerId);
  drawSpeechBubbles(context, state, chatBubbles, frameTime);
}

function drawSky(context: CanvasRenderingContext2D) {
  context.fillStyle = "#9b90f4";
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}

function drawClouds(context: CanvasRenderingContext2D, time: number) {
  for (let index = 0; index < CLOUD_COUNT; index += 1) {
    const cloud = cloudPosition(time, index);
    drawPixelCloud(context, cloud.x, cloud.y, cloud.size);
  }
}

function drawPixelCloud(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const unit = 10 * size;
  context.fillStyle = "#fffdf8";
  context.fillRect(x, y, unit * 8, unit * 4);
  context.fillRect(x + unit, y - unit, unit * 6, unit * 6);
  context.fillRect(x + unit * 2, y - unit * 2, unit * 4, unit * 8);
  context.fillRect(x - unit, y + unit, unit * 10, unit * 2);
}

function drawTerrain(context: CanvasRenderingContext2D, state: GameState) {
  const fill = state.landscape === "tower" ? "#f2a913" : state.landscape === "sea" ? "#2478cf" : "#17131f";
  for (let x = 0; x < WORLD_WIDTH; x += 12) {
    const surface = groundY(x + 6, state.landscape);
    context.fillStyle = fill;
    context.fillRect(x, surface, 12, WORLD_HEIGHT - surface);
    if (state.landscape !== "sea") {
      context.fillStyle = state.landscape === "mountains" ? "#f2a913" : "#17131f";
      context.fillRect(x, surface, 12, 6);
    }
  }
  if (state.landscape === "sea") {
    context.fillStyle = "#fffdf8";
    const drift = Math.floor(state.time * 7) % 48;
    for (let x = -48 + drift; x < WORLD_WIDTH; x += 48) {
      const offset = Math.floor((x - drift) / 48) % 2 === 0 ? 0 : 5;
      context.fillRect(x, 601 + offset, 24, 4);
      context.fillRect(x + 8, 597 + offset, 12, 4);
    }
    return;
  }
  if (state.landscape === "tower") drawTower(context, WORLD_WIDTH / 2, groundY(WORLD_WIDTH / 2, "tower"));
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

function drawPilotBullets(context: CanvasRenderingContext2D, state: GameState) {
  context.fillStyle = "#fffdf8";
  for (const bullet of state.pilotBullets) {
    context.fillRect(Math.round(bullet.x) - 1, Math.round(bullet.y) - 1, 2, 2);
  }
}

function drawRevengePowerUp(context: CanvasRenderingContext2D, state: GameState) {
  const powerUp = state.revengePowerUp;
  if (!powerUp) return;
  const flash = Math.floor(state.time * 5) % 2 === 0;
  context.save();
  context.translate(Math.round(powerUp.x), Math.round(powerUp.y));
  context.fillStyle = flash ? "#fffdf8" : "#f2a913";
  context.fillRect(-18, -16, 36, 7);
  context.fillRect(-13, -22, 26, 7);
  context.fillRect(-6, -27, 12, 6);
  context.fillStyle = "#17131f";
  context.fillRect(-13, -9, 3, 17);
  context.fillRect(10, -9, 3, 17);
  context.fillRect(-6, 7, 12, 13);
  context.font = gameFont(8);
  context.textAlign = "center";
  context.fillText("REVENGE", 0, 34);
  context.restore();
}

function drawGroundPilots(context: CanvasRenderingContext2D, state: GameState, viewerId: string) {
  for (const pilot of state.groundPilots) {
    const owner = state.players.find((plane) => plane.id === pilot.ownerId);
    const color = owner?.color ?? "#f02b10";
    const sinkDepth = pilot.wreck ? Math.max(0, Math.min(10, ((pilot.strandedFor ?? 0) - 3) * 5)) : 0;
    context.save();
    context.translate(Math.round(pilot.x), Math.round(pilot.y + sinkDepth));
    if (pilot.invulnerableFor > 0 && Math.floor(state.time * 10) % 2 === 0) context.globalAlpha = 0.35;
    if (pilot.wreck) {
      context.fillStyle = color;
      context.fillRect(-24, 3, 46, 6);
      context.fillRect(-12, -1, 20, 5);
      context.fillStyle = "#17131f";
      context.fillRect(10, -2, 13, 3);
    }
    if (pilot.falling) {
      context.fillStyle = "#fffdf8";
      context.fillRect(-18, -35, 36, 6);
      context.fillRect(-13, -41, 26, 6);
      context.fillRect(-5, -46, 10, 5);
      context.fillStyle = "#17131f";
      context.fillRect(-13, -29, 3, 20);
      context.fillRect(10, -29, 3, 20);
    }
    context.fillStyle = "#fffdf8";
    context.fillRect(-4, -10, 8, 7);
    context.fillStyle = color;
    context.fillRect(-5, -3, 10, 11);
    context.fillStyle = "#17131f";
    const aim = pilot.aim ?? 0;
    if (aim === 0) context.fillRect(-1, -17, 3, 10);
    else context.fillRect(aim > 0 ? 3 : -14, -6, 11, 3);
    context.fillRect(-7, 8, 5, 7);
    context.fillRect(2, 8, 5, 7);
    if (pilot.ownerId === viewerId) {
      context.fillStyle = "#fffdf8";
      context.fillRect(-2, 18, 5, 5);
    }
    context.restore();
  }
}

function drawBombPowerUps(context: CanvasRenderingContext2D, state: GameState) {
  for (const powerUp of state.bombPowerUps) {
    const position = bombPowerUpPosition(state, powerUp);
    const flash = Math.floor(state.time * 4) % 2 === 0;
    context.save();
    context.translate(Math.round(position.x), Math.round(position.y));
    context.fillStyle = flash ? "#f2a913" : "#17131f";
    context.fillRect(-7, -9, 14, 13);
    context.fillRect(-4, 4, 8, 6);
    context.fillStyle = "#fffdf8";
    context.fillRect(-3, -13, 6, 4);
    context.font = gameFont(8);
    context.textAlign = "center";
    context.fillStyle = "#17131f";
    context.fillText("BOMB", 0, 22);
    context.restore();
  }
}

function drawBombs(context: CanvasRenderingContext2D, state: GameState) {
  for (const bomb of state.bombs) {
    context.save();
    context.translate(Math.round(bomb.x), Math.round(bomb.y));
    context.rotate(Math.atan2(bomb.vy, bomb.vx) - Math.PI / 2);
    context.fillStyle = "#17131f";
    context.fillRect(-5, -7, 10, 14);
    context.fillRect(-7, -9, 14, 4);
    context.fillStyle = "#f2a913";
    context.fillRect(-2, 7, 4, 5);
    context.restore();
  }
}

function drawMissiles(context: CanvasRenderingContext2D, state: GameState, frameTime: number) {
  for (const missile of state.missiles) {
    if (!missile.boosted) continue;
    const key = `${missile.ownerId}:${missile.id}`;
    const trail = missileTrails.get(key) ?? [];
    const last = trail.at(-1);
    const trailX = missile.x - Math.cos(missile.angle) * 7;
    const trailY = missile.y - Math.sin(missile.angle) * 7;
    if (!last || Math.hypot(trailX - last.x, trailY - last.y) >= 6 || frameTime - last.born >= 55) {
      trail.push({ x: trailX, y: trailY, born: frameTime });
      missileTrails.set(key, trail);
    }
  }

  for (const [key, trail] of missileTrails) {
    const visible = trail.filter((pixel) => frameTime - pixel.born < 720);
    if (!visible.length) {
      missileTrails.delete(key);
      continue;
    }
    missileTrails.set(key, visible);
    for (const pixel of visible) {
      const age = (frameTime - pixel.born) / 720;
      const size = age < 0.45 ? 4 : age < 0.75 ? 3 : 2;
      context.globalAlpha = Math.max(0, 0.82 * (1 - age));
      context.fillStyle = "#fffdf8";
      context.fillRect(Math.round(pixel.x) - Math.floor(size / 2), Math.round(pixel.y) - Math.floor(size / 2), size, size);
    }
  }
  context.globalAlpha = 1;

  for (const missile of state.missiles) {
    context.save();
    context.translate(Math.round(missile.x), Math.round(missile.y));
    context.rotate(missile.boosted ? missile.angle : Math.atan2(missile.vy, missile.vx || 1));
    if (missile.boosted) {
      context.fillStyle = "#f2a913";
      context.fillRect(-8, -1, 3, 3);
    }
    context.fillStyle = "#17131f";
    context.fillRect(-5, -1, 11, 3);
    context.fillRect(-4, -2, 2, 5);
    context.fillStyle = "#fffdf8";
    context.fillRect(5, 0, 3, 1);
    context.restore();
  }
}

function drawPlane(context: CanvasRenderingContext2D, plane: Plane, isViewer: boolean, time: number) {
  context.save();
  context.translate(plane.x, plane.y);
  context.rotate(plane.angle);
  const rollScale = plane.rollFor > 0
    ? Math.max(0.12, Math.abs(Math.cos((plane.rollFor / ROLL_DURATION) * Math.PI * 2)))
    : 1;
  context.scale(1, plane.liftSide * rollScale);
  if (plane.invulnerableFor > 0 && Math.floor(time * 8) % 2 === 0) context.globalAlpha = 0.35;
  if (plane.damage >= 2) {
    context.fillStyle = "#17131f";
    for (let index = 0; index < 4; index += 1) {
      const drift = ((time * 38 + index * 11) % 38);
      const smokeY = (index % 2 === 0 ? -1 : 1) * (5 + drift * 0.22);
      context.fillRect(-25 - drift, smokeY, 6 - (index % 2), 6 - (index % 2));
    }
  }
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
  if (plane.damage >= 1) context.fillRect(-15, -3, 8, 7);
  if (plane.damage >= 2) context.fillRect(4, 7, 8, 4);
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
  } else if (plane.rollFor > 0) {
    context.font = gameFont(9);
    context.fillStyle = "#fffdf8";
    context.fillText("ROLL", plane.x, plane.y - 38);
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
      const aPilot = state.groundPilots.find((pilot) => pilot.ownerId === a.playerId);
      const bPilot = state.groundPilots.find((pilot) => pilot.ownerId === b.playerId);
      return (aPlane?.alive ? aPlane.y : aPilot?.y ?? 0) - (bPlane?.alive ? bPlane.y : bPilot?.y ?? 0);
    });

  for (const bubble of active) {
    const plane = state.players.find((candidate) => candidate.id === bubble.playerId);
    const groundPilot = state.groundPilots.find((pilot) => pilot.ownerId === bubble.playerId);
    if (!plane || (!plane.alive && !groundPilot) || (plane.alive && planeInCloud(state, plane))) continue;
    const anchorX = plane.alive ? plane.x : groundPilot?.x ?? plane.x;
    const anchorY = plane.alive ? plane.y : groundPilot?.y ?? plane.y;
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
    const abovePlane = anchorY > height + 64;
    const x = clamp(anchorX - width / 2, 7, WORLD_WIDTH - width - 7);
    const y = abovePlane
      ? anchorY - height - 45
      : Math.min(WORLD_HEIGHT - height - 8, anchorY + 34);
    const tailX = clamp(anchorX, x + 12, x + width - 12);

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
  if (state.nextEventId <= lastEventId) resetRendererEffects();
  for (const event of state.events) {
    if (event.id <= lastEventId) continue;
    lastEventId = Math.max(lastEventId, event.id);
    if (event.type === "bomb-explosion" && event.x !== undefined && event.y !== undefined) {
      bursts.set(event.id, {
        x: event.x,
        y: event.y,
        born: frameTime,
        color: "#f02b10",
        kind: "bomb",
      });
      continue;
    }
    if (event.type === "missile-hit" && event.x !== undefined && event.y !== undefined) {
      bursts.set(event.id, {
        x: event.x,
        y: event.y,
        born: frameTime,
        color: "#fffdf8",
        kind: "missile",
      });
      continue;
    }
    if (event.type === "crash") {
      const plane = state.players.find((candidate) => candidate.id === event.playerId);
      if (plane) {
        bursts.set(event.id, {
          x: plane.x,
          y: plane.y,
          born: frameTime,
          color: plane.color,
          kind: "plane",
        });
      }
      continue;
    }
    if ((event.type === "sea-crash" || event.type === "sea-sink") && event.x !== undefined && event.y !== undefined) {
      bursts.set(event.id, {
        x: event.x,
        y: event.y,
        born: frameTime,
        color: "#fffdf8",
        kind: "splash",
      });
      continue;
    }
    if (
      (event.type === "pilot-shot" || event.type === "pilot-bombed" || event.type === "pilot-vaporized") &&
      event.x !== undefined &&
      event.y !== undefined
    ) {
      const target = state.players.find((plane) => plane.id === event.targetId);
      bursts.set(event.id, {
        x: event.x,
        y: event.y,
        born: frameTime,
        color: target?.color ?? "#f02b10",
        kind: event.type === "pilot-bombed" ? "pilot-bomb" : event.type === "pilot-vaporized" ? "vapor" : "pilot",
      });
    }
  }
}

function drawBursts(context: CanvasRenderingContext2D, frameTime: number) {
  for (const [id, burst] of bursts) {
    const age = (frameTime - burst.born) / 1000;
    const duration = burst.kind === "bomb" || burst.kind === "pilot-bomb" ? 1 : burst.kind === "missile" || burst.kind === "vapor" ? 0.55 : 0.8;
    if (age > duration) {
      bursts.delete(id);
      continue;
    }
    const progress = age / duration;
    context.save();
    context.translate(burst.x, burst.y);
    context.globalAlpha = 1 - progress;
    const count = burst.kind === "bomb" ? 16 : burst.kind === "missile" ? 10 : burst.kind === "vapor" ? 12 : burst.kind === "splash" ? 18 : 8;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const spread = burst.kind === "bomb" ? 108 : burst.kind === "missile" ? 46 : burst.kind === "vapor" ? 58 : burst.kind === "splash" ? 64 : 18 + (index % 2) * 10;
      const launchedY = burst.kind === "pilot-bomb" ? -progress * 100 + progress * progress * 70 : 0;
      const vaporY = burst.kind === "vapor" ? -progress * 54 : 0;
      const splashY = burst.kind === "splash" ? -Math.abs(Math.sin(angle)) * progress * 72 : 0;
      const radius = 5 + progress * spread;
      context.fillStyle = burst.kind === "splash"
        ? index % 2 === 0 ? "#fffdf8" : "#2478cf"
        : index % 3 === 0 ? "#17131f" : index % 2 === 0 ? "#f2a913" : burst.color;
      const size = burst.kind === "bomb" ? 12 : burst.kind === "missile" ? 7 : burst.kind === "vapor" ? 5 : burst.kind === "splash" ? 6 : 8;
      context.fillRect(
        Math.round(Math.cos(angle) * radius) - size / 2,
        Math.round(Math.sin(angle) * radius + launchedY + vaporY + splashY) - size / 2,
        size,
        size,
      );
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
  const groundPilot = state.groundPilots.find((candidate) => candidate.ownerId === pilotId);
  if (!plane) {
    return {
      speed: 0,
      altitude: 0,
      stalled: false,
      protected: false,
      rolling: false,
      rollCooldown: 0,
      alive: false,
      respawnIn: 0,
      bombs: 0,
      missiles: 0,
      parachutes: 0,
      shotsRemaining: 0,
      reloadIn: 0,
      onFoot: false,
      parachuting: false,
      damage: 0,
    };
  }
  return {
    speed: groundPilot ? Math.round(Math.abs(groundPilot.vx)) : Math.round(planeSpeed(plane)),
    altitude: groundPilot ? 0 : Math.max(0, Math.round(groundY(plane.x, state.landscape) - plane.y)),
    stalled: plane.stalled,
    protected: groundPilot ? groundPilot.invulnerableFor > 0 : plane.invulnerableFor > 0,
    rolling: plane.rollFor > 0,
    rollCooldown: Math.max(0, plane.rollCooldown ?? 0),
    alive: plane.alive || Boolean(groundPilot),
    respawnIn: Math.max(0, plane.respawnIn),
    bombs: plane.bombs,
    missiles: plane.missiles,
    parachutes: plane.parachutes ?? 0,
    shotsRemaining: plane.shotsRemaining,
    reloadIn: Math.max(0, plane.reloadIn),
    onFoot: Boolean(groundPilot),
    parachuting: Boolean(groundPilot?.falling),
    damage: plane.damage ?? 0,
  };
}
