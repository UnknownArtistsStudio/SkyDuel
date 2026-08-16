# Sky Duel

An original browser homage to early console biplane dogfights. Two to six pilots share a flat-colour pixel sky with fast automatic engine power, basic forward guns, momentum, stalls, genuine nose-down recovery, and a growing collection of unexpected match options.

## Play

- Press **Start** on the pixel title screen to enable game audio and open the game menu.
- **A / D** or **arrow keys** rotate the aircraft. Press both turn directions together to perform one precisely timed barrel roll. Bullets and missiles pass through the aircraft during the roll, followed by a short recharge beat before another dodge is possible.
- **Space** fires the forward gun. Each magazine holds three shots, followed by a short automatic reload. Rooms can use instant one-hit destruction or three-hit damage, where the aircraft first breaks, then smokes, then explodes.
- Hold **T** and speak to send a radio-filtered voice clip of up to three seconds. On supported browsers, the spoken words also appear briefly above your aircraft. On mobile, hold **Talk**. Clips and transcriptions are transmitted directly to the room, disappear after playback, and are not stored.
- A low, early-computer cockpit voice privately warns the affected pilot: **BOMB READY** when a bomb is collected, **BOMBS AWAY** when it is dropped, **MISSILE ARMED**, **EJECT EJECT**, and **MAYDAY MAYDAY** at critical damage in three-hit mode.
- When bomb pickups are enabled, fly through the bomb hidden in a drifting cloud, then press **B** to drop it. The blast can take out several opponents at once; the pilot who dropped it and teammates are safe from its blast.
- Every pilot receives one missile at each personal three-kill milestone: 3, 6, 9, 12, and so on. Unused missiles accumulate. Press **B** to use one (before a carried bomb): from an aircraft, the tiny missile falls away for a visible beat before igniting and racing straight ahead. An ejected pilot keeps unused missiles and, after landing, can aim through the same 180-degree arc and press **B** to fire one immediately like a ground rocket launcher. Missile smoke is a trail of individual fading pixels, and a well-timed barrel roll can dodge one.
- With Parachute Mode enabled, every bullet, bomb, or missile takedown ejects the pilot automatically. The tiny pilot can steer while falling, run after landing, and fire a weaker rapid machine gun through any angle across a smooth 180-degree upper arc. Hold left or right to rotate the gun, then fire; six pilot hits equal one aircraft-damage hit. A grounded pilot can choose **Quit Pilot / Respawn** to leave the ground fight and return in an aircraft after the normal respawn. Aircraft fire can blow the pilot apart, bombs throw the body upward, and missiles vaporize it. Terrain crashes do not eject the pilot, while sea crashes retain their wreck-gunner behavior.
- Choose the stepped **Tower**, **Sea**, or **Mountains** landscape. The sea is a blue-and-white animated surface that splashes on impact and leaves the pilot firing from the wreck. Wreck pilots can shoot one another; if several remain stranded, their aircraft sink and they restart. Mountain terrain uses smaller, varied peaks with safe spawn clearance. Aircraft and their speech bubbles disappear while inside the slowly drifting clouds, including one oversized cloud built for surprise exits.
- Callsigns are the pilots' identities: the chosen name is enlarged during setup, match introductions, and the winner display.
- A normal climb retains plenty of power; a prolonged steep climb still trades speed for altitude. If the aircraft stalls, point the nose down, allow speed to rebuild, then ease back into level flight.
- A flashing respawn is completely protected: it cannot fire, be hit, or collide until the flashing ends.
- On touch devices in landscape, use the compact arcade stick on the left and hold **Talk** or **Fire** on the right. Tap the middle of the stick to barrel roll. A **Bomb** or **Missile** button appears only while carrying that special weapon. The controls stay at the screen edges and respect phone safe areas.

**Press Start** enables the original slow, dark 1980s-style synth-pad score. The title holds briefly so the opening pad is heard, then the same music carries continuously through the game settings and joining screens. During a match it becomes a quieter ambient pad bed, switches to a fast action cue while a pilot is outside an aircraft, and ends with an intentionally cheerful victory fanfare. Browsers require that first button press before they allow music to begin.

## Match types

- **Practice duel:** one player against a computer rival using the selected winning score.
- **Private free-for-all:** every pilot can shoot every other pilot.
- **Private teams:** pilots request red, green, or automatic team assignment; friendly fire and friendly collisions are disabled.

Private room creators choose first to 5, first to 10 (the default), first to 20, or no limit before opening the room. In free-for-all, the first pilot to the target wins. In teams, the red or green pilots' combined score decides the winner. The action freezes on the result screen and the lead pilot starts the next round.

Room creators choose one- or three-hit aircraft, Tower/Sea/Mountains, Parachute Mode on or off, and bomb pickups on or off. When bombs are enabled, one bomb power-up appears in a slowly drifting cloud at a time; another returns after the previous one is collected.

Joining pilots can request a team, which is used only when the host selected team play. Both private modes support up to six pilots.

Private rooms use an encrypted, direct browser connection. The lead pilot runs the authoritative match simulation and sends synchronized snapshots to the other pilots. A small D1-backed signaling service introduces the browsers; it does not carry the match traffic itself.

The room creator can add zero to five computer pilots. Practice supports one human against as many as five computers. Multiplayer rooms remain capped at six total pilots: as humans join, computer pilots automatically give up slots, allowing combinations such as two humans with one to four computers.

## GitHub Pages

The repository includes a separate static build for GitHub Pages. The public Pages version uses the same game and design while sending only room introductions to the public Sky Duel signaling service. Match movement and inputs still travel directly between the players' browsers.

Every push to `main` runs the Pages deployment workflow. The static build can also be checked locally with `npm run build:pages`.

## Local development

Requirements: Node.js 22.13 or newer.

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. The local Sites runtime provides the D1 room service.

Quality checks:

```sh
npm test
npm run lint
npx tsc --noEmit
```

## Project map

- `app/game/SkyDuel.tsx` — game shell, controls, modes, and match loop
- `lib/game-core.ts` — shared flight, stall, collision, firing, and scoring rules
- `app/game/peer-room.ts` — six-player WebRTC room connection
- `worker/game-api.ts` — room codes and WebRTC signaling
- `db/schema.ts` and `drizzle/` — signaling database schema and migration

All visuals, interface elements, and aircraft drawings in the game are original. The project does not contain Intellivision code, sprites, sounds, or branding.

The bundled Press Start 2P typeface is distributed under the SIL Open Font License.
