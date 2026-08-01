# Core rules

Use this checklist for every reward path and system change.

## The action stack is the engine

- Every player input and every card effect during an opening becomes an
  action on the opening's queue. Actions resolve strictly one at a time, in
  the order they were added — nothing ever resolves simultaneously.
- Rapidly revealing cards stacks reveals; the stack drains in order.
- Card effects only trigger while a pack is open. When the player exits an
  opening, the action stack is cleared: pending reveals and effects are
  gone, and face-down cards are left behind. Revealed cards keep everything
  they already paid.
- There is no passive income, no offline progress, and no timer-driven
  gameplay. The only timers in the app pace animations and autosave.

## Cash, Scrap, and the collection

- Revealing a card pays Cash by rarity: Common 1, Rare 4, Epic 15,
  Legendary 60. Foil cards pay double. Foil base odds are 5%.
- Any card revealed for the first time joins the collection. That is the
  only door into the binder.
- Salvage tears up a revealed card: it leaves the pack and pays Scrap by
  rarity instead — Common 1, Rare 2, Epic 4, Legendary 8. Scrap persists
  between packs and is spent automatically by displayed effects.
- Fuse merges two revealed cards of the same rarity into a new card of that
  rarity, which is revealed again through the queue. Effects can make
  fusions jump a rarity tier.
- Packs cost 12 Cash, hold six cards, and are the only product. A new save
  starts with three sealed packs.

## The collection is exactly 50 cards

- Four rarities: 24 Common (74%), 14 Rare (20%), 8 Epic (5%), 4 Legendary
  (1%).
- Exactly 20 cards carry printed effects; the other 30 are collection cards
  with no effect. Effect text is player-facing and unique per card.

## The display case

- Up to six owned cards can be displayed; slots unlock through pack and
  collection milestones. Slot 1 is always open.
- Displayed cards fire their printed effects only during pack openings, in
  slot order, left to right. Slot order is load-bearing: some effects
  reference "the card to its right" or "the first card in the display
  case".
- Every trigger animates its slot; nothing fires silently.

## Review commands

```bash
npm test
npm run test:e2e
```
