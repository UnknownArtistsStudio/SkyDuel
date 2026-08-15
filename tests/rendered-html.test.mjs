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
  assert.match(component, /MediaRecorder/);
  assert.match(component, /voice-request/);
  assert.match(component, /BOMB PICKUPS/);
  assert.match(component, /RADIO SENT/);
  assert.match(component, /RADIO CHAT \/ ALLOW MIC FIRST TIME/);
  assert.match(component, /HOLD T \+ SPEAK \/ RELEASE TO SEND \/ 3 SEC MAX/);
  assert.match(component, /PHONE: HOLD TALK/);
  assert.match(component, /MISSILES \/ EVERY 3 KILLS EARNS 1 \/ UNUSED MISSILES STACK/);
  assert.match(component, /NOT STORED/);
  assert.doesNotMatch(component, /chatInputOpen|TYPE MESSAGE|ENTER FOR TEXT|ENTER: TYPE MESSAGE|MESSAGE &gt;/);
  assert.match(component, /A\+D ROLL/);
  assert.match(component, /ROLL RESET/);
  assert.match(component, /TITLE_MUSIC_LEAD_IN/);
  assert.match(component, /MISSILE READY/);
  assert.match(component, /MISSILES/);
  assert.match(component, /SpeechSynthesisUtterance/);
  assert.match(component, /BOMB HATCH OPEN/);
  assert.match(component, /MISSILE ARMED/);
  assert.match(component, /EJECT EJECT/);
  assert.match(component, /MAYDAY MAYDAY/);
  assert.match(component, /PARACHUTE EQUIPPED/);
  assert.match(component, /PLANE DAMAGE/);
  assert.match(component, /REVENGE PILOT/);
  assert.match(component, /6 PILOT HITS = 1 PLANE HIT/);
  assert.match(component, /3 HIT MODE \/ DAMAGED \/ SMOKE \/ EXPLODE/);
  assert.match(component, /LANDSCAPE/);
  assert.match(component, /MOUNTAINS/);
  assert.match(component, /PIXEL PILOT/);
  assert.match(component, /PixelFaceEditor/);
  assert.match(component, /PixelPortrait/);
  assert.match(component, /scheduleMenuBeat/);
  assert.match(component, /scheduleGameBeat/);
  assert.match(component, /scheduleActionBeat/);
  assert.match(component, /schedulePad/);
  assert.match(component, /heroicFanfare/);
  assert.match(component, /victoryFanfare/);
  assert.match(core, /MAX_PLAYERS = 6/);
  assert.match(core, /matchMode/);
  assert.match(core, /scoreLimit/);
  assert.match(core, /winner/);
  assert.match(core, /STALL_SPEED = 78/);
  assert.match(core, /RECOVERY_SPEED = 102/);
  assert.match(core, /BOMB_BLAST_RADIUS = 132/);
  assert.match(core, /bombPowerUps/);
  assert.match(core, /MAGAZINE_SIZE = 3/);
  assert.match(core, /ROLL_DURATION/);
  assert.match(core, /ROLL_RECHARGE/);
  assert.match(core, /missileMilestones/);
  assert.match(core, /cloudPosition/);
  assert.match(core, /PILOT_GUN_HITS = 6/);
  assert.match(core, /GroundPilot/);
  assert.match(core, /revengePowerUp/);
  assert.match(core, /revengeSpawned/);
  assert.match(core, /planeHits/);
  assert.match(core, /landscape/);
  assert.match(core, /planeInCloud/);
  assert.match(core, /pilot-vaporized/);
  assert.doesNotMatch(core, /#087bed|#d43bce/);
  assert.match(renderer, /drawPixelCloud/);
  assert.match(renderer, /drawSpeechBubbles/);
  assert.match(renderer, /drawBombPowerUps/);
  assert.match(renderer, /drawBombs/);
  assert.match(renderer, /drawMissiles/);
  assert.match(renderer, /drawRevengePowerUp/);
  assert.match(renderer, /drawGroundPilots/);
  assert.match(renderer, /drawPilotBullets/);
  assert.match(renderer, /planeInCloud/);
  assert.match(renderer, /missileTrails/);
  assert.match(renderer, /resetRendererEffects/);
  assert.match(renderer, /#9b90f4/);
  assert.doesNotMatch(renderer, /createLinearGradient|drawVignette/);
  assert.doesNotMatch(renderer, /ui-monospace|SFMono|Menlo/);
  assert.match(styles, /--purple: #9b90f4/);
  assert.doesNotMatch(styles, /border-radius|box-shadow|text-shadow|rgba\(|gradient/i);
  assert.doesNotMatch(layout, /next\/font|Geist|Press_Start_2P/);
  assert.match(styles, /font-family: "SkyDuelPixel"/);
  assert.match(styles, /\.arcade-controls/);
  assert.match(styles, /\.face-editor/);
  assert.match(styles, /\.pixel-portrait/);
  assert.match(styles, /\.pilot-lineup/);
  assert.doesNotMatch(styles, /chat-composer/);
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
