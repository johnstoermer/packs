# Core economy invariants

Use this checklist for every reward path and system change.

## The pack is the only door

- Only `openPack` may increase a binder collection count.
- Purchases and product breaks only change pack inventory.
- The binder never produces cash.
- Online and offline time add exactly 1 whole cash per second; balances and prices never use fractional cash.
- Selling duplicates keeps one best printing of every card.
- Upgrades only modify duplicate sale value, rarity weight, or purchase price.
- Offline progress only adds the flat time-based cash.
- Tutorials, fixes, and future event compensation must use packs or cash.

## Pack inventory stays simple

- Loose packs and cases are inventory, not investments.
- Booster boxes do not exist.
- Breaking a case is one-way and explicit.
- Packs have no resale value, appreciation, or market simulation.
- Base product prices stay stable; supplier terms apply the only discount.
- Each new set unlocks only after all 12 cards in the immediately previous set are owned.

## Manual opening remains the game

- Every pack contains six individually revealed cards.
- All eighteen base pull rates remain defined in `RARITIES`.
- Higher rarity printings upgrade the kept binder copy.
- Hover signals may bluff; the printed card is authoritative.
- Heat, grade, and anomaly detection remain properties of a witnessed opening.
- No current offline or automated path can open a pack.

## Review commands

```bash
npm test
npm run test:e2e
```

The unit suite includes a collection-invariant test for every non-pack action. The browser suite verifies the uncluttered main loop, click and hold-Space reveal flows, responsive card layout, gradual shop disclosure, and high-rarity impact treatment.
