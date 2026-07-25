// Headless balance simulator: plays PACKWORKS with the real game logic under
// different set-progression paths and display-case builds, from a fresh save
// through the Rewrite, on a simulated clock with seeded RNG.
//
//   node scripts/simulate-balance.mjs [--hours=400] [--packs=40000] [--json=out.json]
//
// Each scenario reports sim-time and pack counts for every major milestone,
// where the run stalled, and what the case contributed. Results feed balance
// tuning; nothing here ships to players.

import fs from "node:fs";
import { RARITIES, SETS, getSet, seededRandom } from "../lib/gameData.js";
import {
  buyProduct,
  breakProduct,
  canRewrite,
  createInitialState,
  displayCard,
  getCompletedSetIds,
  getDuplicateCount,
  getDuplicateSaleValue,
  getInscriptionsEarned,
  getPackPrice,
  getPassiveIncomeRate,
  openPack,
  rewriteState,
  selectSet,
  sellDuplicates,
  undisplayCard,
} from "../lib/gameLogic.js";
import {
  getCardEffect,
  getCaseSlots,
  getDisplayedEntries,
  getDisplayModifiers,
} from "../lib/displayEffects.js";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const OPEN_SECONDS = 1.7;

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  return [key, value ?? true];
}));
const HOURS_CAP = Number(args.hours || 400);
const PACKS_CAP = Number(args.packs || 40_000);

// --- Progression paths: ordered set preferences over the unlock DAG. -------
const PATHS = {
  wide: { order: SETS.map((set) => set.id) },
  economyLane: { order: ["corner", "circuit", "frontier", "verdant", "cloud", "orchard", "harbor", "signal", "glass", "polar", "abyss", "crown", "ember", "hollow", "prism", "observatory", "foundry", "apocalypse", "lastlight", "unwritten"] },
  chaosLane: { order: ["corner", "circuit", "abyss", "polar", "glass", "harbor", "signal", "verdant", "cloud", "frontier", "crown", "ember", "hollow", "prism", "observatory", "foundry", "apocalypse", "lastlight", "unwritten"] },
  powerLane: { order: ["corner", "circuit", "crown", "ember", "frontier", "verdant", "hollow", "cloud", "glass", "polar", "abyss", "orchard", "harbor", "signal", "prism", "observatory", "foundry", "apocalypse", "lastlight", "unwritten"] },
  rushSignal: { order: ["corner", "circuit", "frontier", "verdant", "cloud", "harbor", "signal", "abyss", "crown", "polar", "ember", "glass", "orchard", "hollow", "prism", "observatory", "foundry", "apocalypse", "lastlight", "unwritten"] },
};

// --- Display-case builds: how to value an effect type. ---------------------
const BUILD_WEIGHTS = {
  none: {},
  economy: {
    income: 10, interest: 9, bankInterest: 6, dupValue: 8, setDupValue: 5,
    packDiscount: 8, setPackDiscount: 4, dupCash: 6, newCardCash: 5,
    rarityCash: 4, foilCash: 3, misprintCash: 1, quickCash: 3, firstPackCash: 1,
    completionCash: 3, allDupRefund: 6, buyBulkFree: 7, freePack: 7,
    amplifyEco: 9, amplify: 8, inscriptionIncome: 6,
  },
  odds: {
    rarityWeight: 10, pity: 10, pityHalve: 9, pityPower: 8, dupReroll: 9,
    crossSetHunt: 9, crossSet: 4, extraCard: 8, godPack: 7, godExtraCard: 6,
    freePack: 5, amplifyChance: 9, amplify: 8, trueSignal: 1, rampSpeed: 3,
    rampFull: 3, autoOpen: 6,
  },
  chance: {
    godPack: 10, godExtraCard: 9, extraCard: 9, freePack: 9, foilChance: 5,
    dupReroll: 7, crossSetHunt: 6, amplifyChance: 10, amplify: 8, pity: 6,
    autoOpen: 6, allDupRefund: 5,
  },
  greedy: {
    income: 7, interest: 7, dupValue: 6, packDiscount: 7, freePack: 8,
    rarityWeight: 8, pity: 8, dupReroll: 8, crossSetHunt: 8, extraCard: 8,
    godPack: 8, autoOpen: 7, amplify: 9, amplifyEco: 7, amplifyChance: 7,
    allDupRefund: 6, buyBulkFree: 6, dupCash: 5, newCardCash: 5,
    bankInterest: 4, quickCash: 3, pityHalve: 8, pityPower: 7, godExtraCard: 7,
    rampFull: 5, rampSpeed: 4, setDupValue: 3, setPackDiscount: 3,
    rarityCash: 4, foilCash: 2, foilChance: 2, misprintCash: 1,
    completionCash: 3, firstPackCash: 1, trueSignal: 1,
  },
};
const META_WEIGHTS = {
  nameless: 100, inscriptionGain: 50, keepDisplayed: 40, headStart: 30,
  keepCoins: 20, inscriptionIncome: 10,
};

