import test from "node:test";
import assert from "node:assert/strict";
import { ALL_CARDS, RARITIES, SETS, seededRandom } from "../lib/gameData.js";
import {
  CARD_DEFS,
  DISCOVER_POOL,
  KINGS,
  SET_KINGS,
  describeCard,
  getCardDef,
  getEngine,
} from "../lib/engineCards.js";
import {
  NAMELESS_CARD_ID,
  advanceBeat,
  canRewrite,
  chooseDiscoverOption,
  createInitialState,
  displayCard,
  evaluateIdleThresholds,
  getDuplicateCount,
  getInscriptionsEarned,
  hydrateState,
  openPack,
  resolveFusions,
  revealPackCard,
  rewriteState,
  sellDuplicatesDetailed,
  undisplayCard,
} from "../lib/gameLogic.js";

const CORNER_IDS = SETS[0].cards.map((card) => card.id);

function withCards(state, ids, extra = {}) {
  return advanceBeat({
    ...state,
    ...extra,
    collection: { ...state.collection, ...Object.fromEntries(ids.map((id) => [id, 1])) },
  });
}

function withSlots(state, ids = [], extra = {}) {
  return withCards(state, [...CORNER_IDS, ...ids], { packsOpened: 200, ...extra });
}

function displayAll(state, ids, at = 0) {
  return ids.reduce((current, id) => displayCard(current, id, at), state);
}

function revealAll(state, cards, rng) {
  let working = state;
  let board = cards;
  let guard = 0;
  while (guard < 200) {
    guard += 1;
    const index = board.findIndex((pull) => !pull.revealed && !pull.fusedAway);
    if (index < 0) break;
    const step = revealPackCard(working, board, index, { manual: true, rng });
    working = step.state;
    board = step.cards;
  }
  return { state: working, cards: board };
}

