# PACKWORKS

PACKWORKS is a clean incremental game about opening card packs, improving a collection, and selling duplicates.

## The loop

1. Open a six-card pack.
2. Hover each card for a rarity signal, then click through it or hold Space.
3. Earn cash every second and sell every extra copy with one button.
4. Build an engine in the display case: signatures anchor verbs, supports tune them.
5. Spend cash on packs from newly unlocked sets or one of three upgrades.

The display case is the core progression engine. There are no duel, filing-rule, contract, or beat dashboards.

## The verb engine

- Each verb has one **signature** card — its biggest chance source or defining rule: Common Echo, Mark, Salvage, Mimic, Rare Echo, Fusion, Transmute, Fracture, Catalyst, Blueprint, Relay, or Autopilot. Signatures are the high-rarity anchors of their print line.
- Every other card is a **support** that adds its own chance source or pays out on a trigger (reveals, duplicate sales, pack opens, coin or pack thresholds). Every chance source works standalone; pure dials (biases, depths, preferences) modify a verb and wait for a source to feed them.
- Late sets carry **capstones** — cross-engine cards that bridge two verbs at once.
- **Discover** is the universal support mechanic: qualifying triggers offer a choice of three boons (Insight, Resonance, Catalyst, Reflection, Acceleration); picks stack until an event consumes them.
- **Salvage** converts duplicate sales into Mystery Packs that inject extra cards into the current reveal.
- Automation runs on coin and pack **thresholds** (watermarks), never timers: displayed cards fire when totals cross their lines, including while idle.

## Progression

- The player begins with three packs and earns exactly 1 whole cash per second online or away.
- The binder is a collection view and never generates cash.
- Selling duplicates keeps one copy of every card and converts every extra copy into cash.
- Dealer trays improve duplicate sale value.
- Inspection lamps improve premium-card weight.
- Supplier terms reduce the purchase price of packs.
- Booster boxes do not exist. Cases remain a late bulk option.
- There is one 98-card collection; each card is a signature, a support, a capstone, or the prestige door, with player-facing rules text.
- The display case holds up to six cards; slots unlock through milestones, and the displayed signatures-plus-supports engine drives the run. Editing the case first sells that card's duplicate stack — displaying is a commitment.
- Card counts taper at every step from Common through Divine. Nameless is not a normal rarity roll: it replaces one card in the next pack only after all other 97 cards have been discovered.
- Owning Nameling unlocks the Rewrite: a prestige reset that grants permanent Inscriptions (+25% income and sale value each, doubled if the Nameless is displayed when you Rewrite).

The full engine design — verbs, triggers, pipeline order, animation language, and rejected directions — lives in `docs/ENGINE_SPEC.md`.

Cases are inventory bundles that the player can break into loose packs. Packs have no resale value or appreciation system. Only `openPack` can increase a collection count.

## Rarity

Normal pulls use seven tiers: Common (75%), Uncommon (18%), Rare (5%), Epic (1.5%), Legendary (0.4%), Mythic (0.09%), and Divine (0.01%). The retired Exalted, Ascendant, Celestial, old Divine, and Astral labels collapse into Mythic; Eternal, Primordial, Transcendent, Empyrean, Absolute, and Singularity collapse into Divine. Nameless remains a one-card completion unlock outside that percentage ladder. Fusion, Transmute, Salvage, and Fracture provide engine-driven routes upward without allowing an early Nameless pull.

## Opening

Pack opening remains deliberately elaborate even though the surrounding game is minimal:

- staged foil handling and tear animation;
- separately dealt cards, staged in bounded batches for large packs;
- hover rarity signals with occasional false positives;
- manual click-to-reveal or a paced hold-Space sequence;
- rarity-specific impact, lighting, particles, and synthesized audio;
- distinctive animated PixelLab artwork for all 98 cards.

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

The live illustrations in `public/card-art-pixel/` were created specifically for PACKWORKS. Every card uses its animated PixelLab frame set; the retired static-art fallback is intentionally not shipped. No artwork, characters, names, or scans from commercial trading-card games are included.

The project includes [augmented-ui](https://augmented-ui.com/) under the BSD 2-Clause License. Its license is included at `public/vendor/augmented-ui.LICENSE.txt`.
