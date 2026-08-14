import assert from "node:assert/strict";
import test from "node:test";

import {
  addPlayer,
  createGame,
  groundY,
  planeSpeed,
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
      minimumClearance = Math.min(minimumClearance, groundY(plane.x) - plane.y - 14);
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
    assert.ok(planeSpeed(plane) > 145, `spawn ${spawnIndex} lost engine speed`);
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
  assert.ok(planeSpeed(plane) > 88, "recovery happened without rebuilding airspeed");
});
