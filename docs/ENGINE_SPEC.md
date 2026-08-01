# PACKWORKS Engine Specification

The contract for the queue-engine redesign. The previous design (18
rarities, 12 verbs, passive income, watermark automation, prestige) is fully
replaced.

## The loop

Earn Cash by opening packs → buy more packs → complete the 50-card
collection → wire the display case into an engine that makes each opening
richer.

## The action queue

Everything that happens during a pack opening is an **action**: reveal a
card, salvage a card, fuse two cards, reroll a card, add cards to the pack.

- Actions are added to the opening's stack and popped strictly in order,
  one at a time. A rapid burst of player clicks queues that many reveals;
  they never process simultaneously.
- Card effects react to actions and push new actions onto the same stack
  (`lib/gameLogic.js` → `stepOpening`). The UI paces the pump; the logic
  layer never schedules time.
- Stale actions (a card that has since fused away, an invalidated pair) are
  discarded silently at pop time.
- Exiting an opening clears the stack. Face-down cards are left behind.

## Triggers

- **On Pack Open** — fires once, immediately, when the pack is opened
  (before the player sees the board). Shapes the pack.
- **On Reveal** — fires after a card flips and pays its Cash.
- **On Salvage** — fires after a card is torn into Scrap.
- **On Fuse** — fires after two cards merge; the fused result's reveal is
  already queued when these fire.

Displayed cards fire in slot order, left to right. Effects that spend
resources (Scrap, Cash) check and pay at trigger time; if the bank is
short, the effect silently does not fire.

## Economy

| Rarity | Odds | Cash | Scrap |
| --- | --- | --- | --- |
| Common | 74% | 1 | 1 |
| Rare | 20% | 4 | 2 |
| Epic | 5% | 15 | 4 |
| Legendary | 1% | 60 | 8 |

- Foil: 5% base odds, pays double Cash. Effects can raise foil odds.
- Pack price: 12 Cash, six cards. Baseline expected value per pack is ~17
  Cash, so opening is always worth it and the engine multiplies from there.
- No passive income. No offline progress. No duplicate-selling economy —
  duplicates simply pay their reveal Cash.

## The twenty effects

Defined in `lib/engineCards.js` (`EFFECTS` + `EFFECT_RULES`), printed on 20
of the 50 cards in `lib/gameData.js`:

1. Scrapactus — On Reveal: 25% chance to Salvage.
2. Salvatort — Gain double Scrap when you Salvage Common cards.
3. Recyclen — On Reveal: If the card is Common, spend 1 Scrap to reroll the card once.
4. Scrapcup — On Reveal: 25% chance to spend 1 Scrap to Reveal an additional Common card.
5. Cinderscrap — Cards give no Cash, gain double Scrap when you Salvage.
6. Rarehouse — On Pack Open: Spend half of your Cash, the pack contains Rare or better cards.
7. Bellpack — On Pack Open: Spend 10 Scrap to add 3 cards to the pack.
8. Firstseer — On Reveal: If this is the first card in the pack, Reveal all other cards in the pack.
9. Coinbud — On Reveal: If the card is Common, gain double Cash for it.
10. Reclaimotive — On Salvage: Spend 20 Scrap to open a pack.
11. Omniecho — Reveal triggers twice.
12. Mimistar — This card copies the effect of the card to its right.
13. Heartmerge — On Reveal: If there is a revealed card in the pack of the same rarity, Fuse them.
14. Fusihare — Fusions have a 5% chance to jump a rarity tier.
15. Mergeimp — On Fuse: Salvage.
16. Boiloreverb — On Fuse: 50% chance to trigger the card to the right.
17. Foilmonk — +5% Foil chance.
18. Foilpress — On Fuse: If both cards were foil, jump to the Legendary rarity.
19. Scrapanvil — On Salvage: If the card is Rare or better, add an additional card to the pack.
20. Encorekeep — When the first card in the display case is triggered, 5% chance to trigger an additional time.

Rulings encoded in the engine:

- **Salvage** targets the card that triggered it (the revealed card, or the
  fused result). It pays Scrap in place of nothing — the Cash a revealed
  card already paid is never clawed back.
- **Fuse** produces a random new card of the same rarity, revealed through
  the queue (so it pays and can chain). Foilpress's double-foil jump wins
  over Fusihare's roll; a double-foil fusion is also foil.
- **Reroll** replaces the card in place with a fresh roll of any rarity;
  a rerolled card cannot reroll again.
- **"Open a pack" inside an opening** (Reclaimotive) merges six new
  face-down cards into the current opening — never a second screen.
- **Mimistar** resolves at engine-build time, right to left, so a copy of a
  copy settles; in the last slot it copies nothing.
- **Omniecho** makes every displayed On Reveal effect fire twice per
  reveal; it does not double the reveal's Cash.
- **Encorekeep** watches slot 1 across every trigger type.
- Growth caps: an opening holds at most 72 cards; the stack holds at most
  200 actions. Effects that would exceed a cap silently do not fire.

## Overflow

When an opening grows past six live cards it tips into Overflow mode: one
face-down stack, one counted pile per distinct card. The board compresses
gracefully; reveals stay big and readable.

## Animation language

Reveal = flip + rarity impact. Salvage = tear, SALVAGED chip, Scrap
floater. Fuse = banner, the result joins the pack. Pack burst = global
burst. Every displayed-card trigger pulses its case-strip slot. **Nothing
happens silently.**

## Rejected directions (do not reintroduce)

Passive cash per second, offline/idle progress, timer-based automation of
any kind, watermark/threshold triggers, duplicate selling as an economy,
prestige/rewrite, Discover boons, Marks, Echo/Transmute/Fracture/Mimic as
pack-state verbs, multiple sets and pack products, grades, false rarity
signals.
