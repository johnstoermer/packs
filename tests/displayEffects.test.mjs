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
  applyOfflineProgress,
  buyProduct,
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
  sellDuplicates,
  storedSaveDominates,
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

const CORNER_IDS = SETS[0].cards.map((card) => card.id);

// Corner complete (slot 2) + 200 packs (slot 3) gives room for multi-card loadouts.
function withSlots(state, ids = [], extra = {}) {
  return withCards(state, [...CORNER_IDS, ...ids], { packsOpened: 200, ...extra });
}

function displayAll(state, ids, at = 0) {
  return ids.reduce((current, id) => displayCard(current, id, at), state);
}

test("every card carries a unique, described display effect", () => {
  assert.equal(Object.keys(CARD_EFFECTS).length, 240);
  const signatures = new Set();
  for (const card of ALL_CARDS) {
    const effect = getCardEffect(card.id);
    assert.ok(effect, card.id);
    assert.ok(effect.value > 0, card.id);
    const scope = ["setDupValue", "setPackDiscount"].includes(effect.type) ? card.setId : "";
    const tier = effect.minRarity || "";
    const signature = `${effect.type}|${effect.value}|${effect.ramp ? "ramp" : ""}|${scope}|${tier}`;
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
  const lowerIsBetter = new Set(["pity", "autoOpen", "buyBulkFree"]);
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
        const better = lowerIsBetter.has(type)
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
  const finishedCorner = withCards(state, CORNER_IDS);
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

test("income, discounts, and duplicate value feed the economy", () => {
  const base = withCards(createInitialState(1), ["corner-02", "corner-08"]);
  assert.equal(getPassiveIncomeRate(base), 1);
  const withIncome = displayCard(base, "corner-02", 0);
  assert.equal(getPassiveIncomeRate(withIncome, 0), 2);

  const priceBefore = getPackPrice(base, "loose", "corner");
  const discounted = displayCard(base, "corner-08", 0);
  assert.ok(getPackPrice(discounted, "loose", "corner") < priceBefore);

  const dupState = {
    ...withCards(createInitialState(1), ["circuit-04"]),
    collection: { "circuit-04": 3 },
    duplicateBank: 100,
  };
  const plain = getDuplicateSaleValue(dupState, 0);
  const boosted = getDuplicateSaleValue(displayCard(dupState, "circuit-04", 0), 0);
  assert.equal(plain, 100);
  assert.equal(boosted, 110);
});

test("ramp effects grow with display time and reset on unseat", () => {
  assert.equal(getRampScale(0, 0), 0.25);
  assert.ok(Math.abs(getRampScale(0, 15 * MINUTE) - 0.625) < 1e-9);
  assert.equal(getRampScale(0, 30 * MINUTE), 1);

  const state = withCards(createInitialState(1), ["verdant-01"]);
  const young = displayCard(state, "verdant-01", 0);
  assert.ok(Math.abs(getDisplayModifiers(young, 0).income - 6 * 0.25) < 1e-9);
  assert.ok(Math.abs(getDisplayModifiers(young, 30 * MINUTE).income - 6) < 1e-9);

  const reseated = displayCard(undisplayCard(young, "verdant-01"), "verdant-01", 30 * MINUTE);
  assert.ok(Math.abs(getDisplayModifiers(reseated, 30 * MINUTE).income - 6 * 0.25) < 1e-9);
});

test("Heartseed accelerates ramps and the Lantern completes them", () => {
  const speedState = displayAll(withSlots(createInitialState(1), ["verdant-01", "verdant-12"]), ["verdant-01", "verdant-12"]);
  assert.ok(Math.abs(getDisplayModifiers(speedState, 15 * MINUTE).income - 6) < 1e-9);

  const fullState = displayAll(withSlots(createInitialState(1), ["verdant-01", "lastlight-03"]), ["verdant-01", "lastlight-03"]);
  assert.ok(Math.abs(getDisplayModifiers(fullState, 0).income - 6) < 1e-9);
});

test("amplifiers strengthen by type: all, economy, and chance", () => {
  const base = withSlots(createInitialState(1), ["corner-02", "corner-10", "lastlight-01", "lastlight-02", "lastlight-04"]);

  const all = displayAll(base, ["corner-02", "lastlight-01"]);
  assert.ok(Math.abs(getDisplayModifiers(all, 0).income - 1.06) < 1e-9);

  const eco = displayAll(base, ["corner-02", "corner-10", "lastlight-02"]);
  const ecoMods = getDisplayModifiers(eco, 0);
  assert.ok(Math.abs(ecoMods.income - 1.3) < 1e-9);
  assert.ok(Math.abs(ecoMods.freePack - 8) < 1e-9);

  const chance = displayAll(base, ["corner-02", "corner-10", "lastlight-04"]);
  const chanceMods = getDisplayModifiers(chance, 0);
  assert.ok(Math.abs(chanceMods.income - 1) < 1e-9);
  assert.ok(Math.abs(chanceMods.freePack - 10) < 1e-9);
});

test("the White Horizon halves premium guarantee intervals", () => {
  const state = displayAll(
    withSlots(createInitialState(1), ["crown-02", "lastlight-09"]),
    ["crown-02", "lastlight-09"],
  );
  assert.equal(getDisplayModifiers(state, 0).pityEvery, 20);
});

test("god pack chance queues a blessed pack whose cards land in the top tiers", () => {
  const state = withCards(createInitialState(1), ["abyss-12"], { activeSet: "corner" });
  const displayed = displayCard(state, "abyss-12", 0);

  const queuedRoll = openPack(displayed, { manual: true, free: true, now: 5_000, rng: () => 0.0001 });
  assert.equal(queuedRoll.result.godPackQueued, true);

  const god = openPack(queuedRoll.state, { manual: true, free: true, now: 10_000, rng: () => 0.5 });
  assert.equal(god.result.isGodPack, true);
  assert.equal(god.state.godPackQueued, false);
  const orders = god.result.cards.map((pull) => RARITIES[pull.rarity].order);
  assert.ok(orders.every((order) => order >= RARITIES.rare.order), orders.join(","));
  assert.ok(orders.some((order) => order === RARITIES.legendary.order));
});

test("Creature Beyond Frame adds an extra card to god packs", () => {
  const base = withSlots(createInitialState(1), ["prism-10"], { godPackQueued: true });
  const withCreature = displayCard(base, "prism-10", 0);
  const god = openPack(withCreature, { manual: true, free: true, now: 5_000, rng: () => 0.5 });
  assert.equal(god.result.isGodPack, true);
  assert.equal(god.result.cards.length, 7);
});

test("free pack, seventh card, and interest effects work as printed", () => {
  const freeState = displayCard(withCards(createInitialState(1), ["corner-10"]), "corner-10", 0);
  const freeOpen = openPack(freeState, { manual: true, now: 5_000, rng: () => 0.001 });
  assert.equal(freeOpen.result.freePackGranted, true);
  assert.equal(freeOpen.state.sealed.corner.loose, 3);

  const extraState = displayCard(withCards(createInitialState(1), ["circuit-12"]), "circuit-12", 0);
  const extraOpen = openPack(extraState, { manual: true, free: true, now: 5_000, rng: () => 0.05 });
  assert.equal(extraOpen.result.cards.length, 7);

  const interestState = {
    ...displayCard(withCards(createInitialState(1), ["frontier-02"]), "frontier-02", Date.now()),
    coins: 6_000,
  };
  const ticked = tickEconomy(interestState, 1);
  assert.equal(ticked.coins - interestState.coins, 1);
});

test("quick hands pay for chained openings and the Sprout pays after time away", () => {
  const quick = displayCard(withCards(createInitialState(1), ["corner-06"]), "corner-06", 0);
  const first = openPack(quick, { manual: true, now: 10_000, rng: () => 0.5 });
  assert.equal(first.result.bonusCash, 0);
  const second = openPack(first.state, { manual: true, now: 12_000, rng: () => 0.5 });
  assert.equal(second.result.bonusCash, 3);
  assert.equal(second.result.bonusEvents[0].label, "QUICK HANDS");

  const sprout = displayCard(withCards(createInitialState(1), ["corner-01"]), "corner-01", 0);
  const returned = openPack(
    { ...sprout, lastManualAt: 10_000 },
    { manual: true, now: 10_000 + 6 * MINUTE, rng: () => 0.5 },
  );
  assert.equal(returned.result.bonusCash, 2 * getPackPrice(sprout, "loose", "corner"));
  const chained = openPack(returned.state, { manual: true, now: 10_000 + 6 * MINUTE + 2_000, rng: () => 0.5 });
  assert.equal(chained.result.bonusCash, 0);
});

test("new cards, duplicates, premium pulls, foils, and misprints pay bonuses", () => {
  const newCash = displayCard(withCards(createInitialState(1), ["corner-11"]), "corner-11", 0);
  const fresh = openPack({ ...newCash, collection: { "corner-11": 1 } }, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  const newPulls = fresh.result.cards.filter((pull) => pull.isNew).length;
  assert.ok(newPulls > 0);
  assert.equal(fresh.result.bonusCash, newPulls * 3);

  const foilState = displayCard(withCards(createInitialState(1), ["frontier-03"]), "frontier-03", 0);
  const foiled = openPack(foilState, { manual: true, free: true, now: 5_000, rng: () => 0.0001 });
  assert.ok(foiled.result.cards.every((pull) => pull.foil));
  assert.ok(foiled.result.bonusEvents.some((event) => event.label === "FOIL"));

  const rarityState = displayCard(withCards(createInitialState(1), ["abyss-08"]), "abyss-08", 0);
  const premium = openPack(rarityState, { manual: true, free: true, now: 5_000, rng: () => 0.0001 });
  assert.ok(premium.result.bonusEvents.some((event) => event.label === "PREMIUM PULL"));
});

test("the Herald pays out when a pack finishes a set", () => {
  const nearlyDone = withCards(createInitialState(1), CORNER_IDS.slice(5));
  const heraldState = displayCard(withCards(nearlyDone, ["crown-08"]), "crown-08", 0);
  const finisher = openPack(heraldState, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  const completion = finisher.result.bonusEvents.find((event) => event.label === "SET FINISHED");
  assert.ok(completion, JSON.stringify(finisher.result.bonusEvents));
  assert.equal(completion.amount, 8 * SETS[0].baseValue);
});

test("the Toad refunds fares on packs with nothing new", () => {
  const allOwned = withCards(createInitialState(1), CORNER_IDS);
  const toadState = displayCard(withCards(allOwned, ["ember-01"]), "ember-01", 0);
  const dud = openPack(toadState, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  assert.ok(dud.result.cards.every((pull) => !pull.isNew));
  assert.equal(dud.result.bonusCash, Math.floor(0.4 * getPackPrice(allOwned, "loose", "corner")));
});

test("every nth purchased pack rings free at the Auction of Winds", () => {
  const state = {
    ...displayCard(withSlots(createInitialState(1), ["cloud-09"]), "cloud-09", 0),
    coins: 1_000,
    packsPurchased: 5,
  };
  const freeBuy = buyProduct(state, "loose", "corner");
  assert.equal(freeBuy.coins, 1_000);
  assert.equal(freeBuy.packsPurchased, 6);
  const paidBuy = buyProduct(freeBuy, "loose", "corner");
  assert.equal(paidBuy.coins, 1_000 - getPackPrice(freeBuy, "loose", "corner"));
});

test("the High Noon Titan grows the unsold pile, capped at double", () => {
  const base = {
    ...displayCard(withCards(createInitialState(1), ["frontier-12"]), "frontier-12", 0),
    collection: { "frontier-12": 3 },
    duplicateBank: 100,
    lastDuplicateSaleAt: 0,
  };
  assert.equal(getDuplicateSaleValue(base, 30 * MINUTE), 160);
  assert.equal(getDuplicateSaleValue(base, 5 * 60 * MINUTE), 200);
  const sold = sellDuplicates(base, 30 * MINUTE);
  assert.equal(sold.coins, 160);
  assert.equal(sold.lastDuplicateSaleAt, 30 * MINUTE);
});

test("the Porcelain Hound keeps hand-opened grades at six or better", () => {
  const state = displayCard(withCards(createInitialState(1), ["crown-05"]), "crown-05", 0);
  const graded = openPack(state, { manual: true, free: true, now: 5_000, rng: () => 0.05 });
  assert.ok(graded.result.cards.every((pull) => pull.grade >= 6));
  const bare = openPack(createInitialState(1), { manual: true, free: true, now: 5_000, rng: () => 0.05 });
  assert.ok(bare.result.cards.every((pull) => pull.grade === 5));
});

test("the Constellation Hound never lets a signal bluff", () => {
  const state = displayCard(withCards(createInitialState(1), ["observatory-05"]), "observatory-05", 0);
  const honest = openPack(state, { manual: true, free: true, now: 5_000, rng: () => 0.05 });
  assert.equal(honest.result.falseSignals, 0);
  const bare = openPack(createInitialState(1), { manual: true, free: true, now: 5_000, rng: () => 0.05 });
  assert.ok(bare.result.falseSignals > 0);
});

test("the Copper Crawler opens table packs while you are away", () => {
  const base = displayCard(withCards(createInitialState(1), ["circuit-05"]), "circuit-05", 0);
  const away = {
    ...base,
    lastSavedAt: 0,
    sealed: { ...base.sealed, corner: { ...base.sealed.corner, loose: 10 } },
  };
  const offline = applyOfflineProgress(away, 3_600_000);
  assert.equal(offline.report.packsOpened, 4);
  assert.equal(offline.state.sealed.corner.loose, 6);
  assert.ok(offline.state.packsOpened >= 4);
});

test("pity guarantees fire on schedule and upgrade with the Message", () => {
  const pityState = displayAll(
    withSlots(createInitialState(1), ["signal-10", "signal-09"], { packsOpened: 2 }),
    ["signal-10", "signal-09"],
  );
  assert.equal(getDisplayModifiers(pityState, 0).pityEvery, 3);
  assert.equal(getDisplayModifiers(pityState, 0).pityPower, true);
  const guaranteed = openPack(pityState, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  assert.ok(RARITIES[guaranteed.result.cards[0].rarity].order >= RARITIES.epic.order);
});

test("the Nameless card is the door to the Rewrite loop", () => {
  const noNameless = withCards(createInitialState(1), ["corner-01"]);
  assert.equal(canRewrite(noNameless), false);
  assert.equal(rewriteState(noNameless, 99), noNameless);

  const ready = withCards(createInitialState(1), [...CORNER_IDS, NAMELESS_CARD_ID], { coins: 1_000 });
  assert.equal(canRewrite(ready), true);
  assert.equal(getInscriptionsEarned(ready, 0), 6);

  const rewritten = rewriteState(ready, 123);
  assert.equal(rewritten.prestige.inscriptions, 6);
  assert.equal(rewritten.prestige.rewrites, 1);
  assert.deepEqual(rewritten.collection, {});
  assert.equal(rewritten.coins, 0);
  assert.equal(rewritten.sealed.corner.loose, 3);
  assert.equal(getPassiveIncomeRate(rewritten, 123), 1 * (1 + 6 * 0.25));
});

test("meta cards shape the Rewrite: gains, head starts, kept cash, kept cases", () => {
  const base = withSlots(
    createInitialState(1),
    [NAMELESS_CARD_ID, "orchard-09", "signal-11", "unwritten-07"],
    { coins: 10_000 },
  );
  const curated = displayAll(base, [NAMELESS_CARD_ID, "orchard-09", "signal-11", "unwritten-07"]);

  const mods = getDisplayModifiers(curated, 0);
  assert.equal(mods.namelessDisplayed, true);
  assert.equal(mods.headStart, 40);
  assert.equal(mods.keepCoins, 25);
  assert.equal(mods.keepDisplayed, true);

  const rewritten = rewriteState(curated, 456);
  assert.equal(rewritten.prestige.inscriptions, Math.round(6 * 2));
  assert.equal(rewritten.sealed.corner.loose, 43);
  assert.equal(rewritten.coins, 2_500);
  assert.equal(rewritten.displayed.length, 4);
  assert.equal(rewritten.collection[NAMELESS_CARD_ID], 1);
  assert.equal(rewritten.collection["unwritten-07"], 1);
  assert.equal(canRewrite(rewritten), true);
});

test("saves round-trip display, god pack, prestige, and counters", () => {
  const state = withCards(createInitialState(1), ["corner-01"]);
  const displayed = displayCard(state, "corner-01", 77);
  const withExtras = {
    ...displayed,
    godPackQueued: true,
    prestige: { inscriptions: 3, rewrites: 1 },
    packsPurchased: 17,
    lastDuplicateSaleAt: 55,
  };
  const hydrated = hydrateState(JSON.parse(JSON.stringify(withExtras)), 999);
  assert.deepEqual(hydrated.displayed, [{ id: "corner-01", at: 77 }]);
  assert.equal(hydrated.godPackQueued, true);
  assert.deepEqual(hydrated.prestige, { inscriptions: 3, rewrites: 1 });
  assert.equal(hydrated.packsPurchased, 17);
  assert.equal(hydrated.lastDuplicateSaleAt, 55);

  const corrupted = hydrateState({ ...withExtras, displayed: [{ id: "corner-01" }, { id: "corner-01" }, { id: "nope" }, { id: "corner-02", at: 1 }] }, 999);
  assert.deepEqual(corrupted.displayed, [{ id: "corner-01", at: 999 }]);
});

test("a stored save with more progress or more Rewrites is never clobbered", () => {
  const state = createInitialState(1);
  const ahead = JSON.stringify({ ...state, packsOpened: 50, cardsPulled: 300, lifetimeCoins: 900 });
  assert.equal(storedSaveDominates(ahead, state), true);
  assert.equal(storedSaveDominates(JSON.stringify(state), { ...state, packsOpened: 10 }), false);

  const rewritten = JSON.stringify({ ...state, prestige: { inscriptions: 5, rewrites: 1 } });
  const bigOldRun = { ...state, packsOpened: 9_999, cardsPulled: 60_000, lifetimeCoins: 1e9 };
  assert.equal(storedSaveDominates(rewritten, bigOldRun), true);
  assert.equal(storedSaveDominates("not json", state), false);
  assert.equal(storedSaveDominates(null, state), false);
});
