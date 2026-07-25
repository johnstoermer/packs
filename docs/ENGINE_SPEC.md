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

**Kings introduce verbs. Supports modify verbs. Never the reverse.** The King
defines what the verb *does*; supports define *when* it happens, what it
targets, and how it scales. A verb does nothing until its King is displayed.

## Confirmed Kings

1. **Common Echo** — Common reveals Echo: their reveal triggers fire again.
2. **Rare Echo** — Rare-or-better reveals Echo. Split from Common Echo for
   balance and identity; never one universal Echo.
3. **Salvage** — "Whenever you Salvage, create a Mystery Pack." Supports
   create Salvage sources (per duplicate sold, per coins earned, per set
   completed, per fusion). The bridge between active play and passive income.
4. **Mark** — every pack contains one Marked card, visible before reveal.
   Supports define what Marks do, where they appear, how they spread/chain.
   Marks create reveal-order decisions.
5. **Fusion** — after reveals, duplicates fuse upward (4 Commons → 2
   Uncommons → 1 Rare → …). Each fusion reveals again. Supports add pack
   size, fusion depth, duplicate likelihood.
6. **Catalyst** — when a card gains a property, it may spread that property
   to another unrevealed card. Chain reactions.
7. **Mimic** — before reveal, one unrevealed card becomes a copy of another
   unrevealed card. Always visibly animated. Supports bias targets.
8. **Transmute** — when a card is revealed, another unrevealed card visibly
   transmutes toward that rarity. Supports bias direction and targets.
9. **Fracture** — packs fracture into additional packs that merge into the
   current reveal. Chains build massive reveal boards. Never separate screens.
10. **Blueprint** — behaves as an exact copy of the card in display slot 1.
    No selection UI; position is the interface.
11. **Relay** — whenever a displayed card triggers, the displayed card
    immediately to its right also triggers if able. Positional chains.
12. **Autopilot (Discover automation)** — whenever you would Discover, an
    option is chosen automatically and enhanced. High-agency manual play vs
    high-flow automated play.

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
internal term. Supports nudge — "prefer", "more likely", "+1 chance" — never
"always" or "guaranteed".

## Support philosophy

Supports modify verbs, bias probabilities, extend chains, and create synergy;
they never exist as isolated percentage sticks. Commons stay valuable
forever: Kings elevate commons, and endgame builds should naturally mix
commons through high rarities. Builds should read as identities: "I'm playing
Salvage", never "I stacked forty multipliers".

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
- Supports keep nudge language even when powerful: "prefer", "more likely",
  "N% chance" — a support never says "always", "never", or "guaranteed".
  Absolutes are reserved for Kings and capstones, which define rules.

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

## Set → King mapping

The chase card at the end of a set IS that set's King: pulling it completes
the set and hands the player the build-around at the same moment. Kings are
assigned to the first twelve sets in unlock-tree order; later sets' chase
cards are cross-engine capstones (supports that fuse two verbs), and the
final Unwritten chase card remains the prestige door.
