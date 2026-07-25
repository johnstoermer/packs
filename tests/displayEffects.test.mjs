import test from "node:test";
import assert from "node:assert/strict";
import { ALL_CARDS, RARITIES, SETS, getCard } from "../lib/gameData.js";
import {
  CARD_EFFECTS,
  CASE_SIZE,
  describeCardEffect,
  getCardEffect,
  getCaseSlots,
  getDisplayModifiers,
  getRampScale,
} from "../lib/displayEffects.js";
import {
  NAMELESS_CARD_ID,
  advanceBeat,
  canRewrite,
  createInitialState,
  displayCard,
  getDuplicateSaleValue,
  getInscriptionsEarned,
  getPackPrice,
  getPassiveIncomeRate,
  hydrateState,
  openPack,
  rewriteState,
  tickEconomy,
  undisplayCard,
} from "../lib/gameLogic.js";

const MINUTE = 60_000;

function withCards(state, ids, extra = {}) {
  return advanceBeat({
    ...state,
    ...extra,
    collection: { ...state.collection, ...Object.fromEntries(ids.map((id) => [id, 1])) },
  });
}

test("every card carries a unique display effect with a description", () => {
  assert.equal(Object.keys(CARD_EFFECTS).length, 240);
  const signatures = new Set();
  for (const card of ALL_CARDS) {
    const effect = getCardEffect(card.id);
    assert.ok(effect, card.id);
    assert.ok(effect.value > 0, card.id);
    const scope = ["setDupValue", "setPackDiscount"].includes(effect.type) ? card.setId : "";
    const signature = `${effect.type}|${effect.value}|${effect.ramp ? "ramp" : ""}|${scope}`;
    assert.ok(!signatures.has(signature), `duplicate effect: ${card.id} ${signature}`);
    signatures.add(signature);
    const description = describeCardEffect(card.id);
    assert.ok(description.length > 10, card.id);
  }
});

test("meta cards are mixed across tiers, not only in Unwritten", () => {
  const metaCards = ALL_CARDS.filter((card) => getCardEffect(card.id).meta);
  const metaSets = new Set(metaCards.map((card) => card.setId));
  assert.ok(metaSets.size >= 5, [...metaSets].join(","));
  const metaOrders = new Set(metaCards.map((card) => RARITIES[card.rarity].order));
  assert.ok(metaOrders.size >= 5);
  assert.ok(metaCards.some((card) => card.rarity === "common"));
});

test("within a set and effect type, rarer cards have stronger effects", () => {
  for (const set of SETS) {
    const byType = {};
    for (const card of set.cards) {
      const effect = getCardEffect(card.id);
      (byType[effect.type] ||= []).push({ order: RARITIES[card.rarity].order, value: effect.value, id: card.id });
    }
    for (const [type, entries] of Object.entries(byType)) {
      const sorted = [...entries].sort((a, b) => a.order - b.order);
      for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index].order === sorted[index - 1].order) continue;
        const better = ["pity", "autoOpen"].includes(type)
          ? sorted[index].value <= sorted[index - 1].value
          : sorted[index].value >= sorted[index - 1].value;
        assert.ok(better, `${type} regresses at ${sorted[index].id}`);
      }
    }
  }
});

test("display slots unlock through milestones and cap at six", () => {
  const state = createInitialState(1);
  assert.equal(getCaseSlots(state).slots, 1);
  const finishedCorner = withCards(state, SETS[0].cards.map((card) => card.id));
  assert.equal(getCaseSlots(finishedCorner).slots, 2);
  assert.equal(getCaseSlots({ ...finishedCorner, packsOpened: 150 }).slots, 3);
  assert.equal(CASE_SIZE, 6);
});

test("displaying cards requires ownership, free slots, and no duplicates", () => {
  const state = withCards(createInitialState(1), ["corner-01"]);
  assert.equal(displayCard(state, "corner-02", 5).displayed.length, 0);
  const displayed = displayCard(state, "corner-01", 5);
  assert.deepEqual(displayed.displayed, [{ id: "corner-01", at: 5 }]);
  assert.equal(displayCard(displayed, "corner-01", 9), displayed);
  const second = withCards(displayed, ["corner-05"]);
  assert.equal(displayCard(second, "corner-05", 9).displayed.length, 1);
  const removed = undisplayCard(displayed, "corner-01");
  assert.equal(removed.displayed.length, 0);
});

