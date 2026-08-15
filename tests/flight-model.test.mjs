import assert from "node:assert/strict";
import test from "node:test";

import {
  addPlayer,
  bombPowerUpPosition,
  cloudPosition,
  createGame,
  groundY,
  MISSILE_DROP_TIME,
  planeInCloud,
  planeSpeed,
  resetRound,
  ROLL_RECHARGE,
  SEA_WRECK_SINK_TIME,
  stepGame,
} from "../lib/game-core.ts";

const FRAME = 1 / 60;

function planeAtSpawn(spawnIndex) {
  const state = createGame();
  let plane;
  for (let index = 0; index <= spawnIndex; index += 1) {
    plane = addPlayer(state, `pilot-${index}`, `PILOT ${index}`);
  }
  state.players = [plane];
  return { state, plane };
}

function fly(state, plane, seconds, inputFor = () => ({ turn: 0, fire: false })) {
  let minimumClearance = Infinity;
  for (let frame = 0; frame < seconds * 60; frame += 1) {
    stepGame(state, { [plane.id]: inputFor(frame * FRAME, plane) }, FRAME);
    if (plane.alive) {
      minimumClearance = Math.min(minimumClearance, groundY(plane.x) - plane.y - 12);
    }
  }
  return minimumClearance;
}

test("automatic engine power keeps every spawn safely airborne", () => {
  for (let spawnIndex = 0; spawnIndex < 6; spawnIndex += 1) {
    const { state, plane } = planeAtSpawn(spawnIndex);
    const minimumClearance = fly(state, plane, 30);

    assert.equal(plane.deaths, 0, `spawn ${spawnIndex} crashed in level flight`);
    assert.ok(minimumClearance > 80, `spawn ${spawnIndex} flew too close to terrain`);
    assert.ok(planeSpeed(plane) > 185, `spawn ${spawnIndex} lost engine speed`);
  }
});

test("a climb and counter-turn gains altitude without a false stall", () => {
  const { state, plane } = planeAtSpawn(0);
  const startingY = plane.y;

  fly(state, plane, 8, (time) => ({
    turn: time < 0.5 ? -1 : time < 1 ? 1 : 0,
    fire: false,
  }));

  assert.equal(plane.deaths, 0);
  assert.equal(plane.stalled, false);
  assert.ok(plane.y < startingY - 50, "the aircraft did not carry through the climb");
  assert.ok(planeSpeed(plane) > 165, "the aircraft lost too much speed in a normal climb");
});

test("a genuine low-speed stall can recover by pointing the nose down", () => {
  const { state, plane } = planeAtSpawn(0);
  plane.y = 220;
  let sawStall = false;
  let sawRecovery = false;

  for (let frame = 0; frame < 6 * 60; frame += 1) {
    if (plane.stalled) sawStall = true;
    const turn = !sawStall ? -1 : plane.angle < 0.4 ? 1 : 0;
    const wasStalled = plane.stalled;
    stepGame(state, { [plane.id]: { turn, fire: false } }, FRAME);
    if (wasStalled && !plane.stalled && plane.alive) {
      sawRecovery = true;
      break;
    }
  }

  assert.equal(sawStall, true, "the prolonged climb never stalled");
  assert.equal(sawRecovery, true, "the aircraft did not recover after diving");
  assert.equal(plane.deaths, 0, "the aircraft crashed before recovery");
  assert.ok(planeSpeed(plane) > 102, "recovery happened without rebuilding airspeed");
});

