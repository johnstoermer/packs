import test from "node:test";
import assert from "node:assert/strict";
import { ALL_CARDS, LEGACY_CARD_MAP, RARITIES, SETS, getCard, seededRandom } from "../lib/gameData.js";

const L = (legacyId) => LEGACY_CARD_MAP[legacyId] || legacyId;
import {
  CARD_DEFS,
  CARD_KEYWORD_GLOSSARY,
  DISCOVER_POOL,
  SIGNATURE_CARDS,
  describeCard,
  getCardDef,
  getCardRules,
  getCaseSlots,
  getEngine,
  tokenizeCardText,
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
  getPassiveIncomeRate,
  hydrateState,
  openPack,
  resolveFusions,
  revealPackCard,
  rewriteState,
  sellDuplicatesDetailed,
  undisplayCard,
} from "../lib/gameLogic.js";

const CORNER_IDS = SETS[0].cards.map((card) => card.id);
const FIRST = SETS[0].id;
const BLANK_IDS = new Set();

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

test("every card has a verb-engine definition; intentional blanks have no rules text", () => {
  assert.equal(Object.keys(CARD_DEFS).length, 98);
  for (const card of ALL_CARDS) {
    const def = getCardDef(card.id);
    assert.ok(def, card.id);
    const text = describeCard(card.id);
    if (BLANK_IDS.has(card.id)) {
      assert.equal(def.blank, true, card.id);
      assert.equal(text, "", card.id);
      continue;
    }
    assert.ok(text.length > 10, card.id);
    assert.ok(!/support|King card/i.test(text.replace(/KING \//, "")), `internal jargon leaked: ${card.id}: ${text}`);
  }
});

test("every card exposes structured, highlightable rules text", () => {
  assert.ok(Object.keys(CARD_KEYWORD_GLOSSARY).length >= 20);
  for (const card of ALL_CARDS) {
    const rules = getCardRules(card.id);
    if (BLANK_IDS.has(card.id)) {
      assert.equal(rules, null, card.id);
      continue;
    }
    assert.ok(rules, card.id);
    assert.ok(rules.eyebrow, card.id);
    assert.ok(rules.title, card.id);
    assert.equal(rules.text, describeCard(card.id), card.id);
    assert.deepEqual(rules.tokens, tokenizeCardText(rules.text), card.id);
    assert.ok(rules.tokens.length > 0, card.id);
    assert.ok(rules.tokens.some((token) => token.type !== "text"), `no emphasized token: ${card.id}`);
  }
});

test("card copy follows the shared rules grammar", () => {
  for (const card of ALL_CARDS) {
    const text = describeCard(card.id);
    assert.ok(!/\bcoins?\b/i.test(text), `legacy resource name: ${card.id}: ${text}`);
    assert.ok(!/\d+x\b/i.test(text), `ASCII multiplier: ${card.id}: ${text}`);
    assert.ok(!/\bWhen(?:ever)?\b[^.]*:/i.test(text), `trigger colon: ${card.id}: ${text}`);
    assert.ok(!/\bextra\b/i.test(text), `inconsistent additional wording: ${card.id}: ${text}`);
    if (text.startsWith("When")) {
      assert.ok(text.startsWith("Whenever"), `event trigger must use Whenever: ${card.id}: ${text}`);
    }
  }
});

test("selected signature cards remain high-rarity cards with real effects", () => {
  const required = new Set(["mark", "fusion", "mimic", "transmute", "relay", "autopilot"]);
  assert.ok([...required].every((verb) => SIGNATURE_CARDS[verb]), "selected signatures survive consolidation");
  for (const [verb, cardId] of Object.entries(SIGNATURE_CARDS)) {
    const card = getCard(cardId);
    const def = getCardDef(cardId);
    assert.ok(card, cardId);
    assert.ok(RARITIES[card.rarity].order >= RARITIES.legendary.order, `${verb} signature sits at ${card.rarity}`);
    assert.equal(def.signature, true, cardId);
    assert.equal(def.sig, verb, cardId);
    // A signature is never a bare gate: it carries its own chance source or
    // rule, plus player-facing text.
    assert.ok(def.mod || def.on, cardId);
    assert.ok(def.note && def.note.length > 20, cardId);
  }
  assert.equal(getCardDef(NAMELESS_CARD_ID).prestige, true);
  assert.equal(getCard(NAMELESS_CARD_ID).rarity, "nameless");
});

test("chance sources stand alone: a salvage support works with no signature displayed", () => {
  const state = withSlots(createInitialState(1), [L("frontier-01")]);
  const solo = displayCard(state, L("frontier-01"), 0);
  const sale = sellDuplicatesDetailed(
    { ...solo, collection: { ...solo.collection, [L("corner-01")]: 500 }, duplicateBank: 499 },
    { rng: () => 0.0001 },
  );
  assert.ok(sale.salvages > 0);
  assert.ok(sale.mysteryCards.length >= 4);
});

test("pure dials stay inert without a source: fusion depth alone fuses nothing", () => {
  const base = withSlots(createInitialState(1), [L("verdant-04")]);
  const built = displayAll(base, [L("verdant-04")]);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  const all = revealAll(opened.state, opened.result.cards, () => 0.99);
  const fusion = resolveFusions(all.state, all.cards, { rng: () => 0.99 });
  assert.equal(fusion.fused, false);
});

test("selected Salvage sources turn duplicate sales into Mystery Packs", () => {
  const base = withSlots(createInitialState(1), [L("frontier-01"), L("frontier-07")]);
  const built = displayAll(base, [L("frontier-01"), L("frontier-07")]);
  const loaded = {
    ...built,
    collection: { ...built.collection, [L("corner-01")]: 1_001 },
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
  const base = withSlots(createInitialState(1), [L("corner-05")]);
  const built = displayCard(base, L("corner-05"), 0);
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

test("Mark signature marks a visible card before reveal and marked reveals pay", () => {
  const base = withSlots(createInitialState(1), [L("circuit-12"), L("circuit-02")]);
  const built = displayAll(base, [L("circuit-12"), L("circuit-02")]);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.4 });
  assert.ok(opened.result.cards.some((pull) => pull.marked));
  assert.ok(opened.result.events.some((event) => event.t === "mark"));
  const markedIndex = opened.result.cards.findIndex((pull) => pull.marked);
  const coinsBefore = opened.state.coins;
  const step = revealPackCard(opened.state, opened.result.cards, markedIndex, { manual: true, rng: () => 0.4 });
  assert.ok(step.state.coins > coinsBefore);
});

test("Echo chance is additive from zero and overflow adds guaranteed repeats", () => {
  const allEcho = L("prism-12");
  const rareEchoes = [L("crown-01"), L("lastlight-02")];
  const base = withSlots(createInitialState(1), [allEcho, ...rareEchoes]);

  const plain = displayCard(base, allEcho, 0);
  const openedPlain = openPack(plain, { manual: true, free: true, now: 5_000, rng: () => 0.49 });
  const plainCards = openedPlain.result.cards.map((pull, index) => (
    index === 0 ? { ...pull, rarity: "rare" } : pull
  ));
  const plainStep = revealPackCard(openedPlain.state, plainCards, 0, { manual: true, rng: () => 0.49 });
  assert.equal(plainStep.events.filter((event) => event.t === "echo").length, 1);

  // Omniecho (+50%) + Resonash (+100%) + Nightecho (+100%) = 250%:
  // two guaranteed repeats and a final 50% roll.
  const boosted = displayAll(base, [allEcho, ...rareEchoes]);
  const openedBoosted = openPack(boosted, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  const boostedCards = openedBoosted.result.cards.map((pull, index) => (
    index === 0 ? { ...pull, rarity: "rare" } : pull
  ));
  const boostedStep = revealPackCard(openedBoosted.state, boostedCards, 0, { manual: true, rng: () => 0.99 });
  assert.equal(boostedStep.events.filter((event) => event.t === "echo").length, 2);
});

test("Fusion signature fuses same-rarity pairs upward and they reveal again", () => {
  const base = withSlots(createInitialState(1), [L("verdant-12")]);
  const built = displayAll(base, [L("verdant-12")]);
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

test("selected Fracture sources spill extra packs into the same reveal", () => {
  const base = withSlots(createInitialState(1), [L("ember-01")]);
  const built = displayCard(base, L("ember-01"), 0);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.01 });
  assert.ok(opened.result.cards.length >= 12);
  assert.ok(opened.result.events.some((event) => event.t === "fracture"));
  assert.ok(opened.result.packsInReveal >= 2);
});

test("every pack carries at least one Uncommon-or-better from its set", () => {
  let state = withSlots(createInitialState(1), []);
  const rng = seededRandom(7);
  const floor = RARITIES.uncommon.order;
  for (let round = 0; round < 80; round += 1) {
    const opened = openPack(state, { manual: true, free: true, now: 5_000 + round, rng });
    state = opened.state;
    const lifted = opened.result.cards.filter((pull) => RARITIES[pull.rarity].order >= floor);
    assert.ok(lifted.length >= 1, `pack ${round} was all Common`);
    assert.ok(
      lifted.some((pull) => pull.card.setId === opened.result.set.id),
      `pack ${round} uncommon came from outside the set`,
    );
  }
});

test("Mimic signature copies one unrevealed card before reveal", () => {
  const base = withSlots(createInitialState(1), [L("abyss-12")]);
  const built = displayAll(base, [L("abyss-12")]);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.7 });
  const mimicEvent = opened.result.events.find((event) => event.t === "mimic");
  assert.ok(mimicEvent);
  assert.equal(
    opened.result.cards[mimicEvent.to].card.id,
    opened.result.cards[mimicEvent.from].card.id,
  );
});

test("Transmute signature morphs an unrevealed card toward the revealed rarity", () => {
  const base = withSlots(createInitialState(1), [L("polar-12")]);
  const built = displayCard(base, L("polar-12"), 0);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.3 });
  const step = revealPackCard(opened.state, opened.result.cards, 0, { manual: true, rng: () => 0.001 });
  assert.ok(step.events.some((event) => event.t === "transmute"));
  assert.ok(step.cards.some((pull) => pull.transmuted && !pull.revealed));
});

test("Relay chains display triggers to the right", () => {
  const base = withSlots(createInitialState(1), [L("harbor-12"), L("corner-02"), L("corner-01")]);
  const relayCase = displayAll(base, [L("corner-02"), L("harbor-12"), L("corner-01")]);
  const opened = openPack(relayCase, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  const commonIndex = opened.result.cards.findIndex((pull) => pull.rarity === "common");
  const step = revealPackCard(opened.state, opened.result.cards, commonIndex, { manual: true, rng: () => 0.99 });
  assert.ok(step.events.some((event) => event.t === "relay"));
});

test("Discover offers three options, stacks picks, and Autopilot self-picks", () => {
  const discover = L("observatory-05");
  const base = withSlots(createInitialState(1), [discover]);
  const built = displayCard(base, discover, 0);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.5 });
  assert.ok(opened.state.discoverOffer);
  assert.equal(opened.state.discoverOffer.length, 3);
  const optionId = opened.state.discoverOffer[0];
  const chosen = chooseDiscoverOption(opened.state, optionId);
  assert.equal(chosen.discoverOffer, null);
  assert.ok(chosen.discoverStack[optionId] >= 1);
  assert.ok(DISCOVER_POOL.some((option) => option.id === optionId));

  const autoBase = withSlots(createInitialState(1), [L("orchard-12"), discover]);
  const autoBuilt = displayAll(autoBase, [L("orchard-12"), discover]);
  const autoOpened = openPack(autoBuilt, { manual: true, free: true, now: 5_000, rng: () => 0.5 });
  assert.equal(autoOpened.state.discoverOffer, null);
  assert.ok(Object.values(autoOpened.state.discoverStack).some((count) => count >= 2));
  assert.ok(autoOpened.result.events.some((event) => event.t === "discoverAuto"));
});

