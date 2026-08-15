export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 675;
export const MAX_PLAYERS = 6;
export const STALL_SPEED = 78;
export const RECOVERY_SPEED = 102;
export const BOMB_BLAST_RADIUS = 132;
export const CLOUD_COUNT = 3;
export const MAGAZINE_SIZE = 3;
export const RELOAD_TIME = 1.35;
export const ROLL_DURATION = 0.58;
export const ROLL_RECHARGE = 1.35;
export const MISSILE_DROP_TIME = 0.42;
export const PILOT_GUN_HITS = 6;
export const SEA_WRECK_SINK_TIME = 5;

export type MatchMode = "free-for-all" | "teams";
export type Team = 0 | 1;
export type TeamPreference = Team | "auto";
export type ScoreLimit = 5 | 10 | 20 | null;
export type PlaneHits = 1 | 3;
export type Landscape = "tower" | "sea" | "mountains";
export type GameWinner =
  | { kind: "pilot"; playerId: string }
  | { kind: "team"; team: Team };

const GRAVITY = 68;
const ENGINE_THRUST = 66;
const DRAG = 0.00172;
const LIFT = 0.00177;
const TURN_RATE = 1.65;
const SIDE_SLIP_DAMPING = 2.8;
const PLANE_RADIUS = 12;
const BULLET_SPEED = 420;
const BULLET_LIFE = 1.18;
const FIRE_DELAY = 0.32;
const MISSILE_SPEED = 535;
const MISSILE_LIFE = 2.4;
const BOMB_GRAVITY = 210;
const BOMB_PICKUP_RADIUS = 28;
const BOMB_LIFE = 8;
const PILOT_AIM_LIMIT = Math.PI / 2;
const PILOT_AIM_SPEED = Math.PI * 0.95;
const PILOT_BULLET_SPEED = 330;

export type PilotInput = {
  turn: -1 | 0 | 1;
  fire: boolean;
  bomb: boolean;
  roll: boolean;
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
  specialCooldown: number;
  shotsRemaining: number;
  reloadIn: number;
  rollFor: number;
  rollCooldown: number;
  respawnIn: number;
  invulnerableFor: number;
  spawnIndex: number;
  liftSide: 1 | -1;
  team: Team | null;
  bombs: number;
  missiles: number;
  missileMilestones: number;
  damage: number;
  pilotDamage: number;
  joinedAt: number;
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

export type Bomb = {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
};

export type BombPowerUp = {
  id: number;
  cloudIndex: number;
};

export type GroundPilot = {
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  falling: boolean;
  wreck: boolean;
  strandedFor: number;
  aimAngle: number;
  fireCooldown: number;
  invulnerableFor: number;
};

export type PilotBullet = {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
};

export type Missile = {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  dropFor: number;
  boosted: boolean;
  life: number;
};

export type GameEvent = {
  id: number;
  type:
    | "shot"
    | "reload"
    | "roll"
    | "crash"
    | "sea-crash"
    | "sea-sink"
    | "score"
    | "stall"
    | "recover"
    | "bomb-drop"
    | "bomb-explosion"
    | "bomb-pickup"
    | "missile-award"
    | "missile-launch"
    | "missile-hit"
    | "plane-hit"
    | "mayday"
    | "pilot-eject"
    | "pilot-shot"
    | "pilot-bombed"
    | "pilot-vaporized"
    | "pilot-gun"
    | "victory";
  playerId: string;
  targetId?: string;
  x?: number;
  y?: number;
  time: number;
};

export type GameState = {
  time: number;
  nextBulletId: number;
  nextBombId: number;
  nextMissileId: number;
  nextPowerUpId: number;
  nextPilotBulletId: number;
  nextEventId: number;
  players: Plane[];
  bullets: Bullet[];
  bombs: Bomb[];
  missiles: Missile[];
  bombPowerUps: BombPowerUp[];
  groundPilots: GroundPilot[];
  pilotBullets: PilotBullet[];
  bombSpawnIn: number;
  events: GameEvent[];
  matchMode: MatchMode;
  scoreLimit: ScoreLimit;
  bombsEnabled: boolean;
  parachuteMode: boolean;
  planeHits: PlaneHits;
  landscape: Landscape;
  winner: GameWinner | null;
};

const COLORS = ["#f02b10", "#00ad38", "#f2a913", "#fffdf8", "#17131f", "#f02b10"];
const TEAM_COLORS = ["#f02b10", "#00ad38"] as const;

const SPAWNS = [
  { x: 110, y: 335, angle: 0, speed: 188, liftSide: 1 as const },
  { x: 1090, y: 405, angle: Math.PI, speed: 188, liftSide: -1 as const },
  { x: 270, y: 225, angle: 0, speed: 192, liftSide: 1 as const },
  { x: 930, y: 175, angle: Math.PI, speed: 192, liftSide: -1 as const },
  { x: 455, y: 110, angle: 0, speed: 196, liftSide: 1 as const },
  { x: 745, y: 495, angle: Math.PI, speed: 196, liftSide: -1 as const },
];

export function createGame(
  matchMode: MatchMode = "free-for-all",
  scoreLimit: ScoreLimit = 10,
  bombsEnabled = false,
  parachuteMode = true,
  planeHits: PlaneHits = 1,
  landscape: Landscape = "tower",
): GameState {
  return {
    time: 0,
    nextBulletId: 1,
    nextBombId: 1,
    nextMissileId: 1,
    nextPowerUpId: 1,
    nextPilotBulletId: 1,
    nextEventId: 1,
    players: [],
    bullets: [],
    bombs: [],
    missiles: [],
    bombPowerUps: [],
    groundPilots: [],
    pilotBullets: [],
    bombSpawnIn: nextBombDelay(true),
    events: [],
    matchMode,
    scoreLimit,
    bombsEnabled,
    parachuteMode,
    planeHits,
    landscape,
    winner: null,
  };
}

export function addPlayer(
  state: GameState,
  id: string,
  name: string,
  teamPreference: TeamPreference = "auto",
): Plane {
  const used = new Set(state.players.map((player) => player.spawnIndex));
  const spawnIndex = SPAWNS.findIndex((_, index) => !used.has(index));
  const index = spawnIndex >= 0 ? spawnIndex : state.players.length % SPAWNS.length;
  const team = chooseTeam(state, teamPreference);
  const plane = makePlane(id, cleanName(name), index, team, state.time, state.landscape);
  state.players.push(plane);
  return plane;
}

export function removePlayer(state: GameState, id: string) {
  state.players = state.players.filter((player) => player.id !== id);
  state.bullets = state.bullets.filter((bullet) => bullet.ownerId !== id);
  state.bombs = state.bombs.filter((bomb) => bomb.ownerId !== id);
  state.missiles = state.missiles.filter((missile) => missile.ownerId !== id);
  state.groundPilots = state.groundPilots.filter((pilot) => pilot.ownerId !== id);
  state.pilotBullets = state.pilotBullets.filter((bullet) => bullet.ownerId !== id);
}

function makePlane(
  id: string,
  name: string,
  spawnIndex: number,
  team: Team | null,
  joinedAt: number,
  landscape: Landscape,
): Plane {
  const spawn = SPAWNS[spawnIndex % SPAWNS.length];
  return {
    id,
    name,
    color: team === null ? COLORS[spawnIndex % COLORS.length] : TEAM_COLORS[team],
    x: spawn.x,
    y: Math.min(spawn.y, groundY(spawn.x, landscape) - 100),
    vx: Math.cos(spawn.angle) * spawn.speed,
    vy: Math.sin(spawn.angle) * spawn.speed,
    angle: spawn.angle,
    score: 0,
    deaths: 0,
    alive: true,
    stalled: false,
    fireCooldown: 0,
    specialCooldown: 0,
    shotsRemaining: MAGAZINE_SIZE,
    reloadIn: 0,
    rollFor: 0,
    rollCooldown: 0,
    respawnIn: 0,
    invulnerableFor: 2.2,
    spawnIndex,
    liftSide: spawn.liftSide,
    team,
    bombs: 0,
    missiles: 0,
    missileMilestones: 0,
    damage: 0,
    pilotDamage: 0,
    joinedAt,
  };
}

function chooseTeam(state: GameState, preference: TeamPreference): Team | null {
  if (state.matchMode !== "teams") return null;
  if (preference === 0 || preference === 1) return preference;
  const red = state.players.filter((plane) => plane.team === 0).length;
  const green = state.players.filter((plane) => plane.team === 1).length;
  return red <= green ? 0 : 1;
}

export function cleanName(name: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 12);
  return cleaned || "PILOT";
}

