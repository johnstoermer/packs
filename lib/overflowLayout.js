// Overflow board solver: size the revealed-card piles so that every distinct
// card in the set can sit on screen at once. The stepped target keeps pile
// size stable while new piles stream in mid-opening.
//
// Piles never drop below MIN_PILE_WIDTH — on surfaces too small to fit the
// whole set at that size (phones, tiny embeds), the solver flags the board as
// scrollable instead of shrinking cards into unreadable specks.

export const MIN_PILE_WIDTH = 38;
export const PILE_ASPECT = 1.42;

export function solveOverflowLayout({
  width,
  height,
  coarse = false,
  uniqueCount = 1,
  setSize = 98,
}) {
  const mobileOpening = coarse || width <= 700;
  const unique = Math.max(1, uniqueCount);
  const stepped = Math.min(setSize, Math.max(12, Math.ceil(unique / 12) * 12));
  const availW = width * (mobileOpening ? 0.96 : 0.94);
  const pilesTop = mobileOpening ? 206 : 278;
  const pilesBottom = mobileOpening ? 148 : 88;
  const availH = Math.max(140, height - pilesTop - pilesBottom);
  const gap = mobileOpening ? 6 : 10;
  const counterH = mobileOpening ? 18 : 22;
  const maxCols = mobileOpening ? 9 : 24;

  let pileW = 0;
  for (let cols = 1; cols <= Math.min(stepped, maxCols); cols += 1) {
    const rows = Math.ceil(stepped / cols);
    const widthCap = (availW - (cols - 1) * gap) / cols;
    const heightCap = ((availH - (rows - 1) * gap) / rows - counterH) / PILE_ASPECT;
    const candidate = Math.min(mobileOpening ? 104 : 138, widthCap, heightCap);
    if (candidate > pileW) pileW = candidate;
  }
  pileW = Math.max(MIN_PILE_WIDTH, Math.floor(pileW));

  // With the readability floor applied, check whether the stepped target
  // still fits the area; if not, the board scrolls vertically instead.
  const fitCols = Math.max(1, Math.floor((availW + gap) / (pileW + gap)));
  const rowsNeeded = Math.ceil(stepped / fitCols);
  const neededH = rowsNeeded * (pileW * PILE_ASPECT + counterH) + (rowsNeeded - 1) * gap;
  const scrollable = neededH > availH + 1;

  return {
    pileW,
    gap,
    pilesTop,
    pilesBottom,
    stackW: mobileOpening ? 78 : 104,
    scrollable,
  };
}
