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
  revealPackCard,
  sellDuplicates,
  tickEconomy,
} from "../lib/gameLogic.js";
import { ALL_CARDS, PACK_PRODUCTS, RARITIES, SETS, getCard } from "../lib/gameData.js";

function clone(value) {
  return structuredClone(value);
}


function openAndRevealAll(state, options) {
  const opened = openPack(state, options);
  if (!opened.result) return opened;
  let working = opened.state;
  let cards = opened.result.cards;
  for (let index = 0; index < cards.length; index += 1) {
    if (cards[index].revealed || cards[index].fusedAway) continue;
    const step = revealPackCard(working, cards, index, { manual: options?.manual !== false, rng: options?.rng });
    working = step.state;
    cards = step.cards;
  }
  return { state: working, result: { ...opened.result, cards }, error: null };
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
  assert.equal(getPackPrice(state, "loose"), 9);
  assert.equal(Number.isInteger(getPackPrice(state, "loose")), true);
});

test("opening consumes one pack; cards file into the binder as they are revealed", () => {
  const state = { ...createInitialState(1), coins: 17 };
  const opened = openPack(state, { manual: true, now: 2_000, rng: () => 0.99 });
  assert.equal(opened.error, null);
  assert.equal(opened.result.cards.length, 6);
  assert.equal(opened.state.cardsPulled, 0);
  assert.equal(Object.keys(opened.state.collection).length, 0);
  assert.equal(getProductCount(opened.state, "corner", "loose"), 2);

  const revealed = openAndRevealAll(state, { manual: true, now: 2_000, rng: () => 0.99 });
  assert.equal(revealed.state.cardsPulled, 6);
  assert.equal(revealed.state.coins, 17);
  assert.ok(Object.keys(revealed.state.collection).length > 0);
});

test("cash income is a flat one per second and the binder pays nothing", () => {
  const state = createInitialState(1);
  const opened = openPack(state, { manual: true, now: 2_000, rng: () => 0.99 });
  assert.equal(getBinderIncome(opened.state), 0);
  assert.equal(BINDER_PAYOUT_SCALE, 0);
  assert.equal(BASE_PASSIVE_RATE, 1);
  assert.equal(tickEconomy(opened.state, 1).coins, opened.state.coins + 1);

  let ticking = opened.state;
  for (let step = 0; step < 3; step += 1) {
    ticking = tickEconomy(ticking, 0.25);
    assert.equal(ticking.coins, opened.state.coins);
    assert.equal(Number.isInteger(ticking.coins), true);
  }
  ticking = tickEconomy(ticking, 0.25);
  assert.equal(ticking.coins, opened.state.coins + 1);
  assert.equal(Number.isInteger(ticking.coins), true);
});

