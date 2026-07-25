# PACKWORKS

PACKWORKS is a voxel-isometric incremental game about cracking trading card packs, completing five illustrated sets, and turning a tiny sorting table into an automated card workshop.

## Play

- Click the pack on the worktable or press `Space` to break the foil.
- Hover each face-down card to read its rarity signal, then click every card to turn it.
- Pull cards, earn cash, and build a 60-card binder.
- Buy workshop upgrades to automate the line and improve card value.
- Keep an opening streak alive for a manual earnings multiplier.
- Complete contracts, unlock new print runs, and begin reprints for permanent bonuses.

Progress is saved locally. Offline earnings are capped at eight hours.

## Development

```bash
npm install
npm run dev
```

## Builds

```bash
npm run build
npm run build:portal
```

Both builds are written to `dist/`. The default build packages a Sites-compatible Worker plus root-relative assets, while the portal build targets `/games/packs/`.

## Visual assets

The 60 card illustrations in `public/card-art/` were created specifically for PACKWORKS. No artwork, characters, names, or card scans from commercial trading-card games are included. The generation brief is preserved in `docs/CARD_ART_PROMPTS.md`.

The hard-edged panel framing uses [augmented-ui](https://augmented-ui.com/), distributed under the BSD 2-Clause License. A copy of that license is included at `public/vendor/augmented-ui.LICENSE.txt`.
