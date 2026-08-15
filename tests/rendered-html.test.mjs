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
  assert.match(html, /<title>Sky Duel - Browser Biplane Dogfights<\/title>/i);
  assert.match(html, /Sky Duel/);
  assert.match(html, /PRESS START/);
  assert.match(html, /Biplane dogfight arena/);
  assert.doesNotMatch(html, /fonts\.googleapis|Geist/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps the original-style flight, pixel display, and multiplayer promises", async () => {
  const [component, core, renderer, styles, layout, pagesShell, peerRoom, packageJson] = await Promise.all([
    readFile(new URL("../app/game/SkyDuel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-core.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/render-game.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../github-pages/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app/game/peer-room.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(component, /STALL \/ NOSE DOWN/);
  assert.match(component, /SAFE \/ GUNS OFF/);
  assert.match(component, /FREE FOR ALL/);
  assert.match(component, /TEAMS/);
  assert.match(component, /NO LIMIT/);
  assert.match(component, /FIRST TO/);
  assert.match(component, /pixelExplosion/);
  assert.match(component, /pixelGunshot/);
  assert.match(component, /talking \? 0\.0007 : 0\.0045/);
  assert.match(component, /webkitSpeechRecognition/);
  assert.match(component, /TRANSMITTING/);
  assert.match(component, /chat-request/);
  assert.match(component, /ArcadeControls/);
  assert.match(component, /MESSAGE &gt;/);
  assert.match(core, /MAX_PLAYERS = 6/);
  assert.match(core, /matchMode/);
  assert.match(core, /scoreLimit/);
  assert.match(core, /winner/);
  assert.match(core, /STALL_SPEED = 78/);
  assert.match(core, /RECOVERY_SPEED = 102/);
  assert.doesNotMatch(core, /#087bed|#d43bce/);
  assert.match(renderer, /drawPixelCloud/);
  assert.match(renderer, /drawSpeechBubbles/);
  assert.match(renderer, /#9b90f4/);
  assert.doesNotMatch(renderer, /createLinearGradient|drawVignette/);
  assert.doesNotMatch(renderer, /ui-monospace|SFMono|Menlo/);
  assert.match(styles, /--purple: #9b90f4/);
  assert.doesNotMatch(styles, /border-radius|box-shadow|text-shadow|rgba\(|gradient/i);
  assert.doesNotMatch(layout, /next\/font|Geist|Press_Start_2P/);
  assert.match(styles, /font-family: "SkyDuelPixel"/);
  assert.match(styles, /\.arcade-controls/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /pointer: coarse/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(pagesShell, /viewport-fit=cover/);
  assert.match(peerRoom, /RTCPeerConnection/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../dist-pages/index.html", import.meta.url));
  await access(new URL("../.github/workflows/pages.yml", import.meta.url));
  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});
