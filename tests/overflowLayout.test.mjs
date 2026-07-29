import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_PILE_WIDTH,
  PILE_ASPECT,
  solveOverflowLayout,
} from "../lib/overflowLayout.js";

const SET_SIZE = 98;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, coarse: false },
  { name: "wide desktop", width: 1920, height: 1080, coarse: false },
  { name: "laptop", width: 1280, height: 720, coarse: false },
  { name: "portal frame", width: 1050, height: 620, coarse: false },
  { name: "compact frame", width: 800, height: 450, coarse: false },
  { name: "phone", width: 390, height: 844, coarse: true },
  { name: "small phone", width: 360, height: 640, coarse: true },
  { name: "tablet", width: 820, height: 1180, coarse: true },
];

function fitReport(layout, viewport) {
  const mobile = viewport.coarse || viewport.width <= 700;
  const availW = viewport.width * (mobile ? 0.96 : 0.94);
  const availH = Math.max(140, viewport.height - layout.pilesTop - layout.pilesBottom);
  const counterH = mobile ? 18 : 22;
  const cols = Math.max(1, Math.floor((availW + layout.gap) / (layout.pileW + layout.gap)));
  const rows = Math.ceil(SET_SIZE / cols);
  const neededH = rows * (layout.pileW * PILE_ASPECT + counterH) + (rows - 1) * layout.gap;
  return { neededH, availH };
}

test("every viewport carries a full 98-pile overflow board at readable size", () => {
  for (const viewport of VIEWPORTS) {
    for (const uniqueCount of [1, 12, 13, 25, 49, 72, 97, 98]) {
      const layout = solveOverflowLayout({ ...viewport, uniqueCount, setSize: SET_SIZE });
      assert.ok(
        layout.pileW >= MIN_PILE_WIDTH,
        `${viewport.name}: pile width ${layout.pileW} below readability floor at ${uniqueCount} piles`,
      );
      assert.ok(Number.isFinite(layout.pileW) && layout.pileW <= 138);
    }
    const full = solveOverflowLayout({ ...viewport, uniqueCount: SET_SIZE, setSize: SET_SIZE });
    const { neededH, availH } = fitReport(full, viewport);
    if (!full.scrollable) {
      assert.ok(
        neededH <= availH + 1,
        `${viewport.name}: claims to fit 98 piles but needs ${Math.round(neededH)}px of ${Math.round(availH)}px`,
      );
    } else {
      // Scrolling is a last resort: it may only engage when fitting would
      // have required shrinking piles below the readability floor.
      const honest = solveOverflowLayout({ ...viewport, uniqueCount: SET_SIZE, setSize: SET_SIZE });
      assert.equal(honest.pileW, MIN_PILE_WIDTH,
        `${viewport.name}: scrolls even though piles sit above the floor`);
    }
  }
});

test("a standard desktop shows all 98 piles without scrolling", () => {
  const layout = solveOverflowLayout({ width: 1440, height: 900, coarse: false, uniqueCount: 98, setSize: SET_SIZE });
  assert.equal(layout.scrollable, false);
  assert.ok(layout.pileW >= 44, `desktop piles too small: ${layout.pileW}`);
});

test("pile size steps stay stable while a board grows", () => {
  const sizes = [];
  for (let unique = 1; unique <= SET_SIZE; unique += 1) {
    const layout = solveOverflowLayout({ width: 1440, height: 900, coarse: false, uniqueCount: unique, setSize: SET_SIZE });
    sizes.push(layout.pileW);
  }
  // The stepped bucket target means at most nine distinct sizes on the way up.
  assert.ok(new Set(sizes).size <= 9, `too many resizes: ${new Set(sizes).size}`);
});
