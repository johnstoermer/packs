import test from "node:test";
import assert from "node:assert/strict";
import * as gameLogic from "../lib/gameLogic.js";
import {
  PACK_SIZE,
  buyPack,
  clearOpeningQueue,
  createInitialState,
  displayCard,
  enqueueReveal,
  hydrateState,
  isOpeningSettled,
  openPack,
  reorderDisplayed,
  stepOpening,
  storedSaveDominates,
  undisplayCard,
} from "../lib/gameLogic.js";
import { ALL_CARDS, RARITIES } from "../lib/gameData.js";

// A deterministic rng: yields the listed values in order, then repeats the
// last one forever.
function rngSeq(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function findCard(name) {
  const card = ALL_CARDS.find((entry) => entry.name === name);
  assert.ok(card, `card ${name} exists`);
  return card;
}

function vanillaCardOf(rarity) {
  const card = ALL_CARDS.find((entry) => entry.rarity === rarity && !entry.effectId);
  assert.ok(card, `vanilla ${rarity} exists`);
  return card;
}

function makeState({ caseNames = [], cash = 0, scrap = 0, packs = 3 } = {}) {
  const state = createInitialState(0);
  state.cash = cash;
  state.scrap = scrap;
  state.packs = packs;
  // Meet every case milestone so all six slots are legal in tests.
  state.packsOpened = 100;
  for (const card of ALL_CARDS.slice(0, 30)) state.collection[card.id] = 1;
  for (const name of caseNames) state.collection[findCard(name).id] = 1;
  state.displayed = caseNames.map((name) => ({ id: findCard(name).id }));
  return state;
}

function pullOf(rarity, { revealed = false, foil = false } = {}) {
  return {
    card: vanillaCardOf(rarity),
    rarity,
    foil,
    revealed,
    salvaged: false,
    fusedAway: false,
    isNew: false,
  };
}

function makeSession(pulls, queue = []) {
  return {
    id: "test-opening",
    cards: pulls,
    queue,
    revealsDone: pulls.filter((pull) => pull.revealed).length,
  };
}

function drainQueue(state, session, rng, maxSteps = 100) {
  let working = { state, session };
  for (let step = 0; step < maxSteps; step += 1) {
    if (working.session.queue.length === 0) break;
    working = stepOpening(working.state, working.session, { rng });
  }
  return working;
}

test("there is no passive income and no timer hooks in the logic layer", () => {
  assert.ok(!("tickEconomy" in gameLogic));
  assert.ok(!("getPassiveIncomeRate" in gameLogic));
  assert.ok(!("evaluateIdleThresholds" in gameLogic));
});

test("openPack consumes a sealed pack and deals six cards", () => {
  const state = makeState({ packs: 1 });
  const opened = openPack(state, { rng: rngSeq([0.5]) });
  assert.equal(opened.error, null);
  assert.equal(opened.state.packs, 0);
  assert.equal(opened.session.cards.length, PACK_SIZE);
  assert.equal(opened.session.queue.length, 0);
  const again = openPack(opened.state, { rng: rngSeq([0.5]) });
  assert.equal(again.error, "NO_STOCK");
  assert.equal(again.session, null);
});

test("rapidly queued reveals process strictly one at a time, in order", () => {
  const state = makeState({});
  let session = makeSession([pullOf("common"), pullOf("common"), pullOf("common")]);
  session = enqueueReveal(session, 2);
  session = enqueueReveal(session, 0);
  session = enqueueReveal(session, 1);
  assert.equal(session.queue.length, 3);

  const rng = rngSeq([0.99]);
  let outcome = stepOpening(state, session, { rng });
  assert.deepEqual(outcome.action, { type: "reveal", index: 2 });
  assert.equal(outcome.session.cards[2].revealed, true);
  assert.equal(outcome.session.cards[0].revealed, false);

  outcome = stepOpening(outcome.state, outcome.session, { rng });
  assert.deepEqual(outcome.action, { type: "reveal", index: 0 });
  outcome = stepOpening(outcome.state, outcome.session, { rng });
  assert.deepEqual(outcome.action, { type: "reveal", index: 1 });
  assert.equal(outcome.session.queue.length, 0);
  assert.equal(outcome.state.cash, 3);
  assert.ok(isOpeningSettled(outcome.session));
});

test("a reveal's cascade resolves before the next queued reveal", () => {
  const state = makeState({ caseNames: ["Scrapactus"] });
  let session = makeSession([pullOf("common"), pullOf("common")]);
  session = enqueueReveal(session, 0);
  session = enqueueReveal(session, 1);

  // Reveal 0 procs Scrapactus (0.1 < 25%): its salvage cuts in FRONT of the
  // already-queued reveal of card 1.
  let outcome = stepOpening(state, session, { rng: rngSeq([0.1]) });
  assert.deepEqual(outcome.session.queue.map((action) => action.type), ["salvage", "reveal"]);

  outcome = stepOpening(outcome.state, outcome.session, { rng: rngSeq([0.99]) });
  assert.equal(outcome.action.type, "salvage");
  assert.equal(outcome.session.cards[0].salvaged, true);
  assert.equal(outcome.session.cards[1].revealed, false, "next reveal waits for the cascade");

  outcome = stepOpening(outcome.state, outcome.session, { rng: rngSeq([0.99]) });
  assert.deepEqual(outcome.action, { type: "reveal", index: 1 });
});

test("enqueueReveal ignores duplicates and already-revealed cards", () => {
  let session = makeSession([pullOf("common"), pullOf("common", { revealed: true })]);
  session = enqueueReveal(session, 0);
  session = enqueueReveal(session, 0);
  session = enqueueReveal(session, 1);
  assert.equal(session.queue.length, 1);
});

test("reveals pay cash by rarity, foil pays double, new cards join the collection", () => {
  const state = makeState({});
  const rareCard = pullOf("rare", { foil: true });
  let session = makeSession([rareCard]);
  session = enqueueReveal(session, 0);
  const outcome = stepOpening(state, session, { rng: rngSeq([0.99]) });
  assert.equal(outcome.state.cash, RARITIES.rare.sellValue * 2);
  assert.equal(outcome.session.cards[0].isNew, true);
  assert.equal(outcome.state.collection[rareCard.card.id], 1);
  assert.equal(outcome.state.foils[rareCard.card.id], 1);

  // The same card again is a duplicate, not new.
  let second = makeSession([pullOf("rare")]);
  second.cards[0].card = rareCard.card;
  second = enqueueReveal(second, 0);
  const dupOutcome = stepOpening(outcome.state, second, { rng: rngSeq([0.99]) });
  assert.equal(dupOutcome.session.cards[0].isNew, false);
  assert.equal(dupOutcome.state.collection[rareCard.card.id], 2);
});

test("Coinbud doubles Common cash; Omniecho makes reveal triggers fire twice", () => {
  const single = drainQueue(
    makeState({ caseNames: ["Coinbud"] }),
    enqueueReveal(makeSession([pullOf("common")]), 0),
    rngSeq([0.99]),
  );
  assert.equal(single.state.cash, 2);

  const doubled = drainQueue(
    makeState({ caseNames: ["Coinbud", "Omniecho"] }),
    enqueueReveal(makeSession([pullOf("common")]), 0),
    rngSeq([0.99]),
  );
  assert.equal(doubled.state.cash, 3);

  // Rare reveals get no Coinbud bonus.
  const rare = drainQueue(
    makeState({ caseNames: ["Coinbud"] }),
    enqueueReveal(makeSession([pullOf("rare")]), 0),
    rngSeq([0.99]),
  );
  assert.equal(rare.state.cash, RARITIES.rare.sellValue);
});

test("Scrapactus salvages the reveal into Scrap through the queue", () => {
  const state = makeState({ caseNames: ["Scrapactus"] });
  let session = enqueueReveal(makeSession([pullOf("common")]), 0);
  // First rng value drives the 25% roll: 0.1 procs.
  let outcome = stepOpening(state, session, { rng: rngSeq([0.1]) });
  assert.equal(outcome.session.queue.length, 1);
  assert.equal(outcome.session.queue[0].type, "salvage");
  outcome = stepOpening(outcome.state, outcome.session, { rng: rngSeq([0.99]) });
  assert.equal(outcome.session.cards[0].salvaged, true);
  assert.equal(outcome.state.scrap, RARITIES.common.scrapValue);
  assert.equal(outcome.state.stats.salvages, 1);
});

test("Salvatort and Cinderscrap double Scrap and Cinderscrap zeroes cash", () => {
  const state = makeState({ caseNames: ["Salvatort", "Cinderscrap"] });
  const session = makeSession(
    [pullOf("common", { revealed: true })],
    [{ type: "salvage", index: 0 }],
  );
  const outcome = stepOpening(state, session, { rng: rngSeq([0.99]) });
  // Base 1, doubled by Cinderscrap, doubled again by Salvatort on a Common.
  assert.equal(outcome.state.scrap, 4);

  const noCash = drainQueue(
    makeState({ caseNames: ["Cinderscrap"] }),
    enqueueReveal(makeSession([pullOf("legendary")]), 0),
    rngSeq([0.99]),
  );
  assert.equal(noCash.state.cash, 0);
});

test("Reclaimotive spends 20 Scrap on Salvage to burst a pack into the opening", () => {
  const state = makeState({ caseNames: ["Reclaimotive"], scrap: 25 });
  const session = makeSession(
    [pullOf("common", { revealed: true })],
    [{ type: "salvage", index: 0 }],
  );
  const outcome = drainQueue(state, session, rngSeq([0.99]));
  assert.equal(outcome.state.scrap, 25 - 20 + RARITIES.common.scrapValue);
  assert.equal(outcome.session.cards.length, 1 + PACK_SIZE);
  assert.ok(outcome.session.cards.slice(1).every((pull) => pull.fromEffect));
});

test("Scrapanvil adds a card when a Rare-or-better card is salvaged", () => {
  const state = makeState({ caseNames: ["Scrapanvil"] });
  const session = makeSession(
    [pullOf("epic", { revealed: true }), pullOf("common", { revealed: true })],
    [{ type: "salvage", index: 0 }, { type: "salvage", index: 1 }],
  );
  const outcome = drainQueue(state, session, rngSeq([0.99]));
  // The Epic salvage adds one card; the Common salvage does not.
  assert.equal(outcome.session.cards.length, 3);
});

test("Firstseer's first reveal queues every other card in the pack", () => {
  const state = makeState({ caseNames: ["Firstseer"] });
  let session = enqueueReveal(makeSession([pullOf("common"), pullOf("common"), pullOf("rare")]), 1);
  let outcome = stepOpening(state, session, { rng: rngSeq([0.99]) });
  assert.equal(outcome.session.queue.length, 2);
  outcome = drainQueue(outcome.state, outcome.session, rngSeq([0.99]));
  assert.ok(outcome.session.cards.every((pull) => pull.revealed));
});

test("Heartmerge fuses same-rarity reveals; the result reveals through the queue", () => {
  const state = makeState({ caseNames: ["Heartmerge"] });
  let session = makeSession([pullOf("common", { revealed: true }), pullOf("common")]);
  session = enqueueReveal(session, 1);
  let outcome = stepOpening(state, session, { rng: rngSeq([0.99]) });
  assert.equal(outcome.session.queue[0].type, "fuse");
  outcome = drainQueue(outcome.state, outcome.session, rngSeq([0.5, 0.99]));
  assert.equal(outcome.session.cards[0].fusedAway, true);
  assert.equal(outcome.session.cards[1].fusedAway, true);
  assert.equal(outcome.session.cards.length, 3);
  const result = outcome.session.cards[2];
  assert.equal(result.rarity, "common");
  assert.equal(result.revealed, true);
  assert.equal(outcome.state.stats.fusions, 1);
});

test("Fusihare gives fusions a chance to jump a rarity tier", () => {
  const state = makeState({ caseNames: ["Heartmerge", "Fusihare"] });
  const session = makeSession(
    [pullOf("common", { revealed: true }), pullOf("common", { revealed: true })],
    [{ type: "fuse", a: 0, b: 1 }],
  );
  // First rng value is the jump roll: 0.01 < 0.05 jumps.
  const outcome = stepOpening(state, session, { rng: rngSeq([0.01, 0.5, 0.99]) });
  assert.equal(outcome.session.cards[2].rarity, "rare");
  assert.ok(outcome.events.some((event) => event.t === "fusion" && event.jumped));
});

test("Foilpress jumps double-foil fusions straight to Legendary", () => {
  const state = makeState({ caseNames: ["Foilpress"] });
  const session = makeSession(
    [
      pullOf("common", { revealed: true, foil: true }),
      pullOf("common", { revealed: true, foil: true }),
    ],
    [{ type: "fuse", a: 0, b: 1 }],
  );
  const outcome = stepOpening(state, session, { rng: rngSeq([0.99]) });
  const result = outcome.session.cards[2];
  assert.equal(result.rarity, "legendary");
  assert.equal(result.foil, true);
});

test("Recyclen rerolls a Common once for 1 Scrap", () => {
  const state = makeState({ caseNames: ["Recyclen"], scrap: 1 });
  const session = enqueueReveal(makeSession([pullOf("common")]), 0);
  const outcome = drainQueue(state, session, rngSeq([0.99]));
  assert.equal(outcome.state.scrap, 0);
  assert.equal(outcome.state.stats.rerolls, 1);
  assert.equal(outcome.session.cards.length, 1);
  assert.equal(outcome.session.cards[0].revealed, true);
  assert.equal(outcome.session.cards[0].rerolled, true);
  assert.ok(isOpeningSettled(outcome.session));
});

test("Scrapcup can spend 1 Scrap to reveal an additional Common", () => {
  const state = makeState({ caseNames: ["Scrapcup"], scrap: 1 });
  const session = enqueueReveal(makeSession([pullOf("common")]), 0);
  // 0.1 procs the 25% roll; later values keep replacement rolls tame.
  const outcome = drainQueue(state, session, rngSeq([0.1, 0.5, 0.99]));
  assert.equal(outcome.state.scrap, 0);
  assert.equal(outcome.session.cards.length, 2);
  assert.equal(outcome.session.cards[1].rarity, "common");
  assert.equal(outcome.session.cards[1].revealed, true);
});

test("Bellpack spends 10 Scrap on pack open to add 3 cards", () => {
  const state = makeState({ caseNames: ["Bellpack"], scrap: 10, packs: 1 });
  const opened = openPack(state, { rng: rngSeq([0.5]) });
  assert.equal(opened.state.scrap, 0);
  assert.equal(opened.session.cards.length, PACK_SIZE + 3);
});

test("Rarehouse spends half your cash for a Rare-or-better pack", () => {
  const state = makeState({ caseNames: ["Rarehouse"], cash: 100, packs: 1 });
  const opened = openPack(state, { rng: rngSeq([0.5]) });
  assert.equal(opened.state.cash, 50);
  assert.ok(opened.session.cards.every(
    (pull) => RARITIES[pull.rarity].order >= RARITIES.rare.order,
  ));
});

test("Encorekeep can trigger the first display case card an additional time", () => {
  const state = makeState({ caseNames: ["Coinbud", "Encorekeep"] });
  const session = enqueueReveal(makeSession([pullOf("common")]), 0);
  // The first rng value is the 5% encore roll.
  const outcome = stepOpening(state, session, { rng: rngSeq([0.01, 0.99]) });
  assert.equal(outcome.state.cash, 3);
  assert.ok(outcome.events.some((event) => event.t === "encore"));
});

test("Boiloreverb can trigger the card to its right when a fusion happens", () => {
  const state = makeState({ caseNames: ["Heartmerge", "Boiloreverb", "Scrapactus"] });
  const session = makeSession(
    [pullOf("common", { revealed: true }), pullOf("common", { revealed: true })],
    [{ type: "fuse", a: 0, b: 1 }],
  );
  // rng order: fused card pick, fused foil roll, Boiloreverb 50% roll,
  // Scrapactus 25% roll — both succeed at 0.1.
  let outcome = stepOpening(state, session, { rng: rngSeq([0.5, 0.99, 0.1, 0.1]) });
  assert.ok(outcome.session.queue.some((action) => action.type === "salvage"));
  outcome = drainQueue(outcome.state, outcome.session, rngSeq([0.99]));
  assert.equal(outcome.session.cards[2].salvaged, true);
  assert.ok(outcome.state.scrap > 0);
});

test("leaving an opening clears the action stack", () => {
  let session = makeSession([pullOf("common"), pullOf("common")]);
  session = enqueueReveal(session, 0);
  session = enqueueReveal(session, 1);
  const cleared = clearOpeningQueue(session);
  assert.equal(cleared.queue.length, 0);
  assert.equal(cleared.cards.length, 2);
  assert.ok(!isOpeningSettled(cleared), "face-down cards remain unresolved");
});

test("buyPack charges the pack price", () => {
  const state = { ...createInitialState(0), cash: 20, packs: 0 };
  const bought = buyPack(state);
  assert.equal(bought.packs, 1);
  assert.equal(bought.cash, 20 - gameLogic.PACK_COST);
  const broke = buyPack({ ...state, cash: 5 });
  assert.equal(broke.packs, 0);
});

test("display case respects ownership, slot count, and order", () => {
  const owned = findCard("Coinbud");
  const second = findCard("Zeraph");
  let state = createInitialState(0);
  state.collection[owned.id] = 1;
  state.collection[second.id] = 1;
  state = displayCard(state, owned.id);
  assert.deepEqual(state.displayed, [{ id: owned.id }]);
  // A fresh save has one slot; a second display is rejected.
  state = displayCard(state, second.id);
  assert.equal(state.displayed.length, 1);
  // Unowned cards are rejected.
  const unowned = displayCard(state, findCard("Omniecho").id);
  assert.equal(unowned.displayed.length, 1);

  state.packsOpened = 3;
  state = displayCard(state, second.id);
  assert.equal(state.displayed.length, 2);
  state = reorderDisplayed(state, 0, 1);
  assert.deepEqual(state.displayed.map((entry) => entry.id), [second.id, owned.id]);
  state = undisplayCard(state, second.id);
  assert.deepEqual(state.displayed.map((entry) => entry.id), [owned.id]);
});

test("saves from the pre-redesign game restart fresh", () => {
  const legacy = { version: 11, coins: 50_000, packsOpened: 400, collection: {} };
  const hydrated = hydrateState(legacy, 0);
  assert.equal(hydrated.cash, 0);
  assert.equal(hydrated.packs, gameLogic.STARTING_PACKS);
  assert.equal(hydrated.packsOpened, 0);
  assert.equal(storedSaveDominates(JSON.stringify(legacy), hydrated), false);
});

test("current saves round-trip through hydrate", () => {
  const state = makeState({ caseNames: ["Coinbud"], cash: 44, scrap: 7, packs: 2 });
  state.lifetimeCash = 44;
  state.lifetimeScrap = 7;
  const hydrated = hydrateState(JSON.parse(gameLogic.serializeState(state, 1)), 1);
  assert.equal(hydrated.cash, 44);
  assert.equal(hydrated.scrap, 7);
  assert.equal(hydrated.packs, 2);
  assert.deepEqual(hydrated.displayed, [{ id: findCard("Coinbud").id }]);
});