test("editing the display case sells the duplicate stack first", () => {
  const base = withSlots(createInitialState(1), []);
  const dupped = {
    ...base,
    collection: { ...base.collection, [L("corner-01")]: 5 },
    duplicateBank: 4,
  };
  assert.ok(getDuplicateCount(dupped) > 0);
  const edited = displayCard(dupped, L("corner-01"), 10);
  assert.equal(getDuplicateCount(edited), 0);
  assert.ok(edited.coins > dupped.coins);
  assert.equal(edited.displayed.length, 1);
  const removed = undisplayCard({ ...edited, collection: { ...edited.collection, [L("corner-02")]: 3 }, duplicateBank: 2 }, L("corner-01"));
  assert.equal(getDuplicateCount(removed), 0);
  assert.equal(removed.displayed.length, 0);
});

test("core card update pass keeps authored triggers live", () => {
  const pennigeon = L("corner-02");
  let state = displayCard(withSlots(createInitialState(1), [pennigeon]), pennigeon, 0);
  const engine = getEngine(state);
  assert.ok(engine.reveal.some((record) => record.id === pennigeon));

  const opened = openPack(state, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  const commonIndex = opened.result.cards.findIndex((pull) => pull.rarity === "common");
  const step = revealPackCard(opened.state, opened.result.cards, commonIndex, { manual: true, rng: () => 0.99 });
  assert.equal(step.state.coins - opened.state.coins, 100);

  const questhound = L("observatory-05");
  state = displayCard(withSlots(createInitialState(1), [questhound]), questhound, 0);
  const discovered = openPack(state, { manual: true, free: true, now: 5_000, rng: () => 0.5 });
  assert.ok(discovered.state.discoverOffer);
});

test("Echowl adds a matching card to the live pack whenever Omniecho Echoes", () => {
  const ids = [L("corner-10"), L("prism-12")];
  const built = displayAll(withSlots(createInitialState(1), ids), ids);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0 });
  const cards = opened.result.cards.map((pull, index) => (
    index === 0 ? { ...pull, rarity: "common" } : pull
  ));
  const before = cards.length;
  const step = revealPackCard(opened.state, cards, 0, { manual: true, rng: () => 0 });
  assert.equal(step.cards.length, before + 1);
  assert.ok(step.events.some((event) => event.t === "addCards" && event.source === L("corner-10")));
});

