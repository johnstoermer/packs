import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_PASSIVE_RATE,
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
  getCurrentBeat,
  getDuplicateCount,
  getDuplicateSaleValue,
  getFusionLevel,
  getPackPrice,
  getProductCount,
  getSetUnlockStatus,
  getUpgradeCost,
  hydrateState,
  openPack,
  sellDuplicates,
  tickEconomy,
} from "../lib/gameLogic.js";
import { ALL_CARDS, PACK_PRODUCTS, RARITIES, SETS, getCard } from "../lib/gameData.js";

function clone(value) {
  return structuredClone(value);
}

test("a new game starts with three packs and no cards", () => {
  const state = createInitialState(1);
  assert.equal(getProductCount(state, "corner", "loose"), 3);
  assert.deepEqual(state.collection, {});
  assert.equal(state.coins, 0);
  assert.equal(state.packsOpened, 0);
});

test("buying product changes pack stock but can never create a card", () => {
  const state = { ...createInitialState(1), coins: 500 };
  const beforeCollection = clone(state.collection);
  const next = buyProduct(state, "loose");
  assert.equal(getProductCount(next, "corner", "loose"), 4);
  assert.deepEqual(next.collection, beforeCollection);
  assert.equal(next.coins, 490);
});

test("pack prices stay simple as opened volume grows", () => {
  const fresh = createInitialState(1);
  const knownBuyer = { ...fresh, packsOpened: 866 };
  assert.equal(getPackPrice(fresh, "loose"), 10);
  assert.equal(getPackPrice(knownBuyer, "loose"), 10);
});

