// Headless balance simulator for the verb engine: plays the real game logic
// through unlock paths and King-archetype builds, reveal by reveal.
//   node scripts/simulate-balance.mjs [--hours=200] [--packs=20000] [--json=out.json]

import fs from "node:fs";
import { RARITIES, SETS, getSet, seededRandom } from "../lib/gameData.js";
import {
  buyProduct,
  breakProduct,
  canRewrite,
  chooseDiscoverOption,
  createInitialState,
  displayCard,
  evaluateIdleThresholds,
  getCompletedSetIds,
  getDuplicateCount,
  getPackPrice,
  getPassiveIncomeRate,
  openPack,
  resolveFusions,
  revealPackCard,
  rewriteState,
  selectSet,
  sellDuplicatesDetailed,
  undisplayCard,
} from "../lib/gameLogic.js";
import { getCardDef, getCaseSlots, getDisplayedEntries, SET_KINGS } from "../lib/engineCards.js";

const HOUR = 3_600_000;
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  return [key, value ?? true];
}));
const HOURS_CAP = Number(args.hours || 200);
const PACKS_CAP = Number(args.packs || 20_000);
const OPEN_SECONDS = 1.7;

const PATHS = {
  wide: SETS.map((set) => set.id),
  salvageRush: ["corner", "circuit", "frontier", "abyss", "crown", "verdant", "polar", "ember", "cloud", "glass", "harbor", "orchard", "hollow", "prism", "signal", "observatory", "foundry", "apocalypse", "lastlight", "unwritten"],
};

// Score a card for a build: Kings of favored verbs first, then supports whose
// definitions reference those verbs.
function scoreCard(id, favoredVerbs) {
  const def = getCardDef(id);
  if (!def || def.prestige) return 0;
  if (def.king) return favoredVerbs.includes(def.king) ? 100 : 10;
  const text = JSON.stringify(def);
  let score = 1;
  for (const verb of favoredVerbs) {
    if (verb === "salvage" && /salvage|coinsEarned|mystery/i.test(text)) score += 20;
    if (verb === "fusion" && /fusion|packSize|dupBias/i.test(text)) score += 20;
    if (verb === "mark" && /mark/i.test(text)) score += 20;
    if (verb === "commonEcho" && /commonReveal|echo/i.test(text)) score += 20;
    if (verb === "fracture" && /fracture|packSize/i.test(text)) score += 20;
  }
  if (def.on && (def.coins || def.coinsFlat)) score += 4;
  return score;
}

const BUILDS = {
  none: [],
  salvage: ["salvage", "commonEcho"],
  fusion: ["fusion", "fracture"],
  mark: ["mark", "commonEcho"],
  mixed: ["salvage", "fusion", "mark", "commonEcho", "fracture"],
};

function refreshLoadout(state, favored, now) {
  if (!favored.length) return state;
  const slots = getCaseSlots(state).slots;
  const owned = Object.keys(state.collection || {}).filter((id) => (state.collection[id] || 0) > 0);
  const target = owned
    .map((id) => ({ id, score: scoreCard(id, favored) }))
    .filter((entry) => entry.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, slots)
    .map((entry) => entry.id);
  const current = getDisplayedEntries(state).map((entry) => entry.id);
  if (target.join() === current.join()) return state;
  let next = state;
  for (const id of current) if (!target.includes(id)) next = undisplayCard(next, id, now);
  for (const id of target) next = displayCard(next, id, now);
  return next;
}

