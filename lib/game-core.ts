export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 675;
export const MAX_PLAYERS = 6;
export const STALL_SPEED = 68;
export const RECOVERY_SPEED = 88;

const GRAVITY = 76;
const ENGINE_THRUST = 48;
const DRAG = 0.0019;
const LIFT = 0.00318;
const TURN_RATE = 1.55;
const SIDE_SLIP_DAMPING = 2.4;
const PLANE_RADIUS = 14;
const BULLET_SPEED = 365;
const FIRE_DELAY = 0.23;

export type PilotInput = {
  turn: -1 | 0 | 1;
  fire: boolean;
};

export type Plane = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  score: number;
  deaths: number;
  alive: boolean;
  stalled: boolean;
  fireCooldown: number;
  respawnIn: number;
  invulnerableFor: number;
  spawnIndex: number;
  liftSide: 1 | -1;
};

export type Bullet = {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
};

export type GameEvent = {
  id: number;
  type: "shot" | "crash" | "score" | "stall" | "recover";
  playerId: string;
  targetId?: string;
};

export type GameState = {
  time: number;
  nextBulletId: number;
  nextEventId: number;
  players: Plane[];
  bullets: Bullet[];
  events: GameEvent[];
};

const COLORS = ["#f3c84b", "#e85d45", "#4e9fe6", "#70b86f", "#d884d6", "#f0eee2"];

const SPAWNS = [
  { x: 128, y: 360, angle: 0, speed: 158, liftSide: 1 as const },
  { x: 1072, y: 405, angle: Math.PI, speed: 158, liftSide: -1 as const },
  { x: 250, y: 285, angle: 0, speed: 160, liftSide: 1 as const },
  { x: 950, y: 250, angle: Math.PI, speed: 160, liftSide: -1 as const },
  { x: 385, y: 180, angle: 0, speed: 162, liftSide: 1 as const },
  { x: 815, y: 145, angle: Math.PI, speed: 162, liftSide: -1 as const },
];

export function createGame(): GameState {
  return {
    time: 0,
    nextBulletId: 1,
    nextEventId: 1,
    players: [],
    bullets: [],
    events: [],
  };
}

export function addPlayer(state: GameState, id: string, name: string): Plane {
  const used = new Set(state.players.map((player) => player.spawnIndex));
  const spawnIndex = SPAWNS.findIndex((_, index) => !used.has(index));
  const index = spawnIndex >= 0 ? spawnIndex : state.players.length % SPAWNS.length;
  const plane = makePlane(id, cleanName(name), index);
  state.players.push(plane);
  return plane;
}

export function removePlayer(state: GameState, id: string) {
  state.players = state.players.filter((player) => player.id !== id);
  state.bullets = state.bullets.filter((bullet) => bullet.ownerId !== id);
}

function makePlane(id: string, name: string, spawnIndex: number): Plane {
  const spawn = SPAWNS[spawnIndex % SPAWNS.length];
  return {
    id,
    name,
    color: COLORS[spawnIndex % COLORS.length],
    x: spawn.x,
    y: spawn.y,
    vx: Math.cos(spawn.angle) * spawn.speed,
    vy: Math.sin(spawn.angle) * spawn.speed,
    angle: spawn.angle,
    score: 0,
    deaths: 0,
    alive: true,
    stalled: false,
    fireCooldown: 0,
    respawnIn: 0,
    invulnerableFor: 2.2,
    spawnIndex,
    liftSide: spawn.liftSide,
  };
}

export function cleanName(name: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 12);
  return cleaned || "PILOT";
}

export function groundY(x: number): number {
  const wrapped = ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
  if (wrapped < 245 || wrapped > 955) return 592;
  const centerHill = 92 * Math.exp(-Math.pow((wrapped - 600) / 205, 2));
  const smallRoll = 17 * Math.sin((wrapped - 245) / 78) + 7 * Math.sin(wrapped / 31);
  return 592 - centerHill - smallRoll;
}

export function planeSpeed(plane: Plane): number {
  return Math.hypot(plane.vx, plane.vy);
}

