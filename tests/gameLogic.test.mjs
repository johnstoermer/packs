import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_PASSIVE_RATE,
  BINDER_PAYOUT_SCALE,
  MANUAL_RATE_CAP_MS,
  NAMELESS_CARD_ID,
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
import {
  ALL_CARDS,
  LEGACY_CARD_MAP,
  PACK_PRODUCTS,
  PACK_TYPES,
  RARITIES,
  SETS,
  getCard,
} from "../lib/gameData.js";
import { CORE_ART_TRANSFERS } from "../lib/coreArtTransfers.js";
import { CORE_CARD_IDS } from "../lib/coreSetManifest.js";

const L = (legacyId) => LEGACY_CARD_MAP[legacyId] || legacyId;
const FIRST = SETS[0].id;

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
  assert.equal(getProductCount(state, FIRST, "loose"), 3);
  assert.deepEqual(state.collection, {});
  assert.equal(state.coins, 0);
  assert.equal(state.packsOpened, 0);
});

test("buying product changes pack stock but can never create a card", () => {
  const state = { ...createInitialState(1), coins: 500 };
  const beforeCollection = clone(state.collection);
  const next = buyProduct(state, "loose");
  assert.equal(getProductCount(next, FIRST, "loose"), 4);
  assert.deepEqual(next.collection, beforeCollection);
  assert.equal(next.coins, 400);
});

test("pack prices stay simple as opened volume grows", () => {
  const fresh = createInitialState(1);
  const knownBuyer = { ...fresh, packsOpened: 866 };
  assert.equal(getPackPrice(fresh, "loose"), 100);
  assert.equal(getPackPrice(knownBuyer, "loose"), 100);
});

test("the five pack types have exact prices, concise copy, and distinct wrapper creatures", () => {
  const state = createInitialState(1);
  assert.deepEqual(PACK_TYPES.map((packType) => packType.name), [
    "Standard",
    "Rare",
    "Mega Standard",
    "Mega Rare",
    "Collector",
  ]);
  assert.deepEqual(PACK_TYPES.map((packType) => getPackPrice(state, packType.id)), [
    100,
    10_000,
    10_000,
    1_000_000,
    10_000,
  ]);
  assert.deepEqual(PACK_TYPES.map((packType) => packType.cardCount), [6, 6, 36, 36, 6]);
  assert.deepEqual(PACK_TYPES[0].featuredNames, ["Bankslime", "Coinbud", "Packross"]);
  assert.equal(new Set(PACK_TYPES.flatMap((packType) => packType.featuredNames)).size, 15);
  for (const packType of PACK_TYPES) {
    assert.doesNotMatch(packType.description, /\d|\bcash\b/i);
  }
});

test("premium pack types change the actual deal", () => {
  const state = createInitialState(1);
  const rare = openPack(state, { manual: true, free: true, source: "rare", rng: () => 0.99 });
  const megaStandard = openPack(state, { manual: true, free: true, source: "mega-standard", rng: () => 0.99 });
  const megaRare = openPack(state, { manual: true, free: true, source: "mega-rare", rng: () => 0.99 });
  const collector = openPack(state, { manual: true, free: true, source: "collector", rng: () => 0.99 });

  assert.equal(rare.result.cards.length, 6);
  assert.ok(rare.result.cards.every((pull) => RARITIES[pull.rarity].order >= RARITIES.rare.order));
  assert.equal(megaStandard.result.cards.length, 36);
  assert.equal(megaRare.result.cards.length, 36);
  assert.ok(megaRare.result.cards.every((pull) => RARITIES[pull.rarity].order >= RARITIES.rare.order));
  assert.ok(collector.result.cards.some((pull) => pull.foil));
});

test("supplier terms reduce purchase cost", () => {
  const state = { ...createInitialState(1), upgrades: { ...createInitialState(1).upgrades, supplier: 2 } };
  assert.equal(getPackPrice(state, "loose"), 95);
  assert.equal(Number.isInteger(getPackPrice(state, "loose")), true);
});

