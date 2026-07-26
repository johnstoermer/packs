# PACKWORKS Engine Specification

Distilled from the authoritative design conversation. This document is the
contract for the display-case engine overhaul. The previous ~240 stat-stick
effects are legacy and fully replaced; only the core loop survives: earn
money, buy packs, open packs, reveal cards, complete sets, sell duplicates,
unlock sets, prestige.

## Core philosophy

The player is building an engine, not collecting numbers. Display case cards
are engine components. Every card changes how the game behaves — never just
"+50%".

## Three-part engine structure

- **Trigger** — when something happens (card revealed, pack opened, duplicate
  sold, coins earned, set completed, mystery pack opened).
- **Modifier** — the verb (Echo, Mark, Salvage, Fusion, Transmute, …).
- **Payoff** — what ultimately happens (open packs, reveal cards, gain money,
  create Mystery Packs, upgrade rarity, trigger effects).

**Every chance source stands alone. Pure dials modify.** A card that reads
"+16% chance to Fracture" fractures packs all by itself — displaying it IS
the way into a Fracture build. The chase card of each early set is that
verb's **signature**: its biggest chance source, or its defining rule where
one genuinely exists (Mimic, Fusion, Blueprint, Relay, Autopilot). A
signature is never a bare "this verb is now active" gate. Dials that only
bias, deepen, or redirect a verb (Mark targeting, Fusion depth, Mimic
preferences) stay inert until some source feeds them — they modify, they
don't gate.

## The twelve verbs and their signatures

1. **Common Echo** (signature: +50% chance) — Common reveals may Echo: their
   reveal triggers fire again. Chance is additive from a base of zero across
   every displayed source; effective chance past 100% grants guaranteed
   additional Echoes with the remainder rolled as chance (so boosts are
   always live dials, never dead text). Every Echo visibly replays the
   reveal on the card itself.
2. **Rare Echo** (signature: +50% chance) — Rare-or-better reveals Echo
   under the same additive, overflow-into-extra-Echoes rules. Split from
   Common Echo for balance and identity; never one universal Echo.
3. **Salvage** (signature: 4% per duplicate sold) — Salvaging bursts open a
   Mystery Pack. Any support that grants Salvage chances or events works on
   its own (per duplicate sold, per coins earned, per set completed, per
   fusion). The bridge between active play and passive income.
4. **Mark** (signature: one Marked card per pack) — Marks are visible before
   reveal and create reveal-order decisions. Any card that creates Marks
   works alone; supports that pay on Marked reveals spend the Marks.
5. **Fusion** (signature: the pairing rule) — after reveals, same-rarity
   pairs fuse upward and reveal again. Solo-fusion and cross-rarity chance
   sources work standalone; depth and foil dials modify.
6. **Catalyst** (signature: +75% spread chance) — when a card gains a
   property, it may spread to another unrevealed card. Chain reactions.
7. **Mimic** (signature: the copying rule) — before reveal, one unrevealed
   card becomes a copy of another. Always visibly animated. Supports bias
   targets.
8. **Transmute** (signature: +50% chance) — when a card is revealed, another
   unrevealed card visibly transmutes toward that rarity. Chance is additive
   from zero; supports bias direction and targets.
9. **Fracture** (signature: +35% chance) — packs fracture into additional
   packs that merge into the current reveal. Chains build massive reveal
   boards. Never separate screens.
10. **Blueprint** (signature: the copy rule) — behaves as an exact copy of
    the card in display slot 1. No selection UI; position is the interface.
11. **Relay** (signature: the chain rule) — whenever a displayed card
    triggers, the displayed card immediately to its right also triggers if
    able. Positional chains.
12. **Autopilot** (signature: the automation rule) — whenever you would
    Discover, an option is chosen automatically and enhanced. High-agency
    manual play vs high-flow automated play.

## Mystery Packs

Contain cards from every unlocked set, with a very small chance of cards from
future locked sets. Always visual events: they burst onto the screen, open
immediately, and merge into the current reveal. Never interrupt gameplay.

## Discover

Not a King — a universal support mechanic. Supports create Discover events;
the player picks one of three options; picks stack and the whole stack is
consumed by the next qualifying event.

Pool: **Insight** (next Mark gains one additional Mark), **Resonance** (next
Echo gains one additional trigger), **Catalyst** (next Fusion upgrades one
additional rarity), **Reflection** (next Transmute affects one additional
card), **Acceleration** (next Salvage triggers one additional time).

Discover modifies existing verbs only; it never introduces new mechanics.
Every new verb should eventually get a Discover option.

## Pack pipeline

