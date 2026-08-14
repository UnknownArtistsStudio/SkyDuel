# Loop & Lead

An original browser homage to early console biplane dogfights. Two to six pilots share one compact airfield with constant engine power, basic forward guns, momentum, stalls, and genuine nose-down recovery.

## Play

- **A / D** or **arrow keys** rotate the aircraft.
- **Space** or **Enter** fires the forward gun.
- Climbing trades speed for altitude. If the aircraft stalls, point the nose down, allow speed to rebuild, then ease back into level flight.
- The desktop layout also includes touch controls for phones and tablets.

## Match types

- **Practice duel:** one player against a computer rival.
- **Private room:** the lead pilot creates a four-letter room code and shares it with up to five friends.

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

- `app/game/LoopAndLead.tsx` — game shell, controls, modes, and match loop
- `lib/game-core.ts` — shared flight, stall, collision, firing, and scoring rules
- `app/game/peer-room.ts` — six-player WebRTC room connection
- `worker/game-api.ts` — room codes and WebRTC signaling
- `db/schema.ts` and `drizzle/` — signaling database schema and migration

All visuals, interface elements, and aircraft drawings in the game are original. The project does not contain Intellivision code, sprites, sounds, or branding.
