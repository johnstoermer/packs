// Aggregate the randomized-build campaign: per-card marginal lift on
// collection-fill speed, verb-family rankings, and completion statistics.
//   node scripts/analyze-random.mjs rand-w1.jsonl rand-w2.jsonl ...
import fs from "node:fs";
import { getCard } from "../lib/gameData.js";
import { getCardDef, KINGS } from "../lib/engineCards.js";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: node scripts/analyze-random.mjs <runs.jsonl> [...]");
  process.exit(1);
}

const STAGE_LABELS = ["<60 cards", "60-99", "100-139", "140+"];
const runs = files.flatMap((file) => fs.readFileSync(file, "utf8")
  .split("\n").filter(Boolean).map((line) => JSON.parse(line)));

// --- completion statistics ---
const hoursDone = runs.filter((run) => run.owned >= 240).map((run) => run.hours).sort((a, b) => a - b);
const packsDone = runs.filter((run) => run.owned >= 240).map((run) => run.packs).sort((a, b) => a - b);
const pct = (list, p) => list.length ? list[Math.min(list.length - 1, Math.floor(list.length * p))] : null;
console.log(`runs: ${runs.length}`);
console.log(`completed 240/240: ${hoursDone.length} (${(100 * hoursDone.length / runs.length).toFixed(1)}%)`);
if (hoursDone.length) {
  console.log(`sim-hours to full: p10 ${pct(hoursDone, 0.10)} | median ${pct(hoursDone, 0.5)} | p90 ${pct(hoursDone, 0.9)}`);
  console.log(`packs to full:     p10 ${pct(packsDone, 0.10)} | median ${pct(packsDone, 0.5)} | p90 ${pct(packsDone, 0.9)}`);
}

// --- per-stage baselines ---
const base = [0, 0, 0, 0].map(() => ({ p: 0, g: 0 }));
for (const run of runs) {
  for (let stage = 0; stage < 4; stage += 1) {
    base[stage].p += run.stageTotals[stage * 2];
    base[stage].g += run.stageTotals[stage * 2 + 1];
  }
}
console.log("\nbaseline new-cards-per-pack by stage:");
base.forEach((entry, stage) => {
  console.log(`  ${STAGE_LABELS[stage].padEnd(10)} ${(entry.g / Math.max(1, entry.p)).toFixed(4)} over ${entry.p} exposure-packs`);
});

// --- per-card exposure ---
const cards = {};
for (const run of runs) {
  for (const [id, row] of Object.entries(run.exposure || {})) {
    const bucket = cards[id] || (cards[id] = [0, 0, 0, 0, 0, 0, 0, 0]);
    for (let index = 0; index < 8; index += 1) bucket[index] += row[index];
  }
}

const MIN_PACKS = 1_500;
const scored = [];
for (const [id, row] of Object.entries(cards)) {
  const card = getCard(id);
  if (!card) continue;
  let weight = 0;
  let liftSum = 0;
  let packsTotal = 0;
  const perStage = [];
  for (let stage = 0; stage < 4; stage += 1) {
    const packs = row[stage * 2];
    const gains = row[stage * 2 + 1];
    packsTotal += packs;
    const baseline = base[stage].g / Math.max(1, base[stage].p);
    if (packs >= 300 && baseline > 0) {
      const lift = (gains / packs) / baseline;
      const w = Math.min(packs, 20_000);
      liftSum += lift * w;
      weight += w;
      perStage.push(`${STAGE_LABELS[stage]}:${lift.toFixed(2)}`);
    }
  }
  if (packsTotal < MIN_PACKS || !weight) continue;
  scored.push({ id, name: card.name, rarity: card.rarity, lift: liftSum / weight, packs: packsTotal, perStage });
}
scored.sort((a, b) => b.lift - a.lift);

const describeVerb = (id) => {
  const def = getCardDef(id) || {};
  if (def.sig) return `sig:${def.sig}`;
  const text = JSON.stringify(def);
  for (const verb of ["fracture", "fusion", "mark", "mimic", "transmute", "catalyst", "relay", "salvage", "mystery", "echo", "discover", "packSize", "coins"]) {
    if (text.toLowerCase().includes(verb.toLowerCase())) return verb;
  }
  return "other";
};

console.log(`\ntop 20 cards by exposure-weighted fill lift (min ${MIN_PACKS} packs):`);
for (const entry of scored.slice(0, 20)) {
  console.log(`  ${entry.lift.toFixed(3)}x  ${entry.id.padEnd(15)} ${entry.name.padEnd(28)} ${entry.rarity.padEnd(11)} ${describeVerb(entry.id).padEnd(14)} (${entry.packs}p)`);
}
console.log("\nbottom 10 cards:");
for (const entry of scored.slice(-10)) {
  console.log(`  ${entry.lift.toFixed(3)}x  ${entry.id.padEnd(15)} ${entry.name.padEnd(28)} ${entry.rarity.padEnd(11)} ${describeVerb(entry.id).padEnd(14)} (${entry.packs}p)`);
}

// --- early/mid ranking (stages 0-2 only): de-confounds cards that are
// only obtainable near the end, when there is nothing left to fill. ---
const earlyScored = [];
for (const [id, row] of Object.entries(cards)) {
  const card = getCard(id);
  if (!card) continue;
  let weight = 0;
  let liftSum = 0;
  for (let stage = 0; stage < 3; stage += 1) {
    const packs = row[stage * 2];
    const baseline = base[stage].g / Math.max(1, base[stage].p);
    if (packs >= 300 && baseline > 0) {
      const w = Math.min(packs, 20_000);
      liftSum += ((row[stage * 2 + 1] / packs) / baseline) * w;
      weight += w;
    }
  }
  if (weight >= 600) earlyScored.push({ id, name: card.name, rarity: card.rarity, lift: liftSum / weight });
}
earlyScored.sort((a, b) => b.lift - a.lift);
console.log("\ntop 15 early/mid-game cards (stages <140 only):");
for (const entry of earlyScored.slice(0, 15)) {
  console.log(`  ${entry.lift.toFixed(3)}x  ${entry.id.padEnd(15)} ${entry.name.padEnd(28)} ${entry.rarity.padEnd(11)} ${describeVerb(entry.id)}`);
}

// --- verb families ---
const families = {};
for (const entry of scored) {
  const family = describeVerb(entry.id).replace(/^sig:/, "");
  const bucket = families[family] || (families[family] = { lift: 0, weight: 0, count: 0 });
  bucket.lift += entry.lift * entry.packs;
  bucket.weight += entry.packs;
  bucket.count += 1;
}
console.log("\nverb families by exposure-weighted lift:");
Object.entries(families)
  .map(([family, bucket]) => ({ family, lift: bucket.lift / bucket.weight, count: bucket.count, packs: bucket.weight }))
  .sort((a, b) => b.lift - a.lift)
  .forEach((row) => console.log(`  ${row.lift.toFixed(3)}x  ${row.family.padEnd(14)} (${row.count} cards, ${row.packs}p)`));

// --- signatures specifically ---
console.log("\nsignatures ranked:");
scored.filter((entry) => (getCardDef(entry.id) || {}).sig)
  .forEach((entry) => console.log(`  ${entry.lift.toFixed(3)}x  ${(getCardDef(entry.id).sig + "").padEnd(11)} ${entry.name} [${entry.perStage.join(" ")}]`));
