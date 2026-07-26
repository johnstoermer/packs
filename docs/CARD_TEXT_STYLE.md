# PACKWORKS card text style

This is the source of truth for player-facing card rules. The renderer and
detail views consume the same structured rules from `lib/engineCards.js`.

## Information order

1. Printed rarity, base pull rate, and card kind
2. Card name
3. Rules text
4. Flavor text
5. Collection state and printed rarity

Rules are never hidden behind flavor text. The compact reveal card may omit
flavor at small sizes, but it keeps the rules text.

## Grammar

- Event triggers begin with **Whenever**: “Whenever you reveal a Common card…”
- Repeating thresholds begin with **For every**: “For every 100 cash you earn…”
- Passive effects use a declarative sentence: “Each pack contains…”
- A trigger with multiple results separates them with a semicolon.
- Use **cash**, never “coins.”
- Use the multiplication sign `×`, never a lowercase `x`.
- Use “additional,” not “extra,” in rules text.
- Use “Rare-or-better” and “Uncommon-or-better” as compound modifiers.
- Capitalize named game mechanics; keep ordinary actions and resources lowercase.
- Rules describe the actual outcome before adding reminder text.

## Named mechanics

| Keyword | Rules meaning |
| --- | --- |
| Echo | Repeat the revealed card's effects. Chance above 100% adds repeats. |
| Mark | Put a visible sign on a card before it is revealed. |
| Salvage | Open a free Mystery Pack immediately. |
| Mystery Pack | A free pack that can reach beyond the current set. |
| Mimic | Make one unrevealed card copy another unrevealed card. |
| Fusion | Combine a same-rarity pair into one card of the next rarity. |
| Transmute | Move an unrevealed card toward the revealed card's rarity. |
| Fracture | Spill another pack into the current reveal. |
| Catalyst | Spread a Mark, copy, or Transmute to another unrevealed card. |
| Blueprint | Copy the exact effect of the card in display slot 1. |
| Relay | Also trigger the displayed card immediately to the right. |
| Discover | Offer a choice of temporary upgrades. |
| Autopilot | Choose an enhanced Discover option automatically. |
| Rewrite | Reset the collection and shop for permanent Inscriptions. |

## Highlighting

Named mechanics, rarities, resources, states, and numeric values are emitted as
semantic tokens. Themes may render those tokens as chips, small caps,
underlines, or color accents, but the underlying emphasis is identical.

Reminder text is shown in the detail view for up to two named mechanics. It
should explain a term without changing the card's actual effect.
