# Core economy invariants

Use this checklist for every reward path and system change.

## The pack is the only door

- Only `openPack` may put cards in front of the player, and a card joins the binder at the moment it is revealed — never at open time.
- Purchases and product breaks only change pack inventory.
- The binder never produces cash on its own.
- Passive income is the flat 1 cash per second times the Inscription multiplier; every other coin comes from a displayed engine trigger. Balances and prices never use fractional cash.
- Selling duplicates keeps one best printing of every card.
- Upgrades only modify duplicate sale value, rarity weight, or purchase price. Everything else flows from the display case.
- Offline progress only adds time-based cash; threshold cards catch up from their watermarks when the totals are next evaluated.
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
- Extra product arrives only as Mystery Packs from the Salvage verb, and their cards merge additively into the reveal in progress — new information never invalidates what is already shown.

## The display case is the engine

- Up to six owned cards can be displayed; slots unlock through milestones. Slot 1 is always open.
- Every chance source stands alone; pure dials modify a verb and stay inert until a source feeds them. The chase card of each of the first twelve sets is that verb's signature — its biggest chance source or defining rule; late sets carry cross-engine capstones.
- Discover is the universal support mechanic: three options drawn from a five-boon pool, picks stack, the next qualifying event consumes the stack. Autopilot picks automatically and enhances automatic picks.
- Automation is thresholds, never timers: displayed cards watch coin and pack watermarks and fire when totals cross them, online or idle.
- Editing the case sells that card's duplicate stack first — displaying is a commitment.
- Every engine trigger animates; nothing fires silently. Card text is player-facing rules text, never internal jargon.
- The Rewrite (prestige) opens only by owning What Was Never Named. It resets binder, cash, and shop; Inscriptions persist and multiply income and duplicate sales by +25% each, and Rewriting with the Nameless displayed doubles the Inscriptions earned.

The full verb list, pipeline order, and rejected directions live in `docs/ENGINE_SPEC.md`.

## Review commands

```bash
npm test
npm run test:e2e
```

The unit suite includes a collection-invariant test for every non-pack action. The browser suite verifies the uncluttered main loop, click and hold-Space reveal flows, responsive card layout, gradual shop disclosure, and high-rarity impact treatment.