test("Locklure makes packs Common-only and can grow them on Common reveals", () => {
  const id = L("crown-11");
  const built = displayCard(withSlots(createInitialState(5), [id]), id, 0);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0 });
  assert.ok(opened.result.cards.every((pull) => pull.rarity === "common"));
  const before = opened.result.cards.length;
  const step = revealPackCard(opened.state, opened.result.cards, 0, { manual: true, rng: () => 0 });
  assert.equal(step.cards.length, before + 1);
  assert.equal(step.cards.at(-1).rarity, "common");
  assert.ok(step.events.some((event) => event.t === "trigger" && event.cardId === id));
  assert.ok(step.events.some((event) => event.t === "addCards" && event.source === id));
});

test("force-finish reveals suppress display effects so a pack chain is bounded", () => {
  const locklure = L("crown-11");
  const built = displayCard(withSlots(createInitialState(1), [locklure]), locklure, 0);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0 });
  const originalLength = opened.result.cards.length;
  let state = opened.state;
  let cards = opened.result.cards;
  const events = [];
  for (let index = 0; index < cards.length; index += 1) {
    const step = revealPackCard(state, cards, index, {
      manual: true,
      rng: () => 0,
      suppressEffects: true,
    });
    state = step.state;
    cards = step.cards;
    events.push(...step.events);
  }
  assert.equal(cards.length, originalLength);
  assert.ok(cards.every((pull) => pull.revealed));
  assert.equal(events.some((event) => event.t === "addCards"), false);
});

