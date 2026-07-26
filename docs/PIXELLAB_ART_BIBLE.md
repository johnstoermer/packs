# PACKWORKS PixelLab art bible

## Identity

PACKWORKS uses original creature-collector designs rather than existing
franchise characters. Every creature's name, silhouette, prop, and motion
should communicate its actual engine effect before the rules text is read.

The complete identity map lives in `lib/cardIdentities.js`. Gameplay wording
remains authoritative in `lib/engineCards.js`.

## Shared visual contract

- 128 × 128 transparent PNG source.
- True 16-bit pixel construction with deliberate square pixels.
- Three-quarter front view and a centered, fully readable silhouette.
- Compact heroic proportions and an expressive face.
- Selective dark-navy outline.
- Medium cel shading with restrained highlights and light volume.
- Set colors dominate; cream, navy, cyan, gold, and coral are shared accents.
- No words, logos, card frames, scenery panels, or existing IP in creature art.
- Effect motifs are concrete: coins, sigils, afterimages, mystery packs,
  crystals, rifts, compasses, sonar rings, or relayed light.

## Holo contract

- Four frames. PixelLab v3 requires an even frame count and recommends four
  frames for a simple idle loop.
- Frame 1 is also the standard card illustration.
- Anatomy, colors, markings, accessories, scale, and camera stay fixed.
- Motion is limited to breathing, weight shift, secondary motion, and the
  card's effect motif.
- Frame 4 must flow back to frame 1.
- The runtime uses `frame-0.png` for standard cards and `holo-strip.png` for
  holo cards.

## Generation pipeline

`scripts/generate-pixellab-art.mjs` uses:

- `POST /v2/generate-image-v2` for the base creature.
- `POST /v2/animate-with-text-v3` for the four-frame loop.
- `GET /v2/background-jobs/{id}` for observable polling.
- `POST /v2/create-image-pixflux` for the PACKWORKS wordmark.

The pipeline is resumable. It skips a card when both its standard frame and
holo strip already exist. It never writes the PixelLab key to disk.

Run it only with a transient process environment:

```sh
read -rs PIXELLAB_API_KEY
export PIXELLAB_API_KEY
node scripts/generate-pixellab-art.mjs --concurrency=3
unset PIXELLAB_API_KEY
```

Do not put the key in an `.env` file. `.env` variants are ignored as a second
line of defense.

## Review

Open `/review/` to inspect all 240 cards. The Card Lab supports:

- Standard/holo treatment switching.
- Play/pause for every four-frame loop.
- Set and rarity filters.
- Name, rules, and keyword search.
- True-card zoom.
- A dedicated reveal-turn and light-3D interaction check.
- Live generation coverage from `public/card-art-pixel/manifest.json`.
