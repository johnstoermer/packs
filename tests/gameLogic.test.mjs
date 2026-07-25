import test from "node:test";
import assert from "node:assert/strict";
import {
  DECK_SIZE,
  FORGE_COST,
  addFilingRule,
  applyOfflineProgress,
  buyProduct,
  changeDeckCard,
  configureStandingOrder,
  createInitialState,
  forgePack,
  getBinderIncome,
  getCardIncome,
  getCurrentBeat,
  getFusionLevel,
  getPackPrice,
  getProductCount,
  hydrateState,
  openPack,
  resolveDuel,
  resolveSealedDuel,
  startSealedRun,
  tickEconomy,
  updateFilingRule,
} from "../lib/gameLogic.js";
import { ALL_CARDS, RARITIES, getCard, getSet } from "../lib/gameData.js";

function clone(value) {
  return structuredClone(value);
}

test("a new desk starts with sealed product and no loose cards", () => {
  const state = createInitialState(1);
  assert.equal(getProductCount(state, "corner", "loose"), 3);
  assert.deepEqual(state.collection, {});
  assert.equal(state.coins, 0);
  assert.equal(state.beat, 1);
});

test("buying product changes sealed inventory but never creates a card", () => {
  const state = { ...createInitialState(1), coins: 500 };
  const beforeCollection = clone(state.collection);
  const next = buyProduct(state, "loose");
  assert.equal(getProductCount(next, "corner", "loose"), 4);
  assert.deepEqual(next.collection, beforeCollection);
  assert.equal(next.coins, 490);
});

test("pack price follows known-buyer market pressure", () => {
  const fresh = createInitialState(1);
  const knownBuyer = { ...fresh, packsOpened: 866 };
  assert.equal(getPackPrice(fresh, "loose"), 10);
  assert.ok(getPackPrice(knownBuyer, "loose") > 19.9);
  assert.ok(getPackPrice(knownBuyer, "loose") < 20.1);
});

test("opening consumes one sealed pack, files six cards, and grants no cash", () => {
  const state = { ...createInitialState(1), coins: 17 };
  const opened = openPack(state, { manual: true, now: 2_000, rng: () => 0.99 });
  assert.equal(opened.error, null);
  assert.equal(opened.result.cards.length, 6);
  assert.equal(opened.state.cardsPulled, 6);
  assert.equal(getProductCount(opened.state, "corner", "loose"), 2);
  assert.equal(opened.state.coins, 17);
  assert.ok(Object.keys(opened.state.collection).length > 0);
});

test("manual misses build heat while machine pulls stay flat", () => {
  const state = createInitialState(1);
  const manual = openPack(state, { manual: true, free: true, now: 2, rng: () => 0.99 }).state;
  const automatic = openPack(state, { manual: false, free: true, now: 2, rng: () => 0.99 }).state;
  assert.equal(manual.pityLegendary, 1);
  assert.equal(automatic.pityLegendary, 0);
});

test("manual opening is capped near forty packs per minute", () => {
  const state = createInitialState(1);
  const first = openPack(state, { manual: true, now: 10_000, rng: () => 0.99 }).state;
  const capped = openPack(first, { manual: true, now: 11_000, rng: () => 0.99 });
  const allowed = openPack(first, { manual: true, now: 11_500, rng: () => 0.99 });
  assert.equal(capped.error, "MANUAL_RATE_CAP");
  assert.equal(capped.state.packsOpened, 1);
  assert.equal(allowed.error, null);
  assert.equal(allowed.state.packsOpened, 2);
});

test("manual opening grades the card while automated opening uses floor grade", () => {
  const state = createInitialState(1);
  const manual = openPack(state, { manual: true, free: true, rng: () => 0.99 }).result;
  const automatic = openPack(state, { manual: false, free: true, rng: () => 0.99 }).result;
  assert.ok(manual.cards.every((pull) => pull.grade === 10));
  assert.ok(automatic.cards.every((pull) => pull.grade === 4));
});

test("rarity signals can be false positives without changing the printed pull", () => {
  const state = createInitialState(1);
  const result = openPack(state, { manual: true, free: true, rng: () => 0.01 }).result;
  assert.ok(result.falseSignals > 0);
  assert.ok(result.cards.some((pull) => RARITIES[pull.signalRarity].order > RARITIES[pull.rarity].order));
});

test("star fusion crosses 2/4/8/16/32 and raises the binder effect by 40% each", () => {
  const card = getCard("corner-01");
  const state = { ...createInitialState(1), beat: 2, collection: { [card.id]: 1 } };
  const base = getCardIncome(state, card.id);
  for (const [copies, expectedLevel] of [[2, 1], [4, 2], [8, 3], [16, 4], [32, 5]]) {
    const next = { ...state, collection: { [card.id]: copies } };
    assert.equal(getFusionLevel(copies), expectedLevel);
    assert.equal(getCardIncome(next, card.id), base * (1 + expectedLevel * 0.4));
  }
});

test("standing orders buy sealed product but do not open it", () => {
  let state = {
    ...createInitialState(1),
    beat: 2,
    coins: 100,
    collection: { "corner-01": 1 },
  };
  state = configureStandingOrder(state, { enabled: true, product: "loose" });
  const next = tickEconomy(state, 1);
  assert.equal(next.packsOpened, 0);
  assert.equal(getProductCount(next, "corner", "loose"), 4);
  assert.deepEqual(next.collection, state.collection);
});