test("Heraldthorn stacks repeated Marks", () => {
  const stackingIds = [L("crown-08"), L("circuit-12"), L("circuit-01")];
  const stacking = displayAll(withSlots(createInitialState(5), stackingIds), stackingIds);
  const opened = openPack(stacking, { manual: true, free: true, now: 5_000, rng: () => 0 });
  assert.ok(opened.result.cards.some((pull) => pull.markStacks >= 2));
});

test("Questcap and Truescope resolve positional display triggers without loops", () => {
  const pennigeon = L("corner-02");
  const questcap = L("observatory-01");
  let built = displayAll(withSlots(createInitialState(5), [pennigeon, questcap]), [pennigeon, questcap]);
  let opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  const commonIndex = opened.result.cards.findIndex((pull) => pull.rarity === "common");
  let step = revealPackCard(opened.state, opened.result.cards, commonIndex, { manual: true, rng: () => 0 });
  assert.ok(step.events.some((event) => event.t === "leftTriggered" && event.cardId === questcap));
  assert.ok(step.state.discoverOffer);

  const truescope = L("observatory-02");
  const zeraph = L("circuit-12");
  built = displayAll(withSlots(createInitialState(5), [pennigeon, truescope, zeraph]), [pennigeon, truescope, zeraph]);
  opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0 });
  const markedIndex = opened.result.cards.findIndex((pull) => pull.marked);
  step = revealPackCard(opened.state, opened.result.cards, markedIndex, { manual: true, rng: () => 0 });
  assert.ok(step.events.some((event) => event.t === "triggerLeft" && event.cardId === pennigeon));
  assert.ok(step.events.length < 80);
});

