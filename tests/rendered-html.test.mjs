import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the finished Sky Duel game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Sky Duel — Browser Biplane Dogfights<\/title>/i);
  assert.match(html, /SKY/);
  assert.match(html, /DUEL/);
  assert.match(html, /PRACTICE DUEL/);
  assert.match(html, /CREATE PRIVATE ROOM/);
  assert.match(html, /Biplane dogfight arena/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps the original-style flight and multiplayer promises in the product", async () => {
  const [component, core, peerRoom, packageJson] = await Promise.all([
    readFile(new URL("../app/game/SkyDuel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-core.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/peer-room.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(component, /STALL · NOSE DOWN/);
  assert.match(component, /CREATE PRIVATE ROOM/);
  assert.match(component, /JOIN A ROOM/);
  assert.match(core, /MAX_PLAYERS = 6/);
  assert.match(core, /STALL_SPEED = 68/);
  assert.match(core, /RECOVERY_SPEED = 88/);
  assert.match(peerRoom, /RTCPeerConnection/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});