function scoreCard(cardId, weights) {
  const effect = getCardEffect(cardId);
  if (!effect) return 0;
  const base = weights[effect.type] || 0;
  if (!base) return 0;
  const card = SETS.flatMap((set) => set.cards).find((candidate) => candidate.id === cardId);
  return base * (1 + RARITIES[card.rarity].order / 4);
}

function chooseLoadout(state, weights, now) {
  const slots = getCaseSlots(state).slots;
  const owned = Object.keys(state.collection || {}).filter((id) => (state.collection[id] || 0) > 0);
  return owned
    .map((id) => ({ id, score: scoreCard(id, weights) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, slots)
    .map((entry) => entry.id);
}

function applyLoadout(state, targetIds, now) {
  const current = getDisplayedEntries(state).map((entry) => entry.id);
  const keep = new Set(targetIds);
  let next = state;
  for (const id of current) {
    if (!keep.has(id)) next = undisplayCard(next, id);
  }
  for (const id of targetIds) {
    next = displayCard(next, id, now);
  }
  return next;
}

function pickActiveSet(state, path) {
  const completed = new Set(getCompletedSetIds(state));
  for (const setId of path.order) {
    if (completed.has(setId)) continue;
    if (state.unlockedSets.includes(setId)) return setId;
  }
  const anyIncomplete = state.unlockedSets.find((setId) => !completed.has(setId));
  return anyIncomplete || state.activeSet;
}

function simulate({ label, seed, path, build, continueAfterRewrite = false }) {
  const rng = seededRandom(seed);
  let state = createInitialState(0);
  let now = 0;
  let packs = 0;
  let idleMs = 0;
  let godPacks = 0;
  let freePacks = 0;
  let bonusCashTotal = 0;
  let autoCarry = 0;
  let lastLoadoutAt = -Infinity;
  let lastSellAt = 0;
  const milestones = {};
  const setCompletionTimes = {};
  const weights = BUILD_WEIGHTS[build];

  const mark = (name) => {
    if (!(name in milestones)) milestones[name] = { hours: now / HOUR, packs };
  };

  const refreshLoadout = (metaMode = false) => {
    if (build === "none" && !metaMode) return;
    const target = chooseLoadout(state, metaMode ? META_WEIGHTS : weights, now);
    const current = getDisplayedEntries(state).map((entry) => entry.id);
    const currentScore = current.reduce((sum, id) => sum + scoreCard(id, metaMode ? META_WEIGHTS : weights), 0);
    const targetScore = target.reduce((sum, id) => sum + scoreCard(id, metaMode ? META_WEIGHTS : weights), 0);
    if (metaMode || targetScore > currentScore * 1.25 || current.length < target.length) {
      state = applyLoadout(state, target, now);
    }
    lastLoadoutAt = now;
  };

  const trackResult = (result) => {
    packs += 1;
    if (result.isGodPack) godPacks += 1;
    if (result.freePackGranted) freePacks += 1;
    bonusCashTotal += result.bonusCash || 0;
    const rarest = Math.max(...result.cards.map((pull) => RARITIES[pull.rarity].order));
    for (const tier of ["legendary", "mythic", "exalted", "celestial", "astral", "primordial", "singularity", "nameless"]) {
      if (rarest >= RARITIES[tier].order) mark(`first ${tier}`);
    }
  };

  const trackCompletions = (before) => {
    const after = getCompletedSetIds(state);
    for (const setId of after) {
      if (!before.includes(setId) && !(setId in setCompletionTimes)) {
        setCompletionTimes[setId] = { hours: now / HOUR, packs };
        mark(`${after.length} sets complete`);
      }
    }
    if (after.length >= 19) mark("all 19 sets complete");
  };

  const advanceIncome = (ms) => {
    if (ms <= 0) return;
    const mods = getDisplayModifiers(state, now);
    const rate = getPassiveIncomeRate(state, now);
    let coins = Math.max(0, state.coins);
    if (mods.interest > 0) {
      coins = coins * Math.pow(1 + mods.interest / 100, ms / MINUTE);
    }
    coins += rate * (ms / 1000);
    state = { ...state, coins: Math.floor(coins), lifetimeCoins: Math.max(state.lifetimeCoins, Math.floor(coins)) };
    now += ms;
  };

  let rewriteReport = null;
  const runUntil = (stopCheck) => {
    while (now < HOURS_CAP * HOUR && packs < PACKS_CAP) {
      if (stopCheck()) return true;

      if (now - lastLoadoutAt >= 10 * MINUTE) refreshLoadout();

      const activeSet = pickActiveSet(state, path);
      if (activeSet !== state.activeSet) state = selectSet(state, activeSet);

      const mods = getDisplayModifiers(state, now);
      const loose = state.sealed[state.activeSet]?.loose || 0;
      if (loose > 0) {
        // Auto-open effects run alongside; process what accrued, then one manual open.
        if (mods.autoOpenEvery > 0) {
          autoCarry += OPEN_SECONDS;
          while (autoCarry >= mods.autoOpenEvery && (state.sealed[state.activeSet]?.loose || 0) > 0) {
            autoCarry -= mods.autoOpenEvery;
            const auto = openPack(state, { manual: false, source: "loose", now, rng });
            if (!auto.result) break;
            const before = getCompletedSetIds(state);
            state = auto.state;
            trackResult(auto.result);
            trackCompletions(before);
          }
        }
        if ((state.sealed[state.activeSet]?.loose || 0) > 0) {
          const opened = openPack(state, { manual: true, source: "loose", now, rng });
          if (opened.result) {
            const before = getCompletedSetIds(state);
            state = opened.state;
            trackResult(opened.result);
            trackCompletions(before);
          }
        }
        advanceIncome(OPEN_SECONDS * 1000);
        continue;
      }

      // Out of stock: sell duplicates if it unlocks a purchase or on cadence.
      const price = getPackPrice(state, "loose", state.activeSet, now);
      const casePrice = state.beat >= 5 ? getPackPrice(state, "case", state.activeSet, now) : Infinity;
      const dupValue = getDuplicateSaleValue(state, now);
      const shouldSell = getDuplicateCount(state) > 0 && (
        state.coins < price || now - lastSellAt >= 30 * MINUTE
      );
      if (shouldSell) {
        state = sellDuplicates(state, now);
        lastSellAt = now;
      }

      if (state.beat >= 5 && state.coins >= casePrice && casePrice / 144 < price) {
        state = buyProduct(state, "case", state.activeSet, 1, now);
        state = breakProduct(state, "case", state.activeSet);
        continue;
      }
      if (state.coins >= price) {
        const batch = Math.max(1, Math.min(24, Math.floor(state.coins / price)));
        state = buyProduct(state, "loose", state.activeSet, batch, now);
        continue;
      }

      // Can't afford anything: wait for income (jump, capped so interest and
      // loadout refresh stay reasonably accurate).
      const rate = getPassiveIncomeRate(state, now) + (getDisplayModifiers(state, now).interest > 0 ? 1 : 0);
      const deficit = price - state.coins;
      const waitMs = Math.min(10 * MINUTE, Math.max(1_000, (deficit / Math.max(0.5, rate)) * 1000));
      idleMs += waitMs;
      advanceIncome(waitMs);
    }
    return false;
  };

  // Main run: play until the Nameless card is owned, then Rewrite.
  const finished = runUntil(() => canRewrite(state));
  mark("end of pre-rewrite run");
  const setsDone = getCompletedSetIds(state).length;

  if (finished && canRewrite(state)) {
    mark("nameless owned");
    refreshLoadout(true);
    const inscriptions = getInscriptionsEarned(state, now);
    const beforeRewrite = { hours: now / HOUR, packs };
    state = rewriteState(state, now);
    rewriteReport = { inscriptions, at: beforeRewrite };

    if (continueAfterRewrite) {
      const start = { hours: now / HOUR, packs };
      refreshLoadout();
      runUntil(() => {
        const done = getCompletedSetIds(state);
        return done.includes("corner") && done.includes("circuit");
      });
      rewriteReport.secondRunCornerCircuit = {
        hours: now / HOUR - start.hours,
        packs: packs - start.packs,
      };
    }
  }

  return {
    label,
    seed,
    build,
    path: Object.keys(PATHS).find((key) => PATHS[key] === path),
    finished: !!rewriteReport,
    packs,
    simHours: +(now / HOUR).toFixed(1),
    idleHours: +(idleMs / HOUR).toFixed(1),
    setsCompleted: setsDone,
    godPacks,
    freePacks,
    bonusCashTotal,
    milestones,
    setCompletionTimes,
    rewrite: rewriteReport,
    finalCoins: state.coins,
    inscriptionsHeld: state.prestige.inscriptions,
  };
}

// --- Scenario matrix -------------------------------------------------------
const SCENARIOS = [
  { label: "baseline: wide path, empty case", seed: 11, path: PATHS.wide, build: "none" },
  { label: "wide path, greedy build", seed: 11, path: PATHS.wide, build: "greedy", continueAfterRewrite: true },
  { label: "wide path, odds build", seed: 11, path: PATHS.wide, build: "odds" },
  { label: "wide path, god-pack build", seed: 11, path: PATHS.wide, build: "chance" },
  { label: "economy lane, economy build", seed: 11, path: PATHS.economyLane, build: "economy" },
  { label: "economy lane, greedy build", seed: 23, path: PATHS.economyLane, build: "greedy" },
  { label: "chaos lane, odds build", seed: 11, path: PATHS.chaosLane, build: "odds" },
  { label: "power lane, greedy build", seed: 11, path: PATHS.powerLane, build: "greedy" },
  { label: "rush signal, odds build", seed: 11, path: PATHS.rushSignal, build: "odds" },
  { label: "wide path, greedy build (alt seed)", seed: 47, path: PATHS.wide, build: "greedy" },
];

const results = [];
for (const scenario of SCENARIOS) {
  const startedAt = process.hrtime.bigint();
  const result = simulate(scenario);
  const wallMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  results.push(result);
  const sets = result.setsCompleted;
  console.log(
    `${result.label.padEnd(40)} | ${String(result.packs).padStart(6)} packs | ${String(result.simHours).padStart(6)}h sim | ${String(result.idleHours).padStart(5)}h idle | ${String(sets).padStart(2)} sets | god ${String(result.godPacks).padStart(4)} | ${result.finished ? `REWRITE +${result.rewrite.inscriptions} ins @${result.rewrite.at.hours.toFixed(1)}h` : "no rewrite"} | (${(wallMs / 1000).toFixed(1)}s wall)`
  );
}

if (args.json) {
  fs.writeFileSync(String(args.json), JSON.stringify(results, null, 2));
  console.log(`\nwrote ${args.json}`);
}