function simulate({ label, seed, path, build }) {
  const rng = seededRandom(seed);
  let state = createInitialState(0);
  let now = 0;
  let packs = 0;
  let idleMs = 0;
  let mysteries = 0;
  let fusions = 0;
  const setTimes = {};
  const favored = BUILDS[build];
  let lastLoadout = -Infinity;

  while (now < HOURS_CAP * HOUR && packs < PACKS_CAP && !canRewrite(state)) {
    if (now - lastLoadout > 10 * 60_000) {
      state = refreshLoadout(state, favored, now);
      lastLoadout = now;
    }
    if (state.discoverOffer) state = chooseDiscoverOption(state, state.discoverOffer[0]);

    const completed = new Set(getCompletedSetIds(state));
    const active = path.find((id) => !completed.has(id) && state.unlockedSets.includes(id)) || state.activeSet;
    if (active !== state.activeSet) state = selectSet(state, active);

    if ((state.sealed[state.activeSet]?.loose || 0) > 0) {
      const opened = openPack(state, { manual: true, source: "loose", now, rng });
      if (opened.result) {
        state = opened.state;
        packs += opened.result.packsInReveal;
        let cards = opened.result.cards;
        let guard = 0;
        while (guard++ < 400) {
          const index = cards.findIndex((pull) => !pull.revealed && !pull.fusedAway);
          if (index < 0) {
            const fusion = resolveFusions(state, cards, { rng });
            state = fusion.state;
            cards = fusion.cards;
            if (fusion.fused) { fusions += fusion.events.filter((event) => event.t === "fusion").length; continue; }
            break;
          }
          const step = revealPackCard(state, cards, index, { manual: true, rng });
          state = step.state;
          cards = step.cards;
          mysteries += step.events.filter((event) => event.t === "mystery").length;
          if (state.discoverOffer) state = chooseDiscoverOption(state, state.discoverOffer[0]);
          now += 400;
        }
      }
      now += OPEN_SECONDS * 1000;
      for (const setId of getCompletedSetIds(state)) {
        if (!(setId in setTimes)) setTimes[setId] = { hours: +(now / HOUR).toFixed(1), packs };
      }
      continue;
    }

    const price = getPackPrice(state, "loose", state.activeSet);
    if (getDuplicateCount(state) > 0 && state.coins < price * 4) {
      const sale = sellDuplicatesDetailed(state, { rng });
      state = sale.state;
      mysteries += sale.mysteryCards.length > 0 ? sale.salvages : 0;
      continue;
    }
    const casePrice = state.beat >= 5 ? getPackPrice(state, "case", state.activeSet) : Infinity;
    if (state.coins >= casePrice && casePrice / 144 < price) {
      state = breakProduct(buyProduct(state, "case", state.activeSet, 1), "case", state.activeSet);
      continue;
    }
    if (state.coins >= price) {
      state = buyProduct(state, "loose", state.activeSet, Math.max(1, Math.min(24, Math.floor(state.coins / price))));
      continue;
    }
    const rate = Math.max(0.5, getPassiveIncomeRate(state));
    const wait = Math.min(10 * 60_000, Math.max(1_000, ((price - state.coins) / rate) * 1000));
    idleMs += wait;
    state = { ...state, coins: Math.floor(state.coins + rate * (wait / 1000)), lifetimeCoins: Math.floor(state.lifetimeCoins + rate * (wait / 1000)) };
    const swept = evaluateIdleThresholds(state, { rng });
    state = swept.state;
    now += wait;
  }

  const finished = canRewrite(state);
  if (finished) state = rewriteState(state, now);
  return {
    label,
    packs,
    simHours: +(now / HOUR).toFixed(1),
    idleHours: +(idleMs / HOUR).toFixed(1),
    setsCompleted: finished ? 20 : getCompletedSetIds(state).length,
    mysteries,
    fusions,
    finished,
    inscriptions: state.prestige.inscriptions,
    setTimes,
  };
}

const SCENARIOS = [
  { label: "baseline: no case", seed: 11, path: PATHS.wide, build: "none" },
  { label: "salvage build", seed: 11, path: PATHS.salvageRush, build: "salvage" },
  { label: "fusion build", seed: 11, path: PATHS.wide, build: "fusion" },
  { label: "mark build", seed: 11, path: PATHS.wide, build: "mark" },
  { label: "mixed build", seed: 11, path: PATHS.wide, build: "mixed" },
  { label: "mixed build (alt seed)", seed: 47, path: PATHS.wide, build: "mixed" },
];

const results = [];
for (const scenario of SCENARIOS) {
  const startedAt = process.hrtime.bigint();
  const result = simulate(scenario);
  const wall = Number(process.hrtime.bigint() - startedAt) / 1e9;
  results.push(result);
  console.log(`${result.label.padEnd(26)} | ${String(result.packs).padStart(6)} packs | ${String(result.simHours).padStart(6)}h | idle ${String(result.idleHours).padStart(5)}h | ${String(result.setsCompleted).padStart(2)} sets | mystery ${String(result.mysteries).padStart(4)} | fusion ${String(result.fusions).padStart(5)} | ${result.finished ? `REWRITE +${result.inscriptions}` : "no rewrite"} | (${wall.toFixed(1)}s)`);
}
if (args.json) {
  fs.writeFileSync(String(args.json), JSON.stringify(results, null, 2));
  console.log(`wrote ${args.json}`);
}
