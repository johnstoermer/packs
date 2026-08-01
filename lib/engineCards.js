// PACKWORKS display-case engine definitions.
//
// Twenty cards in the Packworks Core set carry printed effects. A displayed
// card's effect is live only while a pack is open; every effect resolves
// through the opening's action queue in lib/gameLogic.js. This module owns:
//
//   - EFFECTS: the mechanical definition for each effect id
//   - EFFECT_RULES: the player-facing rules text for each effect id
//   - getEngine(state): the aggregate of the (up to six) displayed cards
//   - getCaseSlots / CASE_MILESTONES: display case slot unlocks
//
// Definition grammar — exactly one of:
//   { on: "reveal" | "packOpen" | "salvage" | "fuse", kind, ... }  triggered
//   { passive: <knob>, v? }                                        always-on
//
// Mimistar's `copyRight` passive is resolved inside getEngine: its def
// becomes an exact copy of the resolved def one slot to its right.

import { ALL_CARDS, RARITIES, getCard } from "./gameData.js";

export const CASE_SIZE = 6;
export const BASE_FOIL_CHANCE = 0.05;

export const EFFECTS = {
  salvageChance: { on: "reveal", kind: "salvageChance", chance: 0.25 },
  commonScrapDouble: { passive: "commonScrapDouble" },
  rerollCommon: { on: "reveal", kind: "rerollCommon", cost: 1 },
  extraCommon: { on: "reveal", kind: "extraCommon", chance: 0.25, cost: 1 },
  noCashDoubleScrap: { passive: "noCashDoubleScrap" },
  packOpenRarePlus: { on: "packOpen", kind: "rarePlusPack" },
  packOpenAddCards: { on: "packOpen", kind: "addCards", cost: 10, count: 3 },
  firstRevealAll: { on: "reveal", kind: "firstRevealAll" },
  commonCashBonus: { on: "reveal", kind: "commonCashBonus" },
  salvagePackBurst: { on: "salvage", kind: "packBurst", cost: 20 },
  revealTwice: { passive: "revealTwice" },
  copyRight: { passive: "copyRight" },
  fuseSameRarity: { on: "reveal", kind: "fuseSameRarity" },
  fuseJump: { passive: "fuseJump", v: 0.05 },
  fuseSalvage: { on: "fuse", kind: "fuseSalvage" },
  fuseTriggerRight: { on: "fuse", kind: "triggerRight", chance: 0.5 },
  foilChance: { passive: "foilChance", v: 0.05 },
  foilFuseLegendary: { passive: "foilFuseLegendary" },
  salvageAddCard: { on: "salvage", kind: "salvageAddCard" },
  firstSlotEcho: { passive: "firstSlotEcho", v: 0.05 },
};

const EFFECT_RULES = {
  salvageChance: { eyebrow: "ON REVEAL", title: "Scrap Roll", text: "On Reveal: 25% chance to Salvage." },
  commonScrapDouble: { eyebrow: "RULE", title: "Clean Cuts", text: "Gain double Scrap when you Salvage Common cards." },
  rerollCommon: { eyebrow: "ON REVEAL", title: "Second Print", text: "On Reveal: If the card is Common, spend 1 Scrap to reroll the card once." },
  extraCommon: { eyebrow: "ON REVEAL", title: "Small Bonus", text: "On Reveal: 25% chance to spend 1 Scrap to Reveal an additional Common card." },
  noCashDoubleScrap: { eyebrow: "RULE", title: "Scrap Economy", text: "Cards give no Cash, gain double Scrap when you Salvage." },
  packOpenRarePlus: { eyebrow: "ON PACK OPEN", title: "The Good Shelf", text: "On Pack Open: Spend half of your Cash, the pack contains Rare or better cards." },
  packOpenAddCards: { eyebrow: "ON PACK OPEN", title: "Overstuffed", text: "On Pack Open: Spend 10 Scrap to add 3 cards to the pack." },
  firstRevealAll: { eyebrow: "ON REVEAL", title: "Full Preview", text: "On Reveal: If this is the first card in the pack, Reveal all other cards in the pack." },
  commonCashBonus: { eyebrow: "ON REVEAL", title: "Small Change", text: "On Reveal: If the card is Common, gain double Cash for it." },
  salvagePackBurst: { eyebrow: "ON SALVAGE", title: "Reclaimed Pack", text: "On Salvage: Spend 20 Scrap to open a pack." },
  revealTwice: { eyebrow: "RULE", title: "Twice Told", text: "Reveal triggers twice." },
  copyRight: { eyebrow: "RULE", title: "Perfect Mimic", text: "This card copies the effect of the card to its right." },
  fuseSameRarity: { eyebrow: "ON REVEAL", title: "Pair Bond", text: "On Reveal: If there is a revealed card in the pack of the same rarity, Fuse them." },
  fuseJump: { eyebrow: "RULE", title: "Tier Leap", text: "Fusions have a 5% chance to jump a rarity tier." },
  fuseSalvage: { eyebrow: "ON FUSE", title: "Merger Teardown", text: "On Fuse: Salvage." },
  fuseTriggerRight: { eyebrow: "ON FUSE", title: "Chain Reaction", text: "On Fuse: 50% chance to trigger the card to the right." },
  foilChance: { eyebrow: "RULE", title: "Polish", text: "+5% Foil chance." },
  foilFuseLegendary: { eyebrow: "ON FUSE", title: "Mirror Press", text: "On Fuse: If both cards were foil, jump to the Legendary rarity." },
  salvageAddCard: { eyebrow: "ON SALVAGE", title: "Quality Sparks", text: "On Salvage: If the card is Rare or better, add an additional card to the pack." },
  firstSlotEcho: { eyebrow: "RULE", title: "Front Row Encore", text: "When the first card in the display case is triggered, 5% chance to trigger an additional time." },
};

