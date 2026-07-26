// Meta balance campaign: many curated builds raced to a full 240-card
// collection through the real engine, reveal by reveal.
//   node scripts/simulate-meta.mjs [--hours=2500] [--packs=40000] [--seeds=2] [--json=out.json]

import fs from "node:fs";
import { ALL_CARDS, SETS, seededRandom } from "../lib/gameData.js";
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
import { getDisplayedEntries, getCaseSlots } from "../lib/engineCards.js";
import { LEGACY_CARD_MAP } from "../lib/gameData.js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  return [key, value ?? true];
}));
const HOUR = 3_600_000;
const HOURS_CAP = Number(args.hours || 2500);
const PACKS_CAP = Number(args.packs || 40_000);
const SEEDS = Number(args.seeds || 2);
const TOTAL_CARDS = ALL_CARDS.length;
const MILESTONES = [60, 120, 180, 220, 235, 240];

// Display priorities per build: King(s) first, then the supports that define
// the archetype. Cards come online as soon as they are pulled.
const LEGACY_BUILDS = {
  "baseline: empty case": [],
  "common echo": ["corner-12", "lastlight-01", "unwritten-09", "corner-01", "corner-07", "corner-10"],
  "rare echo": ["crown-12", "lastlight-02", "observatory-08", "signal-10", "crown-02", "frontier-10"],
  "mark engine": ["circuit-12", "lastlight-04", "circuit-03", "observatory-03", "observatory-09", "circuit-02"],
  "mark + rare echo": ["circuit-12", "crown-12", "observatory-03", "prism-04", "lastlight-04", "circuit-11"],
  "mark + catalyst": ["cloud-12", "circuit-12", "lastlight-06", "cloud-05", "observatory-03", "lastlight-04"],
  "salvage engine": ["frontier-12", "apocalypse-04", "harbor-05", "frontier-01", "lastlight-11", "frontier-07"],
  "salvage + pity": ["frontier-12", "unwritten-08", "signal-06", "unwritten-03", "lastlight-11", "harbor-04"],
  "mimic + dupes": ["abyss-12", "abyss-01", "apocalypse-10", "glass-02", "abyss-03", "foundry-01"],
  "fusion depth": ["verdant-12", "unwritten-07", "hollow-07", "verdant-04", "verdant-10", "lastlight-08"],
  "fusion + fracture": ["verdant-12", "ember-12", "unwritten-07", "lastlight-07", "ember-06", "ember-04"],
  "fusion + salvage": ["verdant-12", "frontier-12", "foundry-06", "unwritten-07", "hollow-12", "lastlight-11"],
  "transmute climb": ["polar-12", "lastlight-05", "prism-09", "polar-03", "observatory-04", "polar-01"],
  "fracture volume": ["ember-12", "lastlight-07", "ember-07", "ember-01", "foundry-09", "ember-04"],
  "blueprint fusion": ["unwritten-07", "verdant-12", "glass-12", "hollow-07", "verdant-04", "lastlight-08"],
  "relay chain": ["harbor-12", "harbor-06", "harbor-01", "unwritten-01", "signal-10", "harbor-09"],
  "autopilot discover": ["orchard-12", "orchard-01", "unwritten-02", "orchard-07", "prism-07", "abyss-09"],
  "kitchen sink endgame": ["frontier-12", "verdant-12", "unwritten-08", "unwritten-07", "lastlight-11", "signal-06"],
};

// Curated builds are written in legacy card ids; map them onto the live
// print-line reprints.
const BUILDS = Object.fromEntries(Object.entries(LEGACY_BUILDS).map(([label, ids]) => [
  label,
  ids.map((id) => LEGACY_CARD_MAP[id] || id),
]));

function refreshLoadout(state, priority, now) {
  if (!priority.length) return state;
  const slots = getCaseSlots(state).slots;
  const target = priority.filter((id) => (state.collection?.[id] || 0) > 0).slice(0, slots);
  const current = getDisplayedEntries(state).map((entry) => entry.id);
  if (target.join() === current.join()) return state;
  let next = state;
  for (const id of current) if (!target.includes(id)) next = undisplayCard(next, id, now);
  for (const id of target) next = displayCard(next, id, now);
  return next;
}

function ownedCount(state) {
  let count = 0;
  for (const id in state.collection) if (state.collection[id] > 0) count += 1;
  return count;
}

