# PACKWORKS

PACKWORKS is a clean incremental game about opening card packs, improving a collection, and selling duplicates.

## The loop

1. Open a six-card pack.
2. Hover each card for a rarity signal, then click through it or hold Space.
3. Earn a flat 1 cash every second and sell every extra copy with one button.
4. Spend cash on packs from newly unlocked sets or one of three upgrades.

That is the whole visible game. There are no duel, filing-rule, automation, contract, or beat dashboards.

## Progression

- The player begins with three packs and earns exactly 1 cash per second online or away.
- The binder is a collection view and never generates cash.
- Selling duplicates keeps one best copy of every card and converts every extra copy into cash.
- Dealer trays improve duplicate sale value.
- Inspection lamps improve premium-card weight.
- Supplier terms reduce the purchase price of packs.
- Booster boxes do not exist. Cases remain a late bulk option.
- Neon Circuit unlocks by owning Mayor Mooncat.
- Gilded Frontier unlocks after 25 opened packs.
- Abyssal Bloom unlocks by finishing Corner Critters.
- Crownfall requires two finished sets and three Mythic-or-better cards.

Cases are inventory bundles that the player can break into loose packs. Packs have no resale value or appreciation system. Only `openPack` can increase a collection count.

## Rarity

Every pack uses the complete 18-tier ladder, from Common at roughly 45% through Nameless at 0.0001%. A higher-tier printing replaces the copy displayed in the binder; the displaced copy joins the duplicate sell pile. Each tier has its own border material or animation, with the upper tiers progressing through shimmer, starfield, halo, constellation, refraction, distortion, and the shifting Nameless treatment.

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

Progress and flat offline cash earnings are stored locally. Offline progress never buys or opens product.

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