test("every card has a verb-engine definition with player-facing text", () => {
  assert.equal(Object.keys(CARD_DEFS).length, 240);
  for (const card of ALL_CARDS) {
    const def = getCardDef(card.id);
    assert.ok(def, card.id);
    const text = describeCard(card.id);
    assert.ok(text.length > 10, card.id);
    assert.ok(!/support|King card/i.test(text.replace(/KING \//, "")), `internal jargon leaked: ${card.id}: ${text}`);
  }
});

test("each of the twelve Kings sits on a chase card; the Nameless keeps the door", () => {
  const kingVerbs = new Set(Object.values(SET_KINGS));
  assert.equal(kingVerbs.size, 12);
  assert.deepEqual([...kingVerbs].sort(), Object.keys(KINGS).sort());
  for (const [setId, verb] of Object.entries(SET_KINGS)) {
    const set = SETS.find((candidate) => candidate.id === setId);
    const chase = set.cards[11];
    assert.deepEqual(getCardDef(chase.id), { king: verb }, setId);
  }
  assert.equal(getCardDef(NAMELESS_CARD_ID).prestige, true);
});

test("verbs are inert without their King displayed", () => {
  const state = withSlots(createInitialState(1), ["frontier-01"]);
  const noKing = displayCard(state, "frontier-01", 0);
  const sale = sellDuplicatesDetailed(
    { ...noKing, collection: { ...noKing.collection, "corner-01": 500 }, duplicateBank: 499 },
    { rng: () => 0.0001 },
  );
  assert.equal(sale.salvages, 0);
  assert.equal(sale.mysteryCards.length, 0);
});

test("Salvage King turns duplicate sales into Mystery Packs", () => {
  const base = withSlots(createInitialState(1), ["frontier-12", "frontier-01"]);
  const built = displayAll(base, ["frontier-12", "frontier-01"]);
  const loaded = {
    ...built,
    collection: { ...built.collection, "corner-01": 1_001 },
    duplicateBank: 1_000,
  };
  const sale = sellDuplicatesDetailed(loaded, { rng: () => 0.0001 });
  assert.ok(sale.salvages > 0);
  assert.ok(sale.mysteryCards.length >= 4);
  assert.ok(sale.events.some((event) => event.t === "mystery"));
  const collectionGrew = sale.mysteryCards.every((pull) => (sale.state.collection[pull.card.id] || 0) > 0);
  assert.ok(collectionGrew);
});

test("coin thresholds fire from any income source, never from timers", () => {
  const base = withSlots(createInitialState(1), ["frontier-12", "corner-05"]);
  const built = displayAll(base, ["frontier-12", "corner-05"]);
  const flush = { ...built, lifetimeCoins: built.lifetimeCoins + 10_000, coins: built.coins + 10_000 };
  const swept = evaluateIdleThresholds(flush, { rng: () => 0.5 });
  assert.ok(swept.events.some((event) => event.t === "mystery"));
  assert.ok(swept.mysteryCards.length > 0);
  let drained = swept.state;
  for (let round = 0; round < 60; round += 1) {
    const next = evaluateIdleThresholds(drained, { rng: () => 0.5 });
    if (next.events.length === 0) break;
    drained = next.state;
  }
  assert.equal(evaluateIdleThresholds(drained, { rng: () => 0.5 }).events.length, 0);
});

test("Mark King marks a visible card before reveal and marked reveals pay", () => {
  const base = withSlots(createInitialState(1), ["circuit-12", "circuit-02"]);
  const built = displayAll(base, ["circuit-12", "circuit-02"]);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.4 });
  assert.ok(opened.result.cards.some((pull) => pull.marked));
  assert.ok(opened.result.events.some((event) => event.t === "mark"));
  const markedIndex = opened.result.cards.findIndex((pull) => pull.marked);
  const coinsBefore = opened.state.coins;
  const step = revealPackCard(opened.state, opened.result.cards, markedIndex, { manual: true, rng: () => 0.4 });
  assert.ok(step.state.coins > coinsBefore);
});

test("Echo has a real base chance, boosts matter, and overflow doubles payoffs", () => {
  const base = withSlots(createInitialState(1), ["corner-12", "corner-02", "lastlight-01"]);

  // King alone: 25% base chance — a high roll does NOT echo, so chance
  // boosts have real room to work in.
  const kingOnly = displayAll(base, ["corner-12", "corner-02"]);
  const openedKing = openPack(kingOnly, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  const kingIndex = openedKing.result.cards.findIndex((pull) => pull.rarity === "common");
  const kingStep = revealPackCard(openedKing.state, openedKing.result.cards, kingIndex, { manual: true, rng: () => 0.99 });
  assert.ok(!kingStep.events.some((event) => event.t === "echo"));
  const plainGain = kingStep.state.coins - openedKing.state.coins;

  // King + Matchstick Moth (+100%): 125% -> exactly one guaranteed Echo on
  // the same high roll, doubling the reveal payoff. The echo event carries
  // the King's card id so the case strip can pulse it.
  const boosted = displayAll(base, ["corner-12", "corner-02", "lastlight-01"]);
  const openedEcho = openPack(boosted, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  const echoIndex = openedEcho.result.cards.findIndex((pull) => pull.rarity === "common");
  const echoStep = revealPackCard(openedEcho.state, openedEcho.result.cards, echoIndex, { manual: true, rng: () => 0.99 });
  const echoEvents = echoStep.events.filter((event) => event.t === "echo");
  assert.equal(echoEvents.length, 1);
  assert.equal(echoEvents[0].cardId, "corner-12");
  const echoGain = echoStep.state.coins - openedEcho.state.coins;
  assert.equal(echoGain, plainGain * 2);
});

test("Fusion King fuses same-rarity pairs upward and they reveal again", () => {
  const base = withSlots(createInitialState(1), ["verdant-12"]);
  const built = displayAll(base, ["verdant-12"]);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  const all = revealAll(opened.state, opened.result.cards, () => 0.99);
  const fusion = resolveFusions(all.state, all.cards, { rng: () => 0.99 });
  assert.equal(fusion.fused, true);
  assert.ok(fusion.events.some((event) => event.t === "fusion"));
  const newCards = fusion.cards.filter((pull) => pull.fusedFrom && !pull.revealed);
  assert.ok(newCards.length > 0);
  assert.ok(newCards.every((pull) => RARITIES[pull.rarity].order > RARITIES.common.order));
  const consumed = fusion.cards.filter((pull) => pull.fusedAway).length;
  assert.equal(consumed, newCards.length * 2);
});

test("Fracture King spills extra packs into the same reveal", () => {
  const base = withSlots(createInitialState(1), ["ember-12", "ember-01"]);
  const built = displayAll(base, ["ember-12", "ember-01"]);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.01 });
  assert.ok(opened.result.cards.length >= 12);
  assert.ok(opened.result.events.some((event) => event.t === "fracture"));
  assert.ok(opened.result.packsInReveal >= 2);
});

test("Mimic King copies one unrevealed card before reveal", () => {
  const base = withSlots(createInitialState(1), ["abyss-12"]);
  const built = displayAll(base, ["abyss-12"]);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.7 });
  const mimicEvent = opened.result.events.find((event) => event.t === "mimic");
  assert.ok(mimicEvent);
  assert.equal(
    opened.result.cards[mimicEvent.to].card.id,
    opened.result.cards[mimicEvent.from].card.id,
  );
});