function simulate({ label, priority, seed }) {
  const rng = seededRandom(seed);
  let state = createInitialState(0);
  let now = 0;
  let packs = 0;
  let idleMs = 0;
  const tally = { mystery: 0, fusion: 0, echo: 0, transmute: 0, engineCoins: 0 };
  const milestones = {};
  let kingAt = null;
  let namelessVia = null;
  let lastLoadout = -Infinity;
  const kingIds = priority.filter((id) => {
    const slot = Number(id.slice(id.lastIndexOf("-") + 1));
    return slot >= 31;
  });

  const absorb = (events) => {
    for (const event of events) {
      if (event.t === "mystery") tally.mystery += 1;
      else if (event.t === "fusion") tally.fusion += 1;
      else if (event.t === "echo") tally.echo += 1;
      else if (event.t === "transmute") tally.transmute += 1;
      else if (event.t === "coins") tally.engineCoins += event.amount;
    }
  };
  const noteNameless = (via) => {
    if (!namelessVia && (state.collection["unwritten-12"] || 0) > 0) namelessVia = via;
  };
  const noteProgress = () => {
    const owned = ownedCount(state);
    for (const mark of MILESTONES) {
      if (owned >= mark && !(mark in milestones)) {
        milestones[mark] = { hours: +(now / HOUR).toFixed(1), packs };
      }
    }
    if (kingAt === null && kingIds.some((id) => (state.collection[id] || 0) > 0)) {
      kingAt = { hours: +(now / HOUR).toFixed(1), packs };
    }
  };

  while (now < HOURS_CAP * HOUR && packs < PACKS_CAP && ownedCount(state) < TOTAL_CARDS) {
    if (now - lastLoadout > 10 * 60_000) {
      state = refreshLoadout(state, priority, now);
      lastLoadout = now;
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
        absorb(opened.result.events);
        let cards = opened.result.cards;
        let guard = 0;
        while (guard++ < 600) {
          const index = cards.findIndex((pull) => !pull.revealed && !pull.fusedAway);
          if (index < 0) {
            const fusion = resolveFusions(state, cards, { rng });
            state = fusion.state;
            cards = fusion.cards;
            absorb(fusion.events);
            noteNameless("fusion");
            if (fusion.fused) continue;
            break;
          }
          const step = revealPackCard(state, cards, index, { manual: true, rng });
          state = step.state;
          cards = step.cards;
          absorb(step.events);
          const pull = cards[index];
          noteNameless(pull?.fromMystery ? "mystery" : pull?.fusedFrom ? "fusion" : "pull");
          if (state.discoverOffer) state = chooseDiscoverOption(state, state.discoverOffer[0]);
          now += 350;
        }
      }
      now += 1_700;
      noteProgress();
      continue;
    }

    const price = getPackPrice(state, "loose", state.activeSet);
    if (getDuplicateCount(state) > 0 && state.coins < price * 4) {
      const sale = sellDuplicatesDetailed(state, { rng });
      state = sale.state;
      absorb(sale.events);
      noteNameless("mystery");
      noteProgress();
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
    absorb(swept.events);
    noteNameless("mystery");
    now += wait;
    noteProgress();
  }

  noteProgress();
  return {
    label,
    seed,
    owned: ownedCount(state),
    fillPct: +((100 * ownedCount(state)) / TOTAL_CARDS).toFixed(1),
    packs,
    simHours: +(now / HOUR).toFixed(1),
    idleHours: +(idleMs / HOUR).toFixed(1),
    setsCompleted: getCompletedSetIds(state).length,
    milestones,
    kingAt,
    namelessVia,
    ...tally,
  };
}

const results = [];
for (const [label, priority] of Object.entries(BUILDS)) {
  for (let index = 0; index < SEEDS; index += 1) {
    const seed = 101 + index * 37;
    const startedAt = process.hrtime.bigint();
    const result = simulate({ label, priority, seed });
    const wall = Number(process.hrtime.bigint() - startedAt) / 1e9;
    results.push(result);
    const m180 = result.milestones[180] ? `${result.milestones[180].packs}p` : "--";
    const m240 = result.milestones[240] ? `${result.milestones[240].packs}p/${result.milestones[240].hours}h` : "--";
    console.log(
      `${label.padEnd(22)} s${seed} | fill ${String(result.fillPct).padStart(5)}% (${String(result.owned).padStart(3)}) | ${String(result.packs).padStart(6)}p ${String(result.simHours).padStart(7)}h | 180@${m180.padStart(7)} | 240@${m240.padStart(13)} | sets ${String(result.setsCompleted).padStart(2)} | fus ${String(result.fusion).padStart(6)} | mys ${String(result.mystery).padStart(5)} | ${result.namelessVia || "-"} | (${wall.toFixed(0)}s)`,
    );
  }
}
if (args.json) {
  fs.writeFileSync(String(args.json), JSON.stringify(results, null, 2));
  console.log(`wrote ${args.json}`);
}
