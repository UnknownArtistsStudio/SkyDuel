import assert from "node:assert/strict";
import test from "node:test";

import {
  addPlayer,
  createGame,
  groundY,
  planeSpeed,
  resetRound,
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