test("flashing respawns can neither shoot nor be shot", () => {
  const state = createGame();
  const protectedPlane = addPlayer(state, "protected", "SAFE");
  const attacker = addPlayer(state, "attacker", "ATTACKER");
  attacker.invulnerableFor = 0;

  stepGame(state, { protected: { turn: 0, fire: true } }, FRAME);
  assert.equal(state.bullets.length, 0, "a protected plane fired a bullet");

  state.bullets.push({
    id: state.nextBulletId++,
    ownerId: attacker.id,
    x: protectedPlane.x,
    y: protectedPlane.y,
    vx: 0,
    vy: 0,
    life: 1,
  });
  stepGame(state, {}, 0);
  assert.equal(protectedPlane.alive, true, "a protected plane was shot");

  protectedPlane.invulnerableFor = 0;
  stepGame(state, {}, 0);
  assert.equal(protectedPlane.alive, false, "the plane remained protected after flashing ended");
});

test("shot events remain long enough to reach multiplayer snapshots", () => {
  const state = createGame();
  const shooter = addPlayer(state, "shooter", "SHOOTER");
  shooter.invulnerableFor = 0;

  stepGame(state, { [shooter.id]: { turn: 0, fire: true } }, 0);
  assert.ok(state.events.some((event) => event.type === "shot"));

  for (let frame = 0; frame < 6; frame += 1) stepGame(state, {}, 0.05);
  assert.ok(state.events.some((event) => event.type === "shot"), "the shot vanished before a network snapshot");

  for (let frame = 0; frame < 4; frame += 1) stepGame(state, {}, 0.05);
  assert.equal(state.events.some((event) => event.type === "shot"), false);
});

test("guns fire three-shot bursts and then reload", () => {
  const state = createGame("free-for-all", null);
  const shooter = addPlayer(state, "shooter", "SHOOTER");
  shooter.invulnerableFor = 0;

  for (let shot = 0; shot < 3; shot += 1) {
    shooter.fireCooldown = 0;
    stepGame(state, { shooter: { turn: 0, fire: true, bomb: false, roll: false } }, 0);
  }
  assert.equal(shooter.shotsRemaining, 0);
  assert.ok(shooter.reloadIn > 1);
  assert.equal(state.bullets.length, 3);

  shooter.fireCooldown = 0;
  stepGame(state, { shooter: { turn: 0, fire: true, bomb: false, roll: false } }, 0);
  assert.equal(state.bullets.length, 3, "the empty gun fired a fourth shot");

  for (let frame = 0; frame < 30; frame += 1) stepGame(state, {}, 0.05);
  assert.equal(shooter.shotsRemaining, 3);
  assert.equal(shooter.reloadIn, 0);
});

test("a timed barrel roll dodges bullets but ends cleanly", () => {
  const state = createGame("free-for-all", null);
  const defender = addPlayer(state, "defender", "DEFENDER");
  const attacker = addPlayer(state, "attacker", "ATTACKER");
  defender.invulnerableFor = 0;
  attacker.invulnerableFor = 0;
  state.bullets.push({
    id: state.nextBulletId++,
    ownerId: attacker.id,
    x: defender.x,
    y: defender.y,
    vx: 0,
    vy: 0,
    life: 1,
  });

  stepGame(state, { defender: { turn: 0, fire: false, bomb: false, roll: true } }, 0);
  assert.equal(defender.alive, true);
  assert.ok(defender.rollFor > 0);
  assert.equal(state.bullets.length, 1, "the roll should evade rather than erase the bullet");

  defender.rollFor = 0;
  stepGame(state, {}, 0);
  assert.equal(defender.alive, false, "the dodge remained active after the roll ended");
});

test("barrel rolls require a short recharge before another dodge", () => {
  const state = createGame("free-for-all", null);
  const pilot = addPlayer(state, "pilot", "PILOT");
  pilot.invulnerableFor = 0;

  stepGame(state, { pilot: { turn: 0, fire: false, bomb: false, roll: true } }, 0);
  assert.equal(pilot.rollCooldown, ROLL_RECHARGE);
  pilot.rollFor = 0;
  stepGame(state, { pilot: { turn: 0, fire: false, bomb: false, roll: true } }, 0);
  assert.equal(pilot.rollFor, 0, "a second roll started during the recharge beat");

  for (let frame = 0; frame < 28; frame += 1) stepGame(state, {}, 0.05);
  stepGame(state, { pilot: { turn: 0, fire: false, bomb: false, roll: true } }, 0);
  assert.ok(pilot.rollFor > 0, "the roll did not return after recharging");
});