export function stepGame(
  state: GameState,
  inputs: Record<string, PilotInput>,
  dt: number,
) {
  const safeDt = Math.min(Math.max(dt, 0), 1 / 20);
  state.time += safeDt;
  state.events = [];

  for (const plane of state.players) {
    if (!plane.alive) {
      plane.respawnIn -= safeDt;
      if (plane.respawnIn <= 0) respawnPlane(plane);
      continue;
    }

    const input = inputs[plane.id] ?? { turn: 0, fire: false };
    const speed = planeSpeed(plane);
    const forwardX = Math.cos(plane.angle);
    const forwardY = Math.sin(plane.angle);
    const forwardSpeed = plane.vx * forwardX + plane.vy * forwardY;
    const velocityAngle = Math.atan2(plane.vy, plane.vx);
    const angleOfAttack = Math.abs(angleDifference(plane.angle, velocityAngle));
    const wasStalled = plane.stalled;

    if (!plane.stalled && (speed < STALL_SPEED || (speed < RECOVERY_SPEED && angleOfAttack > 1))) {
      plane.stalled = true;
    } else if (plane.stalled && speed > RECOVERY_SPEED && forwardSpeed > 0 && angleOfAttack < 0.7) {
      plane.stalled = false;
    }

    if (plane.stalled !== wasStalled) {
      pushEvent(state, plane.stalled ? "stall" : "recover", plane.id);
    }

    const authority = plane.stalled
      ? 0.62
      : clamp((speed - 42) / 90, 0.48, 1);
    plane.angle = normalizeAngle(plane.angle + input.turn * TURN_RATE * authority * safeDt);

    const noseX = Math.cos(plane.angle);
    const noseY = Math.sin(plane.angle);
    const topX = Math.sin(plane.angle) * plane.liftSide;
    const topY = -Math.cos(plane.angle) * plane.liftSide;
    const refreshedForwardSpeed = Math.max(0, plane.vx * noseX + plane.vy * noseY);
    const liftForce = plane.stalled
      ? refreshedForwardSpeed * refreshedForwardSpeed * LIFT * 0.08
      : Math.min(112, refreshedForwardSpeed * refreshedForwardSpeed * LIFT);
    const thrust = ENGINE_THRUST * (plane.stalled ? 0.8 : 1);
    const currentSpeed = Math.max(1, planeSpeed(plane));
    const dragForce = DRAG * currentSpeed;
    const sideSpeed = plane.vx * topX + plane.vy * topY;
    const sideSlipDamping = plane.stalled ? 0.28 : SIDE_SLIP_DAMPING;

    plane.vx +=
      (noseX * thrust + topX * liftForce - plane.vx * dragForce - topX * sideSpeed * sideSlipDamping) *
      safeDt;
    plane.vy +=
      (noseY * thrust + topY * liftForce - plane.vy * dragForce + GRAVITY - topY * sideSpeed * sideSlipDamping) *
      safeDt;

    plane.x += plane.vx * safeDt;
    plane.y += plane.vy * safeDt;
    plane.fireCooldown = Math.max(0, plane.fireCooldown - safeDt);
    plane.invulnerableFor = Math.max(0, plane.invulnerableFor - safeDt);

    if (plane.x < -24) plane.x = WORLD_WIDTH + 24;
    if (plane.x > WORLD_WIDTH + 24) plane.x = -24;
    if (plane.y < 24) {
      plane.y = 24;
      plane.vy = Math.max(18, plane.vy);
    }

    if (input.fire && plane.fireCooldown <= 0) fireBullet(state, plane);

    if (plane.y + PLANE_RADIUS >= groundY(plane.x)) {
      destroyPlane(state, plane, undefined);
    }
  }

  updateBullets(state, safeDt);
  updatePlaneCollisions(state);
}

function fireBullet(state: GameState, plane: Plane) {
  const noseX = Math.cos(plane.angle);
  const noseY = Math.sin(plane.angle);
  plane.fireCooldown = FIRE_DELAY;
  state.bullets.push({
    id: state.nextBulletId++,
    ownerId: plane.id,
    x: plane.x + noseX * 21,
    y: plane.y + noseY * 21,
    vx: plane.vx + noseX * BULLET_SPEED,
    vy: plane.vy + noseY * BULLET_SPEED,
    life: 1.65,
  });
  pushEvent(state, "shot", plane.id);
}

