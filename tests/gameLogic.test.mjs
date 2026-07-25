import test from "node:test";
import assert from "node:assert/strict";
import {
  BINDER_PAYOUT_SCALE,
  MANUAL_RATE_CAP_MS,
  SAVE_VERSION,
  advanceBeat,
  applyOfflineProgress,
  breakProduct,
  buyProduct,
  buyUpgrade,
  createInitialState,
  getBinderIncome,
  getCardIncome,
  getCurrentBeat,
  getFusionLevel,
  getPackPrice,
  getProductCount,
  getSealedAssetValue,
  getUpgradeCost,
  hydrateState,
  openPack,
  tickEconomy,
} from "../lib/gameLogic.js";
import { ALL_CARDS, RARITIES, getCard } from "../lib/gameData.js";

function clone(value) {
  return structuredClone(value);
}

test("a new game starts with three sealed packs and no cards", () => {
  const state = createInitialState(1);
  assert.equal(getProductCount(state, "corner", "loose"), 3);
  assert.deepEqual(state.collection, {});
  assert.equal(state.coins, 0);
  assert.equal(state.packsOpened, 0);
});

test("buying product changes sealed stock but can never create a card", () => {
  const state = { ...createInitialState(1), coins: 500 };
  const beforeCollection = clone(state.collection);
  const next = buyProduct(state, "loose");
  assert.equal(getProductCount(next, "corner", "loose"), 4);
  assert.deepEqual(next.collection, beforeCollection);
  assert.equal(next.coins, 490);
});

test("sealed market prices rise with opened volume", () => {
  const fresh = createInitialState(1);
  const knownBuyer = { ...fresh, packsOpened: 866 };
  assert.equal(getPackPrice(fresh, "loose"), 10);
  assert.ok(getPackPrice(knownBuyer, "loose") > 19.9);
  assert.ok(getPackPrice(knownBuyer, "loose") < 20.1);
  assert.ok(getSealedAssetValue(knownBuyer) > getSealedAssetValue(fresh));
});

test("supplier terms reduce purchase cost without reducing owned asset value", () => {
  const state = { ...createInitialState(1), upgrades: { ...createInitialState(1).upgrades, supplier: 2 } };
  const plain = createInitialState(1);
  assert.equal(getPackPrice(state, "loose"), 9.5);
  assert.equal(getSealedAssetValue(state), getSealedAssetValue(plain));
});

test("opening consumes one pack, files six cards, and grants no direct cash", () => {
  const state = { ...createInitialState(1), coins: 17 };
  const opened = openPack(state, { manual: true, now: 2_000, rng: () => 0.99 });
  assert.equal(opened.error, null);
  assert.equal(opened.result.cards.length, 6);
  assert.equal(opened.state.cardsPulled, 6);
  assert.equal(getProductCount(opened.state, "corner", "loose"), 2);
  assert.equal(opened.state.coins, 17);
  assert.ok(Object.keys(opened.state.collection).length > 0);
});

test("the binder pays immediately at the calmer clean-edition scale", () => {
  const state = createInitialState(1);
  const opened = openPack(state, { manual: true, now: 2_000, rng: () => 0.99 });
  const binderRate = getBinderIncome(opened.state);
  assert.ok(binderRate > 0);
  assert.ok(binderRate < 1);
  assert.equal(opened.result.incomeDelta, binderRate);
  assert.equal(BINDER_PAYOUT_SCALE, 0.02);
});

test("manual misses build heat while automated pulls stay flat", () => {
  const state = createInitialState(1);
  const manual = openPack(state, { manual: true, free: true, now: 2, rng: () => 0.99 }).state;
  const automatic = openPack(state, { manual: false, free: true, now: 2, rng: () => 0.99 }).state;
  assert.equal(manual.pityLegendary, 1);
  assert.equal(automatic.pityLegendary, 0);
});

test("manual opening retains a measured rate cap", () => {
  const state = createInitialState(1);
  const first = openPack(state, { manual: true, now: 10_000, rng: () => 0.99 }).state;
  const capped = openPack(first, { manual: true, now: 10_000 + MANUAL_RATE_CAP_MS - 1, rng: () => 0.99 });
  const allowed = openPack(first, { manual: true, now: 10_000 + MANUAL_RATE_CAP_MS, rng: () => 0.99 });
  assert.equal(capped.error, "MANUAL_RATE_CAP");
  assert.equal(allowed.error, null);
});

test("rarity signals may bluff without changing the printed pull", () => {
  const state = createInitialState(1);
  const result = openPack(state, { manual: true, free: true, rng: () => 0.01 }).result;
  assert.ok(result.falseSignals > 0);
  assert.ok(result.cards.some((pull) => RARITIES[pull.signalRarity].order > RARITIES[pull.rarity].order));
});

test("fusion milestones remain useful at 2, 4, 8, 16, and 32 copies", () => {
  const card = getCard("corner-01");
  const state = { ...createInitialState(1), collection: { [card.id]: 1 } };
  const base = getCardIncome(state, card.id);
  for (const [copies, expectedLevel] of [[2, 1], [4, 2], [8, 3], [16, 4], [32, 5]]) {
    const next = { ...state, collection: { [card.id]: copies } };
    assert.equal(getFusionLevel(copies), expectedLevel);
    assert.equal(getCardIncome(next, card.id), base * (1 + expectedLevel * 0.4));
  }
});

