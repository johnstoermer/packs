# Core economy invariants

Use this checklist for every reward path and system change.

## The pack is the only door

- Only `openPack` may increase a binder collection count.
- Purchases add sealed product.
- Duels and sealed matches award sealed product.
- The forge outputs a sealed, tag-biased pack.
- Offline progress may add binder cash and execute standing orders; it never opens.
- Filing rules may hold or destroy a pull; they never replace it with a selected card.
- Tutorials, fixes, and future event compensation must use sealed product or pack currency.

## Sealed product remains an asset

- Loose packs, boxes, cases, pallets, wholesale lots, and forged packs remain distinct inventory.
- Breaking a box or case is one-way and explicit.
- Product pricing is derived from known-buyer pressure: `costFactor × 1.0008^packsOpened`.
- Rotation-era status and appreciation belong to the product, not its expected card value.

## Machines cannot see

- Manual opening owns heat/pity accrual.
- Manual opening assesses a non-floor grade.
- Manual opening detects misprints.
- Automated pulls use printed rarity for filing and do not infer treatment, condition, or anomaly state.
- No future bulk action may resolve above-spec backlog without a manual reveal.

## Review command

Run both suites before shipping:

```bash
npm test
npm run test:e2e
```

The unit suite asserts that purchases, orders, duels, sealed rewards, forging, and offline progress do not mutate the collection.