test("three-hit mode shows two damage stages before a plane explodes", () => {
  const state = createGame("free-for-all", null, false, true, 3);
  const shooter = addPlayer(state, "shooter", "SHOOTER");
  const target = addPlayer(state, "target", "TARGET");
  shooter.invulnerableFor = 0;
  target.invulnerableFor = 0;

  for (let hit = 1; hit <= 3; hit += 1) {
    state.bullets.push({
      id: state.nextBulletId++,
      ownerId: shooter.id,
      x: target.x,
      y: target.y,
      vx: 0,
      vy: 0,
      life: 1,
    });
    stepGame(state, {}, 0);
    assert.equal(target.damage, hit < 3 ? hit : 0);
    assert.equal(target.alive, hit < 3);
  }

  assert.equal(shooter.score, 1);
  assert.equal(state.events.filter((event) => event.type === "plane-hit").length, 2);
  const mayday = state.events.filter((event) => event.type === "mayday");
  assert.equal(mayday.length, 1, "the critical-damage warning did not fire exactly once");
  assert.equal(mayday[0].targetId, target.id);
});

test("parachute mode ejects an armed vulnerable pilot after every weapon takedown", () => {
  const state = createGame("free-for-all", null, false, true, 1);
  const carrier = addPlayer(state, "carrier", "CARRIER");
  const attacker = addPlayer(state, "attacker", "ATTACKER");
  carrier.invulnerableFor = 0;
  attacker.invulnerableFor = 0;
  state.bullets.push({
    id: state.nextBulletId++,
    ownerId: attacker.id,
    x: carrier.x,
    y: carrier.y,
    vx: 0,
    vy: 0,
    life: 1,
  });
  stepGame(state, {}, 0);
  assert.equal(carrier.alive, false);
  assert.equal(state.groundPilots[0]?.ownerId, carrier.id);
  assert.equal(state.groundPilots[0]?.falling, true);

  stepGame(state, { carrier: { turn: 0, fire: true, bomb: false, roll: false } }, 0);
  assert.ok(state.pilotBullets.some((bullet) => bullet.ownerId === carrier.id));

  state.groundPilots[0].fireCooldown = 0;
  stepGame(state, { carrier: { turn: 1, fire: true, bomb: false, roll: false } }, 0);
  const angledShot = state.pilotBullets.at(-1);
  assert.ok(angledShot.vx > 300 && angledShot.vy === 0, "the pilot gun did not aim sideways");

  state.groundPilots[0].fireCooldown = 0;
  stepGame(state, { carrier: { turn: 1, fire: true, bomb: false, roll: false, aimUp: true } }, 0);
  const diagonalShot = state.pilotBullets.at(-1);
  assert.ok(
    diagonalShot.vx > 200 && diagonalShot.vx < 300 && diagonalShot.vy < -200,
    "the pilot gun did not aim diagonally",
  );
  assert.equal(state.groundPilots[0].aim, 1);

  const pilot = state.groundPilots[0];
  pilot.invulnerableFor = 0;
  state.bullets.push({
    id: state.nextBulletId++,
    ownerId: attacker.id,
    x: pilot.x,
    y: pilot.y,
    vx: 0,
    vy: 0,
    life: 1,
  });
  stepGame(state, {}, 0);
  assert.equal(state.groundPilots.length, 0);
  assert.ok(state.events.some((event) => event.type === "pilot-shot"));

  for (let frame = 0; frame < 60; frame += 1) stepGame(state, {}, 0.05);
  assert.equal(carrier.alive, true);
  carrier.invulnerableFor = 0;
  state.bullets.push({
    id: state.nextBulletId++,
    ownerId: attacker.id,
    x: carrier.x,
    y: carrier.y,
    vx: 0,
    vy: 0,
    life: 1,
  });
  stepGame(state, {}, 0);
  assert.equal(state.groundPilots[0]?.ownerId, carrier.id, "the second takedown did not eject the pilot");

  const disabled = createGame("free-for-all", null, false, false, 1);
  const grounded = addPlayer(disabled, "grounded", "GROUNDED");
  const rival = addPlayer(disabled, "rival", "RIVAL");
  grounded.invulnerableFor = 0;
  disabled.bullets.push({
    id: disabled.nextBulletId++,
    ownerId: rival.id,
    x: grounded.x,
    y: grounded.y,
    vx: 0,
    vy: 0,
    life: 1,
  });
  stepGame(disabled, {}, 0);
  assert.equal(disabled.groundPilots.length, 0, "parachute mode off still ejected a pilot");
});