export function groundY(x: number, landscape: Landscape = "tower"): number {
  const wrappedX = ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
  if (landscape === "sea") return 598;
  if (landscape === "mountains") {
    const peaks = [
      { x: 155, width: 115, height: 76 },
      { x: 410, width: 150, height: 118 },
      { x: 705, width: 92, height: 62 },
      { x: 1015, width: 138, height: 96 },
    ];
    const height = peaks.reduce((highest, peak) => {
      const slope = Math.max(0, 1 - Math.abs(wrappedX - peak.x) / peak.width);
      return Math.max(highest, slope * peak.height);
    }, 0);
    return 620 - Math.round(height / 8) * 8;
  }
  if (wrappedX < 150 || wrappedX > 1050) return 598;
  if (wrappedX < 275 || wrappedX > 925) return 610;
  return 620;
}

export function planeSpeed(plane: Plane): number {
  return Math.hypot(plane.vx, plane.vy);
}

export function cloudPosition(time: number, cloudIndex: number) {
  const index = Math.abs(Math.trunc(cloudIndex)) % CLOUD_COUNT;
  const cloud = index === 0
    ? { startX: 155, y: 105, speed: 1.2, size: 1.2, phase: 0 }
    : index === 1
      ? { startX: 905, y: 205, speed: 0.86, size: 1, phase: 2.4 }
      : { startX: 515, y: 315, speed: 0.55, size: 1.75, phase: 4.1 };
  const span = WORLD_WIDTH + 360;
  const x = (cloud.startX + time * cloud.speed) % span - 130;
  const y = cloud.y + Math.round(Math.sin(time * 0.18 + cloud.phase) * 3);
  return { x, y, size: cloud.size };
}

export function planeInCloud(state: GameState, plane: Plane): boolean {
  for (let index = 0; index < CLOUD_COUNT; index += 1) {
    const cloud = cloudPosition(state.time, index);
    const width = 100 * cloud.size;
    const height = 76 * cloud.size;
    const dx = wrappedDistance(cloud.x + width * 0.4, plane.x);
    const dy = plane.y - (cloud.y + height * 0.2);
    if (Math.abs(dx) < width * 0.48 && Math.abs(dy) < height * 0.48) return true;
  }
  return false;
}

