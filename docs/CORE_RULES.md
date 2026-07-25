# Core economy invariants

Use this checklist for every reward path and system change.

## The pack is the only door

- Only `openPack` may increase a binder collection count.
- Purchases and product breaks only change pack inventory.
- Upgrades only modify income, rarity weight, or purchase price.
- Offline progress only adds binder cash.
- Tutorials, fixes, and future event compensation must use packs or cash.

## Pack inventory stays simple

- Loose packs, booster boxes, and cases are inventory, not investments.
- Breaking a box or case is one-way and explicit.
- Packs have no resale value, appreciation, or market simulation.
- Base product prices stay stable; supplier terms apply the only discount.

## Manual opening remains the game

- Every pack contains six individually revealed cards.
- Hover signals may bluff; the printed card is authoritative.
- Heat, grade, and anomaly detection remain properties of a witnessed opening.
- No current offline or automated path can open a pack.

## Review commands

```bash
npm test
npm run test:e2e
```

The unit suite includes a collection-invariant test for every non-pack action. The browser suite verifies the uncluttered main loop, click and hold-Space reveal flows, responsive card layout, gradual shop disclosure, and high-rarity impact treatment.
