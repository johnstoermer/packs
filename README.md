# PACKWORKS

PACKWORKS is a clean incremental game about opening card packs and building a binder that pays for the next one.

## The loop

1. Open a six-card pack.
2. Hover each card for a rarity signal, then click through it or hold Space.
3. Cards in the binder earn cash every second.
4. Spend cash on more packs, booster boxes, cases, or one of three upgrades.

That is the whole visible game. There are no duel, filing-rule, automation, contract, or beat dashboards.

## Progression

- The player begins with three packs and no loose cards or cash grants.
- Binder income begins with the first card, but uses a slower payout scale tuned around roughly one minute for an early pack after the starter stock is opened.
- Display shelves improve binder income.
- Inspection lamps improve premium-card weight.
- Supplier terms reduce the purchase price of packs.
- Booster boxes unlock after 10 packs; cases unlock after 150.
- New sets arrive at 150, 500, 1,500, and 5,000 packs.
- Duplicate cards fuse at 2, 4, 8, 16, and 32 copies for +40% effect at each milestone.

Boxes and cases are inventory bundles that the player can break into loose packs. Packs have no resale value or appreciation system. Only `openPack` can increase a collection count.

## Opening

Pack opening remains deliberately elaborate even though the surrounding game is minimal:

- staged foil handling and tear animation;
- six separately dealt cards;
- hover rarity signals with occasional false positives;
- manual click-to-reveal or a paced hold-Space sequence;
- rarity-specific impact, lighting, particles, and synthesized audio;
- distinctive original voxel artwork for all 60 cards.

Manual opening is capped near forty packs per minute. Reduced-motion preferences shorten packaging without skipping individual reveals.

## Controls

- Hold `Space`: open a pack, reveal its cards one by one, and continue opening while held
- `Escape`: close the current panel, card, or completed opening

Progress and offline binder earnings are stored locally. Offline progress never buys or opens product.

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

Both builds are written to `dist/`. The default build packages a Sites-compatible Worker plus root-relative assets. The portal build targets `/games/packs/`.

## Assets and UI license

The 60 illustrations in `public/card-art/` were created specifically for PACKWORKS. No artwork, characters, names, or scans from commercial trading-card games are included. The generation brief is preserved in `docs/CARD_ART_PROMPTS.md`.

The project includes [augmented-ui](https://augmented-ui.com/) under the BSD 2-Clause License. Its license is included at `public/vendor/augmented-ui.LICENSE.txt`.