export function bombPowerUpPosition(state: GameState, powerUp: BombPowerUp) {
  const cloud = cloudPosition(state.time, powerUp.cloudIndex);
  return {
    x: cloud.x + 40 * cloud.size,
    y: cloud.y + 22 * cloud.size,
  };
}

export function stepGame(
  state: GameState,
  inputs: Record<string, PilotInput>,
  dt: number,
) {
  const safeDt = Math.min(Math.max(dt, 0), 1 / 20);
  if (state.winner) return;
  state.events = state.events.filter((event) => state.time - event.time < 0.4);
  state.time += safeDt;

  for (const plane of state.players) {
    if (!plane.alive) {
      const pilotActive = state.groundPilots.some((pilot) => pilot.ownerId === plane.id);
      if (!pilotActive) {
        plane.respawnIn -= safeDt;
        if (plane.respawnIn <= 0) respawnPlane(plane, state.landscape);
      }
      continue;
    }

    const input = inputs[plane.id] ?? { turn: 0, fire: false, bomb: false, roll: false };
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
      ? 0.66
      : clamp((speed - 50) / 120, 0.52, 1);
    plane.angle = normalizeAngle(plane.angle + input.turn * TURN_RATE * authority * safeDt);

    const noseX = Math.cos(plane.angle);
    const noseY = Math.sin(plane.angle);
    const topX = Math.sin(plane.angle) * plane.liftSide;
    const topY = -Math.cos(plane.angle) * plane.liftSide;
    const refreshedForwardSpeed = Math.max(0, plane.vx * noseX + plane.vy * noseY);
    const liftForce = plane.stalled
      ? refreshedForwardSpeed * refreshedForwardSpeed * LIFT * 0.08
      : Math.min(108, refreshedForwardSpeed * refreshedForwardSpeed * LIFT);
    const thrust = ENGINE_THRUST * (plane.stalled ? 0.84 : 1);
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
    plane.specialCooldown = Math.max(0, plane.specialCooldown - safeDt);
    plane.rollFor = Math.max(0, plane.rollFor - safeDt);
    plane.rollCooldown = Math.max(0, (plane.rollCooldown ?? 0) - safeDt);
    if (plane.reloadIn > 0) {
      plane.reloadIn = Math.max(0, plane.reloadIn - safeDt);
      if (plane.reloadIn === 0) plane.shotsRemaining = MAGAZINE_SIZE;
    }
    plane.invulnerableFor = Math.max(0, plane.invulnerableFor - safeDt);

    if (plane.x < -24) plane.x = WORLD_WIDTH + 24;
    if (plane.x > WORLD_WIDTH + 24) plane.x = -24;
    if (plane.y < 24) {
      plane.y = 24;
      plane.vy = Math.max(18, plane.vy);
    }

    if (input.roll && (plane.rollCooldown ?? 0) <= 0 && plane.invulnerableFor <= 0) {
      plane.rollFor = ROLL_DURATION;
      plane.rollCooldown = ROLL_RECHARGE;
      pushEvent(state, "roll", plane.id);
    }
    if (
      input.fire &&
      plane.fireCooldown <= 0 &&
      plane.reloadIn <= 0 &&
      plane.shotsRemaining > 0 &&
      plane.invulnerableFor <= 0 &&
      plane.rollFor <= 0
    ) fireBullet(state, plane);
    if (
      input.bomb &&
      plane.specialCooldown <= 0 &&
      plane.invulnerableFor <= 0 &&
      plane.rollFor <= 0
    ) activateSpecialWeapon(state, plane);

    if (plane.y + PLANE_RADIUS >= groundY(plane.x, state.landscape)) {
      destroyPlane(state, plane, undefined, state.landscape === "sea" ? "sea-crash" : "crash");
    }
  }

  updateBombPowerUps(state, safeDt);
  updateGroundPilots(state, inputs, safeDt);
  updateBombs(state, safeDt);
  updateMissiles(state, safeDt);
  updateBullets(state, safeDt);
  updatePilotBullets(state, safeDt);
  if (!state.winner) updatePlaneCollisions(state);
  if (!state.winner) updateMissileAwards(state);
  if (state.winner) {
    state.bullets = [];
    state.bombs = [];
    state.missiles = [];
    state.bombPowerUps = [];
    state.pilotBullets = [];
  }
}

function fireBullet(state: GameState, plane: Plane) {
  const noseX = Math.cos(plane.angle);
  const noseY = Math.sin(plane.angle);
  plane.fireCooldown = FIRE_DELAY;
  plane.shotsRemaining -= 1;
  if (plane.shotsRemaining <= 0) {
    plane.shotsRemaining = 0;
    plane.reloadIn = RELOAD_TIME;
    pushEvent(state, "reload", plane.id);
  }
  state.bullets.push({
    id: state.nextBulletId++,
    ownerId: plane.id,
    x: plane.x + noseX * 21,
    y: plane.y + noseY * 21,
    vx: plane.vx + noseX * BULLET_SPEED,
    vy: plane.vy + noseY * BULLET_SPEED,
    life: BULLET_LIFE,
  });
  pushEvent(state, "shot", plane.id);
}