test("Firstseer reveals the full pack and Lunaglyph Echoes revealed Marked cards", () => {
  const firstseer = L("observatory-07");
  let built = displayCard(withSlots(createInitialState(5), [firstseer]), firstseer, 0);
  let opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  let step = revealPackCard(opened.state, opened.result.cards, 0, { manual: true, rng: () => 0.99 });
  assert.ok(step.cards.every((pull) => pull.revealed || pull.fusedAway));
  assert.ok(step.events.some((event) => event.t === "revealRest"));

  const ids = [L("corner-02"), L("observatory-06"), L("circuit-12")];
  built = displayAll(withSlots(createInitialState(5), ids), ids);
  opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0 });
  const markedIndex = opened.result.cards.findIndex((pull) => pull.marked);
  step = revealPackCard(opened.state, opened.result.cards, markedIndex, { manual: true, rng: () => 0.99 });
  assert.ok(step.events.some((event) => event.t === "echo" && event.allMarked));
});

test("Coincrow scales idle income and Regalynx reveals owned duplicates at cash thresholds", () => {
  const coincrow = L("crown-09");
  const regalynx = L("crown-10");
  const ids = [coincrow, regalynx, L("corner-01"), L("corner-02")];
  let built = displayAll(withSlots(createInitialState(5), ids), [coincrow, regalynx]);
  const discovered = Object.values(built.collection).filter((count) => count > 0).length;
  assert.ok(getPassiveIncomeRate(built) >= discovered + 1);

  const copiesBefore = Object.values(built.collection).reduce((sum, count) => sum + count, 0);
  built = {
    ...built,
    coins: built.coins + 1_000,
    lifetimeCoins: built.lifetimeCoins + 1_000,
  };
  const swept = evaluateIdleThresholds(built, { rng: () => 0 });
  const copiesAfter = Object.values(swept.state.collection).reduce((sum, count) => sum + count, 0);
  assert.equal(copiesAfter, copiesBefore + 1);
  assert.ok(swept.events.some((event) => event.t === "duplicateReveal"));
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
  const state = withCards(createInitialState(1), [L("corner-01")]);
  const withEngineBits = {
    ...displayCard(state, L("corner-01"), 7),
    discoverStack: { resonance: 3, bogus: 9 },
    counters: { "c:corner-05": 120, junk: Number.NaN },
    prestige: { inscriptions: 2, rewrites: 1 },
  };
  const hydrated = hydrateState(JSON.parse(JSON.stringify(withEngineBits)), 999);
  assert.deepEqual(hydrated.displayed, [{ id: L("corner-01"), at: 7 }]);
  assert.deepEqual(hydrated.discoverStack, { resonance: 3 });
  assert.equal(hydrated.counters["c:corner-05"], 120);
  assert.equal(hydrated.prestige.inscriptions, 2);
  assert.equal(hydrated.discoverOffer, null);
});

test("no two cards share identical effect text", () => {
  const seen = new Map();
  const intentionalSharedText = new Set([
    "For every 10 packs you open, Discover.",
    "Common cards have +100% Echo.",
    "Packs have +100% chance to contain a Marked card.",
  ]);
  for (const card of ALL_CARDS) {
    const text = describeCard(card.id);
    if (BLANK_IDS.has(card.id)) continue;
    assert.ok(text.length > 0, `${card.id} has effect text`);
    assert.ok(
      !seen.has(text) || intentionalSharedText.has(text),
      `${card.id} duplicates ${seen.get(text)}: "${text}"`,
    );
    seen.set(text, card.id);
  }
});

