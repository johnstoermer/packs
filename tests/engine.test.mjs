import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ALL_CARDS,
  RARITIES,
  RARITY_IDS,
  canonicalRarityId,
  getCard,
  getCardArtId,
} from "../lib/gameData.js";
import {
  BASE_FOIL_CHANCE,
  CASE_MILESTONES,
  CASE_SIZE,
  EFFECTS,
  getCardDef,
  getCardRules,
  getCaseSlots,
  getDisplayedEntries,
  getEngine,
  tokenizeCardText,
} from "../lib/engineCards.js";
import { createInitialState } from "../lib/gameLogic.js";

function findCard(name) {
  const card = ALL_CARDS.find((entry) => entry.name === name);
  assert.ok(card, `card ${name} exists`);
  return card;
}

function stateWithCase(names) {
  const state = createInitialState(0);
  for (const name of names) {
    const card = findCard(name);
    state.collection[card.id] = 1;
  }
  state.displayed = names.map((name) => ({ id: findCard(name).id }));
  // Meet every milestone so all six slots are legal.
  state.packsOpened = 100;
  for (const card of ALL_CARDS.slice(0, 30)) {
    state.collection[card.id] = state.collection[card.id] || 1;
  }
  return state;
}

test("the collection is exactly 50 cards with exactly 20 effects", () => {
  assert.equal(ALL_CARDS.length, 50);
  assert.equal(ALL_CARDS.filter((card) => card.effectId).length, 20);
  assert.equal(ALL_CARDS.filter((card) => !card.effectId).length, 30);
});

test("rarity spread is 24 / 14 / 8 / 4 across the four rarities", () => {
  const counts = Object.fromEntries(RARITY_IDS.map((id) => [id, 0]));
  for (const card of ALL_CARDS) counts[card.rarity] += 1;
  assert.deepEqual(counts, { common: 24, rare: 14, epic: 8, legendary: 4 });
});

test("rarities are exactly Common, Rare, Epic, Legendary with full odds", () => {
  assert.deepEqual(RARITY_IDS, ["common", "rare", "epic", "legendary"]);
  const total = RARITY_IDS.reduce((sum, id) => sum + RARITIES[id].odds, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, "pull odds sum to 1");
  for (const id of RARITY_IDS) {
    assert.ok(RARITIES[id].sellValue > 0, `${id} pays cash`);
    assert.ok(RARITIES[id].scrapValue > 0, `${id} salvages into scrap`);
  }
  assert.equal(canonicalRarityId("uncommon"), "rare");
  assert.equal(canonicalRarityId("mythic"), "legendary");
});

test("card ids and names are unique", () => {
  assert.equal(new Set(ALL_CARDS.map((card) => card.id)).size, ALL_CARDS.length);
  assert.equal(new Set(ALL_CARDS.map((card) => card.name)).size, ALL_CARDS.length);
});

test("every card's art exists in the pixel art manifest", async () => {
  const manifest = JSON.parse(await readFile("public/card-art-pixel/manifest.json", "utf8"));
  const generated = new Set(
    manifest.cards.filter((entry) => entry.generated).map((entry) => entry.legacyId),
  );
  for (const card of ALL_CARDS) {
    assert.ok(generated.has(getCardArtId(card)), `${card.name} art ${getCardArtId(card)} is generated`);
  }
});

test("every effect card has unique rules text; vanilla cards have none", () => {
  const texts = new Set();
  for (const card of ALL_CARDS) {
    const rules = getCardRules(card.id);
    if (card.effectId) {
      assert.ok(rules?.text, `${card.name} has rules text`);
      assert.ok(!texts.has(rules.text), `${card.name} text is unique`);
      texts.add(rules.text);
    } else {
      assert.equal(rules, null, `${card.name} has no rules text`);
    }
  }
  assert.equal(texts.size, 20);
});

test("every effect id maps to a definition and vice versa", () => {
  const used = new Set(ALL_CARDS.map((card) => card.effectId).filter(Boolean));
  for (const effectId of used) assert.ok(EFFECTS[effectId], `${effectId} defined`);
  for (const effectId of Object.keys(EFFECTS)) {
    assert.ok(used.has(effectId), `${effectId} is printed on a card`);
  }
});

test("tokenizer marks keywords and numbers", () => {
  const tokens = tokenizeCardText("On Reveal: 25% chance to Salvage.");
  assert.ok(tokens.some((token) => token.type === "keyword" && token.keyword === "Reveal"));
  assert.ok(tokens.some((token) => token.type === "keyword" && token.keyword === "Salvage"));
  assert.ok(tokens.some((token) => token.type === "number" && token.value === "25%"));
});

test("getEngine aggregates passives", () => {
  const state = stateWithCase(["Foilmonk", "Omniecho", "Cinderscrap", "Salvatort", "Fusihare", "Encorekeep"]);
  const engine = getEngine(state);
  assert.ok(Math.abs(engine.foilChance - (BASE_FOIL_CHANCE + 0.05)) < 1e-9);
  assert.equal(engine.revealRepeats, 2);
  assert.equal(engine.noCash, true);
  assert.equal(engine.doubleScrap, true);
  assert.equal(engine.commonScrapDouble, true);
  assert.ok(Math.abs(engine.fuseJumpChance - 0.05) < 1e-9);
  assert.ok(Math.abs(engine.firstSlotEchoChance - 0.05) < 1e-9);
});

test("Mimistar copies the effect of the card to its right", () => {
  const state = stateWithCase(["Mimistar", "Scrapactus"]);
  const engine = getEngine(state);
  assert.equal(engine.onReveal.length, 2);
  assert.equal(engine.onReveal[0].id, findCard("Mimistar").id);
  assert.equal(engine.onReveal[0].def.kind, "salvageChance");
  assert.equal(engine.onReveal[1].id, findCard("Scrapactus").id);
});

test("Mimistar in the last slot copies nothing", () => {
  const state = stateWithCase(["Scrapactus", "Mimistar"]);
  const engine = getEngine(state);
  assert.equal(engine.onReveal.length, 1);
  assert.equal(engine.onReveal[0].id, findCard("Scrapactus").id);
});

test("Mimistar copying a passive card stacks the passive", () => {
  const state = stateWithCase(["Mimistar", "Foilmonk"]);
  const engine = getEngine(state);
  assert.ok(Math.abs(engine.foilChance - (BASE_FOIL_CHANCE + 0.1)) < 1e-9);
});

test("display case slots unlock through milestones", () => {
  const fresh = createInitialState(0);
  assert.equal(getCaseSlots(fresh).slots, 1);
  assert.equal(CASE_MILESTONES.length, CASE_SIZE);
  const veteran = {
    ...fresh,
    packsOpened: 30,
    collection: Object.fromEntries(ALL_CARDS.slice(0, 25).map((card) => [card.id, 1])),
  };
  assert.equal(getCaseSlots(veteran).slots, 6);
});

test("displayed entries require ownership and dedupe", () => {
  const card = findCard("Coinbud");
  const state = {
    ...createInitialState(0),
    collection: { [card.id]: 1 },
    displayed: [{ id: card.id }, { id: card.id }, { id: "core-99" }, { id: findCard("Zeraph").id }],
  };
  const entries = getDisplayedEntries(state);
  assert.deepEqual(entries, [{ id: card.id }]);
  assert.equal(getCardDef(card.id)?.kind, "commonCashBonus");
  assert.equal(getCard("core-99"), null);
});