1. Generate pack.
2. Resolve all pre-reveal effects (Fracture, Mimic, Mark, pre-seeded state).
3. Show the player the resulting puzzle.
4. Reveal one card at a time; resolve reveal effects (Echo, Transmute,
   Catalyst, coin payoffs, Salvage progress, Discover triggers).
5. After the last reveal, resolve Fusion chains; fused cards reveal again and
   may fuse again.

**Never invalidate information already shown to the player.**

## Passive systems

Passive systems generate resources. Resources cross thresholds. Thresholds
trigger engines. **Never timer-based triggers.** "Every 100 coins earned →
Salvage" is correct; "every 5 seconds → Salvage" is wrong. Idle income (the
flat cash drip) feeds the same thresholds as active play and never becomes a
second gameplay system.

## Display case rules

- Six slots; slot 1 is always unlocked (Blueprint's reference point). One
  unique card per slot.
- The display case is **always visible** — main menu and pack opening — as a
  live engine dashboard. It replaces the old pack progress topline.
- Clicking it opens the management interface.
- Editing the case first force-sells the duplicate stack, so builds are
  commitments (no swap-before-selling exploits).
- Every trigger animates its slot. Trigger frequency teaches the player which
  cards carry their engine.

## Animation language

Echo = pulse. Mark = glow/icon on the card back. Fusion = cards fly together
and merge. Transmute = morph. Relay = energy chain to the right. Blueprint =
mirrors slot 1. Salvage = Mystery Pack bursts onto the screen. Coins = burst.
**Nothing happens silently.** If it triggered, the player saw it.

## Card text rules

Player-facing language only: "displayed cards", "display case slot 1",
"revealed cards", "packs", "duplicates". Never "support", "King", or any
internal term. Chance sources state absolutes about themselves — "+16%
chance to Fracture" — because the number IS the card. Pure dials nudge:
"prefer", "+1 step". Supports never say "always" or "guaranteed".

## Support philosophy

Supports add chance sources, bias probabilities, extend chains, and create
synergy; they never exist as isolated percentage sticks. Commons stay
valuable forever: signatures elevate commons, and endgame builds should
naturally mix commons through high rarities. Builds should read as
identities: "I'm playing Salvage", never "I stacked forty multipliers".

Uniqueness rules (enforced by tests/engine.test.mjs):
- No two cards may ever have identical effect text.
- A numbers-stripped effect template may repeat on at most three cards, and
  those must escalate strongly across set tiers (an early anchor, a mid
  restatement, a late capper). Everything else gets a one-of-a-kind effect.
- When adding a card, prefer inventing a new trigger, payoff, or knob over
  re-numbering an existing template.
- No economy sticks: displayed cards never modify duplicate sale value or
  product prices — those belong to the three shop upgrades (and the rejected
  Broker direction stays rejected). Engine coins always flow through a
  visible trigger.
- Supports keep nudge language even when powerful: "prefer", "+N% chance" —
  a support never says "always", "never", or "guaranteed". Rule absolutes
  are reserved for signatures and capstones.

## UI scaling

Packs can grow to dozens or hundreds of cards (Fracture, Mystery Packs,
Fusion). The board compresses gracefully — cards get smaller, reveals stay
big and readable. The interface grows denser, not heavier.

## Rejected directions (do not reintroduce)

Charge/Amplifier (linear, not exponential), Historian/pack memory (no
agency), Reveal-sequence memory, Lucky as a separate tag (folded into Mark
types), Imbue (Mark's space), Invest (unclear decision), Orbit (variation of
Connected), Shuffle/position-manipulation of pack cards, Replicate (too close
to Echo), one-universal-Echo, Curator pick-a-rarity, on-sell-button doubling
(Broker), timer-based automation of any kind, factory/machine theming (the
payoff is visible cause and effect, not a metaphor).

Demoted to support space: Connected/Collector (relationship tags inside Mark
and Mimic builds).

## Print lines → signature mapping

The pool is five 48-card print lines, every line sharing one rarity
distribution (10 Common, 8 Uncommon, 6 Rare, 4 Epic, 3 Legendary, 3 Mythic,
2 Exalted, 2 Ascendant, 2 Celestial, then one of each deeper tier). Each
line leans toward a family of verbs, and its signatures are pinned to high
slots so rarity itself routes players into builds: signatures sit at the top
Legendary, top Mythic, and top Celestial of their line; capstones take the
Absolute and apex slots. The final line swaps its Singularity for the
Nameless finale — the prestige door closes the collection. Nothing is gated
on a signature — every chance source on every support works the moment it is
displayed.

- Midnight Marquee: Common Echo, Mark, Rare Echo
- Tideworks: Salvage, Relay
- Forgeline: Fusion, Fracture
- Mirrorfield: Mimic, Transmute, Catalyst
- The Last Archive: Blueprint, Autopilot, and the Nameless
