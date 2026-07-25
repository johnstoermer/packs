# PACKWORKS

PACKWORKS is a voxel-isometric incremental card game about the tension between keeping product sealed and opening it for power now. The current release is a complete v1 arc covering beats 1–5.

## Core rules

1. The pack is the only door. No duel, milestone, forge, rule, or offline system can issue a loose card.
2. Sealed product is an asset. Boxes and cases stay intact until the player deliberately breaks them into openable stock.
3. Machines can open, but they cannot see. The v1 systems establish manual heat, grade, misprint detection, and false rarity tells ahead of the warehouse automation arc.

These rules are enforced in `lib/gameLogic.js` and covered by the unit suite.

## Gameplay

- Begin with three sealed loose packs and no cash.
- Hover each face-down card for an imperfect rarity signal, then reveal all six cards individually.
- Hand opening applies a permanent +25% hit-slot weight, builds Legendary heat, assesses condition grade, and detects misprints.
- Cards generate binder income from beat 2 onward.
- Copies fuse at 2/4/8/16/32 for +40% effect at each threshold.
- Buy loose packs, booster boxes, and cases. Bulk product stays sealed until deliberately broken.
- Standing orders automate purchasing only; they never open stock.
- Build a physical twelve-card list and run an eight-second auto-resolved duel. Wins award sealed packs.
- Enter Sealed by committing six loose packs, opening all thirty-six cards, and building exclusively from that restricted pool.
- Write filing rules for true bulk and turn offcuts into tag-biased forged packs.
- Reach 3/6/9 archetype thresholds in Swarm, Tempo, Relic, and Fortress lists.

Manual opening is capped near forty packs per minute. Quick opening shortens the wrapper sequence but never skips individual card reveals.

## Audio

All audio is synthesized at runtime with the Web Audio API. The mix includes layered foil handling, a zipper tear, six-card deal transients, rarity-specific reveal chords, misprint and fusion stingers, sealed-entry and forge sequences, and a timed four-exchange duel mix with distinct win and loss resolves.

## Controls

- `Space`: open selected stock
- `I`: sealed inventory
- `B`: binder
- `L`: league desk
- `R`: filing rules and forge
- `M`: audio
- `Escape`: close the active detail or completed sequence

Progress is stored locally. Offline progress accrues binder cash and may execute standing orders, but never opens a pack.

## Development

```bash
npm install
npm test
npm run test:e2e
npm run dev
```

## Builds

```bash
npm run build
npm run build:portal
```

Both builds are written to `dist/`. The default build packages a Sites-compatible Worker plus root-relative assets, while the portal build targets `/games/packs/`.

## Visual assets and UI license

The 60 card illustrations in `public/card-art/` were created specifically for PACKWORKS. No artwork, characters, names, or card scans from commercial trading-card games are included. The generation brief is preserved in `docs/CARD_ART_PROMPTS.md`.

Hard-edged panel framing uses [augmented-ui](https://augmented-ui.com/), distributed under the BSD 2-Clause License. A copy of that license is included at `public/vendor/augmented-ui.LICENSE.txt`.
