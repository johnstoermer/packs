// Randomized build campaign: thousands of runs whose display case is
// re-rolled at random intervals from whatever the run owns. Every window of
// play attributes packs opened and unique cards gained to the cards on
// display, bucketed by collection stage, so per-card marginal lift can be
// computed across the whole campaign.
//   node scripts/simulate-random.mjs --runs=2500 --seedStart=1000 --hours=350 --out=runs.jsonl

import fs from "node:fs";
import { SETS, seededRandom } from "../lib/gameData.js";
import {
  buyProduct,
  breakProduct,
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
  selectSet,
  sellDuplicatesDetailed,
  undisplayCard,
} from "../lib/gameLogic.js";
import { getCardDef, getDisplayedEntries, getCaseSlots } from "../lib/engineCards.js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  return [key, value ?? true];
}));
const HOUR = 3_600_000;
const RUNS = Number(args.runs || 100);
const SEED_START = Number(args.seedStart || 1000);
const HOURS_CAP = Number(args.hours || 350);
const PACKS_CAP = Number(args.packs || 4000);
const OUT = String(args.out || "random-runs.jsonl");

const STAGES = [60, 100, 140, Infinity];
const stageOf = (owned) => STAGES.findIndex((limit) => owned < limit);

function ownedCount(state) {
  let count = 0;
  for (const id in state.collection) if (state.collection[id] > 0) count += 1;
  return count;
}

function randomLoadout(state, rng) {
  const slots = getCaseSlots(state).slots;
  const pool = Object.keys(state.collection).filter((id) => state.collection[id] > 0 && getCardDef(id));
  const picks = [];
  while (picks.length < slots && pool.length) {
    const index = Math.floor(rng() * pool.length) % pool.length;
    picks.push(pool.splice(index, 1)[0]);
  }
  return picks;
}

function applyLoadout(state, target, now) {
  const current = getDisplayedEntries(state).map((entry) => entry.id);
  if (target.join() === current.join()) return state;
  let next = state;
  for (const id of current) if (!target.includes(id)) next = undisplayCard(next, id, now);
  for (const id of target) next = displayCard(next, id, now);
  return next;
}

function simulate(seed) {
  const rng = seededRandom(seed);
  let state = createInitialState(0);
  let now = 0;
  let packs = 0;
  const exposure = {}; // cardId -> [p0,g0,p1,g1,p2,g2,p3,g3]
  const stageTotals = [0, 0, 0, 0, 0, 0, 0, 0]; // p,g per stage
  let window_ = null;
  let nextReroll = 0;

  const openWindow = () => {
    window_ = {
      ids: getDisplayedEntries(state).map((entry) => entry.id),
      stage: stageOf(ownedCount(state)),
      packs0: packs,
      owned0: ownedCount(state),
    };
  };
  const closeWindow = () => {
    if (!window_) return;
    const packsDelta = packs - window_.packs0;
    const gainDelta = ownedCount(state) - window_.owned0;
    if (packsDelta > 0) {
      const base = window_.stage * 2;
      stageTotals[base] += packsDelta;
      stageTotals[base + 1] += gainDelta;
      for (const id of window_.ids) {
        const row = exposure[id] || (exposure[id] = [0, 0, 0, 0, 0, 0, 0, 0]);
        row[base] += packsDelta;
        row[base + 1] += gainDelta;
      }
    }
    window_ = null;
  };

  while (now < HOURS_CAP * HOUR && packs < PACKS_CAP) {
    if (now >= nextReroll) {
      closeWindow();
      state = applyLoadout(state, randomLoadout(state, rng), now);
      nextReroll = now + (1 + rng() * 3) * HOUR;
      openWindow();
    }
    if (state.discoverOffer) state = chooseDiscoverOption(state, state.discoverOffer[0]);

    const completed = new Set(getCompletedSetIds(state));
    const active = SETS.map((set) => set.id).find((id) => !completed.has(id) && state.unlockedSets.includes(id)) || state.activeSet;
    if (active !== state.activeSet) state = selectSet(state, active);

    if ((state.sealed[state.activeSet]?.loose || 0) > 0) {
      const opened = openPack(state, { manual: true, source: "loose", now: now + 1, rng });
      if (opened.result) {
        state = opened.state;
        packs += opened.result.packsInReveal;
        let cards = opened.result.cards;
        let guard = 0;
        while (guard++ < 600) {
          const index = cards.findIndex((pull) => !pull.revealed && !pull.fusedAway);
          if (index < 0) {
            const fusion = resolveFusions(state, cards, { rng });
            state = fusion.state;
            cards = fusion.cards;
            if (fusion.fused) continue;
            break;
          }
          const step = revealPackCard(state, cards, index, { manual: true, rng });
          state = step.state;
          cards = step.cards;
          if (state.discoverOffer) state = chooseDiscoverOption(state, state.discoverOffer[0]);
          now += 350;
        }
      }
      now += 1_700;
      continue;
    }

    const price = getPackPrice(state, "loose", state.activeSet);
    if (getDuplicateCount(state) > 0 && state.coins < price * 4) {
      state = sellDuplicatesDetailed(state, { rng }).state;
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
    state = { ...state, coins: Math.floor(state.coins + rate * (wait / 1000)), lifetimeCoins: Math.floor(state.lifetimeCoins + rate * (wait / 1000)) };
    state = evaluateIdleThresholds(state, { rng }).state;
    now += wait;
  }
  closeWindow();

  return {
    seed,
    owned: ownedCount(state),
    packs,
    hours: +(now / HOUR).toFixed(1),
    sets: getCompletedSetIds(state).length,
    stageTotals,
    exposure,
  };
}

const stream = fs.createWriteStream(OUT, { flags: "a" });
const startedAt = Date.now();
for (let index = 0; index < RUNS; index += 1) {
  const result = simulate(SEED_START + index);
  stream.write(`${JSON.stringify(result)}\n`);
  if ((index + 1) % 100 === 0) {
    const rate = (index + 1) / ((Date.now() - startedAt) / 1000);
    console.log(`${OUT}: ${index + 1}/${RUNS} runs (${rate.toFixed(2)}/s)`);
  }
}
stream.end();
console.log(`${OUT}: done — ${RUNS} runs`);