test("the pilot machine gun needs sustained fire to destroy a plane", () => {
  const state = createGame("free-for-all", null, false, true, 1);
  const gunner = addPlayer(state, "gunner", "GUNNER");
  const target = addPlayer(state, "target", "TARGET");
  gunner.alive = false;
  gunner.respawnIn = 3;
  target.invulnerableFor = 0;
  state.groundPilots.push({
    ownerId: gunner.id,
    x: target.x,
    y: 580,
    vx: 0,
    vy: 0,
    falling: false,
    wreck: false,
    fireCooldown: 0,
    invulnerableFor: 0,
  });

  for (let hit = 1; hit <= 6; hit += 1) {
    state.pilotBullets.push({
      id: state.nextPilotBulletId++,
      ownerId: gunner.id,
      x: target.x,
      y: target.y,
      vx: 0,
      vy: 0,
      life: 1,
    });
    stepGame(state, {}, 0);
    assert.equal(target.alive, hit < 6);
  }

  assert.equal(gunner.score, 1);
});

test("bombs throw ground pilots and missiles vaporize them", () => {
  const bombState = createGame("free-for-all", null, true, true);
  const bomber = addPlayer(bombState, "bomber", "BOMBER");
  const bombTarget = addPlayer(bombState, "target", "TARGET");
  bombTarget.alive = false;
  bombState.groundPilots.push({
    ownerId: bombTarget.id,
    x: 500,
    y: groundY(500) - 7,
    vx: 0,
    vy: 0,
    falling: false,
    wreck: false,
    fireCooldown: 0,
    invulnerableFor: 0,
  });
  bombState.bombs.push({
    id: bombState.nextBombId++,
    ownerId: bomber.id,
    x: 500,
    y: groundY(500) - 3,
    vx: 0,
    vy: 0,
    life: 1,
  });
  stepGame(bombState, {}, 0);
  assert.ok(bombState.events.some((event) => event.type === "pilot-bombed"));

  const missileState = createGame();
  const attacker = addPlayer(missileState, "attacker", "ATTACKER");
  const missileTarget = addPlayer(missileState, "target", "TARGET");
  missileTarget.alive = false;
  missileState.groundPilots.push({
    ownerId: missileTarget.id,
    x: 500,
    y: 300,
    vx: 0,
    vy: 0,
    falling: true,
    wreck: false,
    fireCooldown: 0,
    invulnerableFor: 0,
  });
  missileState.missiles.push({
    id: missileState.nextMissileId++,
    ownerId: attacker.id,
    x: 500,
    y: 300,
    vx: 0,
    vy: 0,
    angle: 0,
    dropFor: 0,
    boosted: true,
    life: 1,
  });
  stepGame(missileState, {}, 0);
  assert.ok(missileState.events.some((event) => event.type === "pilot-vaporized"));
});

