# Sky Duel

An original browser homage to early console biplane dogfights. Two to six pilots share a wide, flat-colour pixel sky with fast automatic engine power, basic forward guns, momentum, stalls, and genuine nose-down recovery.

## Play

- Press **Start** on the pixel title screen to enable game audio and open the game menu.
- **A / D** or **arrow keys** rotate the aircraft. Press both turn directions together to perform one precisely timed barrel roll; release either direction before rolling again. Bullets and missiles pass through the aircraft during the roll.
- **Space** fires the forward gun. Each magazine holds three shots, followed by a short automatic reload.
- Hold **T** and speak to send a radio-filtered voice clip of up to three seconds plus a short message above your aircraft. Press **Enter** for the typed fallback. Clips and messages are transmitted directly to the room, disappear after playback, and are not stored.
- When bomb pickups are enabled, fly through the bomb hidden in a drifting cloud, then press **B** to drop it. The blast can take out several opponents at once; the pilot who dropped it and teammates are safe from its blast.
- A pilot who moves three kills ahead of every opponent receives one missile. Press **B** to use it (before a carried bomb): it drops from the aircraft, ignites, and races straight ahead with a white vapour trail. A well-timed barrel roll can dodge it. Falling behind and later rebuilding a three-kill lead can earn another.
- A normal climb retains plenty of power; a prolonged steep climb still trades speed for altitude. If the aircraft stalls, point the nose down, allow speed to rebuild, then ease back into level flight.
- A flashing respawn is completely protected: it cannot fire, be hit, or collide until the flashing ends.
- On touch devices in landscape, use the compact arcade stick on the left and hold **Talk** or **Fire** on the right. Tap the middle of the stick to barrel roll. A **Bomb** or **Missile** button appears only while carrying that special weapon. The controls stay at the screen edges and respect phone safe areas.

After **Press Start**, an original 8-bit heroic aviation theme plays through the setup screens. During a match it becomes a quieter chord bed, with individual pilot fanfares for kills and short dramatic cues for bomb pickups, missile awards, rolls, reloads, launches, and impacts. Browsers require the first button press before they allow music to begin.

## Match types

- **Practice duel:** one player against a computer rival using the selected winning score.
- **Private free-for-all:** every pilot can shoot every other pilot.
- **Private teams:** pilots request red, green, or automatic team assignment; friendly fire and friendly collisions are disabled.

Private room creators choose first to 5, first to 10 (the default), first to 20, or no limit before opening the room. In free-for-all, the first pilot to the target wins. In teams, the red or green pilots' combined score decides the winner. The action freezes on the result screen and the lead pilot starts the next round.

Room creators can also turn bomb pickups on or off. When enabled, one bomb power-up appears in a slowly drifting cloud at a time; another returns after the previous one is collected.

Joining pilots can request a team, which is used only when the host selected team play. Both private modes support up to six pilots.

Private rooms use an encrypted, direct browser connection. The lead pilot runs the authoritative match simulation and sends synchronized snapshots to the other pilots. A small D1-backed signaling service introduces the browsers; it does not carry the match traffic itself.

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