test("opening consumes one pack; cards file into the binder as they are revealed", () => {
  const state = { ...createInitialState(1), coins: 17 };
  const opened = openPack(state, { manual: true, now: 2_000, rng: () => 0.99 });
  assert.equal(opened.error, null);
  assert.equal(opened.result.cards.length, 6);
  assert.equal(opened.state.cardsPulled, 0);
  assert.equal(Object.keys(opened.state.collection).length, 0);
  assert.equal(getProductCount(opened.state, FIRST, "loose"), 2);

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

test("the seven normal rarities use a coherent 100% ladder with Nameless outside it", () => {
  const expected = {
    common: 0.75,
    uncommon: 0.18,
    rare: 0.05,
    epic: 0.015,
    legendary: 0.004,
    mythic: 0.0009,
    divine: 0.0001,
    nameless: 0,
  };
  assert.equal(Object.keys(RARITIES).length, 8);
  assert.deepEqual(
    Object.fromEntries(Object.entries(RARITIES).map(([id, rarity]) => [id, rarity.odds])),
    expected,
  );
  assert.equal(
    Object.entries(RARITIES)
      .filter(([id]) => id !== "nameless")
      .reduce((total, [, rarity]) => total + rarity.odds, 0),
    1,
  );
  assert.deepEqual(
    Object.values(RARITIES).map((rarity) => rarity.order),
    Array.from({ length: 8 }, (_, index) => index),
  );
  assert.ok(Object.values(RARITIES).every((rarity) => rarity.border && rarity.rateLabel));
  assert.ok(Object.values(RARITIES).every((rarity, index, all) => index === 0 || rarity.sellValue > all[index - 1].sellValue));
});

test("the 98-card set has fewer cards at every higher normal rarity", () => {
  assert.equal(SETS.length, 1);
  assert.equal(SETS[0].id, "core");
  assert.equal(ALL_CARDS.length, 98);
  assert.deepEqual(ALL_CARDS.map((card) => card.id), CORE_CARD_IDS);
  assert.equal(new Set(SETS.map((set) => set.id)).size, SETS.length);
  assert.equal(new Set(ALL_CARDS.map((card) => card.id)).size, ALL_CARDS.length);
  assert.equal(new Set(ALL_CARDS.map((card) => card.name)).size, ALL_CARDS.length);
  assert.ok(ALL_CARDS.every((card) => /^[A-Z][A-Za-z]+$/.test(card.name)));
  assert.ok(ALL_CARDS.every((card) => card.flavor && card.flavor.endsWith(".")));
  assert.equal(SETS[0].cards.length, 98);
  assert.deepEqual(new Set(ALL_CARDS.map((card) => card.rarity)), new Set(Object.keys(RARITIES)));

  const distribution = Object.fromEntries(Object.keys(RARITIES).map((rarity) => [
    rarity,
    ALL_CARDS.filter((card) => card.rarity === rarity).length,
  ]));
  assert.deepEqual(distribution, {
    common: 25,
    uncommon: 21,
    rare: 16,
    epic: 12,
    legendary: 9,
    mythic: 8,
    divine: 6,
    nameless: 1,
  });
  const normalCounts = Object.keys(RARITIES)
    .filter((rarity) => rarity !== "nameless")
    .map((rarity) => distribution[rarity]);
  assert.ok(normalCounts.every((count, index) => index === 0 || count < normalCounts[index - 1]));
  assert.equal(SETS[0].cards.at(-1).name, "Nameling");
  assert.equal(SETS[0].cards.at(-1).rarity, "nameless");
  assert.deepEqual(SETS[0].unlockRequirements, []);

  assert.equal(Object.keys(LEGACY_CARD_MAP).length, 98);
  assert.equal(new Set(Object.values(LEGACY_CARD_MAP)).size, 98);
  for (const [legacyId, liveId] of Object.entries(LEGACY_CARD_MAP)) {
    assert.ok(getCard(liveId), legacyId);
  }
  assert.equal(Object.keys(CORE_ART_TRANSFERS).length, 47);
  assert.equal(ALL_CARDS.filter((card) => card.artTransferredFrom).length, 47);
});

test("every card keeps its authored rarity in pulls and migrated saves", () => {
  const state = {
    ...createInitialState(1),
    collection: { [L("corner-02")]: 1 },
    bestRarities: { [L("corner-02")]: "nameless" },
  };
  const migrated = hydrateState(state, 2);
  assert.equal(migrated.bestRarities[L("corner-02")], getCard(L("corner-02")).rarity);

  const highRoll = openAndRevealAll(migrated, { manual: true, free: true, now: 2_000, rng: () => 0 });
  assert.ok(highRoll.result.cards.every((pull) => pull.rarity === pull.card.rarity));
  assert.ok(Object.entries(highRoll.state.bestRarities).every(([id, rarity]) => getCard(id)?.rarity === rarity));

  const commonRoll = openAndRevealAll(createInitialState(1), {
    manual: true,
    free: true,
    now: 2_000,
    rng: () => 0.99,
  });
  const common = commonRoll.result.cards.find((pull) => pull.rarity === "common");
  assert.ok(common);
  assert.equal(common.rarity, common.card.rarity);
  assert.equal(commonRoll.state.bestRarities[common.card.id], common.card.rarity);
});

test("retired rarity totals migrate into Mythic and Divine", () => {
  const migrated = hydrateState({
    ...createInitialState(1),
    rarityPulls: {
      exalted: 2,
      astral: 3,
      divine: 4,
      eternal: 5,
      singularity: 7,
    },
  }, 2);
  assert.equal(migrated.rarityPulls.mythic, 9);
  assert.equal(migrated.rarityPulls.divine, 12);
  assert.equal("exalted" in migrated.rarityPulls, false);
  assert.equal("singularity" in migrated.rarityPulls, false);
});

test("Nameless cannot roll early and appears once after the other 97 cards", () => {
  const early = openPack(createInitialState(1), {
    manual: true,
    free: true,
    source: "mega-rare",
    rng: () => 0,
  });
  assert.equal(early.result.cards.some((pull) => pull.card.id === NAMELESS_CARD_ID), false);

  const ready = createInitialState(1);
  for (const card of ALL_CARDS) {
    if (card.id === NAMELESS_CARD_ID) continue;
    ready.collection[card.id] = 1;
    ready.bestRarities[card.id] = card.rarity;
  }
  const winning = openPack(ready, { manual: true, free: true, source: "mega-standard", rng: () => 0.99 });
  const namelessIndex = winning.result.cards.findIndex((pull) => pull.card.id === NAMELESS_CARD_ID);
  assert.ok(namelessIndex >= 0);
  assert.equal(winning.result.cards.filter((pull) => pull.card.id === NAMELESS_CARD_ID).length, 1);
  assert.ok(winning.result.events.some((event) => event.t === "namelessUnlocked"));

  const revealed = revealPackCard(winning.state, winning.result.cards, namelessIndex, {
    manual: true,
    rng: () => 0.99,
  });
  const later = openPack(revealed.state, { manual: true, free: true, rng: () => 0 });
  assert.equal(later.result.cards.some((pull) => pull.card.id === NAMELESS_CARD_ID), false);
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
    collection: { [L("corner-01")]: 4, [L("corner-02")]: 2 },
  }, 2);
  const count = getDuplicateCount(state);
  const value = getDuplicateSaleValue(state);
  const sold = sellDuplicates(state);
  assert.equal(count, 4);
  assert.equal(Number.isInteger(value), true);
  assert.equal(sold.collection[L("corner-01")], 1);
  assert.equal(sold.collection[L("corner-02")], 1);
  assert.equal(getDuplicateCount(sold), 0);
  assert.equal(sold.coins, state.coins + value);
});

