# Sky Duel

An original browser homage to early console biplane dogfights. Two to six pilots share a wide, flat-colour pixel sky with fast automatic engine power, basic forward guns, momentum, stalls, and genuine nose-down recovery.

## Play

- Press **Start** on the pixel title screen to enable game audio and open the game menu.
- **A / D** or **arrow keys** rotate the aircraft.
- **Space** or **Enter** fires the forward gun.
- A normal climb retains plenty of power; a prolonged steep climb still trades speed for altitude. If the aircraft stalls, point the nose down, allow speed to rebuild, then ease back into level flight.
- A flashing respawn is completely protected: it cannot fire, be hit, or collide until the flashing ends.
- The layout includes touch controls for phones and tablets.

## Match types

- **Practice duel:** one player against a computer rival with an open-ended score.
- **Private free-for-all:** every pilot can shoot every other pilot.
- **Private teams:** pilots request red, green, or automatic team assignment; friendly fire and friendly collisions are disabled.

Private room creators choose the room rules before opening the room. Joining pilots can request a team, which is used only when the host selected team play. Both private modes support up to six pilots.

Private rooms use an encrypted, direct browser connection. The lead pilot runs the authoritative match simulation and sends synchronized snapshots to the other pilots. A small D1-backed signaling service introduces the browsers; it does not carry the match traffic itself.

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