function activateSpecialWeapon(state: GameState, plane: Plane) {
  if (plane.missiles > 0) {
    launchMissile(state, plane);
    return;
  }
  if (plane.bombs > 0) dropBomb(state, plane);
}

function dropBomb(state: GameState, plane: Plane) {
  plane.bombs -= 1;
  plane.specialCooldown = 0.35;
  state.bombs.push({
    id: state.nextBombId++,
    ownerId: plane.id,
    x: plane.x,
    y: plane.y + 13,
    vx: plane.vx * 0.72,
    vy: plane.vy + 35,
    life: BOMB_LIFE,
  });
  pushEvent(state, "bomb-drop", plane.id, undefined, plane.x, plane.y);
}

function launchMissile(state: GameState, plane: Plane) {
  plane.missiles -= 1;
  plane.specialCooldown = 0.35;
  state.missiles.push({
    id: state.nextMissileId++,
    ownerId: plane.id,
    x: plane.x,
    y: plane.y + 9,
    vx: plane.vx * 0.7,
    vy: plane.vy * 0.45 + 28,
    angle: plane.angle,
    dropFor: MISSILE_DROP_TIME,
    boosted: false,
    life: MISSILE_LIFE,
  });
  pushEvent(state, "missile-launch", plane.id, undefined, plane.x, plane.y);
}

function updateBombPowerUps(state: GameState, dt: number) {
  if (!state.bombsEnabled) {
    state.bombPowerUps = [];
    return;
  }

  if (state.bombPowerUps.length === 0) {
    state.bombSpawnIn -= dt;
    if (state.bombSpawnIn <= 0) {
      state.bombPowerUps.push({
        id: state.nextPowerUpId++,
        cloudIndex: Math.floor(Math.random() * CLOUD_COUNT),
      });
    }
  }

  for (const powerUp of state.bombPowerUps) {
    const position = bombPowerUpPosition(state, powerUp);
    const collector = state.players.find((plane) => {
      if (!plane.alive || plane.bombs > 0) return false;
      const dx = wrappedDistance(position.x, plane.x);
      const dy = position.y - plane.y;
      return dx * dx + dy * dy <= BOMB_PICKUP_RADIUS * BOMB_PICKUP_RADIUS;
    });
    if (!collector) continue;
    collector.bombs = 1;
    state.bombPowerUps = state.bombPowerUps.filter((candidate) => candidate.id !== powerUp.id);
    state.bombSpawnIn = nextBombDelay(false);
    pushEvent(state, "bomb-pickup", collector.id, undefined, position.x, position.y);
    break;
  }
}

function updateGroundPilots(state: GameState, inputs: Record<string, PilotInput>, dt: number) {
  const seaWreckCount = state.landscape === "sea"
    ? state.groundPilots.filter((pilot) => pilot.wreck).length
    : 0;
  for (const pilot of state.groundPilots) {
    const input = inputs[pilot.ownerId] ?? { turn: 0, fire: false, bomb: false, roll: false };
    pilot.invulnerableFor = Math.max(0, pilot.invulnerableFor - dt);
    pilot.fireCooldown = Math.max(0, pilot.fireCooldown - dt);
    pilot.aimAngle = clamp(
      (Number.isFinite(pilot.aimAngle) ? pilot.aimAngle : 0) + input.turn * PILOT_AIM_SPEED * dt,
      -PILOT_AIM_LIMIT,
      PILOT_AIM_LIMIT,
    );
    if (pilot.falling) {
      pilot.vx += input.turn * 32 * dt;
      pilot.vx *= Math.pow(0.985, dt * 60);
      pilot.vy = Math.min(52, pilot.vy + 24 * dt);
      pilot.x += pilot.vx * dt;
      pilot.y += pilot.vy * dt;
      const surface = groundY(pilot.x, state.landscape) - 7;
      if (pilot.y >= surface) {
        pilot.y = surface;
        pilot.vx = 0;
        pilot.vy = 0;
        pilot.falling = false;
      }
    } else if (!pilot.wreck) {
      const speed = state.landscape === "sea" ? 24 : 58;
      pilot.x += input.turn * speed * dt;
      pilot.y = groundY(pilot.x, state.landscape) - 7;
    }
    pilot.strandedFor = pilot.wreck && seaWreckCount >= 2
      ? (pilot.strandedFor ?? 0) + dt
      : 0;
    if (pilot.x < 0) pilot.x += WORLD_WIDTH;
    if (pilot.x > WORLD_WIDTH) pilot.x -= WORLD_WIDTH;
    if (input.fire && pilot.fireCooldown <= 0) firePilotGun(state, pilot);
  }

  const sinkingPilots = state.groundPilots.filter(
    (pilot) => pilot.wreck && (pilot.strandedFor ?? 0) >= SEA_WRECK_SINK_TIME,
  );
  if (sinkingPilots.length > 0) {
    const sinkingIds = new Set(sinkingPilots.map((pilot) => pilot.ownerId));
    for (const pilot of sinkingPilots) {
      const plane = state.players.find((candidate) => candidate.id === pilot.ownerId);
      if (plane) plane.respawnIn = 0.85;
      pushEvent(state, "sea-sink", pilot.ownerId, undefined, pilot.x, pilot.y);
    }
    state.groundPilots = state.groundPilots.filter((pilot) => !sinkingIds.has(pilot.ownerId));
    state.pilotBullets = state.pilotBullets.filter((bullet) => !sinkingIds.has(bullet.ownerId));
  }
}

