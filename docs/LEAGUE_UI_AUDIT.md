# League UI anti-giveaway audit

The target is a polished console-game interface: authored, tactile, and built
around play. This file records the checks applied to the League overhaul.

## Removed

- Glassmorphism and blurred translucent panels
- Generic dark dashboard surfaces
- Repeated SaaS cards with identical radius, border, and shadow treatment
- Decorative gradients without a material or gameplay purpose
- Tiny metadata as the primary hierarchy
- A separate web-style details page inside a modal
- Theme-demo controls after the League direction was selected
- Mixed serif, monospace, and system-font UI voices
- Trigger feedback that appeared only as a toast
- Dark opening, Discover, Salvage, and rarity treatments inherited from the
  original workshop interface

## Replaced with

- Opaque tournament hardware with navy outlines and physical drop shadows
- A small set of purposeful materials: enamel, printed paper, foil, and arena
  display graphics
- Chunky focus and pressed states designed to read from couch distance
- Controller-style A, B, and Y action cues on the primary game loop
- One printed card component shared by reveals and collection zoom
- A camera-style card zoom with a compact action HUD
- Authored shop tickets, binder cells, display-case sockets, and Discover cards
- Rarity and mechanic feedback that occurs at the affected card
- Three coherent motion languages that preserve the same League layout

## Motion options

- **Broadcast** — scoreboards, speed lines, camera kick, and rarity lower-thirds
- **Holo Rush** — prismatic lighting, spectral trails, and luminous card energy
- **Tabletop Snap** — sleeve friction, physical bounce, stepped impacts, and
  paper confetti

Reduced-effects mode and the operating-system reduced-motion preference override
all three packages.
