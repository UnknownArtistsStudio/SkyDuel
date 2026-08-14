import {
  groundY,
  planeSpeed,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type GameState,
  type Plane,
} from "../../lib/game-core";

type Burst = { x: number; y: number; born: number; color: string };

const bursts = new Map<number, Burst>();
let lastEventId = 0;

export function renderGame(
  canvas: HTMLCanvasElement,
  state: GameState,
  viewerId: string,
  frameTime: number,
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
  drawVignette(context);
}

function drawSky(context: CanvasRenderingContext2D) {
  const gradient = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  gradient.addColorStop(0, "#6ba3b1");
  gradient.addColorStop(0.7, "#9bc4c5");
  gradient.addColorStop(1, "#d8d2aa");
  context.fillStyle = gradient;
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  context.globalAlpha = 0.17;
  context.fillStyle = "#f9f1cb";
  for (let y = 18; y < WORLD_HEIGHT; y += 7) context.fillRect(0, y, WORLD_WIDTH, 1);
  context.globalAlpha = 1;
}

function drawClouds(context: CanvasRenderingContext2D, time: number) {
  const clouds = [
    { x: 125, y: 108, size: 1.1, speed: 2.2 },
    { x: 590, y: 82, size: 0.72, speed: 1.4 },
    { x: 900, y: 170, size: 0.88, speed: 1.8 },
  ];
  context.fillStyle = "rgba(243, 239, 211, 0.58)";
  for (const cloud of clouds) {
    const x = (cloud.x + time * cloud.speed) % (WORLD_WIDTH + 180) - 90;
    context.beginPath();
    context.ellipse(x, cloud.y, 50 * cloud.size, 15 * cloud.size, 0, 0, Math.PI * 2);
    context.ellipse(x - 34 * cloud.size, cloud.y + 4, 29 * cloud.size, 11 * cloud.size, 0, 0, Math.PI * 2);
    context.ellipse(x + 32 * cloud.size, cloud.y + 5, 34 * cloud.size, 12 * cloud.size, 0, 0, Math.PI * 2);
    context.fill();
  }
}

function drawTerrain(context: CanvasRenderingContext2D) {
  context.beginPath();
  context.moveTo(0, WORLD_HEIGHT);
  context.lineTo(0, groundY(0));
  for (let x = 0; x <= WORLD_WIDTH; x += 8) context.lineTo(x, groundY(x));
  context.lineTo(WORLD_WIDTH, WORLD_HEIGHT);
  context.closePath();
  const grass = context.createLinearGradient(0, 490, 0, WORLD_HEIGHT);
  grass.addColorStop(0, "#667945");
  grass.addColorStop(1, "#263322");
  context.fillStyle = grass;
  context.fill();

  context.strokeStyle = "#d7ce91";
  context.lineWidth = 3;
  context.beginPath();
  for (let x = 0; x <= WORLD_WIDTH; x += 8) {
    if (x === 0) context.moveTo(x, groundY(x));
    else context.lineTo(x, groundY(x));
  }
  context.stroke();
  drawRunway(context, 26, 232);
  drawRunway(context, 968, 1174);
  drawWindSock(context, 248, groundY(248));
  drawWindSock(context, 952, groundY(952));

  context.fillStyle = "rgba(20, 28, 18, 0.45)";
  for (let x = 285; x < 925; x += 37) {
    const y = groundY(x);
    context.fillRect(x, y + 8, 2, 14 + ((x / 37) % 3) * 4);
  }
}

function drawRunway(context: CanvasRenderingContext2D, start: number, end: number) {
  const y = 595;
  context.fillStyle = "#37372f";
  context.fillRect(start, y - 5, end - start, 14);
  context.fillStyle = "#e0d8a7";
  for (let x = start + 12; x < end - 8; x += 34) context.fillRect(x, y, 18, 2);
}

function drawWindSock(context: CanvasRenderingContext2D, x: number, y: number) {
  context.strokeStyle = "#25271f";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x, y - 39);
  context.stroke();
  context.fillStyle = "#e85d45";
  context.beginPath();
  context.moveTo(x, y - 38);
  context.lineTo(x - 31, y - 31);
  context.lineTo(x - 31, y - 42);
  context.closePath();
  context.fill();
}