test("sea crashes splash, stranded wreck pilots sink, and mountain spawns stay safe", () => {
  const sea = createGame("free-for-all", null, false, true, 1, "sea");
  const pilot = addPlayer(sea, "pilot", "PILOT");
  const wingman = addPlayer(sea, "wingman", "WINGMAN");
  pilot.invulnerableFor = 0;
  wingman.invulnerableFor = 0;
  pilot.x = 420;
  wingman.x = 780;
  pilot.y = groundY(pilot.x, "sea") - 12;
  wingman.y = groundY(wingman.x, "sea") - 12;
  stepGame(sea, {}, 0);
  assert.equal(pilot.alive, false);
  assert.equal(wingman.alive, false);
  assert.equal(sea.groundPilots.length, 2);
  assert.ok(sea.groundPilots.every((groundPilot) => groundPilot.wreck));
  assert.equal(sea.events.filter((event) => event.type === "sea-crash").length, 2);
  assert.equal(sea.events.some((event) => event.type === "pilot-eject"), false);

  for (let elapsed = 0; elapsed <= SEA_WRECK_SINK_TIME; elapsed += 0.05) stepGame(sea, {}, 0.05);
  assert.equal(sea.groundPilots.length, 0);
  assert.equal(sea.events.filter((event) => event.type === "sea-sink").length, 2);
  for (let elapsed = 0; elapsed < 1; elapsed += 0.05) stepGame(sea, {}, 0.05);
  assert.equal(pilot.alive, true);
  assert.equal(wingman.alive, true);

  const mountainHeights = [155, 410, 705, 1015].map((x) => 620 - groundY(x, "mountains"));
  assert.ok(Math.max(...mountainHeights) <= 120);
  assert.ok(new Set(mountainHeights).size >= 3);

  const mountains = createGame("free-for-all", null, false, true, 1, "mountains");
  for (let index = 0; index < 6; index += 1) addPlayer(mountains, `mountain-${index}`, `M${index}`);
  assert.ok(mountains.players.every((plane) => groundY(plane.x, "mountains") - plane.y >= 100));
});

test("large clouds hide planes", () => {
  const state = createGame();
  const pilot = addPlayer(state, "pilot", "PILOT");
  const cloud = cloudPosition(state.time, 2);
  pilot.x = cloud.x + 40 * cloud.size;
  pilot.y = cloud.y + 15 * cloud.size;
  assert.equal(planeInCloud(state, pilot), true);
});

test("pilot machine-gun bullets can hit rival ground pilots", () => {
  const state = createGame("free-for-all", null, false, true, 1, "sea");
  const shooter = addPlayer(state, "shooter", "SHOOTER");
  const target = addPlayer(state, "target", "TARGET");
  shooter.alive = false;
  target.alive = false;
  state.groundPilots = [
    { ownerId: shooter.id, x: 300, y: 591, vx: 0, vy: 0, falling: false, wreck: true, strandedFor: 0, aim: 1, fireCooldown: 0, invulnerableFor: 0 },
    { ownerId: target.id, x: 500, y: 591, vx: 0, vy: 0, falling: false, wreck: true, strandedFor: 0, aim: -1, fireCooldown: 0, invulnerableFor: 0 },
  ];
  stepGame(state, { shooter: { turn: 1, fire: true, bomb: false, roll: false } }, 0);
  for (let frame = 0; frame < 16 && state.groundPilots.some((pilot) => pilot.ownerId === target.id); frame += 1) {
    stepGame(state, {}, 0.05);
  }
  assert.equal(state.groundPilots.some((groundPilot) => groundPilot.ownerId === target.id), false);
  assert.ok(state.events.some((event) => event.type === "pilot-shot"));
});