test("the three upgrade tracks unlock slowly and have one clear effect each", () => {
  const card = getCard("corner-01");
  const base = {
    ...createInitialState(1),
    packsOpened: 5,
    coins: 25,
    collection: { [card.id]: 1 },
  };
  assert.equal(getUpgradeCost(base, "shelf"), 25);
  const shelf = buyUpgrade(base, "shelf");
  assert.equal(shelf.upgrades.shelf, 1);
  assert.equal(getBinderIncome(shelf), getBinderIncome(base) * 1.2);
  assert.equal(buyUpgrade(base, "lamp"), base);

  const supplierReady = {
    ...advanceBeat({ ...base, packsOpened: 50 }),
    coins: 280,
  };
  const supplier = buyUpgrade(supplierReady, "supplier");
  assert.equal(supplier.upgrades.supplier, 1);
  assert.ok(getPackPrice(supplier, "loose") < getPackPrice(supplierReady, "loose"));
});

test("booster boxes and cases unlock by packs opened, not side systems", () => {
  const fresh = { ...createInitialState(1), coins: 10_000 };
  assert.equal(buyProduct(fresh, "box"), fresh);

  const boxReady = advanceBeat({ ...fresh, packsOpened: 10 });
  const withBox = buyProduct(boxReady, "box");
  assert.equal(getProductCount(withBox, "corner", "box"), 1);

  const caseReady = advanceBeat({ ...fresh, packsOpened: 150 });
  const withCase = buyProduct(caseReady, "case");
  assert.equal(getProductCount(withCase, "corner", "case"), 1);
});

test("breaking a product moves its packs to the opening table", () => {
  const state = advanceBeat({ ...createInitialState(1), packsOpened: 10, coins: 1_000 });
  const bought = buyProduct(state, "box");
  const broken = breakProduct(bought, "box");
  assert.equal(getProductCount(broken, "corner", "box"), 0);
  assert.equal(getProductCount(broken, "corner", "loose"), 27);
  assert.deepEqual(broken.collection, state.collection);
});

test("progression is a slow pack-count ladder and later sets arrive quietly", () => {
  const state = createInitialState(1);
  assert.equal(getCurrentBeat(state), 1);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 9 }), 1);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 10 }), 2);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 30 }), 3);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 75 }), 4);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 150 }), 5);

  const circuit = advanceBeat({ ...state, packsOpened: 150 });
  const frontier = advanceBeat({ ...state, packsOpened: 500 });
  assert.deepEqual(circuit.unlockedSets, ["corner", "circuit"]);
  assert.deepEqual(frontier.unlockedSets, ["corner", "circuit", "frontier"]);
});

test("economy ticks add binder cash and never buy or open product", () => {
  const state = {
    ...createInitialState(1),
    collection: { "corner-01": 2, "corner-06": 1 },
    standingOrder: {
      ...createInitialState(1).standingOrder,
      enabled: true,
      product: "loose",
    },
  };
  const stockBefore = clone(state.sealed);
  const next = tickEconomy(state, 1);
  assert.ok(next.coins > state.coins);
  assert.equal(next.packsOpened, 0);
  assert.deepEqual(next.sealed, stockBefore);
  assert.deepEqual(next.collection, state.collection);
});

test("offline progress pays cash but cannot source or open packs", () => {
  const now = 10_000_000;
  const state = {
    ...createInitialState(1),
    collection: { "corner-01": 2, "corner-06": 1 },
    lastSavedAt: now - 60 * 60 * 1000,
  };
  const stockBefore = clone(state.sealed);
  const result = applyOfflineProgress(state, now);
  assert.ok(result.report.coins > 0);
  assert.equal(result.report.ordered, 0);
  assert.equal(result.state.packsOpened, 0);
  assert.deepEqual(result.state.sealed, stockBefore);
  assert.deepEqual(result.state.collection, state.collection);
});

test("hydration migrates earlier saves without inventing cards", () => {
  const state = hydrateState({
    version: 2,
    coins: 90,
    packsOpened: 4,
    collection: { "corner-01": 2, invalid: 99 },
    activeSet: "missing",
    standingOrder: { enabled: true, product: "loose" },
    filingRules: [{ id: 1, rarity: "common", threshold: 2, action: "shred", enabled: true }],
    forged: { corner: { swarm: 2 } },
    sealedRun: { id: "legacy-run", setId: "corner", remainingPacks: 3, pool: {}, deck: [] },
  }, 50);
  assert.equal(state.version, SAVE_VERSION);
  assert.equal(state.collection["corner-01"], 2);
  assert.equal(state.collection.invalid, undefined);
  assert.equal(state.activeSet, "corner");
  assert.equal(state.beat, 1);
  assert.equal(Object.keys(state.collection).length, 1);
  assert.equal(state.standingOrder.enabled, false);
  assert.deepEqual(state.filingRules, []);
  assert.equal(state.sealedRun, null);
  assert.equal(getProductCount(state, "corner", "loose"), 8);
});

test("every non-pack action preserves the collection", () => {
  const state = advanceBeat({
    ...createInitialState(1),
    packsOpened: 150,
    coins: 100_000,
    collection: Object.fromEntries(ALL_CARDS.slice(0, 5).map((card) => [card.id, 1])),
  });
  const original = clone(state.collection);
  const afterProduct = buyProduct(state, "case");
  const afterUpgrade = buyUpgrade({ ...afterProduct, packsOpened: 150 }, "supplier");
  const afterTick = tickEconomy(afterUpgrade, 1);
  assert.deepEqual(afterProduct.collection, original);
  assert.deepEqual(afterUpgrade.collection, original);
  assert.deepEqual(afterTick.collection, original);
});