function drawBullets(context: CanvasRenderingContext2D, state: GameState) {
  context.strokeStyle = "#fff4b3";
  context.lineWidth = 3;
  context.lineCap = "round";
  for (const bullet of state.bullets) {
    const length = Math.hypot(bullet.vx, bullet.vy) || 1;
    context.beginPath();
    context.moveTo(bullet.x, bullet.y);
    context.lineTo(bullet.x - (bullet.vx / length) * 9, bullet.y - (bullet.vy / length) * 9);
    context.stroke();
  }
}

function drawPlane(context: CanvasRenderingContext2D, plane: Plane, isViewer: boolean, time: number) {
  context.save();
  context.translate(plane.x, plane.y);
  context.rotate(plane.angle);
  context.scale(1, plane.liftSide);
  if (plane.invulnerableFor > 0 && Math.floor(time * 8) % 2 === 0) context.globalAlpha = 0.35;
  if (isViewer) {
    context.strokeStyle = "rgba(255, 247, 193, 0.7)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, 23, 0, Math.PI * 2);
    context.stroke();
  }

  context.strokeStyle = "#292922";
  context.lineWidth = 2.6;
  context.fillStyle = plane.color;
  context.beginPath();
  context.moveTo(-18, -4);
  context.lineTo(15, -5);
  context.lineTo(22, 0);
  context.lineTo(15, 5);
  context.lineTo(-18, 6);
  context.lineTo(-23, 1);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#e7ddaa";
  context.fillRect(-8, -14, 27, 4);
  context.fillRect(-9, 10, 29, 4);
  context.strokeRect(-8, -14, 27, 4);
  context.strokeRect(-9, 10, 29, 4);
  context.beginPath();
  context.moveTo(-2, -10);
  context.lineTo(4, 10);
  context.moveTo(14, -10);
  context.lineTo(9, 10);
  context.stroke();

  context.fillStyle = "#25251f";
  context.beginPath();
  context.arc(1, -5, 4, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#9fd0d2";
  context.fillRect(0, -8, 6, 4);

  context.fillStyle = plane.color;
  context.beginPath();
  context.moveTo(-18, 0);
  context.lineTo(-25, -10);
  context.lineTo(-19, -9);
  context.lineTo(-12, 1);
  context.closePath();
  context.fill();
  context.stroke();

  context.strokeStyle = "#eee4b8";
  context.lineWidth = 2;
  const propeller = (time * 32) % (Math.PI * 2);
  context.beginPath();
  context.moveTo(23, -Math.sin(propeller) * 12);
  context.lineTo(23, Math.sin(propeller) * 12);
  context.stroke();
  context.restore();

  context.save();
  context.textAlign = "center";
  context.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillStyle = "rgba(20, 25, 21, 0.82)";
  context.fillText(plane.name.toUpperCase(), plane.x + 1, plane.y - 28);
  context.fillStyle = "#fff5cd";
  context.fillText(plane.name.toUpperCase(), plane.x, plane.y - 29);
  if (plane.stalled) {
    context.font = "800 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillStyle = "#8e2d25";
    context.fillText("STALL", plane.x, plane.y - 44);
  }
  context.restore();
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
    for (let index = 0; index < 11; index += 1) {
      const angle = (index / 11) * Math.PI * 2;
      const radius = 6 + progress * (24 + (index % 3) * 8);
      context.fillStyle = index % 2 === 0 ? "#f3c84b" : burst.color;
      context.fillRect(Math.cos(angle) * radius - 3, Math.sin(angle) * radius - 3, 6, 6);
    }
    context.restore();
  }
}

function drawVignette(context: CanvasRenderingContext2D) {
  const gradient = context.createRadialGradient(
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    WORLD_HEIGHT * 0.28,
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    WORLD_WIDTH * 0.64,
  );
  gradient.addColorStop(0, "rgba(20, 24, 20, 0)");
  gradient.addColorStop(1, "rgba(15, 20, 18, 0.18)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}

export function pilotReadout(state: GameState, pilotId: string) {
  const plane = state.players.find((candidate) => candidate.id === pilotId);
  if (!plane) return { speed: 0, altitude: 0, stalled: false, alive: false, respawnIn: 0 };
  return {
    speed: Math.round(planeSpeed(plane)),
    altitude: Math.max(0, Math.round(groundY(plane.x) - plane.y)),
    stalled: plane.stalled,
    alive: plane.alive,
    respawnIn: Math.max(0, plane.respawnIn),
  };
}