function firePilotGun(
  state: GameState,
  pilot: GroundPilot,
) {
  pilot.fireCooldown = 0.16;
  const aimAngle = clamp(
    Number.isFinite(pilot.aimAngle) ? pilot.aimAngle : 0,
    -PILOT_AIM_LIMIT,
    PILOT_AIM_LIMIT,
  );
  const horizontalDirection = Math.sin(aimAngle);
  const verticalDirection = -Math.cos(aimAngle);
  state.pilotBullets.push({
    id: state.nextPilotBulletId++,
    ownerId: pilot.ownerId,
    x: pilot.x + horizontalDirection * 7,
    y: pilot.y - 4 + verticalDirection * 7,
    vx: horizontalDirection * PILOT_BULLET_SPEED,
    vy: verticalDirection * PILOT_BULLET_SPEED,
    life: 1.65,
  });
  pushEvent(state, "pilot-gun", pilot.ownerId, undefined, pilot.x, pilot.y);
}

function updatePilotBullets(state: GameState, dt: number) {
  const survivors: PilotBullet[] = [];
  for (const bullet of state.pilotBullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.x < 0) bullet.x += WORLD_WIDTH;
    if (bullet.x > WORLD_WIDTH) bullet.x -= WORLD_WIDTH;
    if (bullet.life <= 0 || bullet.y < 0) continue;
    const shooter = state.players.find((plane) => plane.id === bullet.ownerId);
    let hit = false;
    for (const plane of state.players) {
      if (!plane.alive || plane.id === bullet.ownerId || plane.invulnerableFor > 0 || plane.rollFor > 0) continue;
      if (shooter && areTeammates(state, shooter, plane)) continue;
      const dx = wrappedDistance(bullet.x, plane.x);
      const dy = bullet.y - plane.y;
      if (dx * dx + dy * dy >= 12 * 12) continue;
      plane.pilotDamage = (plane.pilotDamage ?? 0) + 1;
      if (plane.pilotDamage >= PILOT_GUN_HITS) {
        plane.pilotDamage = 0;
        const destroyed = applyPlaneHit(state, plane, bullet.ownerId);
        if (destroyed && shooter) awardKill(state, shooter, plane.id);
      }
      hit = true;
      break;
    }
    if (!hit) {
      const struckPilot = state.groundPilots.find((pilot) => {
        if (pilot.ownerId === bullet.ownerId || pilot.invulnerableFor > 0) return false;
        const target = state.players.find((plane) => plane.id === pilot.ownerId);
        if (shooter && target && areTeammates(state, shooter, target)) return false;
        const dx = wrappedDistance(bullet.x, pilot.x);
        const dy = bullet.y - pilot.y;
        return dx * dx + dy * dy < 7 * 7;
      });
      if (struckPilot) {
        destroyGroundPilot(state, struckPilot, "pilot-shot", bullet.ownerId);
        hit = true;
      }
    }
    if (!hit) survivors.push(bullet);
  }
  state.pilotBullets = state.winner ? [] : survivors;
}

function updateBombs(state: GameState, dt: number) {
  const survivors: Bomb[] = [];
  for (const bomb of state.bombs) {
    bomb.vy += BOMB_GRAVITY * dt;
    bomb.vx *= Math.pow(0.995, dt * 60);
    bomb.x += bomb.vx * dt;
    bomb.y += bomb.vy * dt;
    bomb.life -= dt;
    if (bomb.x < 0) bomb.x += WORLD_WIDTH;
    if (bomb.x > WORLD_WIDTH) bomb.x -= WORLD_WIDTH;

    const struckPlane = state.players.some((plane) => {
      if (!plane.alive || plane.id === bomb.ownerId || plane.invulnerableFor > 0) return false;
      const owner = state.players.find((candidate) => candidate.id === bomb.ownerId);
      if (owner && areTeammates(state, owner, plane)) return false;
      const dx = wrappedDistance(bomb.x, plane.x);
      const dy = bomb.y - plane.y;
      return dx * dx + dy * dy < 14 * 14;
    });
    if (struckPlane || bomb.y >= groundY(bomb.x, state.landscape) - 4 || bomb.life <= 0) {
      explodeBomb(state, bomb);
      continue;
    }
    survivors.push(bomb);
  }
  state.bombs = survivors;
}

