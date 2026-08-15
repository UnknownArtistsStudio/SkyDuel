export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 675;
export const MAX_PLAYERS = 6;
export const STALL_SPEED = 78;
export const RECOVERY_SPEED = 102;
export const BOMB_BLAST_RADIUS = 132;
export const CLOUD_COUNT = 2;
export const MAGAZINE_SIZE = 3;
export const RELOAD_TIME = 1.35;
export const ROLL_DURATION = 0.58;
export const ROLL_RECHARGE = 1.35;
export const MISSILE_DROP_TIME = 0.42;
export const TOWER_X = WORLD_WIDTH / 2;
export const TOWER_TOP_Y = 490;
export const TOWER_BUZZ_DURATION = 3.2;

export type MatchMode = "free-for-all" | "teams";
export type Team = 0 | 1;
export type TeamPreference = Team | "auto";
export type ScoreLimit = 5 | 10 | 20 | null;
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
    | "score"
    | "stall"
    | "recover"
    | "bomb-drop"
    | "bomb-explosion"
    | "bomb-pickup"
    | "missile-award"
    | "missile-launch"
    | "missile-hit"
    | "tower-buzz";
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
  nextEventId: number;
  players: Plane[];
  bullets: Bullet[];
  bombs: Bomb[];
  missiles: Missile[];
  bombPowerUps: BombPowerUp[];
  bombSpawnIn: number;
  events: GameEvent[];
  matchMode: MatchMode;
  scoreLimit: ScoreLimit;
  bombsEnabled: boolean;
  winner: GameWinner | null;
  towerBuzz: { playerId: string; time: number } | null;
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
): GameState {
  return {
    time: 0,
    nextBulletId: 1,
    nextBombId: 1,
    nextMissileId: 1,
    nextPowerUpId: 1,
    nextEventId: 1,
    players: [],
    bullets: [],
    bombs: [],
    missiles: [],
    bombPowerUps: [],
    bombSpawnIn: nextBombDelay(true),
    events: [],
    matchMode,
    scoreLimit,
    bombsEnabled,
    winner: null,
    towerBuzz: null,
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
  const plane = makePlane(id, cleanName(name), index, team);
  state.players.push(plane);
  return plane;
}

export function removePlayer(state: GameState, id: string) {
  state.players = state.players.filter((player) => player.id !== id);
  state.bullets = state.bullets.filter((bullet) => bullet.ownerId !== id);
  state.bombs = state.bombs.filter((bomb) => bomb.ownerId !== id);
  state.missiles = state.missiles.filter((missile) => missile.ownerId !== id);
}

function makePlane(id: string, name: string, spawnIndex: number, team: Team | null): Plane {
  const spawn = SPAWNS[spawnIndex % SPAWNS.length];
  return {
    id,
    name,
    color: team === null ? COLORS[spawnIndex % COLORS.length] : TEAM_COLORS[team],
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

export function groundY(x: number): number {
  void x;
  return 620;
}

export function planeSpeed(plane: Plane): number {
  return Math.hypot(plane.vx, plane.vy);
}

export function cloudPosition(time: number, cloudIndex: number) {
  const index = Math.abs(Math.trunc(cloudIndex)) % CLOUD_COUNT;
  const cloud = index === 0
    ? { startX: 155, y: 105, speed: 1.2, size: 1.2, phase: 0 }
    : { startX: 905, y: 205, speed: 0.86, size: 1, phase: 2.4 };
  const span = WORLD_WIDTH + 260;
  const x = (cloud.startX + time * cloud.speed) % span - 130;
  const y = cloud.y + Math.round(Math.sin(time * 0.18 + cloud.phase) * 3);
  return { x, y, size: cloud.size };
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
      plane.respawnIn -= safeDt;
      if (plane.respawnIn <= 0) respawnPlane(plane);
      continue;
    }

    const input = inputs[plane.id] ?? { turn: 0, fire: false, bomb: false, roll: false };
    const previousX = plane.x;
    const previousY = plane.y;
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

    detectTowerBuzz(state, plane, previousX, previousY);

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

    if (plane.y + PLANE_RADIUS >= groundY(plane.x)) {
      destroyPlane(state, plane, undefined);
    }
  }

  updateBombPowerUps(state, safeDt);
  updateBombs(state, safeDt);
  updateMissiles(state, safeDt);
  updateBullets(state, safeDt);
  if (!state.winner) updatePlaneCollisions(state);
  if (!state.winner) updateMissileAwards(state);
  if (state.winner) {
    state.bullets = [];
    state.bombs = [];
    state.missiles = [];
    state.bombPowerUps = [];
  }
}

function detectTowerBuzz(state: GameState, plane: Plane, previousX: number, previousY: number) {
  if (state.towerBuzz || plane.invulnerableFor > 0) return;
  const crossedTower =
    (previousX < TOWER_X && plane.x >= TOWER_X) ||
    (previousX > TOWER_X && plane.x <= TOWER_X);
  if (!crossedTower || Math.abs(plane.vx) < 100) return;

  const passY = (previousY + plane.y) / 2;
  const clearedRoof = passY <= TOWER_TOP_Y - PLANE_RADIUS;
  const flewCloseEnough = passY >= TOWER_TOP_Y - 72;
  if (!clearedRoof || !flewCloseEnough) return;

  state.towerBuzz = { playerId: plane.id, time: state.time };
  pushEvent(state, "tower-buzz", plane.id, undefined, TOWER_X, passY);
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
    if (struckPlane || bomb.y >= groundY(bomb.x) - 4 || bomb.life <= 0) {
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
      if (owner) {
        owner.score += 1;
        checkWinner(state, owner);
      }
      destroyPlane(state, plane, missile.ownerId);
      if (owner) pushEvent(state, "score", owner.id, plane.id);
      pushEvent(state, "missile-hit", missile.ownerId, plane.id, missile.x, missile.y);
      hit = true;
      break;
    }
    if (state.winner) {
      state.missiles = [];
      return;
    }
    if (hit) continue;
    if (missile.life <= 0 || missile.y < 0 || missile.y >= groundY(missile.x) - 3) {
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
    destroyPlane(state, plane, bomb.ownerId);
    pushEvent(state, "score", bomb.ownerId, plane.id);
    score += 1;
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
    if (bullet.life <= 0 || bullet.y < 0 || bullet.y >= groundY(bullet.x)) continue;

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
        if (shooter) {
          shooter.score += 1;
          checkWinner(state, shooter);
        }
        destroyPlane(state, plane, bullet.ownerId);
        if (shooter) pushEvent(state, "score", shooter.id, plane.id);
        hit = true;
        break;
      }
    }
    if (state.winner) {
      state.bullets = [];
      return;
    }
    if (!hit) survivors.push(bullet);
  }
  state.bullets = survivors;
}