test("Transmute King morphs an unrevealed card toward the revealed rarity", () => {
  const base = withSlots(createInitialState(1), ["polar-12", "polar-04"]);
  const built = displayAll(base, ["polar-12", "polar-04"]);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.3 });
  const step = revealPackCard(opened.state, opened.result.cards, 0, { manual: true, rng: () => 0.001 });
  assert.ok(step.events.some((event) => event.t === "transmute"));
  assert.ok(step.cards.some((pull) => pull.transmuted && !pull.revealed));
});

test("Blueprint copies slot 1 and Relay chains to the right", () => {
  const base = withSlots(createInitialState(1), ["glass-12", "harbor-12", "corner-02", "corner-01"]);
  const blueprintCase = displayAll(base, ["corner-02", "glass-12"]);
  const engine = getEngine(blueprintCase);
  assert.equal(engine.reveal.length, 2);
  assert.equal(engine.reveal[1].id, "glass-12");

  const relayCase = displayAll(base, ["corner-02", "harbor-12", "corner-01"]);
  const opened = openPack(relayCase, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  const commonIndex = opened.result.cards.findIndex((pull) => pull.rarity === "common");
  const step = revealPackCard(opened.state, opened.result.cards, commonIndex, { manual: true, rng: () => 0.99 });
  assert.ok(step.events.some((event) => event.t === "relay"));
});

test("Discover offers three options, stacks picks, and Autopilot self-picks", () => {
  const base = withSlots(createInitialState(1), ["corner-08"]);
  const built = displayAll(base, ["corner-08"]);
  const flush = { ...built, packsOpened: built.packsOpened + 60 };
  const opened = openPack(flush, { manual: true, free: true, now: 5_000, rng: () => 0.5 });
  assert.ok(opened.state.discoverOffer);
  assert.equal(opened.state.discoverOffer.length, 3);
  const optionId = opened.state.discoverOffer[0];
  const chosen = chooseDiscoverOption(opened.state, optionId);
  assert.equal(chosen.discoverOffer, null);
  assert.ok(chosen.discoverStack[optionId] >= 1);
  assert.ok(DISCOVER_POOL.some((option) => option.id === optionId));

  const autoBase = withSlots(createInitialState(1), ["orchard-12", "corner-08"]);
  const autoBuilt = displayAll(autoBase, ["orchard-12", "corner-08"]);
  const autoFlush = { ...autoBuilt, packsOpened: autoBuilt.packsOpened + 60 };
  const autoOpened = openPack(autoFlush, { manual: true, free: true, now: 5_000, rng: () => 0.5 });
  assert.equal(autoOpened.state.discoverOffer, null);
  assert.ok(Object.values(autoOpened.state.discoverStack).some((count) => count >= 2));
  assert.ok(autoOpened.result.events.some((event) => event.t === "discoverAuto"));
});

test("editing the display case sells the duplicate stack first", () => {
  const base = withSlots(createInitialState(1), []);
  const dupped = {
    ...base,
    collection: { ...base.collection, "corner-01": 5 },
    duplicateBank: 4,
  };
  assert.ok(getDuplicateCount(dupped) > 0);
  const edited = displayCard(dupped, "corner-01", 10);
  assert.equal(getDuplicateCount(edited), 0);
  assert.ok(edited.coins > dupped.coins);
  assert.equal(edited.displayed.length, 1);
  const removed = undisplayCard({ ...edited, collection: { ...edited.collection, "corner-02": 3 }, duplicateBank: 2 }, "corner-01");
  assert.equal(getDuplicateCount(removed), 0);
  assert.equal(removed.displayed.length, 0);
});

test("the Nameless still opens the Rewrite and inscriptions persist", () => {
  const ready = withCards(createInitialState(1), [...CORNER_IDS, NAMELESS_CARD_ID], { coins: 500 });
  assert.equal(canRewrite(ready), true);
  const displayedNameless = displayCard(withSlots(ready, [NAMELESS_CARD_ID]), NAMELESS_CARD_ID, 0);
  assert.equal(getInscriptionsEarned(ready), 6);
  assert.equal(getInscriptionsEarned(displayedNameless), 12);
  const rewritten = rewriteState(ready, 99);
  assert.equal(rewritten.prestige.inscriptions, 6);
  assert.equal(rewritten.prestige.rewrites, 1);
  assert.deepEqual(rewritten.collection, {});
  assert.equal(rewritten.coins, 0);
});

test("saves round-trip engine state and drop unknown discover entries", () => {
  const state = withCards(createInitialState(1), ["corner-01"]);
  const withEngineBits = {
    ...displayCard(state, "corner-01", 7),
    discoverStack: { resonance: 3, bogus: 9 },
    counters: { "c:corner-05": 120, junk: Number.NaN },
    prestige: { inscriptions: 2, rewrites: 1 },
  };
  const hydrated = hydrateState(JSON.parse(JSON.stringify(withEngineBits)), 999);
  assert.deepEqual(hydrated.displayed, [{ id: "corner-01", at: 7 }]);
  assert.deepEqual(hydrated.discoverStack, { resonance: 3 });
  assert.equal(hydrated.counters["c:corner-05"], 120);
  assert.equal(hydrated.prestige.inscriptions, 2);
  assert.equal(hydrated.discoverOffer, null);
});

test("no two cards share identical effect text", () => {
  const seen = new Map();
  for (const card of ALL_CARDS) {
    const text = describeCard(card.id);
    assert.ok(text.length > 0, `${card.id} has effect text`);
    assert.ok(!seen.has(text), `${card.id} duplicates ${seen.get(text)}: "${text}"`);
    seen.set(text, card.id);
  }
});

test("template families stay small: numbers-stripped text repeats at most 3 times", () => {
  const families = new Map();
  for (const card of ALL_CARDS) {
    const def = getCardDef(card.id);
    if (def?.king || def?.capstone || def?.prestige) continue;
    const norm = describeCard(card.id).replace(/\d+(\.\d+)?[KMB]?/g, "N");
    families.set(norm, [...(families.get(norm) || []), card.id]);
  }
  let inFamilies = 0;
  for (const [norm, ids] of families) {
    assert.ok(ids.length <= 3, `template "${norm}" used by ${ids.length} cards: ${ids.join(", ")}`);
    if (ids.length > 1) inFamilies += ids.length;
  }
  assert.ok(inFamilies <= 90, `${inFamilies} cards share templates (want <= 90)`);
});

test("supports keep nudge language and never touch sale value or prices", () => {
  for (const card of ALL_CARDS) {
    const def = getCardDef(card.id);
    if (def?.king || def?.capstone || def?.prestige) continue;
    const text = describeCard(card.id);
    assert.ok(
      !/\b(always|never|guaranteed)\b/i.test(text),
      `support uses absolute language: ${card.id}: "${text}"`,
    );
    assert.ok(
      !/sell for \d+% more|cost \d+% less|sale is worth \d+% more/i.test(text),
      `support is an economy stick (rejected Broker direction): ${card.id}: "${text}"`,
    );
  }
});

test("admin sandbox unlocks everything and never leaks into real saves", async () => {
  const { ADMIN_SAVE_KEY, SAVE_KEY, createAdminState, openPack, serializeState } = await import("../lib/gameLogic.js");
  const { getCaseSlots } = await import("../lib/engineCards.js");
  assert.notEqual(ADMIN_SAVE_KEY, SAVE_KEY);

  const admin = createAdminState(1000);
  assert.equal(admin.adminMode, true);
  assert.equal(admin.unlockedSets.length, SETS.length);
  assert.equal(Object.keys(admin.collection).length, ALL_CARDS.length);
  assert.ok(ALL_CARDS.every((card) => admin.collection[card.id] === 1));
  assert.ok(admin.coins >= 1e15);
  assert.equal(admin.beat, 5);
  assert.equal(getCaseSlots(admin).slots, 6);
  assert.ok(getCaseSlots(admin).milestones.every((milestone) => milestone.met));

  // No manual rate cap in the sandbox: back-to-back opens both succeed.
  const first = openPack(admin, { manual: true, source: "loose", now: 10, rng: () => 0.5 });
  assert.ok(first.result);
  const second = openPack(first.state, { manual: true, source: "loose", now: 12, rng: () => 0.5 });
  assert.ok(second.result);

  // Hydrating any save always strips the admin flag, so a sandbox snapshot
  // can never impersonate a real save.
  const roundTrip = hydrateState(JSON.parse(serializeState(admin)), 2000);
  assert.equal(roundTrip.adminMode, false);
});

test("audit: markSpread dial is live — revealed Marks spread more with it displayed", () => {
  const runMarks = (ids, seed) => {
    let state = displayAll(withSlots(createInitialState(1), ids), ids);
    const rng = seededRandom(seed);
    let spreads = 0;
    for (let round = 0; round < 120; round += 1) {
      const opened = openPack(state, { manual: true, free: true, now: 5_000 + round, rng });
      state = opened.state;
      let cards = opened.result.cards;
      for (let index = 0; index < cards.length; index += 1) {
        if (cards[index].revealed || cards[index].fusedAway) continue;
        const before = cards.filter((pull) => pull.marked).length;
        const step = revealPackCard(state, cards, index, { manual: true, rng });
        state = step.state;
        cards = step.cards;
        const after = cards.filter((pull) => pull.marked).length;
        if (after > before) spreads += after - before;
      }
    }
    return spreads;
  };
  const withoutKnob = runMarks(["circuit-12"], 11);
  const withKnob = runMarks(["circuit-12", "circuit-06"], 11);
  assert.ok(withKnob > withoutKnob, `expected spreads with knob (${withKnob}) > without (${withoutKnob})`);
});

test("audit: transmute chance past 100% is guaranteed and hits extra cards", () => {
  const ids = ["polar-12", "lastlight-05"];
  const built = displayAll(withSlots(createInitialState(1), ids), ids);
  // 20 base + 100 boost = 120%: rng 0.97 would have failed the old capped
  // roll (0.97 > 0.95) — now one Transmute is guaranteed.
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.97 });
  const step = revealPackCard(opened.state, opened.result.cards, 0, { manual: true, rng: () => 0.97 });
  assert.ok(step.events.some((event) => event.t === "transmute"));
  assert.equal(step.events.find((event) => event.t === "transmute").cardId, "polar-12");
});