test("the complete 18-tier rarity ladder uses the four-hour-arc base rates", () => {
  const expected = {
    common: 0.8169,
    uncommon: 0.18,
    rare: 0.006,
    epic: 0.0028,
    legendary: 0.0012,
    mythic: 0.0006,
    exalted: 0.0003,
    ascendant: 0.00015,
    celestial: 0.00008,
    divine: 0.00003,
    astral: 0.000015,
    eternal: 0.000006,
    primordial: 0.000003,
    transcendent: 0.0000015,
    empyrean: 0.0000006,
    absolute: 0.0000003,
    singularity: 0.00000015,
    nameless: 0.00000003,
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

test("twenty sequential sets contain 240 unique fixed-rarity cards and cover the full ladder", () => {
  assert.equal(SETS.length, 20);
  assert.equal(ALL_CARDS.length, 240);
  assert.equal(new Set(SETS.map((set) => set.id)).size, SETS.length);
  assert.equal(new Set(ALL_CARDS.map((card) => card.id)).size, ALL_CARDS.length);
  assert.ok(SETS.every((set) => set.cards.length === 12));
  assert.ok(SETS.every((set) => set.cards.some((card) => card.rarity === "common")));
  assert.deepEqual(new Set(ALL_CARDS.map((card) => card.rarity)), new Set(Object.keys(RARITIES)));

  const chaseOrders = SETS.map((set) => Math.max(...set.cards.map((card) => RARITIES[card.rarity].order)));
  assert.ok(chaseOrders.every((order, index) => index === 0 || order >= chaseOrders[index - 1]));
  assert.equal(SETS.at(-1).cards.at(-1).name, "What Was Never Named");
  assert.equal(SETS.at(-1).cards.at(-1).rarity, "nameless");

  assert.deepEqual(SETS[0].unlockRequirements, []);
  assert.deepEqual(SETS[1].unlockRequirements, [{ type: "completeSet", setId: "corner" }]);
  for (const branch of ["frontier", "abyss", "crown"]) {
    assert.deepEqual(
      SETS.find((set) => set.id === branch).unlockRequirements,
      [{ type: "completeSet", setId: "circuit" }],
    );
  }
  assert.ok(SETS.slice(1).every((set) => set.unlockRequirements.length > 0));

  const signal = SETS.find((set) => set.id === "signal");
  assert.deepEqual(signal.unlockRequirements, [{ type: "completeSet", setId: "harbor" }]);
  const referencesHarbor = (set) => set.unlockRequirements.some((requirement) => (
    requirement.setId === "harbor" || requirement.setIds?.includes("harbor")
  ));
  assert.deepEqual(SETS.filter(referencesHarbor).map((set) => set.id), ["signal"]);

  assert.deepEqual(SETS.at(-1).unlockRequirements, [{ type: "completeAllSets" }]);
});

test("every card keeps its authored rarity in pulls and migrated saves", () => {
  const state = {
    ...createInitialState(1),
    collection: { "corner-02": 1 },
    bestRarities: { "corner-02": "nameless" },
  };
  const migrated = hydrateState(state, 2);
  assert.equal(migrated.bestRarities["corner-02"], "common");

  const highRoll = openAndRevealAll(migrated, { manual: true, free: true, now: 2_000, rng: () => 0 });
  assert.ok(highRoll.result.cards.every((pull) => pull.rarity === pull.card.rarity));
  assert.ok(highRoll.result.cards.every((pull) => pull.rarity === "legendary"));
  assert.ok(!Object.values(highRoll.state.bestRarities).includes("nameless"));

  const rolls = [0.99, 0.21, 0.99, 0.99, 0.99, 0.99];
  let rollIndex = 0;
  const commonRoll = openAndRevealAll(createInitialState(1), {
    manual: true,
    free: true,
    now: 2_000,
    rng: () => rolls[(rollIndex++) % rolls.length],
  });
  const pigeon = commonRoll.result.cards.find((pull) => pull.card.name === "Pavement Pigeon");
  assert.ok(pigeon);
  assert.equal(pigeon.rarity, "common");
  assert.equal(commonRoll.state.bestRarities[pigeon.card.id], "common");
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
  assert.ok(result.cards.some((pull) => pull.falseSignal));
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
  assert.equal(Number.isInteger(value), true);
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
  assert.ok(getDuplicateSaleValue(dealer) > getDuplicateSaleValue(withDuplicates));
  assert.equal(Number.isInteger(getDuplicateSaleValue(dealer)), true);
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

test("set stock unlocks along the branching print tree", () => {
  const state = createInitialState(1);
  assert.equal(getCurrentBeat(state), 1);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 9 }), 1);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 10 }), 2);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 30 }), 3);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 75 }), 4);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 150 }), 5);

  const setById = (id) => SETS.find((set) => set.id === id);
  const complete = (...ids) => Object.assign(
    {},
    ...ids.map((id) => Object.fromEntries(setById(id).cards.map((card) => [card.id, 1]))),
  );
  assert.equal(getSetUnlockStatus(state, "circuit").unlocked, false);
  assert.equal(getSetUnlockStatus(state, "circuit").requirements[0].label, "Finish Corner Critters");
  assert.equal(getSetUnlockStatus({ ...state, collection: { "corner-12": 1 } }, "circuit").unlocked, false);
  assert.equal(getSetUnlockStatus({ ...state, packsOpened: 25 }, "frontier").unlocked, false);

  const circuit = advanceBeat({ ...state, collection: complete("corner") });
  assert.equal(getSetUnlockStatus(circuit, "circuit").unlocked, true);
  assert.deepEqual(circuit.unlockedSets, ["corner", "circuit"]);
  assert.equal(getPackPrice(circuit, "loose", "circuit"), 20);
  const circuitPurchase = buyProduct({ ...circuit, coins: 20 }, "loose", "circuit");
  assert.equal(getProductCount(circuitPurchase, "circuit", "loose"), 1);
  assert.equal(circuitPurchase.activeSet, "circuit");

  // Neon Circuit fans out into all three mid-game branches at once.
  const fanned = advanceBeat({ ...state, collection: complete("corner", "circuit") });
  for (const branch of ["frontier", "abyss", "crown"]) {
    assert.equal(getSetUnlockStatus(fanned, branch).unlocked, true, branch);
  }
  assert.equal(getSetUnlockStatus(fanned, "verdant").unlocked, false);

  // OR-requirements open the same set from different run paths.
  const viaFrontier = advanceBeat({ ...state, collection: complete("corner", "circuit", "frontier") });
  const viaAbyss = advanceBeat({ ...state, collection: complete("corner", "circuit", "abyss") });
  assert.equal(getSetUnlockStatus(viaFrontier, "verdant").unlocked, true);
  assert.equal(getSetUnlockStatus(viaAbyss, "verdant").unlocked, true);
  assert.equal(getSetUnlockStatus(viaFrontier, "polar").unlocked, false);
  assert.equal(getSetUnlockStatus(viaAbyss, "polar").unlocked, true);
  assert.match(getSetUnlockStatus(state, "verdant").requirements[0].label, /Finish .* or /);

  // Sunken Signal only opens through Nocturne Harbor.
  const allButHarbor = SETS.filter((set) => set.id !== "harbor" && set.id !== "signal").map((set) => set.id);
  const missingHarbor = advanceBeat({ ...state, collection: complete(...allButHarbor) });
  assert.equal(getSetUnlockStatus(missingHarbor, "signal").unlocked, false);
  const withHarbor = advanceBeat({ ...state, collection: complete("corner", "circuit", "frontier", "verdant", "cloud", "harbor") });
  assert.equal(getSetUnlockStatus(withHarbor, "signal").unlocked, true);

  // Unwritten demands every other set, no matter the route taken.
  const allButOne = SETS.filter((set) => set.id !== "unwritten" && set.id !== "corner").map((set) => set.id);
  const nearlyDone = advanceBeat({ ...state, collection: complete(...allButOne) });
  assert.equal(getSetUnlockStatus(nearlyDone, "unwritten").unlocked, false);
  const everything = SETS.filter((set) => set.id !== "unwritten").map((set) => set.id);
  const done = advanceBeat({ ...state, collection: complete(...everything) });
  assert.equal(getSetUnlockStatus(done, "unwritten").unlocked, true);
  const status = getSetUnlockStatus(nearlyDone, "unwritten");
  assert.equal(status.requirements[0].label, "Complete every other set");
  assert.equal(status.requirements[0].current, 18);
  assert.equal(status.requirements[0].target, 19);

  const legacyUnlocks = advanceBeat({ ...state, unlockedSets: SETS.map((set) => set.id) });
  assert.deepEqual(legacyUnlocks.unlockedSets, ["corner"]);
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
    coins: 90.75,
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
  assert.equal(state.coins, 90);
  assert.ok(state.passiveCarry > 0 && state.passiveCarry < 1);
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