test("every pilot earns an accumulating missile at each three-kill milestone", () => {
  const state = createGame("free-for-all", null);
  const leader = addPlayer(state, "leader", "LEADER");
  const rival = addPlayer(state, "rival", "RIVAL");
  leader.score = 3;
  rival.score = 3;
  leader.invulnerableFor = 0;

  stepGame(state, {}, 0);
  assert.equal(leader.missiles, 1);
  assert.equal(rival.missiles, 1, "the other pilot did not receive the same milestone reward");
  assert.equal(leader.missileMilestones, 1);
  assert.equal(rival.missileMilestones, 1);
  assert.equal(state.events.filter((event) => event.type === "missile-award").length, 2);
  stepGame(state, {}, 0);
  assert.equal(state.events.filter((event) => event.type === "missile-award").length, 2, "the milestone repeatedly awarded missiles");

  stepGame(state, { leader: { turn: 0, fire: false, bomb: true, roll: false } }, 0);
  assert.equal(leader.missiles, 0);
  assert.equal(state.missiles.length, 1);
  assert.equal(state.missiles[0].boosted, false);
  const launchY = state.missiles[0].y;
  for (let frame = 0; frame < 7; frame += 1) stepGame(state, {}, 0.05);
  assert.equal(state.missiles[0]?.boosted, false, "the missile ignited before its drop was visible");
  assert.ok(state.missiles[0].y > launchY + 8, "the missile did not fall away from the aircraft");
  for (let frame = 0; frame < 3; frame += 1) stepGame(state, {}, 0.05);
  assert.equal(state.missiles[0]?.boosted, true, "the missile never ignited after its drop");
  assert.equal(MISSILE_DROP_TIME, 0.42);
  assert.ok(Math.hypot(state.missiles[0].vx, state.missiles[0].vy) > 500);

  leader.score = 5;
  stepGame(state, {}, 0);
  assert.equal(leader.missiles, 0, "a missile was awarded before the next three-kill milestone");

  leader.score = 6;
  rival.score = 6;
  stepGame(state, {}, 0);
  assert.equal(leader.missiles, 1, "the pilot did not earn another missile at six kills");
  assert.equal(rival.missiles, 2, "unused missiles did not accumulate");
  assert.equal(leader.missileMilestones, 2);
  assert.equal(rival.missileMilestones, 2);
});

test("barrel rolls also dodge missiles", () => {
  const state = createGame("free-for-all", null);
  const defender = addPlayer(state, "defender", "DEFENDER");
  const attacker = addPlayer(state, "attacker", "ATTACKER");
  defender.invulnerableFor = 0;
  attacker.invulnerableFor = 0;
  state.missiles.push({
    id: state.nextMissileId++,
    ownerId: attacker.id,
    x: defender.x,
    y: defender.y,
    vx: 0,
    vy: 0,
    angle: 0,
    dropFor: 0,
    boosted: true,
    life: 1,
  });

  stepGame(state, { defender: { turn: 0, fire: false, bomb: false, roll: true } }, 0);
  assert.equal(defender.alive, true);
  defender.rollFor = 0;
  stepGame(state, {}, 0);
  assert.equal(defender.alive, false);
  assert.equal(attacker.score, 1);
});

test("missiles ignore teammates and take priority over carried bombs", () => {
  const state = createGame("teams", null, true);
  const leader = addPlayer(state, "leader", "LEADER", 0);
  const teammate = addPlayer(state, "teammate", "TEAMMATE", 0);
  addPlayer(state, "rival", "RIVAL", 1);
  leader.invulnerableFor = 0;
  teammate.invulnerableFor = 0;
  leader.missiles = 1;
  leader.bombs = 1;

  stepGame(state, { leader: { turn: 0, fire: false, bomb: true, roll: false } }, 0);
  assert.equal(leader.missiles, 0);
  assert.equal(leader.bombs, 1, "launching a missile also consumed the bomb");
  assert.equal(state.missiles.length, 1);
  assert.equal(state.bombs.length, 0);

  const missile = state.missiles[0];
  missile.x = teammate.x;
  missile.y = teammate.y;
  missile.vx = 0;
  missile.vy = 0;
  missile.dropFor = 0;
  missile.boosted = true;
  stepGame(state, {}, 0);
  assert.equal(teammate.alive, true, "a missile hit its owner's teammate");
});