function updateMissiles(state: GameState, dt: number) {
  const survivors: Missile[] = [];
  for (const missile of state.missiles) {
    if (missile.dropFor > 0) {
      missile.dropFor = Math.max(0, missile.dropFor - dt);
      missile.vy += BOMB_GRAVITY * 0.92 * dt;
      if (missile.dropFor === 0 && !missile.boosted) {
        missile.boosted = true;
        missile.vx = Math.cos(missile.angle) * MISSILE_SPEED;
        missile.vy = Math.sin(missile.angle) * MISSILE_SPEED;
      }
    }
    missile.x += missile.vx * dt;
    missile.y += missile.vy * dt;
    missile.life -= dt;
    if (missile.x < 0) missile.x += WORLD_WIDTH;
    if (missile.x > WORLD_WIDTH) missile.x -= WORLD_WIDTH;

    let hit = false;
    const owner = state.players.find((candidate) => candidate.id === missile.ownerId);
    for (const plane of state.players) {
      if (
        !plane.alive ||
        plane.id === missile.ownerId ||
        plane.invulnerableFor > 0 ||
        plane.rollFor > 0
      ) continue;
      if (owner && areTeammates(state, owner, plane)) continue;
      const dx = wrappedDistance(missile.x, plane.x);
      const dy = missile.y - plane.y;
      if (dx * dx + dy * dy >= 13 * 13) continue;
      destroyPlane(state, plane, missile.ownerId, "missile");
      if (owner) awardKill(state, owner, plane.id);
      pushEvent(state, "missile-hit", missile.ownerId, plane.id, missile.x, missile.y);
      hit = true;
      break;
    }
    if (state.winner) {
      state.missiles = [];
      return;
    }
    if (!hit) {
      const struckPilot = state.groundPilots.find((pilot) => {
        if (pilot.ownerId === missile.ownerId || pilot.invulnerableFor > 0) return false;
        const target = state.players.find((plane) => plane.id === pilot.ownerId);
        if (owner && target && areTeammates(state, owner, target)) return false;
        const dx = wrappedDistance(missile.x, pilot.x);
        const dy = missile.y - pilot.y;
        return dx * dx + dy * dy < 10 * 10;
      });
      if (struckPilot) {
        destroyGroundPilot(state, struckPilot, "pilot-vaporized", missile.ownerId);
        pushEvent(state, "missile-hit", missile.ownerId, struckPilot.ownerId, missile.x, missile.y);
        hit = true;
      }
    }
    if (hit) continue;
    if (missile.life <= 0 || missile.y < 0 || missile.y >= groundY(missile.x, state.landscape) - 3) {
      pushEvent(state, "missile-hit", missile.ownerId, undefined, missile.x, missile.y);
      continue;
    }
    survivors.push(missile);
  }
  state.missiles = survivors;
}

function explodeBomb(state: GameState, bomb: Bomb) {
  const owner = state.players.find((candidate) => candidate.id === bomb.ownerId);
  let score = 0;
  for (const plane of state.players) {
    if (!plane.alive || plane.id === bomb.ownerId || plane.invulnerableFor > 0) continue;
    if (owner && areTeammates(state, owner, plane)) continue;
    const dx = wrappedDistance(bomb.x, plane.x);
    const dy = bomb.y - plane.y;
    if (dx * dx + dy * dy > BOMB_BLAST_RADIUS * BOMB_BLAST_RADIUS) continue;
    destroyPlane(state, plane, bomb.ownerId, "bomb");
    pushEvent(state, "score", bomb.ownerId, plane.id);
    score += 1;
  }
  for (const pilot of [...state.groundPilots]) {
    if (pilot.ownerId === bomb.ownerId || pilot.invulnerableFor > 0) continue;
    const target = state.players.find((plane) => plane.id === pilot.ownerId);
    if (owner && target && areTeammates(state, owner, target)) continue;
    const dx = wrappedDistance(bomb.x, pilot.x);
    const dy = bomb.y - pilot.y;
    if (dx * dx + dy * dy <= BOMB_BLAST_RADIUS * BOMB_BLAST_RADIUS) {
      destroyGroundPilot(state, pilot, "pilot-bombed", bomb.ownerId);
    }
  }
  if (owner && score > 0) {
    owner.score += score;
    checkWinner(state, owner);
  }
  pushEvent(state, "bomb-explosion", bomb.ownerId, undefined, bomb.x, bomb.y);
}

function updateBullets(state: GameState, dt: number) {
  const survivors: Bullet[] = [];
  for (const bullet of state.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.x < 0) bullet.x += WORLD_WIDTH;
    if (bullet.x > WORLD_WIDTH) bullet.x -= WORLD_WIDTH;
    if (bullet.life <= 0 || bullet.y < 0 || bullet.y >= groundY(bullet.x, state.landscape)) continue;

    let hit = false;
    const shooter = state.players.find((candidate) => candidate.id === bullet.ownerId);
    for (const plane of state.players) {
      if (
        !plane.alive ||
        plane.id === bullet.ownerId ||
        plane.invulnerableFor > 0 ||
        plane.rollFor > 0
      ) continue;
      if (shooter && areTeammates(state, shooter, plane)) continue;
      const dx = wrappedDistance(bullet.x, plane.x);
      const dy = bullet.y - plane.y;
      if (dx * dx + dy * dy < 12 * 12) {
        const destroyed = applyPlaneHit(state, plane, bullet.ownerId);
        if (destroyed && shooter) awardKill(state, shooter, plane.id);
        hit = true;
        break;
      }
    }
    if (state.winner) {
      state.bullets = [];
      return;
    }
    if (!hit) {
      const struckPilot = state.groundPilots.find((pilot) => {
        if (pilot.ownerId === bullet.ownerId || pilot.invulnerableFor > 0) return false;
        const target = state.players.find((plane) => plane.id === pilot.ownerId);
        if (shooter && target && areTeammates(state, shooter, target)) return false;
        const dx = wrappedDistance(bullet.x, pilot.x);
        const dy = bullet.y - pilot.y;
        return dx * dx + dy * dy < 8 * 8;
      });
      if (struckPilot) {
        destroyGroundPilot(state, struckPilot, "pilot-shot", bullet.ownerId);
        hit = true;
      }
    }
    if (!hit) survivors.push(bullet);
  }
  state.bullets = survivors;
}