test("filing rules only shred copies above the written threshold", () => {
  const commons = getSet("corner").cards.filter((card) => card.rarity === "common");
  let state = {
    ...createInitialState(1),
    beat: 4,
    duelsWon: 1,
    collection: Object.fromEntries(commons.map((card) => [card.id, 32])),
    forgeMaterial: 0,
  };
  state = addFilingRule(state);
  state = updateFilingRule(state, state.filingRules[0].id, { rarity: "common", threshold: 32 });
  const result = openPack(state, { manual: true, free: true, rng: () => 0.99 });
  for (const card of commons) assert.equal(result.state.collection[card.id], 32);
  assert.ok(result.result.cards.every((pull) => pull.filedAction === "shred"));
  assert.ok(result.state.forgeMaterial > 1);
});

test("the forge produces a closed tag-biased pack rather than a card", () => {
  const state = {
    ...createInitialState(1),
    beat: 5,
    sealedWins: 1,
    forgeMaterial: FORGE_COST,
    unlockedSets: ["corner", "circuit"],
  };
  const forged = forgePack(state, "swarm");
  assert.equal(forged.forged.corner.swarm, 1);
  assert.deepEqual(forged.collection, state.collection);
  const opened = openPack(forged, { source: "forged:swarm", manual: true, rng: () => 0.99 });
  assert.equal(opened.state.forged.corner.swarm, 0);
  assert.equal(opened.result.tagBias, "swarm");
  assert.equal(opened.result.cards.length, 6);
});

test("constructed duel accepts twelve owned copies and pays only sealed packs", () => {
  const highCards = getSet("corner").cards
    .sort((a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order)
    .slice(0, 4);
  let state = {
    ...createInitialState(1),
    beat: 3,
    packsOpened: 6,
    collection: Object.fromEntries(highCards.map((card) => [card.id, 3])),
  };
  for (const card of highCards) {
    for (let copy = 0; copy < 3; copy += 1) state = changeDeckCard(state, card.id, 1);
  }
  assert.equal(state.duelDeck.length, DECK_SIZE);
  const beforeCollection = clone(state.collection);
  const result = resolveDuel(state, { rng: () => 0 });
  assert.equal(result.result.win, true);
  assert.equal(getProductCount(result.state, "corner", "loose"), 6);
  assert.deepEqual(result.state.collection, beforeCollection);
  assert.equal(result.state.duelsWon, 1);
  assert.equal(result.state.beat, 4);
});

test("sealed uses six packs, builds from its restricted pool, and unlocks archetypes on a win", () => {
  const binderOnly = "circuit-12";
  let state = {
    ...createInitialState(1),
    beat: 4,
    duelsWon: 1,
    unlockedSets: ["corner"],
    collection: { [binderOnly]: 1 },
  };
  state.sealed.corner.loose = 6;
  state = startSealedRun(state, "corner", 2);
  assert.equal(getProductCount(state, "corner", "loose"), 0);
  for (let index = 0; index < 6; index += 1) {
    state = openPack(state, { manual: true, context: "sealed", now: 2_000 + index * 2_000, rng: () => 0 }).state;
  }
  assert.equal(state.sealedRun.phase, "deck");
  assert.equal(Object.values(state.sealedRun.pool).reduce((sum, count) => sum + count, 0), 36);
  const beforeIllegal = state.sealedRun.deck.length;
  state = changeDeckCard(state, binderOnly, 1, "sealed");
  assert.equal(state.sealedRun.deck.length, beforeIllegal);

  const poolCards = ALL_CARDS
    .filter((card) => state.sealedRun.pool[card.id])
    .flatMap((card) => Array.from({ length: state.sealedRun.pool[card.id] }, () => card))
    .sort((a, b) => b.power - a.power)
    .slice(0, DECK_SIZE);
  for (const card of poolCards) state = changeDeckCard(state, card.id, 1, "sealed");
  const result = resolveSealedDuel(state, { rng: () => 0 });
  assert.equal(result.result.win, true);
  assert.equal(result.state.sealedRun, null);
  assert.equal(result.state.beat, 5);
  assert.equal(getProductCount(result.state, "corner", "loose"), 4);
});

test("beat progression follows packs, discoveries, constructed win, then sealed win", () => {
  const state = createInitialState(1);
  assert.equal(getCurrentBeat(state), 1);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 3 }), 2);
  assert.equal(getCurrentBeat({
    ...state,
    packsOpened: 6,
    collection: Object.fromEntries(ALL_CARDS.slice(0, 8).map((card) => [card.id, 1])),
  }), 3);
  assert.equal(getCurrentBeat({ ...state, duelsWon: 1 }), 4);
  assert.equal(getCurrentBeat({ ...state, sealedWins: 1 }), 5);
});

test("offline progress earns binder cash and may source stock, but never opens a pack", () => {
  const now = 10_000_000;
  let state = {
    ...createInitialState(1),
    beat: 2,
    collection: { "corner-01": 2, "corner-06": 1 },
    standingOrder: {
      ...createInitialState(1).standingOrder,
      enabled: true,
      product: "loose",
      setId: "corner",
    },
    lastSavedAt: now - 60 * 60 * 1000,
  };
  const result = applyOfflineProgress(state, now);
  assert.ok(result.report.coins > 0);
  assert.ok(result.report.ordered > 0);
  assert.equal(result.state.packsOpened, 0);
  assert.deepEqual(result.state.collection, state.collection);
  assert.ok(getProductCount(result.state, "corner", "loose") > 3);
  assert.ok(getBinderIncome(result.state) > 0);
});

test("hydration migrates the old numeric collection without inventing cards", () => {
  const state = hydrateState({
    version: 1,
    coins: 90,
    packsOpened: 4,
    collection: { "corner-01": 2, invalid: 99 },
    activeSet: "missing",
  }, 50);
  assert.equal(state.version, 2);
  assert.equal(state.collection["corner-01"], 2);
  assert.equal(state.collection.invalid, undefined);
  assert.equal(state.activeSet, "corner");
  assert.equal(state.beat, 2);
});