export function getCardDef(cardId) {
  const card = getCard(cardId);
  if (!card || !card.effectId) return null;
  return EFFECTS[card.effectId] || null;
}

// ---------------------------------------------------------------------------
// Rules text rendering

export const CARD_KEYWORD_GLOSSARY = {
  Salvage: {
    tone: "scrap",
    reminder: "Tear up a revealed card: it leaves the pack and becomes Scrap based on its rarity.",
    aliases: ["salvage", "salvaged", "on salvage"],
  },
  Scrap: {
    tone: "scrap",
    reminder: "A resource banked between packs. Displayed cards spend it automatically when their effects fire.",
    aliases: ["scrap"],
  },
  Cash: {
    tone: "cash",
    reminder: "Every card revealed in a pack pays Cash based on its rarity. Foil cards pay double.",
    aliases: ["cash"],
  },
  Fuse: {
    tone: "fuse",
    reminder: "Two revealed cards of the same rarity merge into a new card of that rarity, revealed again.",
    aliases: ["fuse", "fusions", "fused", "on fuse"],
  },
  Foil: {
    tone: "foil",
    reminder: "Foil cards pay double Cash. Base foil odds are 5%.",
    aliases: ["foil"],
  },
  Reveal: {
    tone: "reveal",
    reminder: "Flip a face-down card in the open pack. Reveals resolve one at a time, in order.",
    aliases: ["reveal", "on reveal", "revealed"],
  },
  "Pack Open": {
    tone: "reveal",
    reminder: "Fires once, the moment a pack is opened.",
    aliases: ["on pack open", "pack open"],
  },
  Common: { tone: "rarity", reminder: "The 74% rarity. Pays 1 Cash.", aliases: ["common"] },
  Rare: { tone: "rarity", reminder: "The 20% rarity. Pays 4 Cash.", aliases: ["rare"] },
  Epic: { tone: "rarity", reminder: "The 5% rarity. Pays 15 Cash.", aliases: ["epic"] },
  Legendary: { tone: "rarity", reminder: "The 1% rarity. Pays 60 Cash.", aliases: ["legendary"] },
};

const KEYWORD_BY_ALIAS = new Map();
for (const [keyword, entry] of Object.entries(CARD_KEYWORD_GLOSSARY)) {
  for (const alias of entry.aliases) KEYWORD_BY_ALIAS.set(alias, keyword);
}

const RULE_TOKEN_PATTERN = new RegExp(
  `(On Pack Open|On Reveal|On Salvage|On Fuse|Pack Open|Salvage[d]?|Scrap|Cash|Fusions|Fused?|Foil|Reveal(?:ed)?|Common|Rare|Epic|Legendary|\\+?\\d+%|\\d+)`,
  "g",
);

export function tokenizeCardText(text) {
  if (!text) return [];
  return text.split(RULE_TOKEN_PATTERN).filter(Boolean).map((value) => {
    if (/^\+?\d/.test(value)) return { type: "number", value };
    const keyword = KEYWORD_BY_ALIAS.get(value.toLowerCase());
    return keyword
      ? { type: "keyword", value, keyword, tone: CARD_KEYWORD_GLOSSARY[keyword].tone }
      : { type: "text", value };
  });
}

export function getCardRules(cardId) {
  const card = getCard(cardId);
  if (!card || !card.effectId) return null;
  const rules = EFFECT_RULES[card.effectId];
  if (!rules) return null;
  const tokens = tokenizeCardText(rules.text);
  const keywords = [...new Set(tokens.filter((token) => token.type === "keyword").map((token) => token.keyword))];
  return {
    eyebrow: rules.eyebrow,
    title: rules.title,
    text: rules.text,
    tokens,
    keywords,
    reminders: keywords
      .filter((keyword) => CARD_KEYWORD_GLOSSARY[keyword])
      .map((keyword) => ({ keyword, reminder: CARD_KEYWORD_GLOSSARY[keyword].reminder })),
  };
}

