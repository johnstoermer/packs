# Core economy invariants

Use this checklist for every reward path and system change.

## The pack is the only door

- Only `openPack` may increase a binder collection count.
- Purchases and product breaks only change pack inventory.
- The binder never produces cash on its own.
- Passive income is the flat 1 cash per second, augmented only by displayed card effects, Inscriptions, and interest effects; balances and prices never use fractional cash.
- Selling duplicates keeps one best printing of every card.
- Upgrades only modify duplicate sale value, rarity weight, or purchase price. Everything else flows from the display case.
- Offline progress only adds time-based cash (scaled by displayed offline effects).
- Tutorials, fixes, and future event compensation must use packs or cash.

## Pack inventory stays simple

- Loose packs and cases are inventory, not investments.
- Booster boxes do not exist.
- Breaking a case is one-way and explicit.
- Packs have no resale value, appreciation, or market simulation.
- Base product prices stay stable; supplier terms and displayed discount effects are the only discounts (capped at 70% total).
- Sets unlock along a branching print tree: Neon Circuit fans out into Gilded Frontier, Abyssal Bloom, and Crownfall; mid-game sets open from either of two parent sets; Sunken Signal opens only through Nocturne Harbor (and Nocturne Harbor unlocks nothing else); Unwritten demands every other set.

## Manual opening remains the game

- Every pack contains six individually revealed cards.
- All eighteen base pull rates remain defined in `RARITIES`.
- Higher rarity printings upgrade the kept binder copy.
- Hover signals may bluff; the printed card is authoritative.
- Heat, grade, and anomaly detection remain properties of a witnessed opening.
- Automated opening exists only through displayed auto-open effects, opens table stock at the display case's pace, and never opens a queued god pack.

## The display case is the engine

- Up to six owned cards can be displayed; slots unlock through milestones.
- Every one of the 240 cards has a unique display effect; rarer cards in a school carry strictly stronger effects.
- Verdant-style ramp effects grow to full power over 30 minutes on display and reset when unseated.
- God packs are only created by displayed god-pack effects: the next pack's floor jumps to the set's top three tiers with one guaranteed chase-tier pull.
- Meta cards are scattered across sets and tiers; they only shape the Rewrite loop.
- The Rewrite (prestige) opens only by owning What Was Never Named. It resets binder, cash, and shop; Inscriptions persist and multiply income and duplicate sales by +25% each.

## Review commands

```bash
npm test
npm run test:e2e
```

The unit suite includes a collection-invariant test for every non-pack action. The browser suite verifies the uncluttered main loop, click and hold-Space reveal flows, responsive card layout, gradual shop disclosure, and high-rarity impact treatment.