test("team rooms balance automatic choices and prevent friendly fire", () => {
  const state = createGame("teams");
  const redOne = addPlayer(state, "red-one", "RED ONE", 0);
  const redTwo = addPlayer(state, "red-two", "RED TWO", 0);
  const green = addPlayer(state, "green", "GREEN", "auto");
  redOne.invulnerableFor = 0;
  redTwo.invulnerableFor = 0;
  green.invulnerableFor = 0;

  assert.equal(redOne.team, 0);
  assert.equal(redTwo.team, 0);
  assert.equal(green.team, 1);

  state.bullets.push({
    id: state.nextBulletId++,
    ownerId: redOne.id,
    x: redTwo.x,
    y: redTwo.y,
    vx: 0,
    vy: 0,
    life: 1,
  });
  stepGame(state, {}, 0);
  assert.equal(redTwo.alive, true, "friendly fire damaged a teammate");

  state.bullets.push({
    id: state.nextBulletId++,
    ownerId: redOne.id,
    x: green.x,
    y: green.y,
    vx: 0,
    vy: 0,
    life: 1,
  });
  stepGame(state, {}, 0);
  assert.equal(green.alive, false, "an opposing team could not be shot");
  assert.equal(redOne.score, 1);
});

test("bomb power-ups can be collected and dropped", () => {
  const state = createGame("free-for-all", null, true);
  const pilot = addPlayer(state, "pilot", "PILOT");
  state.bombPowerUps = [{ id: state.nextPowerUpId++, cloudIndex: 0 }];
  const pickup = bombPowerUpPosition(state, state.bombPowerUps[0]);
  pilot.x = pickup.x;
  pilot.y = pickup.y;

  stepGame(state, {}, 0);
  assert.equal(pilot.bombs, 1);
  assert.equal(state.bombPowerUps.length, 0);
  assert.ok(state.events.some((event) => event.type === "bomb-pickup"));

  pilot.invulnerableFor = 0;
  stepGame(state, { pilot: { turn: 0, fire: false, bomb: true } }, 0);
  assert.equal(pilot.bombs, 0);
  assert.equal(state.bombs.length, 1);
  assert.ok(state.events.some((event) => event.type === "bomb-drop"));
});

test("a dropped bomb visibly detonates when it reaches the ground", () => {
  const state = createGame("free-for-all", null, true);
  const pilot = addPlayer(state, "pilot", "PILOT");
  pilot.x = 400;
  pilot.y = 260;
  pilot.vy = 0;
  pilot.invulnerableFor = 0;
  pilot.bombs = 1;

  stepGame(state, { pilot: { turn: 0, fire: false, bomb: true, roll: false } }, 0);
  for (let frame = 0; frame < 300 && state.bombs.length > 0; frame += 1) {
    stepGame(state, {}, FRAME);
  }

  const explosion = state.events.find((event) => event.type === "bomb-explosion");
  assert.equal(state.bombs.length, 0, "the bomb passed through the ground");
  assert.ok(explosion, "the ground impact did not emit an explosion effect");
  assert.ok(explosion.y >= groundY(explosion.x) - 6, "the explosion appeared above the impact point");
});

test("one bomb blast can score several opponents", () => {
  const state = createGame("free-for-all", null, true);
  const owner = addPlayer(state, "owner", "OWNER");
  const first = addPlayer(state, "first", "FIRST");
  const second = addPlayer(state, "second", "SECOND");
  owner.x = 500;
  owner.y = 150;
  first.x = 470;
  first.y = 570;
  second.x = 555;
  second.y = 565;
  owner.invulnerableFor = 0;
  first.invulnerableFor = 0;
  second.invulnerableFor = 0;
  state.bombs.push({
    id: state.nextBombId++,
    ownerId: owner.id,
    x: 510,
    y: groundY(510) - 3,
    vx: 0,
    vy: 0,
    life: 1,
  });

  stepGame(state, {}, 0);
  assert.equal(first.alive, false);
  assert.equal(second.alive, false);
  assert.equal(owner.alive, true);
  assert.equal(owner.score, 2);
  assert.ok(state.events.some((event) => event.type === "bomb-explosion"));
});

