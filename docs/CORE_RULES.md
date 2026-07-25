# Core economy invariants

Use this checklist for every reward path and system change.

## The pack is the only door

- Only `openPack` may increase a binder collection count.
- Purchases and product breaks only change sealed inventory.
- Upgrades only modify income, rarity weight, or purchase price.
- Offline progress only adds binder cash.
- Tutorials, fixes, and future event compensation must use sealed product or pack currency.

## Sealed product remains an asset

- Loose packs, booster boxes, and cases remain distinct inventory.
- Breaking a box or case is one-way and explicit.
- Purchase pricing follows known-buyer pressure: `costFactor * 1.0008^packsOpened`.
- Supplier terms reduce purchase cost but do not reduce the market value of stock already owned.

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

The unit suite includes a collection-invariant test for every non-pack action. The browser suite verifies the uncluttered main loop, manual reveal flow, responsive card layout, gradual shop disclosure, and high-rarity impact treatment.
