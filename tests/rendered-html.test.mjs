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

test("renders the finished Sky Wars game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Sky Wars - Browser Biplane Dogfights<\/title>/i);
  assert.match(html, /Sky Wars/);
  assert.doesNotMatch(html, /Sky Duel/i);
  assert.match(html, /PRESS START/);
  assert.match(html, /Biplane dogfight arena/);
  assert.doesNotMatch(html, /fonts\.googleapis|Geist/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps the original-style flight, pixel display, and multiplayer promises", async () => {
  const [component, core, renderer, titleScene, styles, layout, pagesShell, peerRoom, packageJson] = await Promise.all([
    readFile(new URL("../app/game/SkyWars.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-core.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/render-game.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/title-cloud-scene.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../github-pages/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app/game/peer-room.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(component, /STALL \/ NOSE DOWN/);
  assert.match(component, /SKY WARS \/ 2-6 PILOTS/);
  assert.match(component, /TitleCloudScene/);
  assert.doesNotMatch(component, /SKY DUEL/i);
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
  assert.match(component, /<span>BOMBS<\/span>/);
  assert.match(component, /RADIO SENT/);
  assert.match(component, /\+ CONTROLS/);
  assert.match(component, /HOLD T OR TALK/);
  assert.match(component, /3 KILLS = MISSILE/);
  assert.match(component, /AIM \+ FIRE \/ B ROCKET/);
  assert.match(component, /PILOT ROCKET READY \/ B FIRE/);
  assert.match(component, /<span>CPU PLAYERS<\/span>/);
  assert.match(component, /6 PILOTS MAX/);
  assert.match(component, /QUIT PILOT \/ RESPAWN/);
  assert.doesNotMatch(component, /NOT STORED|ALLOW MIC FIRST TIME/);
  assert.doesNotMatch(component, /chatInputOpen|TYPE MESSAGE|ENTER FOR TEXT|ENTER: TYPE MESSAGE|MESSAGE &gt;/);
  assert.match(component, /A\+D ROLL/);
  assert.match(component, /ROLL RESET/);
  assert.match(component, /TITLE_MUSIC_LEAD_IN/);
  assert.match(component, /MISSILE READY/);
  assert.match(component, /MISSILES/);
  assert.match(component, /SpeechSynthesisUtterance/);
  assert.match(component, /BOMB READY/);
  assert.match(component, /BOMBS AWAY/);
  assert.doesNotMatch(component, /BOMB HATCH OPEN/);
  assert.match(component, /MISSILE ARMED/);
  assert.match(component, /EJECT EJECT/);
  assert.match(component, /MAYDAY MAYDAY/);
  assert.match(component, /<span>DAMAGE<\/span>/);
  assert.match(component, /<span>PARACHUTES<\/span>/);
  assert.doesNotMatch(component, /PARACHUTE EQUIPPED|REVENGE PILOT/);
  assert.match(component, /ROTATE \/ MOVE/);
  assert.match(component, /TURN PHONE/);
  assert.match(component, /LANDSCAPE/);
  assert.match(component, /<span>MAP<\/span>/);
  assert.match(component, /MOUNTAINS/);
  assert.match(component, /FREE FOR ALL/);
  assert.match(component, /KILLS TO WIN/);
  assert.match(component, /aria-pressed=\{bombsEnabled\}/);
  assert.match(component, /aria-pressed=\{parachuteMode\}/);
  assert.match(component, /YOUR PILOT/);
  assert.match(component, /callsign-preview/);
  assert.doesNotMatch(component, /PIXEL PILOT|PixelFaceEditor|PixelPortrait/);
  assert.match(component, /scheduleMenuBeat/);
  assert.match(component, /scheduleGameBeat/);
  assert.match(component, /scheduleActionBeat/);
  assert.match(component, /schedulePad/);
  assert.match(component, /heroicFanfare/);
  assert.match(component, /victoryFanfare/);
  assert.match(core, /MAX_PLAYERS = 6/);
  assert.match(core, /syncComputerPlayers/);
  assert.match(core, /reserveHumanSlot/);
  assert.match(core, /quitGroundPilot/);
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
  assert.match(core, /launchPilotMissile/);
  assert.match(core, /cloudPosition/);
  assert.match(core, /PILOT_GUN_HITS = 6/);
  assert.match(core, /PILOT_AIM_SPEED/);
  assert.match(core, /aimAngle/);
  assert.match(core, /SEA_WRECK_SINK_TIME = 5/);
  assert.match(core, /GroundPilot/);
  assert.match(core, /parachuteMode/);
  assert.doesNotMatch(core, /revengePowerUp|revengeSpawned/);
  assert.match(core, /planeHits/);
  assert.match(core, /landscape/);
  assert.match(core, /planeInCloud/);
  assert.match(core, /pilot-vaporized/);
  assert.match(core, /sea-sink/);
  assert.doesNotMatch(core, /#087bed|#d43bce/);
  assert.match(renderer, /drawGameCloud/);
  assert.match(renderer, /drawSpeechBubbles/);
  assert.match(renderer, /drawBombPowerUps/);
  assert.match(renderer, /drawBombs/);
  assert.match(renderer, /drawMissiles/);
  assert.doesNotMatch(renderer, /drawRevengePowerUp/);
  assert.match(renderer, /drawGroundPilots/);
  assert.match(renderer, /drawPilotBullets/);
  assert.match(renderer, /pilot-quit/);
  assert.match(renderer, /Math\.sin\(aimAngle\)/);
  assert.match(renderer, /planeInCloud/);
  assert.match(renderer, /missileTrails/);
  assert.match(renderer, /resetRendererEffects/);
  assert.match(titleScene, /drawCloudTitle/);
  assert.match(titleScene, /drawLoopingGamePlane/);
  assert.doesNotMatch(titleScene, /drawCloudOpening/);
  assert.match(titleScene, /drawGameCloud/);
  assert.match(titleScene, /drawGamePlaneSprite/);
  assert.match(titleScene, /cubicPoint/);
  assert.match(titleScene, /context\.scale\(0\.41, 0\.41\)/);
  assert.match(titleScene, /progress < 0\.985 \? progress : null/);
  assert.doesNotMatch(titleScene, /smoothStep/);
  assert.match(titleScene, /prefers-reduced-motion/);
  assert.match(renderer, /export function drawGameCloud/);
  assert.match(renderer, /export function drawGamePlaneSprite/);
  assert.match(renderer, /#9b90f4/);
  assert.match(renderer, /#2478cf/);
  assert.match(renderer, /Math\.round\(bullet\.x\) - 1, Math\.round\(bullet\.y\) - 1, 2, 2/);
  assert.doesNotMatch(renderer, /createLinearGradient|drawVignette/);
  assert.doesNotMatch(renderer, /ui-monospace|SFMono|Menlo/);
  assert.match(styles, /--purple: #9b90f4/);
  assert.doesNotMatch(styles, /border-radius|box-shadow|text-shadow|rgba\(|gradient/i);
  assert.doesNotMatch(layout, /next\/font|Geist|Press_Start_2P/);
  assert.match(styles, /font-family: "SkyWarsPixel"/);
  assert.match(styles, /\.title-cloud-scene/);
  assert.doesNotMatch(styles, /--title-art/);
  assert.match(styles, /\.arcade-controls/);
  assert.match(component, /canRespawn=\{readout\.onFoot && !readout\.parachuting\}/);
  assert.match(component, /arcade-respawn-button/);
  assert.match(component, /Quit ground pilot and respawn in a plane/);
  assert.match(component, /pagehide/);
  assert.match(styles, /\.arcade-respawn-button/);
  assert.match(styles, /width: min\(100%, 150dvh\)/);
  assert.match(styles, /max-height: 600px/);
  assert.match(styles, /background: var\(--orange\)/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /font-size: 10px/);
  assert.match(styles, /min-height: 38px/);
  assert.match(styles, /--stick-y/);
  assert.match(styles, /\.callsign-preview/);
  assert.doesNotMatch(styles, /\.face-editor|\.pixel-portrait/);
  assert.match(styles, /\.pilot-lineup/);
  assert.doesNotMatch(styles, /chat-composer/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /pointer: coarse/);
  assert.match(styles, /orientation: portrait/);
  assert.match(styles, /\.setup-rules/);
  assert.match(styles, /\.setup-help/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(pagesShell, /viewport-fit=cover/);
  assert.match(pagesShell, /Sky Wars/);
  assert.doesNotMatch(pagesShell, /Sky Duel/i);
  assert.match(peerRoom, /RTCPeerConnection/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../dist-pages/index.html", import.meta.url));
  await access(new URL("../.github/workflows/pages.yml", import.meta.url));
  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});
