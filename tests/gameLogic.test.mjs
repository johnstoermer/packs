import test from "node:test";
import assert from "node:assert/strict";
import {
  applyOfflineProgress,
  buyUpgrade,
  createInitialState,
  getDerived,
  getReprintGain,
  hydrateState,
  performReprint,
  rollPack,
  upgradeCost,
} from "../lib/gameLogic.js";

function sequence(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

test("a fresh manual pack always contains at least one uncommon card", () => {
  const state = createInitialState(1);
  const { state: next, result } = rollPack(state, {
    manual: true,
    now: 2,
    rng: sequence([0.99, 0.7, 0.99, 0.4, 0.99, 0.3, 0.99, 0.2, 0.99]),
  });
  assert.equal(next.packsOpened, 1);
  assert.equal(result.cards.length, 4);
  assert.ok(result.cards.some((pull) => pull.rarity !== "common"));
  assert.ok(result.totalValue > 0);
});

test("rare pity protection fires on the seventh missed pack", () => {
  const state = { ...createInitialState(1), pityRare: 6 };
  const { result } = rollPack(state, {
    manual: false,
    rng: () => 0.99,
  });
  assert.ok(result.cards.some((pull) => ["rare", "epic", "legendary"].includes(pull.rarity)));
});

test("upgrade purchases deduct their exact cost and change derived production", () => {
  const state = { ...createInitialState(1), coins: 1000, packsOpened: 10 };
  const cost = upgradeCost(state, "sorter", 1);
  const next = buyUpgrade(state, "sorter", 1);
  assert.equal(next.coins, 1000 - cost);
  assert.equal(next.upgrades.sorter, 1);
  assert.ok(getDerived(next).autoRate > 0);
});

test("hydration repairs incomplete saves", () => {
  const state = hydrateState({ coins: 10, upgrades: { fingers: 2 }, activeSet: "missing" }, 50);
  assert.equal(state.coins, 10);
  assert.equal(state.upgrades.fingers, 2);
  assert.equal(state.upgrades.sorter, 0);
  assert.equal(state.activeSet, "corner");
  assert.ok(state.unlockedSets.includes("corner"));
});

test("duplicate pulls create dust without removing binder copies", () => {
  const first = rollPack(createInitialState(1), { manual: false, rng: () => 0.99 }).state;
  const second = rollPack(first, { manual: false, rng: () => 0.99 });
  assert.ok(second.result.totalDust > 0);
  assert.ok(Object.values(second.state.collection).every((count) => count >= 2));
});

test("offline automation grants capped production", () => {
  const now = 10_000_000;
  const state = {
    ...createInitialState(1),
    upgrades: { ...createInitialState(1).upgrades, sorter: 10 },
    lastSavedAt: now - 60 * 60 * 1000,
  };
  const result = applyOfflineProgress(state, now);
  assert.ok(result.report.packs > 0);
  assert.ok(result.report.coins > 0);
  assert.ok(result.state.coins > state.coins);
});

test("reprinting keeps the binder and installs permanent plates", () => {
  const state = {
    ...createInitialState(1),
    runCoins: 1_000_000,
    coins: 500_000,
    collection: { "corner-01": 2 },
    unlockedSets: ["corner", "circuit"],
    activeSet: "circuit",
    upgrades: { ...createInitialState(1).upgrades, fingers: 4 },
  };
  assert.ok(getReprintGain(state) > 0);
  const next = performReprint(state, 2);
  assert.equal(next.coins, 75);
  assert.equal(next.activeSet, "corner");
  assert.equal(next.upgrades.fingers, 0);
  assert.equal(next.collection["corner-01"], 2);
  assert.ok(next.plates > state.plates);
});
