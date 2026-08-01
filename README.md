# PACKWORKS

PACKWORKS is a clean incremental game about opening card packs, completing a
50-card collection, and wiring the display case into an engine of Cash and
Scrap.

## The loop

1. Buy a Core Pack for 12 cash and tear it open — six cards, face down.
2. Click through the cards (or hold Space). Every reveal pays cash by
   rarity: Common 1, Rare 4, Epic 15, Legendary 60. Foil pays double.
3. Any card you have never opened before joins the collection — 50 cards to
   find.
4. Display owned cards in the case. Twenty of the fifty carry printed
   effects that fire while a pack is open: salvaging reveals into Scrap,
   fusing same-rarity cards, bursting extra packs into the opening, and
   more. The other thirty are pure collection pieces.

## The action stack

The engine's one structural rule: **nothing resolves simultaneously.**
Every input and every card effect becomes an action on the opening's stack,
and the stack pops strictly one action at a time. Resolution is
depth-first: whatever a reveal sets off — salvages, fuses, added cards,
chained reveals — cuts to the front of the stack and fully resolves before
the next queued reveal gets its turn.

Effects only trigger while you are inside a pack opening. Leaving an
opening clears the stack — pending effects die, face-down cards are left
behind, and everything already revealed stays paid.

There is no cash per second, no offline progress, and no timer-driven
gameplay.

## Resources

- **Cash** buys packs. It only comes from revealing cards.
- **Scrap** comes from Salvage — tearing up a revealed card (Common 1,
  Rare 2, Epic 4, Legendary 8). Displayed effects spend it automatically:
  rerolling Commons, adding cards to packs, bursting whole extra packs into
  an opening.

## Development

```bash
npm test
npm run test:e2e
npm run dev
```

Design contracts live in `docs/CORE_RULES.md` and `docs/ENGINE_SPEC.md`.

## Builds

```bash
npm run build
npm run build:portal
npm run build:test
```

The first two builds are written to `dist/`. The default build packages a Sites-compatible Worker plus root-relative assets. The portal build targets `/games/packs/`. The test build is written to `dist-test/` and targets `/games/packs/test/` — publish it with `npm run deploy:test -- --push`, which copies it into a sibling `herm.cool` checkout under `games-test/packs/` and pushes (the portal serves that directory at `https://herm.cool/games/packs/test/`).

## Assets and UI license

The live illustrations in `public/card-art-pixel/` were created specifically for PACKWORKS. Every card uses its animated PixelLab frame set; the retired static-art fallback is intentionally not shipped. No artwork, characters, names, or scans from commercial trading-card games are included.

The project includes [augmented-ui](https://augmented-ui.com/) under the BSD 2-Clause License. Its license is included at `public/vendor/augmented-ui.LICENSE.txt`.