// ---------------------------------------------------------------------------
// Display case

export function getDisplayedEntries(state) {
  const seen = new Set();
  const entries = [];
  for (const entry of state.displayed || []) {
    const id = entry && typeof entry === "object" ? entry.id : entry;
    if (!id || seen.has(id)) continue;
    const card = getCard(id);
    if (!card) continue;
    if (!((state.collection || {})[id] > 0)) continue;
    seen.add(id);
    entries.push({ id });
    if (entries.length >= CASE_SIZE) break;
  }
  return entries;
}

function uniqueCardCount(state) {
  return Object.values(state.collection || {}).filter((count) => count > 0).length;
}

export const CASE_MILESTONES = [
  { slot: 1, label: "Always open", met: () => true },
  { slot: 2, label: "Open 3 packs", met: (state) => (state.packsOpened || 0) >= 3 },
  { slot: 3, label: "Collect 10 different cards", met: (state) => uniqueCardCount(state) >= 10 },
  { slot: 4, label: "Open 12 packs", met: (state) => (state.packsOpened || 0) >= 12 },
  { slot: 5, label: "Collect 25 different cards", met: (state) => uniqueCardCount(state) >= 25 },
  { slot: 6, label: "Open 30 packs", met: (state) => (state.packsOpened || 0) >= 30 },
];

export function getCaseSlots(state) {
  if (state.adminMode) return { slots: CASE_SIZE, milestones: CASE_MILESTONES };
  let slots = 1;
  for (const milestone of CASE_MILESTONES) {
    if (milestone.met(state)) slots = Math.max(slots, milestone.slot);
  }
  return { slots, milestones: CASE_MILESTONES };
}

// ---------------------------------------------------------------------------
// Engine aggregation

export function getEngine(state) {
  const entries = getDisplayedEntries(state);
  const rawDefs = entries.map((entry) => getCardDef(entry.id));

  // Mimistar copies the resolved effect of the card to its right. Resolve
  // right-to-left so a copy of a copy settles; a copyRight card in the last
  // slot has nothing to copy and stays inert.
  const resolved = new Array(rawDefs.length).fill(null);
  for (let slot = rawDefs.length - 1; slot >= 0; slot -= 1) {
    const def = rawDefs[slot];
    if (def && def.passive === "copyRight") {
      resolved[slot] = slot + 1 < rawDefs.length ? resolved[slot + 1] : null;
    } else {
      resolved[slot] = def;
    }
  }

  const engine = {
    entries,
    defs: resolved,
    foilChance: BASE_FOIL_CHANCE,
    revealRepeats: 1,
    commonScrapDouble: false,
    noCash: false,
    doubleScrap: false,
    fuseJumpChance: 0,
    foilFuseLegendary: false,
    firstSlotEchoChance: 0,
    onReveal: [],
    onPackOpen: [],
    onSalvage: [],
    onFuse: [],
  };

  for (let slot = 0; slot < resolved.length; slot += 1) {
    const def = resolved[slot];
    if (!def) continue;
    const record = { slot, id: entries[slot].id, def };
    if (def.passive) {
      switch (def.passive) {
        case "foilChance": engine.foilChance += def.v; break;
        case "revealTwice": engine.revealRepeats += 1; break;
        case "commonScrapDouble": engine.commonScrapDouble = true; break;
        case "noCashDoubleScrap": engine.noCash = true; engine.doubleScrap = true; break;
        case "fuseJump": engine.fuseJumpChance += def.v; break;
        case "foilFuseLegendary": engine.foilFuseLegendary = true; break;
        case "firstSlotEcho": engine.firstSlotEchoChance += def.v; break;
        default: break;
      }
      continue;
    }
    switch (def.on) {
      case "reveal": engine.onReveal.push(record); break;
      case "packOpen": engine.onPackOpen.push(record); break;
      case "salvage": engine.onSalvage.push(record); break;
      case "fuse": engine.onFuse.push(record); break;
      default: break;
    }
  }

  return engine;
}

// Sanity check: every effect id printed on a card exists.
for (const card of ALL_CARDS) {
  if (card.effectId && !EFFECTS[card.effectId]) {
    throw new Error(`Card ${card.id} (${card.name}) names unknown effect ${card.effectId}`);
  }
  if (card.effectId && !EFFECT_RULES[card.effectId]) {
    throw new Error(`Card ${card.id} (${card.name}) has no rules text for ${card.effectId}`);
  }
}

// Rarity sanity: rules text quotes live payout numbers.
if (RARITIES.common.sellValue !== 1 || RARITIES.rare.sellValue !== 4
  || RARITIES.epic.sellValue !== 15 || RARITIES.legendary.sellValue !== 60) {
  throw new Error("Rarity payouts drifted from the glossary text in engineCards.js");
}