function applyPlaneHit(state: GameState, plane: Plane, attackerId: string): boolean {
  plane.damage = (plane.damage ?? 0) + 1;
  if (plane.damage >= (state.planeHits ?? 1)) {
    destroyPlane(state, plane, attackerId, "shot");
    return true;
  }
  pushEvent(state, "plane-hit", attackerId, plane.id, plane.x, plane.y);
  if (state.planeHits === 3 && plane.damage === 2) {
    pushEvent(state, "mayday", attackerId, plane.id, plane.x, plane.y);
  }
  return false;
}

function awardKill(state: GameState, scorer: Plane, targetId: string) {
  scorer.score += 1;
  pushEvent(state, "score", scorer.id, targetId);
  checkWinner(state, scorer);
}

function checkWinner(state: GameState, scorer: Plane) {
  const hadWinner = Boolean(state.winner);
  if (state.scoreLimit === null) return;
  if (state.matchMode === "free-for-all") {
    if (scorer.score >= state.scoreLimit) {
      state.winner = { kind: "pilot", playerId: scorer.id };
    }
    if (!hadWinner && state.winner) pushEvent(state, "victory", scorer.id);
    return;
  }

  if (scorer.team === null) return;
  const teamScore = state.players
    .filter((plane) => plane.team === scorer.team)
    .reduce((total, plane) => total + plane.score, 0);
  if (teamScore >= state.scoreLimit) {
    state.winner = { kind: "team", team: scorer.team };
  }
  if (!hadWinner && state.winner) pushEvent(state, "victory", scorer.id);
}

function updateMissileAwards(state: GameState) {
  for (const plane of state.players) {
    const earnedMilestones = Math.floor(plane.score / 3);
    const awardedMilestones = plane.missileMilestones ?? 0;
    const newMissiles = Math.max(0, earnedMilestones - awardedMilestones);
    if (newMissiles === 0) continue;

    plane.missiles += newMissiles;
    plane.missileMilestones = earnedMilestones;
    pushEvent(state, "missile-award", plane.id);
  }
}

function updatePlaneCollisions(state: GameState) {
  for (let i = 0; i < state.players.length; i += 1) {
    const a = state.players[i];
    if (!a.alive || a.invulnerableFor > 0) continue;
    for (let j = i + 1; j < state.players.length; j += 1) {
      const b = state.players[j];
      if (!b.alive || b.invulnerableFor > 0 || areTeammates(state, a, b)) continue;
      const dx = wrappedDistance(a.x, b.x);
      const dy = a.y - b.y;
      if (dx * dx + dy * dy < 19 * 19) {
        destroyPlane(state, a, b.id, "collision");
        destroyPlane(state, b, a.id, "collision");
      }
    }
  }
}

function destroyPlane(
  state: GameState,
  plane: Plane,
  targetId?: string,
  cause: "shot" | "bomb" | "missile" | "collision" | "crash" | "sea-crash" = "crash",
) {
  if (!plane.alive) return;
  const impactVx = plane.vx;
  const impactVy = plane.vy;
  const ejects = Boolean(
    state.parachuteMode &&
    targetId &&
    (cause === "shot" || cause === "bomb" || cause === "missile"),
  );
  const seaWreck = cause === "sea-crash";
  plane.alive = false;
  plane.stalled = false;
  plane.deaths += 1;
  plane.respawnIn = 2.75;
  plane.vx = 0;
  plane.vy = 0;
  plane.bombs = 0;
  plane.damage = 0;
  plane.pilotDamage = 0;
  plane.rollFor = 0;
  plane.rollCooldown = 0;
  state.bullets = state.bullets.filter((bullet) => bullet.ownerId !== plane.id);
  pushEvent(state, seaWreck ? "sea-crash" : "crash", plane.id, targetId, plane.x, plane.y);
  if (ejects || seaWreck) {
    state.groundPilots = state.groundPilots.filter((pilot) => pilot.ownerId !== plane.id);
    const surface = groundY(plane.x, state.landscape) - 7;
    state.groundPilots.push({
      ownerId: plane.id,
      x: plane.x,
      y: seaWreck ? surface : Math.min(plane.y, surface),
      vx: seaWreck ? 0 : impactVx * 0.12,
      vy: seaWreck ? 0 : Math.max(18, impactVy * 0.08),
      falling: !seaWreck,
      wreck: seaWreck,
      strandedFor: 0,
      aimAngle: 0,
      fireCooldown: 0,
      invulnerableFor: 0.3,
    });
    if (ejects) pushEvent(state, "pilot-eject", plane.id, targetId, plane.x, plane.y);
  }
}

function destroyGroundPilot(
  state: GameState,
  pilot: GroundPilot,
  effect: "pilot-shot" | "pilot-bombed" | "pilot-vaporized",
  attackerId: string,
) {
  state.groundPilots = state.groundPilots.filter((candidate) => candidate !== pilot);
  state.pilotBullets = state.pilotBullets.filter((bullet) => bullet.ownerId !== pilot.ownerId);
  const plane = state.players.find((candidate) => candidate.id === pilot.ownerId);
  if (plane) plane.respawnIn = 2.75;
  pushEvent(state, effect, attackerId, pilot.ownerId, pilot.x, pilot.y);
}