test("displayed income, discounts, and duplicate value feed the economy", () => {
  const base = withCards(createInitialState(1), ["corner-01", "corner-09"]);
  assert.equal(getPassiveIncomeRate(base), 1);
  const withIncome = displayCard(base, "corner-01", 0);
  assert.equal(getPassiveIncomeRate(withIncome, 0), 2);

  const priceBefore = getPackPrice(base, "loose", "corner");
  const discounted = displayCard(base, "corner-09", 0);
  assert.ok(getPackPrice(discounted, "loose", "corner") < priceBefore);

  const dupState = {
    ...withCards(createInitialState(1), ["corner-02"]),
    collection: { "corner-02": 3 },
    duplicateBank: 100,
  };
  const plain = getDuplicateSaleValue(dupState);
  const boosted = getDuplicateSaleValue(displayCard(dupState, "corner-02", Date.now()));
  assert.equal(plain, 100);
  assert.equal(boosted, 108);
});

test("ramp effects grow with display time and reset on unseat", () => {
  assert.equal(getRampScale(0, 0), 0.25);
  assert.ok(Math.abs(getRampScale(0, 15 * MINUTE) - 0.625) < 1e-9);
  assert.equal(getRampScale(0, 30 * MINUTE), 1);
  assert.equal(getRampScale(0, 90 * MINUTE), 1);

  const state = withCards(createInitialState(1), ["verdant-01"]);
  const young = displayCard(state, "verdant-01", 0);
  const freshMods = getDisplayModifiers(young, 0);
  const grownMods = getDisplayModifiers(young, 30 * MINUTE);
  assert.ok(Math.abs(freshMods.income - 6 * 0.25) < 1e-9);
  assert.ok(Math.abs(grownMods.income - 6) < 1e-9);

  const reseated = displayCard(undisplayCard(young, "verdant-01"), "verdant-01", 30 * MINUTE);
  assert.ok(Math.abs(getDisplayModifiers(reseated, 30 * MINUTE).income - 6 * 0.25) < 1e-9);
});

test("amplify strengthens the other displayed effects", () => {
  const cornerIds = SETS[0].cards.map((card) => card.id);
  const state = withCards(createInitialState(1), [...cornerIds, "lastlight-01"]);
  const income = displayCard(state, "corner-01", 0);
  const amplified = displayCard(income, "lastlight-01", 0);
  assert.ok(Math.abs(getDisplayModifiers(amplified, 0).income - 1.05) < 1e-9);
  assert.equal(getDisplayModifiers(amplified, 0).amplify, 5);
});

test("god pack chance queues a blessed pack whose cards land in the top tiers", () => {
  const state = withCards(createInitialState(1), ["abyss-12"], { activeSet: "corner" });
  const displayed = displayCard(state, "abyss-12", 0);

  const queuedRoll = openPack(displayed, { manual: true, free: true, now: 5_000, rng: () => 0.0001 });
  assert.equal(queuedRoll.result.godPackQueued, true);
  assert.equal(queuedRoll.state.godPackQueued, true);

  const god = openPack(queuedRoll.state, { manual: true, free: true, now: 10_000, rng: () => 0.5 });
  assert.equal(god.result.isGodPack, true);
  assert.equal(god.state.godPackQueued, false);
  const orders = god.result.cards.map((pull) => RARITIES[pull.rarity].order);
  assert.ok(orders.every((order) => order >= RARITIES.rare.order), orders.join(","));
  assert.ok(orders.some((order) => order === RARITIES.legendary.order));

  const calm = openPack(god.state, { manual: true, free: true, now: 20_000, rng: () => 0.5 });
  assert.equal(calm.result.isGodPack, false);
});

test("free pack effects refund stock after opening", () => {
  const state = withCards(createInitialState(1), ["corner-06"]);
  const displayed = displayCard(state, "corner-06", 0);
  const opened = openPack(displayed, { manual: true, now: 5_000, rng: () => 0.001 });
  assert.equal(opened.result.freePackGranted, true);
  assert.equal(opened.state.sealed.corner.loose, 3);
});