test("supplier terms reduce purchase cost", () => {
  const state = { ...createInitialState(1), upgrades: { ...createInitialState(1).upgrades, supplier: 2 } };
  assert.equal(getPackPrice(state, "loose"), 9.5);
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

test("cash income is a flat one per second and the binder pays nothing", () => {
  const state = createInitialState(1);
  const opened = openPack(state, { manual: true, now: 2_000, rng: () => 0.99 });
  assert.equal(getBinderIncome(opened.state), 0);
  assert.equal(BINDER_PAYOUT_SCALE, 0);
  assert.equal(BASE_PASSIVE_RATE, 1);
  assert.equal(tickEconomy(opened.state, 1).coins, opened.state.coins + 1);
});

test("the complete 18-tier rarity ladder uses the requested base rates", () => {
  const expected = {
    common: 0.45,
    uncommon: 0.24,
    rare: 0.15,
    epic: 0.08,
    legendary: 0.04,
    mythic: 0.02,
    exalted: 0.01,
    ascendant: 0.005,
    celestial: 0.0025,
    divine: 0.001,
    astral: 0.0005,
    eternal: 0.0002,
    primordial: 0.0001,
    transcendent: 0.00005,
    empyrean: 0.00002,
    absolute: 0.00001,
    singularity: 0.000005,
    nameless: 0.000001,
  };
  assert.equal(Object.keys(RARITIES).length, 18);
  assert.deepEqual(
    Object.fromEntries(Object.entries(RARITIES).map(([id, rarity]) => [id, rarity.odds])),
    expected,
  );
  assert.deepEqual(
    Object.values(RARITIES).map((rarity) => rarity.order),
    Array.from({ length: 18 }, (_, index) => index),
  );
  assert.ok(Object.values(RARITIES).every((rarity) => rarity.border && rarity.rateLabel));
  assert.ok(Object.values(RARITIES).every((rarity, index, all) => index === 0 || rarity.sellValue > all[index - 1].sellValue));
});

test("a stronger printing becomes the kept copy while the displaced copy enters the sell pile", () => {
  const state = {
    ...createInitialState(1),
    collection: { "corner-01": 1 },
    bestRarities: { "corner-01": "common" },
  };
  const opened = openPack(state, { manual: true, free: true, now: 2_000, rng: () => 0 });
  assert.ok(Object.values(opened.state.bestRarities).includes("nameless"));
  assert.ok(opened.state.duplicateBank > 0);
  assert.ok(opened.result.duplicatesAdded > 0);
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

test("duplicate counts remain explicit at the legacy collection milestones", () => {
  for (const [copies, expectedLevel] of [[2, 1], [4, 2], [8, 3], [16, 4], [32, 5]]) {
    assert.equal(getFusionLevel(copies), expectedLevel);
  }
});

test("selling duplicates keeps one of every card and pays the full sell pile", () => {
  const state = hydrateState({
    ...createInitialState(1),
    collection: { "corner-01": 4, "corner-06": 2 },
  }, 2);
  const count = getDuplicateCount(state);
  const value = getDuplicateSaleValue(state);
  const sold = sellDuplicates(state);
  assert.equal(count, 4);
  assert.equal(sold.collection["corner-01"], 1);
  assert.equal(sold.collection["corner-06"], 1);
  assert.equal(getDuplicateCount(sold), 0);
  assert.equal(sold.coins, state.coins + value);
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
  const withDuplicates = hydrateState({ ...base, collection: { [card.id]: 2 } }, 2);
  const dealer = buyUpgrade({ ...withDuplicates, coins: 25 }, "shelf");
  assert.equal(getDuplicateSaleValue(dealer), getDuplicateSaleValue(withDuplicates) * 1.2);
  assert.equal(buyUpgrade(base, "lamp"), base);

  const supplierReady = {
    ...advanceBeat({ ...base, packsOpened: 50 }),
    coins: 280,
  };
  const supplier = buyUpgrade(supplierReady, "supplier");
  assert.equal(supplier.upgrades.supplier, 1);
  assert.ok(getPackPrice(supplier, "loose") < getPackPrice(supplierReady, "loose"));
});

test("booster boxes are removed while cases remain a late bulk option", () => {
  assert.equal(PACK_PRODUCTS.some((product) => product.id === "box"), false);
  const fresh = { ...createInitialState(1), coins: 10_000 };
  const caseReady = advanceBeat({ ...fresh, packsOpened: 150 });
  const withCase = buyProduct(caseReady, "case");
  assert.equal(getProductCount(withCase, "corner", "case"), 1);
});

test("breaking a case moves its packs to the opening table", () => {
  const state = advanceBeat({ ...createInitialState(1), packsOpened: 150, coins: 2_000 });
  const bought = buyProduct(state, "case");
  const broken = breakProduct(bought, "case");
  assert.equal(getProductCount(broken, "corner", "case"), 0);
  assert.equal(getProductCount(broken, "corner", "loose"), 147);
  assert.deepEqual(broken.collection, state.collection);
});

test("set stock unlocks from different collection characteristics", () => {
  const state = createInitialState(1);
  assert.equal(getCurrentBeat(state), 1);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 9 }), 1);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 10 }), 2);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 30 }), 3);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 75 }), 4);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 150 }), 5);

  const circuit = advanceBeat({ ...state, collection: { "corner-12": 1 } });
  assert.equal(getSetUnlockStatus(circuit, "circuit").unlocked, true);
  assert.ok(circuit.unlockedSets.includes("circuit"));
  assert.equal(getPackPrice(circuit, "loose", "circuit"), 28);
  const circuitPurchase = buyProduct({ ...circuit, coins: 28 }, "loose", "circuit");
  assert.equal(getProductCount(circuitPurchase, "circuit", "loose"), 1);
  assert.equal(circuitPurchase.activeSet, "circuit");

  const frontier = advanceBeat({ ...state, packsOpened: 25 });
  assert.ok(frontier.unlockedSets.includes("frontier"));

  const cornerComplete = Object.fromEntries(getCard("corner-01").setId === "corner"
    ? SETS[0].cards.map((card) => [card.id, 1])
    : []);
  const abyss = advanceBeat({ ...state, collection: cornerComplete });
  assert.ok(abyss.unlockedSets.includes("abyss"));

  const twoSets = Object.fromEntries(SETS.slice(0, 2).flatMap((set) => set.cards.map((card) => [card.id, 1])));
  const bestRarities = Object.fromEntries(Object.keys(twoSets).slice(0, 3).map((id) => [id, "mythic"]));
  const crown = advanceBeat({ ...state, collection: twoSets, bestRarities });
  assert.ok(crown.unlockedSets.includes("crown"));
});

test("economy ticks add exactly one cash per second and never buy or open product", () => {
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
  assert.equal(next.coins, state.coins + 1);
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
  assert.equal(result.report.coins, 3_600);
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
    sealed: { corner: { loose: 0, box: 1 } },
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
  assert.equal(getProductCount(state, "corner", "loose"), 29);
  assert.equal(state.bestRarities["corner-01"], "common");
  assert.ok(state.duplicateBank > 0);
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