function updateBullets(state: GameState, dt: number) {
  const survivors: Bullet[] = [];
  for (const bullet of state.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.x < 0) bullet.x += WORLD_WIDTH;
    if (bullet.x > WORLD_WIDTH) bullet.x -= WORLD_WIDTH;
    if (bullet.life <= 0 || bullet.y < 0 || bullet.y >= groundY(bullet.x)) continue;

    let hit = false;
    for (const plane of state.players) {
      if (!plane.alive || plane.id === bullet.ownerId || plane.invulnerableFor > 0) continue;
      const dx = wrappedDistance(bullet.x, plane.x);
      const dy = bullet.y - plane.y;
      if (dx * dx + dy * dy < 15 * 15) {
        const shooter = state.players.find((candidate) => candidate.id === bullet.ownerId);
        if (shooter) shooter.score += 1;
        destroyPlane(state, plane, bullet.ownerId);
        if (shooter) pushEvent(state, "score", shooter.id, plane.id);
        hit = true;
        break;
      }
    }
    if (!hit) survivors.push(bullet);
  }
  state.bullets = survivors;
}

function updatePlaneCollisions(state: GameState) {
  for (let i = 0; i < state.players.length; i += 1) {
    const a = state.players[i];
    if (!a.alive || a.invulnerableFor > 0) continue;
    for (let j = i + 1; j < state.players.length; j += 1) {
      const b = state.players[j];
      if (!b.alive || b.invulnerableFor > 0) continue;
      const dx = wrappedDistance(a.x, b.x);
      const dy = a.y - b.y;
      if (dx * dx + dy * dy < 24 * 24) {
        destroyPlane(state, a, b.id);
        destroyPlane(state, b, a.id);
      }
    }
  }
}

function destroyPlane(state: GameState, plane: Plane, targetId?: string) {
  if (!plane.alive) return;
  plane.alive = false;
  plane.stalled = false;
  plane.deaths += 1;
  plane.respawnIn = 2.35;
  plane.vx = 0;
  plane.vy = 0;
  state.bullets = state.bullets.filter((bullet) => bullet.ownerId !== plane.id);
  pushEvent(state, "crash", plane.id, targetId);
}

function respawnPlane(plane: Plane) {
  const spawn = SPAWNS[plane.spawnIndex % SPAWNS.length];
  plane.x = spawn.x;
  plane.y = spawn.y;
  plane.vx = Math.cos(spawn.angle) * spawn.speed;
  plane.vy = Math.sin(spawn.angle) * spawn.speed;
  plane.angle = spawn.angle;
  plane.alive = true;
  plane.stalled = false;
  plane.fireCooldown = 0;
  plane.respawnIn = 0;
  plane.invulnerableFor = 2.2;
  plane.liftSide = spawn.liftSide;
}

function pushEvent(
  state: GameState,
  type: GameEvent["type"],
  playerId: string,
  targetId?: string,
) {
  state.events.push({ id: state.nextEventId++, type, playerId, targetId });
}

export function botInput(state: GameState, botId: string): PilotInput {
  const bot = state.players.find((player) => player.id === botId);
  if (!bot || !bot.alive) return { turn: 0, fire: false };
  const opponents = state.players.filter((player) => player.id !== botId && player.alive);
  const target = opponents.sort((a, b) => distanceSquared(bot, a) - distanceSquared(bot, b))[0];

  let desiredAngle = target ? Math.atan2(target.y - bot.y, wrappedDistance(target.x, bot.x)) : 0;
  const terrainClearance = groundY(bot.x) - bot.y;
  if (bot.stalled || planeSpeed(bot) < 82) {
    desiredAngle = bot.vx >= 0 ? 0.48 : Math.PI - 0.48;
  } else if (terrainClearance < 105 && bot.vy > 12) {
    desiredAngle = bot.vx >= 0 ? -0.42 : -Math.PI + 0.42;
  }

  const difference = angleDifference(desiredAngle, bot.angle);
  const turn: -1 | 0 | 1 = Math.abs(difference) < 0.035 ? 0 : difference > 0 ? 1 : -1;
  const targetDifference = target
    ? Math.abs(angleDifference(Math.atan2(target.y - bot.y, wrappedDistance(target.x, bot.x)), bot.angle))
    : Math.PI;
  const fire = Boolean(target && targetDifference < 0.12 && distanceSquared(bot, target) < 430 * 430);
  return { turn, fire };
}

function distanceSquared(a: Plane, b: Plane): number {
  const dx = wrappedDistance(b.x, a.x);
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

function wrappedDistance(targetX: number, originX: number): number {
  let distance = targetX - originX;
  if (distance > WORLD_WIDTH / 2) distance -= WORLD_WIDTH;
  if (distance < -WORLD_WIDTH / 2) distance += WORLD_WIDTH;
  return distance;
}

function angleDifference(target: number, current: number): number {
  return normalizeAngle(target - current);
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