test("the three upgrade tracks unlock slowly and have one clear effect each", () => {
  const card = getCard(L("corner-01"));
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
  assert.equal(getProductCount(withCase, FIRST, "case"), 1);
});

test("breaking a case moves its packs to the opening table", () => {
  const state = advanceBeat({ ...createInitialState(1), packsOpened: 150, coins: 2_000 });
  const bought = buyProduct(state, "case");
  const broken = breakProduct(bought, "case");
  assert.equal(getProductCount(broken, FIRST, "case"), 0);
  assert.equal(getProductCount(broken, FIRST, "loose"), 147);
  assert.deepEqual(broken.collection, state.collection);
});

test("the single Core stock is always unlocked across progression beats", () => {
  const state = createInitialState(1);
  assert.equal(getCurrentBeat(state), 1);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 9 }), 1);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 10 }), 2);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 30 }), 3);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 75 }), 4);
  assert.equal(getCurrentBeat({ ...state, packsOpened: 150 }), 5);
  assert.equal(getSetUnlockStatus(state, FIRST).unlocked, true);
  assert.deepEqual(getSetUnlockStatus(state, FIRST).requirements, []);
  const late = advanceBeat({ ...state, packsOpened: 500 });
  assert.deepEqual(late.unlockedSets, [FIRST]);
  assert.equal(late.activeSet, FIRST);
});

test("economy ticks add exactly one cash per second and never buy or open product", () => {
  const state = {
    ...createInitialState(1),
    collection: { [L("corner-01")]: 2, [L("corner-02")]: 1 },
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
    collection: { [L("corner-01")]: 2, [L("corner-02")]: 1 },
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
    activeSet: "corner",
    standingOrder: { enabled: true, product: "loose" },
    settings: { sound: false, reducedEffects: true },
    filingRules: [{ id: 1, rarity: "common", threshold: 2, action: "shred", enabled: true }],
    forged: { corner: { swarm: 2 } },
    sealed: { corner: { loose: 0, box: 1 } },
    sealedRun: { id: "legacy-run", setId: "corner", remainingPacks: 3, pool: {}, deck: [] },
  }, 50);
  assert.equal(state.version, SAVE_VERSION);
  assert.equal(state.coins, 90);
  assert.ok(state.passiveCarry > 0 && state.passiveCarry < 1);
  // Legacy card ids land on their reprinted cards; junk is dropped.
  assert.equal(state.collection[L("corner-01")], 2);
  assert.equal(state.collection["corner-01"], undefined);
  assert.equal(state.collection.invalid, undefined);
  assert.equal(state.activeSet, FIRST);
  assert.equal(state.beat, 1);
  assert.equal(Object.keys(state.collection).length, 1);
  assert.equal(state.standingOrder.enabled, false);
  assert.equal(state.settings.sound, false);
  assert.equal("reducedEffects" in state.settings, false);
  assert.deepEqual(state.filingRules, []);
  assert.equal(state.sealedRun, null);
  assert.equal(getProductCount(state, FIRST, "loose"), 29);
  assert.equal(state.bestRarities[L("corner-01")], getCard(L("corner-01")).rarity);
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