function checkWinner(state: GameState, scorer: Plane) {
  if (state.scoreLimit === null) return;
  if (state.matchMode === "free-for-all") {
    if (scorer.score >= state.scoreLimit) {
      state.winner = { kind: "pilot", playerId: scorer.id };
    }
    return;
  }

  if (scorer.team === null) return;
  const teamScore = state.players
    .filter((plane) => plane.team === scorer.team)
    .reduce((total, plane) => total + plane.score, 0);
  if (teamScore >= state.scoreLimit) {
    state.winner = { kind: "team", team: scorer.team };
  }
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
  plane.respawnIn = 2.75;
  plane.vx = 0;
  plane.vy = 0;
  plane.bombs = 0;
  plane.rollFor = 0;
  plane.rollCooldown = 0;
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
  plane.specialCooldown = 0;
  plane.shotsRemaining = MAGAZINE_SIZE;
  plane.reloadIn = 0;
  plane.rollFor = 0;
  plane.rollCooldown = 0;
  plane.respawnIn = 0;
  plane.invulnerableFor = 2.2;
  plane.liftSide = spawn.liftSide;
  plane.bombs = 0;
}

export function resetRound(state: GameState) {
  state.time = 0;
  state.nextBulletId = 1;
  state.nextBombId = 1;
  state.nextMissileId = 1;
  state.nextPowerUpId = 1;
  state.bullets = [];
  state.bombs = [];
  state.missiles = [];
  state.bombPowerUps = [];
  state.bombSpawnIn = nextBombDelay(true);
  state.events = [];
  state.winner = null;
  state.towerBuzz = null;
  for (const plane of state.players) {
    plane.score = 0;
    plane.deaths = 0;
    plane.missiles = 0;
    plane.missileMilestones = 0;
    respawnPlane(plane);
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
  if (!bot || !bot.alive) return { turn: 0, fire: false, bomb: false, roll: false };
  const opponents = state.players.filter(
    (player) => player.id !== botId && player.alive && !areTeammates(state, bot, player),
  );
  const target = opponents.sort((a, b) => distanceSquared(bot, a) - distanceSquared(bot, b))[0];

  const weave = Math.sin(state.time * 0.62 + bot.spawnIndex * 1.9) * 0.14;
  let desiredAngle = target ? Math.atan2(target.y - bot.y, wrappedDistance(target.x, bot.x)) + weave : weave;
  const terrainClearance = groundY(bot.x) - bot.y;
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