function respawnPlane(plane: Plane, landscape: Landscape = "tower") {
  const spawn = SPAWNS[plane.spawnIndex % SPAWNS.length];
  plane.x = spawn.x;
  plane.y = Math.min(spawn.y, groundY(spawn.x, landscape) - 100);
  plane.vx = Math.cos(spawn.angle) * spawn.speed;
  plane.vy = Math.sin(spawn.angle) * spawn.speed;
  plane.angle = spawn.angle;
  plane.alive = true;
  plane.stalled = false;
  plane.fireCooldown = 0;
  plane.specialCooldown = 0;
  plane.shotsRemaining = MAGAZINE_SIZE;
  plane.reloadIn = 0;
  plane.rollFor = 0;
  plane.rollCooldown = 0;
  plane.respawnIn = 0;
  plane.invulnerableFor = 2.2;
  plane.liftSide = spawn.liftSide;
  plane.bombs = 0;
  plane.damage = 0;
  plane.pilotDamage = 0;
}

export function resetRound(state: GameState) {
  state.time = 0;
  state.nextBulletId = 1;
  state.nextBombId = 1;
  state.nextMissileId = 1;
  state.nextPowerUpId = 1;
  state.nextPilotBulletId = 1;
  state.bullets = [];
  state.bombs = [];
  state.missiles = [];
  state.bombPowerUps = [];
  state.groundPilots = [];
  state.pilotBullets = [];
  state.bombSpawnIn = nextBombDelay(true);
  state.events = [];
  state.winner = null;
  for (const plane of state.players) {
    plane.score = 0;
    plane.deaths = 0;
    plane.missiles = 0;
    plane.missileMilestones = 0;
    plane.joinedAt = 0;
    respawnPlane(plane, state.landscape);
  }
}

function pushEvent(
  state: GameState,
  type: GameEvent["type"],
  playerId: string,
  targetId?: string,
  x?: number,
  y?: number,
) {
  state.events.push({ id: state.nextEventId++, type, playerId, targetId, x, y, time: state.time });
}

export function botInput(state: GameState, botId: string): PilotInput {
  const bot = state.players.find((player) => player.id === botId);
  if (!bot) return { turn: 0, fire: false, bomb: false, roll: false };
  if (!bot.alive) {
    const pilot = state.groundPilots.find((candidate) => candidate.ownerId === botId);
    const target = state.players.find((candidate) => candidate.id !== botId && candidate.alive && !areTeammates(state, bot, candidate));
    if (!pilot || !target) return { turn: 0, fire: false, bomb: false, roll: false };
    const dx = wrappedDistance(target.x, pilot.x);
    const desiredAim = clamp(Math.atan2(dx, Math.max(1, pilot.y - target.y)), -PILOT_AIM_LIMIT, PILOT_AIM_LIMIT);
    const aimDifference = desiredAim - (Number.isFinite(pilot.aimAngle) ? pilot.aimAngle : 0);
    return {
      turn: Math.abs(aimDifference) < 0.035 ? 0 : aimDifference > 0 ? 1 : -1,
      fire: Math.abs(aimDifference) < 0.14,
      bomb: false,
      roll: false,
    };
  }
  const opponents = state.players.filter(
    (player) => player.id !== botId && player.alive && !areTeammates(state, bot, player),
  );
  const target = opponents.sort((a, b) => distanceSquared(bot, a) - distanceSquared(bot, b))[0];

  const weave = Math.sin(state.time * 0.62 + bot.spawnIndex * 1.9) * 0.14;
  let desiredAngle = target ? Math.atan2(target.y - bot.y, wrappedDistance(target.x, bot.x)) + weave : weave;
  const terrainClearance = groundY(bot.x, state.landscape) - bot.y;
  if (bot.stalled || planeSpeed(bot) < 96) {
    desiredAngle = bot.vx >= 0 ? 0.48 : Math.PI - 0.48;
  } else if (terrainClearance < 120 && bot.vy > 12) {
    desiredAngle = bot.vx >= 0 ? -0.42 : -Math.PI + 0.42;
  }

  const difference = angleDifference(desiredAngle, bot.angle);
  const turn: -1 | 0 | 1 = Math.abs(difference) < 0.035 ? 0 : difference > 0 ? 1 : -1;
  const targetDifference = target
    ? Math.abs(angleDifference(Math.atan2(target.y - bot.y, wrappedDistance(target.x, bot.x)), bot.angle))
    : Math.PI;
  const fire = Boolean(target && targetDifference < 0.085 && distanceSquared(bot, target) < 380 * 380);
  const bomb = Boolean(target && (
    (bot.missiles > 0 && targetDifference < 0.1 && distanceSquared(bot, target) < 520 * 520) ||
    (bot.bombs > 0 && target.y > bot.y + 45 && Math.abs(wrappedDistance(target.x, bot.x)) < 95)
  ));
  const threatened = [...state.bullets, ...state.missiles].some((projectile) => {
    if (projectile.ownerId === bot.id) return false;
    const dx = wrappedDistance(bot.x, projectile.x);
    const dy = bot.y - projectile.y;
    const approaching = dx * projectile.vx + dy * projectile.vy > 0;
    return approaching && dx * dx + dy * dy < 95 * 95;
  });
  return { turn, fire, bomb, roll: threatened };
}

function nextBombDelay(first: boolean) {
  return (first ? 7 : 13) + Math.random() * (first ? 5 : 8);
}

function distanceSquared(a: Plane, b: Plane): number {
  const dx = wrappedDistance(b.x, a.x);
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

function areTeammates(state: GameState, a: Plane, b: Plane): boolean {
  return state.matchMode === "teams" && a.team !== null && a.team === b.team;
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
