# PACKWORKS

PACKWORKS is a clean incremental game about opening card packs, improving a collection, and selling duplicates.

## The loop

1. Open a six-card pack.
2. Hover each card for a rarity signal, then click through it or hold Space.
3. Earn a flat 1 cash every second and sell every extra copy with one button.
4. Spend cash on packs from newly unlocked sets or one of three upgrades.

That is the whole visible game. There are no duel, filing-rule, automation, contract, or beat dashboards.

## Progression

- The player begins with three packs and earns exactly 1 whole cash per second online or away.
- The binder is a collection view and never generates cash.
- Selling duplicates keeps one copy of every card and converts every extra copy into cash.
- Dealer trays improve duplicate sale value.
- Inspection lamps improve premium-card weight.
- Supplier terms reduce the purchase price of packs.
- Booster boxes do not exist. Cases remain a late bulk option.
- There are 20 sets and 240 unique cards.
- Every set has the same unlock rule: complete all 12 cards in the set immediately before it.
- Each later set introduces permanently higher-rarity chase cards, culminating in the sole Nameless card in set 20.

Cases are inventory bundles that the player can break into loose packs. Packs have no resale value or appreciation system. Only `openPack` can increase a collection count.

## Rarity

Every pack uses the complete 18-tier ladder, from Common at roughly 45% through Nameless at 0.0001%. Rarity is part of a card's identity: Pavement Pigeon is always Common, and What Was Never Named is always Nameless. A roll can fall back only to a lower fixed tier that exists in the selected set; it never upgrades a card. Each tier has its own border material or animation, with the upper tiers progressing through shimmer, starfield, halo, constellation, refraction, distortion, and the shifting Nameless treatment.

## Opening

Pack opening remains deliberately elaborate even though the surrounding game is minimal:

- staged foil handling and tear animation;
- six separately dealt cards;
- hover rarity signals with occasional false positives;
- manual click-to-reveal or a paced hold-Space sequence;
- rarity-specific impact, lighting, particles, and synthesized audio;
- distinctive original artwork for all 240 cards across twenty cohesive visual worlds.

Manual opening is capped near forty packs per minute. Reduced-motion preferences shorten packaging without skipping individual reveals.

## Controls

- Tap a face-down card or press and swipe across several cards to reveal them
- Hold `Space`: open a pack, reveal its cards one by one, and continue opening while held
- On mobile, hold the large bottom control to reveal slowly and continue into the next pack
- In the Shop, tap a pack price to buy one or hold it to buy that set rapidly
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

The 240 illustrations in `public/card-art/` were created specifically for PACKWORKS. No artwork, characters, names, or scans from commercial trading-card games are included. The generation brief and crop workflow are preserved in `docs/CARD_ART_PROMPTS.md`.

The project includes [augmented-ui](https://augmented-ui.com/) under the BSD 2-Clause License. Its license is included at `public/vendor/augmented-ui.LICENSE.txt`.