test("extra-card effects can deal a seventh card", () => {
  const state = withCards(createInitialState(1), ["circuit-12"]);
  const displayed = displayCard(state, "circuit-12", 0);
  const opened = openPack(displayed, { manual: true, free: true, now: 5_000, rng: () => 0.05 });
  assert.equal(opened.result.cards.length, 7);
  const plain = openPack(state, { manual: true, free: true, now: 5_000, rng: () => 0.05 });
  assert.equal(plain.result.cards.length, 6);
});

test("interest pays from held cash during economy ticks", () => {
  const state = {
    ...withCards(createInitialState(1), ["corner-08"]),
    coins: 6_000,
  };
  const displayed = displayCard(state, "corner-08", Date.now());
  const ticked = tickEconomy(displayed, 1);
  assert.equal(ticked.coins - state.coins, 1);
});

test("the Nameless card is the door to the Rewrite loop", () => {
  const noNameless = withCards(createInitialState(1), ["corner-01"]);
  assert.equal(canRewrite(noNameless), false);
  assert.equal(rewriteState(noNameless, 99), noNameless);

  const cornerIds = SETS[0].cards.map((card) => card.id);
  const ready = withCards(createInitialState(1), [...cornerIds, NAMELESS_CARD_ID], { coins: 1_000 });
  assert.equal(canRewrite(ready), true);
  const earned = getInscriptionsEarned(ready, 0);
  assert.equal(earned, 6);

  const rewritten = rewriteState(ready, 123);
  assert.equal(rewritten.prestige.inscriptions, 6);
  assert.equal(rewritten.prestige.rewrites, 1);
  assert.deepEqual(rewritten.collection, {});
  assert.equal(rewritten.coins, 0);
  assert.equal(rewritten.sealed.corner.loose, 3);
  assert.equal(getPassiveIncomeRate(rewritten, 123), 1 * (1 + 6 * 0.25));
});

test("meta cards shape the Rewrite: gains, head starts, and kept cash", () => {
  const cornerIds = SETS[0].cards.map((card) => card.id);
  const base = withCards(
    createInitialState(1),
    [...cornerIds, NAMELESS_CARD_ID, "orchard-09", "signal-11", "hollow-11"],
    { coins: 10_000, packsOpened: 200 },
  );
  let curated = displayCard(base, NAMELESS_CARD_ID, 0);
  curated = displayCard(curated, "orchard-09", 0);
  curated = displayCard(curated, "signal-11", 0);

  const mods = getDisplayModifiers(curated, 0);
  assert.equal(mods.namelessDisplayed, true);
  assert.equal(mods.headStart, 40);
  assert.equal(mods.keepCoins, 25);

  const earned = getInscriptionsEarned(curated, 0);
  assert.equal(earned, Math.round(6 * 2));

  const rewritten = rewriteState(curated, 456);
  assert.equal(rewritten.prestige.inscriptions, 12);
  assert.equal(rewritten.sealed.corner.loose, 43);
  assert.equal(rewritten.coins, 2_500);
  assert.deepEqual(rewritten.displayed, []);
});

test("saves round-trip display, god pack, and prestige state", () => {
  const state = withCards(createInitialState(1), ["corner-01"]);
  const displayed = displayCard(state, "corner-01", 77);
  const withExtras = {
    ...displayed,
    godPackQueued: true,
    prestige: { inscriptions: 3, rewrites: 1 },
  };
  const hydrated = hydrateState(JSON.parse(JSON.stringify(withExtras)), 999);
  assert.deepEqual(hydrated.displayed, [{ id: "corner-01", at: 77 }]);
  assert.equal(hydrated.godPackQueued, true);
  assert.deepEqual(hydrated.prestige, { inscriptions: 3, rewrites: 1 });

  const corrupted = hydrateState({ ...withExtras, displayed: [{ id: "corner-01" }, { id: "corner-01" }, { id: "nope" }, { id: "corner-02", at: 1 }] }, 999);
  assert.deepEqual(corrupted.displayed, [{ id: "corner-01", at: 999 }]);
});