test("template families stay small: numbers-stripped text repeats at most 3 times", () => {
  const families = new Map();
  for (const card of ALL_CARDS) {
    const def = getCardDef(card.id);
    if (def?.sig || def?.capstone || def?.prestige || def?.blank) continue;
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
    if (def?.sig || def?.capstone || def?.prestige) continue;
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

test("a later display-case milestone unlocks its named slot", () => {
  const foundCards = ALL_CARDS
    .filter((card) => RARITIES[card.rarity].order < RARITIES.mythic.order)
    .slice(0, 43)
    .map((card) => card.id);
  const state = withCards(createInitialState(1), foundCards, { packsOpened: 0 });
  const result = getCaseSlots(state);

  assert.equal(result.milestones.find((milestone) => milestone.slot === 3).met, false);
  assert.equal(result.milestones.find((milestone) => milestone.slot === 4).met, true);
  assert.equal(result.slots, 4);
  assert.deepEqual(
    result.milestones.filter((milestone) => [2, 4, 6].includes(milestone.slot)).map((milestone) => milestone.label),
    ["Find 12 cards", "Find 36 cards", "Find 72 cards"],
  );
});

test("admin sandbox unlocks everything and never leaks into real saves", async () => {
  const { ADMIN_SAVE_KEY, SAVE_KEY, applyAdminGuarantees, createAdminState, openPack, serializeState } = await import("../lib/gameLogic.js");
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

  // A stale sandbox from an older build heals on load: guarantees are
  // re-applied, so missing cards and spent-down coins come back.
  const stale = hydrateState(JSON.parse(serializeState({ ...createInitialState(5), coins: 12 })), 10);
  const healed = applyAdminGuarantees(stale);
  assert.equal(healed.adminMode, true);
  assert.equal(Object.keys(healed.collection).length, ALL_CARDS.length);
  assert.ok(ALL_CARDS.every((card) => healed.collection[card.id] >= 1));
  assert.ok(healed.coins >= 1e15);
  assert.equal(healed.unlockedSets.length, SETS.length);
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
  const withoutKnob = runMarks([L("circuit-12")], 11);
  const withKnob = runMarks([L("circuit-12"), L("circuit-04")], 11);
  assert.ok(withKnob > withoutKnob, `expected spreads with knob (${withKnob}) > without (${withoutKnob})`);
});

test("audit: transmute chance past 100% is guaranteed and hits extra cards", () => {
  const ids = [L("polar-12"), L("observatory-04")];
  const built = displayAll(withSlots(createInitialState(1), ids), ids);
  // 50 signature + 60 boost = 110%: rng 0.97 would have failed the old
  // capped roll (0.97 > 0.95) — now one Transmute is guaranteed.
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.97 });
  const step = revealPackCard(opened.state, opened.result.cards, 0, { manual: true, rng: () => 0.97 });
  assert.ok(step.events.some((event) => event.t === "transmute"));
  assert.equal(step.events.find((event) => event.t === "transmute").cardId, L("polar-12"));
});

test("audit: Catalystag can grant the Catalyst Fusion boon", () => {
  const ids = [L("verdant-12"), L("verdant-08")];
  const built = displayAll(withSlots(createInitialState(1), ids), ids);
  const opened = openPack(built, { manual: true, free: true, now: 5_000, rng: () => 0.99 });
  const all = revealAll(opened.state, opened.result.cards, () => 0.99);
  const fusion = resolveFusions(all.state, all.cards, { rng: () => 0 });
  assert.equal(fusion.fused, true);
  assert.ok(fusion.events.some((event) => event.t === "boon" && event.option === "catalyst"));
});

test("audit: threshold and duplicate-sale cards emit attributed trigger events", () => {
  const idleIds = [L("corner-05")];
  const idleState = {
    ...displayAll(withSlots(createInitialState(1), idleIds), idleIds),
    lifetimeCoins: 5_000,
  };
  const swept = evaluateIdleThresholds(idleState, { rng: () => 0.5 });
  assert.ok(swept.events.some((event) => event.t === "trigger" && event.cardId === L("corner-05")));

  const saleIds = [L("frontier-01")];
  const saleReady = displayAll(withSlots(createInitialState(1), saleIds), saleIds);
  const withDups = {
    ...saleReady,
    collection: { ...saleReady.collection, [L("corner-01")]: 6 },
    duplicateBank: 5,
  };
  const sale = sellDuplicatesDetailed(withDups, { rng: () => 0 });
  assert.ok(sale.events.some((event) => event.t === "trigger" && event.cardId === L("frontier-01")));
  assert.ok(sale.events.some((event) => event.t === "mystery"));
});

test("audit: direct-applied Mystery Packs fire selected mystery-open supports", () => {
  const ids = [L("corner-05"), L("apocalypse-06")];
  const built = {
    ...displayAll(withSlots(createInitialState(1), ids), ids),
    lifetimeCoins: 2_000,
  };
  const swept = evaluateIdleThresholds(built, { rng: () => 0 });
  assert.ok(swept.mysteryCards.length > 0, "idle salvage produced mystery cards");
  assert.ok(
    swept.events.some((event) => event.t === "boon" && event.option === "acceleration"),
    "mystery-open support fired for direct-applied mystery cards",
  );
  assert.ok(swept.events.some((event) => event.t === "mystery"));
});

test("audit: Salvage Mystery Packs enter the pack-open and Fracture pipeline", () => {
  const ids = [L("frontier-01"), L("ember-01"), L("observatory-05")];
  const built = displayAll(withSlots(createInitialState(1), ids), ids);
  const loaded = {
    ...built,
    collection: { ...built.collection, [L("corner-01")]: 2 },
    duplicateBank: 1,
  };
  const sale = sellDuplicatesDetailed(loaded, { rng: () => 0 });
  assert.ok(sale.events.some((event) => event.t === "mystery"));
  assert.ok(sale.events.some((event) => event.t === "fracture" && event.source === "salvage"));
  assert.ok(sale.events.some((event) => event.t === "trigger" && event.cardId === L("observatory-05")));
  assert.ok(sale.mysteryCards.length >= 10);
  assert.ok(sale.state.packsOpened > loaded.packsOpened);
});

test("audit: Fracture spill cards reveal through Locklure like normal pack cards", () => {
  const ids = [L("crown-11"), L("ember-01")];
  const built = displayAll(withSlots(createInitialState(1), ids), ids);
  const opened = openPack(built, {
    manual: true,
    free: true,
    now: 5_000,
    rng: () => 0,
  });
  const fractureIndex = opened.result.cards.findIndex((pull) => pull.fromFracture);
  assert.ok(fractureIndex >= 0, "Fracture appended a visibly tagged spill card");
  assert.equal(opened.result.cards[fractureIndex].revealed, false);

  const before = opened.result.cards.length;
  const revealed = revealPackCard(opened.state, opened.result.cards, fractureIndex, {
    manual: true,
    rng: () => 0,
  });
  assert.ok(
    revealed.events.some((event) => event.t === "trigger" && event.cardId === L("crown-11")),
    "Locklure triggered from the Fracture card's normal reveal",
  );
  assert.ok(
    revealed.events.some((event) => event.t === "addCards" && event.source === L("crown-11")),
    "Locklure added its Common card to the same opening",
  );
  assert.equal(revealed.cards.length, before + 1);
});

test("audit: duplicate-sale Mystery cards spill into an opening and trigger Locklure", () => {
  const ids = [L("crown-11"), L("frontier-01")];
  const built = displayAll(withSlots(createInitialState(1), ids), ids);
  const opened = openPack(built, {
    manual: true,
    free: true,
    now: 5_000,
    rng: () => 0,
  });
  const loaded = {
    ...opened.state,
    collection: { ...opened.state.collection, [L("corner-01")]: 2 },
    duplicateBank: 1,
  };
  const before = opened.result.cards.length;
  const sale = sellDuplicatesDetailed(loaded, {
    injectCards: opened.result.cards,
    rng: () => 0,
  });
  assert.ok(sale.cards.length > before, "Mystery cards joined the active pack");
  const mysteryIndex = sale.cards.findIndex((pull, index) => index >= before && pull.fromMystery);
  assert.ok(mysteryIndex >= before);
  assert.equal(sale.cards[mysteryIndex].revealed, false);

  const revealed = revealPackCard(sale.state, sale.cards, mysteryIndex, {
    manual: true,
    rng: () => 0,
  });
  assert.ok(
    revealed.events.some((event) => event.t === "trigger" && event.cardId === L("crown-11")),
    "Locklure triggered from the Mystery card's normal reveal",
  );
  assert.ok(
    revealed.events.some((event) => event.t === "addCards" && event.source === L("crown-11")),
    "Locklure's added card remained in that same opening",
  );
});