test("audit: catalyst spread past 100% can spread twice", () => {
  const ids = ["cloud-12", "circuit-12", "prism-11", "lastlight-06"];
  const built = displayAll(withSlots(createInitialState(1), [...ids, ...SETS[2].cards.map((c) => c.id)], {
    collection: Object.fromEntries([...SETS[1].cards, ...SETS[2].cards, ...SETS[13].cards, ...SETS[17].cards, ...SETS[9].cards].map((c) => [c.id, 1])),
  }), ids);
  // catalystChance 25 + 50 + 100 = 175: one guaranteed spread plus 75% of a
  // second. rng 0.5 -> 50 < 75, so the Mark King's mark spreads twice.
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.5 });
  const markEvents = opened.result.events.filter((event) => event.t === "mark");
  assert.ok(markEvents.length >= 3, `expected 3+ marks, got ${markEvents.length}`);
  const catalystEvents = opened.result.events.filter((event) => event.t === "catalyst");
  assert.ok(catalystEvents.length >= 2);
  assert.equal(catalystEvents[0].cardId, "cloud-12");
});

test("audit: threshold and duplicate-sale cards emit attributed trigger events", () => {
  const idleIds = ["corner-05"];
  const idleState = {
    ...displayAll(withSlots(createInitialState(1), idleIds), idleIds),
    lifetimeCoins: 5_000,
  };
  const swept = evaluateIdleThresholds(idleState, { rng: () => 0.5 });
  assert.ok(swept.events.some((event) => event.t === "trigger" && event.cardId === "corner-05"));

  const saleIds = ["frontier-12", "frontier-01", "frontier-06"];
  const saleReady = displayAll(withSlots(createInitialState(1), saleIds), saleIds);
  const withDups = {
    ...saleReady,
    collection: { ...saleReady.collection, "corner-01": 6 },
    duplicateBank: 5,
  };
  const sale = sellDuplicatesDetailed(withDups, { rng: () => 0.99 });
  assert.ok(sale.events.some((event) => event.t === "trigger" && event.cardId === "frontier-01"));
  assert.ok(sale.events.some((event) => event.t === "trigger" && event.cardId === "frontier-06"));
  assert.ok(sale.events.some((event) => event.t === "coins" && event.source === "frontier-06"));
});

test("audit: direct-applied Mystery Pack cards fire reveal supports", () => {
  const ids = ["frontier-12", "corner-05", "abyss-11"];
  const built = {
    ...displayAll(withSlots(createInitialState(1), ids), ids),
    lifetimeCoins: 2_000,
  };
  const swept = evaluateIdleThresholds(built, { rng: () => 0.5 });
  assert.ok(swept.mysteryCards.length > 0, "idle salvage produced mystery cards");
  assert.ok(
    swept.events.some((event) => event.t === "trigger" && event.cardId === "abyss-11"),
    "mysteryReveal support fired for direct-applied mystery cards",
  );
  assert.ok(swept.events.some((event) => event.t === "mystery" && event.cardId === "frontier-12"));
});