test("bomb blasts preserve team protection", () => {
  const state = createGame("teams", null, true);
  const owner = addPlayer(state, "owner", "OWNER", 0);
  const teammate = addPlayer(state, "teammate", "TEAMMATE", 0);
  const opponent = addPlayer(state, "opponent", "OPPONENT", 1);
  owner.x = 400;
  owner.y = 150;
  teammate.x = 430;
  teammate.y = 570;
  opponent.x = 485;
  opponent.y = 570;
  for (const plane of state.players) plane.invulnerableFor = 0;
  state.bombs.push({
    id: state.nextBombId++,
    ownerId: owner.id,
    x: 450,
    y: groundY(450) - 3,
    vx: 0,
    vy: 0,
    life: 1,
  });

  stepGame(state, {}, 0);
  assert.equal(teammate.alive, true);
  assert.equal(opponent.alive, false);
  assert.equal(owner.score, 1);
});

test("a free-for-all ends when a pilot reaches the selected score", () => {
  const state = createGame("free-for-all", 10);
  const ace = addPlayer(state, "ace", "ACE");
  const rival = addPlayer(state, "rival", "RIVAL");
  ace.score = 9;
  ace.invulnerableFor = 0;
  rival.invulnerableFor = 0;
  state.bullets.push({
    id: state.nextBulletId++,
    ownerId: ace.id,
    x: rival.x,
    y: rival.y,
    vx: 0,
    vy: 0,
    life: 1,
  });

  stepGame(state, {}, 0);
  assert.deepEqual(state.winner, { kind: "pilot", playerId: ace.id });
  assert.equal(ace.score, 10);
  assert.ok(state.events.some((event) => event.type === "victory"));

  const frozenX = ace.x;
  stepGame(state, { [ace.id]: { turn: 1, fire: true } }, FRAME);
  assert.equal(ace.x, frozenX, "the match kept moving after a winner was declared");

  resetRound(state);
  assert.equal(state.winner, null);
  assert.equal(state.bullets.length, 0);
  assert.ok(state.players.every((plane) => plane.alive && plane.score === 0 && plane.deaths === 0));
});

test("team wins use the combined team score and no-limit rooms stay open", () => {
  const teamState = createGame("teams", 5);
  const redOne = addPlayer(teamState, "red-one", "RED ONE", 0);
  const redTwo = addPlayer(teamState, "red-two", "RED TWO", 0);
  const green = addPlayer(teamState, "green", "GREEN", 1);
  redOne.score = 2;
  redTwo.score = 2;
  redOne.invulnerableFor = 0;
  green.invulnerableFor = 0;
  teamState.bullets.push({
    id: teamState.nextBulletId++,
    ownerId: redOne.id,
    x: green.x,
    y: green.y,
    vx: 0,
    vy: 0,
    life: 1,
  });

  stepGame(teamState, {}, 0);
  assert.deepEqual(teamState.winner, { kind: "team", team: 0 });

  const endlessState = createGame("free-for-all", null);
  const endlessAce = addPlayer(endlessState, "ace", "ACE");
  const endlessRival = addPlayer(endlessState, "rival", "RIVAL");
  endlessAce.score = 99;
  endlessAce.invulnerableFor = 0;
  endlessRival.invulnerableFor = 0;
  endlessState.bullets.push({
    id: endlessState.nextBulletId++,
    ownerId: endlessAce.id,
    x: endlessRival.x,
    y: endlessRival.y,
    vx: 0,
    vy: 0,
    life: 1,
  });

  stepGame(endlessState, {}, 0);
  assert.equal(endlessState.winner, null);
  assert.equal(endlessAce.score, 100);
});
