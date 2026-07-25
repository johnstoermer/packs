import { RARITIES, SETS, formatNumber, getCard, getSet } from "./gameData.js";

export const CASE_SIZE = 6;

// ---------------------------------------------------------------------------
// Verb engine card definitions (see docs/ENGINE_SPEC.md).
//
// Kings introduce verbs; supports modify them. A verb is inert until its King
// is displayed. Card text is generated in player-facing language only.
//
// Definition grammar (one per card):
//   { king: <verb> }                                — a King card
//   { on: <trigger>, ...payoff }                    — a trigger support
//   { mod: <knob>, v: n }                           — a bias/scaling support
//   { capstone: {...} }                             — late-set cross-engine card
//   { prestige: true }                              — the Nameless
//
// Triggers: commonReveal, uncommonReveal, rareReveal, epicReveal, anyReveal,
//   markedReveal, dupReveal, newReveal, dupSold, coinsEarned (every: n),
//   packOpened, setCompleted, fusion, mysteryOpened, packsOpened (every: n)
// Payoffs: coins (n = multiple of the revealed card's sell value, or flat
//   for non-reveal triggers), salvage, salvageChance (pct), discover,
//   mark, echoBoost
// Knobs: packSize, dupBias, fractureChance, fractureDepth, fusionDepth,
//   markExtraChance, markBiasHigh, markSpread, mimicBiasHigh, mimicBiasMarked,
//   transmuteChance, transmuteUp, echoCommonBoost, echoRareBoost,
//   mysterySize, mysteryFuture, salvageBoost, discoverBoost
// ---------------------------------------------------------------------------

export const KINGS = {
  commonEcho: {
    name: "Common Echo",
    text: "Common cards you reveal Echo: their reveal effects happen one additional time.",
  },
  mark: {
    name: "Mark",
    text: "Every pack you open contains one Marked card. Marks are visible before you reveal.",
  },
  salvage: {
    name: "Salvage",
    text: "Whenever you Salvage, a Mystery Pack bursts open with cards from every set you've unlocked — and a slim chance of one you haven't.",
  },
  mimic: {
    name: "Mimic",
    text: "When a pack is opened, one unrevealed card becomes a copy of another unrevealed card.",
  },
  rareEcho: {
    name: "Rare Echo",
    text: "Rare-or-better cards you reveal Echo: their reveal effects happen one additional time.",
  },
  fusion: {
    name: "Fusion",
    text: "After a pack is fully revealed, pairs of same-rarity cards fuse into one card of the next rarity — which reveals again.",
  },
  transmute: {
    name: "Transmute",
    text: "When you reveal a card, one unrevealed card may visibly Transmute toward that card's rarity.",
  },
  fracture: {
    name: "Fracture",
    text: "Packs you open may Fracture, spilling a second pack into the same reveal.",
  },
  catalyst: {
    name: "Catalyst",
    text: "When an unrevealed card gains a Mark, a copy, or a Transmute, that property may spread to another unrevealed card.",
  },
  blueprint: {
    name: "Blueprint",
    text: "Blueprint acts as an exact copy of the card in display slot 1.",
  },
  relay: {
    name: "Relay",
    text: "Whenever a displayed card triggers, the displayed card immediately to its right also triggers, if able.",
  },
  autopilot: {
    name: "Autopilot",
    text: "Whenever you would Discover, an option is chosen automatically — and automatic choices are enhanced.",
  },
};

// Set id -> King verb, assigned to each set's chase card (card 12).
export const SET_KINGS = {
  corner: "commonEcho",
  circuit: "mark",
  frontier: "salvage",
  abyss: "mimic",
  crown: "rareEcho",
  verdant: "fusion",
  polar: "transmute",
  ember: "fracture",
  cloud: "catalyst",
  glass: "blueprint",
  harbor: "relay",
  orchard: "autopilot",
};

export const DISCOVER_POOL = [
  { id: "insight", name: "Insight", text: "Your next Mark gains one additional Mark." },
  { id: "resonance", name: "Resonance", text: "Your next Echo triggers one additional time." },
  { id: "catalyst", name: "Catalyst", text: "Your next Fusion upgrades one additional rarity." },
  { id: "reflection", name: "Reflection", text: "Your next Transmute affects one additional card." },
  { id: "acceleration", name: "Acceleration", text: "Your next Salvage triggers one additional time." },
];

// Support definitions per set, cards 1..11 (card 12 is the King or capstone).
// Each set leans toward its King's verb while cross-pollinating neighbors.
const S = {
  corner: [
    { on: "commonReveal", coins: 1 },
    { on: "commonReveal", coinsFlat: 2 },
    { on: "dupReveal", coins: 1 },
    { on: "newReveal", coinsFlat: 3 },
    { on: "coinsEarned", every: 100, do: "salvage" },
    { on: "anyReveal", coinsChance: 25, coins: 2 },
    { mod: "echoCommonBoost", v: 15 },
    { on: "packsOpened", every: 30, do: "discover" },
    { mod: "packSize", v: 1 },
    { on: "commonReveal", echoBoost: 10 },
    { on: "setCompleted", coinsFlat: 250 },
  ],
  circuit: [
    { mod: "markExtraChance", v: 20 },
    { on: "markedReveal", coins: 3 },
    { mod: "markBiasHigh", v: 1 },
    { on: "markedReveal", spreadMark: 35 },
    { on: "markedReveal", coinsFlat: 12 },
    { mod: "markSpread", v: 15 },
    { on: "packOpened", markChance: 15 },
    { on: "markedReveal", do: "discover", chance: 20 },
    { mod: "echoCommonBoost", v: 20 },
    { on: "uncommonReveal", coins: 2 },
    { on: "markedReveal", echoBoost: 25 },
  ],
  frontier: [
    { on: "dupSold", salvageChance: 1.5 },
    { on: "coinsEarned", every: 250, do: "salvage" },
    { on: "dupReveal", coins: 2 },
    { mod: "mysterySize", v: 1 },
    { on: "setCompleted", do: "salvage" },
    { on: "dupSold", coinsFlat: 1 },
    { mod: "salvageBoost", v: 1 },
    { on: "mysteryOpened", coinsFlat: 40 },
    { mod: "mysteryFuture", v: 1 },
    { on: "rareReveal", coins: 3 },
    { on: "dupSold", salvageChance: 2.5 },
  ],
  abyss: [
    { mod: "mimicBiasHigh", v: 1 },
    { on: "dupReveal", coins: 3 },
    { mod: "dupBias", v: 12 },
    { mod: "mimicBiasMarked", v: 1 },
    { on: "anyReveal", coinsChance: 15, coins: 3 },
    { mod: "packSize", v: 1 },
    { on: "epicReveal", coins: 4 },
    { mod: "dupBias", v: 20 },
    { on: "packsOpened", every: 25, do: "discover" },
    { on: "dupReveal", echoBoost: 20 },
    { mod: "mysterySize", v: 2 },
  ],
  crown: [
    { on: "rareReveal", coins: 4 },
    { mod: "echoRareBoost", v: 15 },
    { on: "epicReveal", coinsFlat: 60 },
    { on: "rareReveal", echoBoost: 20 },
    { mod: "markBiasHigh", v: 1 },
    { on: "rareReveal", do: "discover", chance: 25 },
    { mod: "echoRareBoost", v: 25 },
    { on: "epicReveal", spreadMark: 50 },
    { on: "anyReveal", coins: 1 },
    { on: "setCompleted", coinsFlat: 900 },
    { on: "markedReveal", coins: 5 },
  ],
  verdant: [
    { mod: "packSize", v: 1 },
    { mod: "dupBias", v: 15 },
    { on: "fusion", coinsFlat: 25 },
    { mod: "fusionDepth", v: 1 },
    { on: "fusion", do: "salvage", chance: 30 },
    { mod: "dupBias", v: 25 },
    { mod: "packSize", v: 2 },
    { on: "fusion", do: "discover", chance: 25 },
    { on: "fusion", echoBoost: 30 },
    { on: "dupReveal", coins: 4 },
    { mod: "fusionDepth", v: 1 },
  ],
  polar: [
    { mod: "transmuteChance", v: 15 },
    { on: "commonReveal", transmuteBoost: 10 },
    { mod: "transmuteUp", v: 1 },
    { mod: "transmuteChance", v: 25 },
    { on: "markedReveal", transmuteBoost: 25 },
    { on: "anyReveal", coins: 2 },
    { mod: "transmuteBiasMarked", v: 1 },
    { on: "rareReveal", transmuteBoost: 20 },
    { on: "packsOpened", every: 20, do: "discover" },
    { mod: "echoRareBoost", v: 20 },
    { on: "epicReveal", coins: 5 },
  ],
  ember: [
    { mod: "fractureChance", v: 8 },
    { on: "packOpened", coinsFlat: 15 },
    { mod: "fractureChance", v: 12 },
    { mod: "fractureDepth", v: 1 },
    { on: "anyReveal", coinsChance: 20, coins: 3 },
    { mod: "packSize", v: 2 },
    { mod: "fractureChance", v: 16 },
    { on: "packOpened", markChance: 30 },
    { on: "fusion", coinsFlat: 120 },
    { mod: "fractureDepth", v: 1 },
    { on: "dupSold", salvageChance: 3.5 },
  ],
  cloud: [
    { mod: "markSpread", v: 25 },
    { on: "markedReveal", coins: 6 },
    { mod: "catalystChance", v: 20 },
    { on: "anyReveal", coins: 3 },
    { mod: "catalystChance", v: 30 },
    { on: "markedReveal", spreadMark: 60 },
    { mod: "mimicBiasMarked", v: 1 },
    { on: "coinsEarned", every: 2_000, do: "salvage" },
    { mod: "markExtraChance", v: 35 },
    { on: "mysteryOpened", coinsFlat: 300 },
    { mod: "transmuteChance", v: 30 },
  ],
  glass: [
    { on: "anyReveal", coins: 4 },
    { mod: "dupBias", v: 30 },
    { on: "newReveal", coinsFlat: 150 },
    { mod: "packSize", v: 2 },
    { on: "dupReveal", coins: 8 },
    { mod: "mimicBiasHigh", v: 1 },
    { on: "epicReveal", echoBoost: 40 },
    { mod: "fusionDepth", v: 1 },
    { on: "packsOpened", every: 15, do: "discover" },
    { on: "markedReveal", coins: 10 },
    { mod: "mysterySize", v: 3 },
  ],
  harbor: [
    { on: "anyReveal", coins: 5 },
    { on: "coinsEarned", every: 5_000, do: "salvage" },
    { on: "mysteryOpened", do: "discover", chance: 35 },
    { mod: "mysteryFuture", v: 2 },
    { on: "dupSold", salvageChance: 5 },
    { mod: "salvageBoost", v: 1 },
    { on: "setCompleted", do: "salvage" },
    { mod: "mysterySize", v: 4 },
    { on: "rareReveal", coins: 8 },
    { on: "mysteryOpened", coinsFlat: 1_200 },
    { mod: "markExtraChance", v: 50 },
  ],
  orchard: [
    { on: "packsOpened", every: 10, do: "discover" },
    { mod: "discoverBoost", v: 1 },
    { on: "epicReveal", do: "discover", chance: 40 },
    { on: "anyReveal", coins: 6 },
    { mod: "discoverBoost", v: 1 },
    { on: "setCompleted", do: "discover" },
    { on: "fusion", do: "discover", chance: 40 },
    { mod: "packSize", v: 3 },
    { on: "mysteryOpened", do: "discover", chance: 50 },
    { on: "dupReveal", coins: 12 },
    { mod: "salvageBoost", v: 2 },
  ],
  hollow: [
    { on: "anyReveal", coins: 8 },
    { on: "commonReveal", coinsFlat: 900 },
    { mod: "dupBias", v: 40 },
    { on: "dupReveal", coins: 18 },
    { mod: "packSize", v: 3 },
    { on: "fusion", coinsFlat: 4_000 },
    { mod: "fusionDepth", v: 2 },
    { on: "epicReveal", coins: 20 },
    { mod: "fractureChance", v: 20 },
    { on: "setCompleted", coinsFlat: 60_000 },
    { mod: "mysterySize", v: 5 },
  ],
  prism: [
    { mod: "echoCommonBoost", v: 40 },
    { mod: "echoRareBoost", v: 40 },
    { on: "anyReveal", coins: 12 },
    { on: "markedReveal", echoBoost: 60 },
    { mod: "transmuteChance", v: 45 },
    { on: "rareReveal", coins: 25 },
    { mod: "markExtraChance", v: 70 },
    { on: "epicReveal", do: "discover", chance: 60 },
    { mod: "transmuteUp", v: 2 },
    { on: "fusion", echoBoost: 80 },
    { mod: "catalystChance", v: 50 },
  ],
  signal: [
    { on: "coinsEarned", every: 60_000, do: "salvage" },
    { on: "anyReveal", coins: 16 },
    { on: "dupSold", salvageChance: 8 },
    { mod: "salvageBoost", v: 2 },
    { on: "mysteryOpened", do: "salvage", chance: 25 },
    { mod: "mysteryFuture", v: 3 },
    { on: "mysteryOpened", coinsFlat: 30_000 },
    { mod: "mysterySize", v: 6 },
    { on: "setCompleted", do: "salvage" },
    { on: "rareReveal", coins: 35 },
    { mod: "discoverBoost", v: 2 },
  ],
  observatory: [
    { on: "anyReveal", coins: 22 },
    { mod: "markBiasHigh", v: 2 },
    { on: "markedReveal", coins: 45 },
    { mod: "transmuteChance", v: 60 },
    { on: "packsOpened", every: 8, do: "discover" },
    { mod: "markSpread", v: 45 },
    { on: "epicReveal", coins: 40 },
    { mod: "echoRareBoost", v: 60 },
    { on: "markedReveal", spreadMark: 85 },
    { mod: "mimicBiasHigh", v: 2 },
    { on: "markedReveal", do: "discover", chance: 45 },
  ],
  foundry: [
    { mod: "dupBias", v: 55 },
    { on: "fusion", coinsFlat: 220_000 },
    { mod: "fusionDepth", v: 2 },
    { on: "dupReveal", coins: 45 },
    { mod: "packSize", v: 4 },
    { on: "fusion", do: "salvage" },
    { mod: "fractureChance", v: 28 },
    { on: "anyReveal", coins: 30 },
    { mod: "fractureDepth", v: 2 },
    { on: "fusion", do: "discover", chance: 60 },
    { on: "setCompleted", coinsFlat: 2_500_000 },
  ],
  apocalypse: [
    { on: "anyReveal", coins: 40 },
    { on: "commonReveal", coinsFlat: 200_000 },
    { on: "coinsEarned", every: 2_000_000, do: "salvage" },
    { on: "dupSold", salvageChance: 12 },
    { on: "anyReveal", coinsChance: 30, coins: 90 },
    { mod: "mysterySize", v: 8 },
    { on: "mysteryOpened", coinsFlat: 1_500_000 },
    { mod: "salvageBoost", v: 3 },
    { on: "epicReveal", coins: 80 },
    { mod: "dupBias", v: 70 },
    { on: "setCompleted", coinsFlat: 40_000_000 },
  ],
  lastlight: [
    { mod: "echoCommonBoost", v: 100 },
    { mod: "echoRareBoost", v: 100 },
    { on: "anyReveal", coins: 60 },
    { mod: "markExtraChance", v: 100 },
    { mod: "transmuteChance", v: 100 },
    { mod: "catalystChance", v: 100 },
    { mod: "fractureChance", v: 40 },
    { mod: "fusionDepth", v: 3 },
    { mod: "mysterySize", v: 10 },
    { mod: "discoverBoost", v: 3 },
    { mod: "salvageBoost", v: 4 },
  ],
  unwritten: [
    { on: "anyReveal", coins: 90 },
    { on: "packsOpened", every: 5, do: "discover" },
    { mod: "mysteryFuture", v: 5 },
    { on: "dupSold", salvageChance: 20 },
    { mod: "packSize", v: 5 },
    { on: "fusion", do: "salvage" },
    { mod: "fusionDepth", v: 4 },
    { on: "mysteryOpened", do: "salvage", chance: 40 },
    { on: "anyReveal", echoBoost: 100 },
    { mod: "fractureChance", v: 50 },
    { on: "setCompleted", do: "discover" },
  ],
};

// Cross-engine capstones for late sets whose chase card is not a King.
const CAPSTONES = {
  hollow: { on: "fusion", do: "salvage", note: "Every Fusion also Salvages." },
  prism: { mod: "echoAllBoost", v: 50, note: "All Echo chances are 50% higher." },
  signal: { mod: "salvageBoost", v: 5, note: "Salvage triggers create one additional Mystery Pack." },
  observatory: { mod: "markEveryPack", v: 1, note: "Packs contain one additional Marked card." },
  foundry: { mod: "fusionTwice", v: 1, note: "Fusion chains run one full extra pass." },
  apocalypse: { on: "mysteryOpened", do: "salvage", chance: 50, note: "Mystery Packs may Salvage again." },
  lastlight: { mod: "discoverEnhance", v: 1, note: "Your Discover choices are always enhanced." },
};

export const CARD_DEFS = Object.fromEntries(SETS.flatMap((set) => {
  const supports = S[set.id] || [];
  return set.cards.map((card, index) => {
    if (index === 11) {
      if (set.id === "unwritten") return [card.id, { prestige: true }];
      const kingVerb = SET_KINGS[set.id];
      if (kingVerb) return [card.id, { king: kingVerb }];
      return [card.id, { capstone: true, ...CAPSTONES[set.id] }];
    }
    return [card.id, { support: true, ...(supports[index] || { on: "anyReveal", coins: 1 }) }];
  });
}));

export function getCardDef(cardId) {
  return CARD_DEFS[cardId] || null;
}

const TRIGGER_LABEL = {
  commonReveal: "you reveal a Common",
  uncommonReveal: "you reveal an Uncommon",
  rareReveal: "you reveal a Rare or better",
  epicReveal: "you reveal an Epic or better",
  anyReveal: "you reveal a card",
  markedReveal: "you reveal a Marked card",
  dupReveal: "you reveal a duplicate",
  newReveal: "you reveal a new card",
  dupSold: "a duplicate is sold",
  packOpened: "you open a pack",
  setCompleted: "you complete a set",
  fusion: "cards Fuse",
  mysteryOpened: "a Mystery Pack opens",
};

const MOD_TEXT = {
  packSize: (v) => `Packs you open contain ${v} additional card${v > 1 ? "s" : ""}.`,
  dupBias: (v) => `Cards in your packs are ${v}% more likely to be duplicates.`,
  fractureChance: (v) => `Packs are ${v}% more likely to Fracture.`,
  fractureDepth: (v) => `Fractured packs can Fracture ${v} additional time${v > 1 ? "s" : ""}.`,
  fusionDepth: (v) => `Fusions can climb ${v} additional rarity step${v > 1 ? "s" : ""}.`,
  markExtraChance: (v) => `Packs have a ${v}% chance to contain an additional Marked card.`,
  markBiasHigh: () => "Marks prefer the highest-rarity card in the pack.",
  markSpread: (v) => `Revealed Marks are ${v}% more likely to spread to an unrevealed card.`,
  mimicBiasHigh: () => "Copies prefer the highest-rarity card in the pack.",
  mimicBiasMarked: () => "Copies prefer Marked cards.",
  transmuteChance: (v) => `Transmutes are ${v}% more likely to happen.`,
  transmuteUp: (v) => `Transmutes climb ${v} additional rarity step${v > 1 ? "s" : ""} upward.`,
  transmuteBiasMarked: () => "Transmutes prefer Marked cards.",
  echoCommonBoost: (v) => `Common reveals are ${v}% more likely to Echo.`,
  echoRareBoost: (v) => `Rare-or-better reveals are ${v}% more likely to Echo.`,
  echoAllBoost: (v) => `All Echo chances are ${v}% higher.`,
  catalystChance: (v) => `Properties are ${v}% more likely to spread between unrevealed cards.`,
  mysterySize: (v) => `Mystery Packs contain ${v} additional card${v > 1 ? "s" : ""}.`,
  mysteryFuture: (v) => `Mystery Packs are ${v}x as likely to hold a card from a set you haven't unlocked.`,
  salvageBoost: (v) => `Each Salvage creates ${v} additional Mystery Pack${v > 1 ? "s" : ""}.`,
  discoverBoost: (v) => `When you Discover, you may keep ${v} additional option${v > 1 ? "s" : ""}.`,
  markEveryPack: () => "Packs contain one additional Marked card.",
  fusionTwice: () => "After Fusions settle, the chain runs one full extra pass.",
  discoverEnhance: () => "Your Discover choices are always enhanced.",
};

export function describeCard(cardId) {
  const def = getCardDef(cardId);
  if (!def) return "";
  if (def.prestige) {
    return "Completing every set awakens this card. It unlocks REWRITE — begin again, permanently inscribed.";
  }
  if (def.king) return KINGS[def.king].text;
  if (def.capstone && def.note) return def.note;
  if (def.mod) return MOD_TEXT[def.mod] ? MOD_TEXT[def.mod](def.v) : "";
  if (def.on) {
    const when = TRIGGER_LABEL[def.on] || def.on;
    const parts = [];
    if (def.every) {
      const noun = def.on === "coinsEarned" ? `${formatNumber(def.every)} coins you earn` : `${def.every} packs you open`;
      const act = def.do === "salvage" ? "Salvage" : "Discover";
      return `Every ${noun}, ${act}.`;
    }
    if (def.coins) parts.push(`gain ${def.coins}x that card's sell value`);
    if (def.coinsFlat) parts.push(`gain ${formatNumber(def.coinsFlat)} coins`);
    if (def.coinsChance) parts.splice(0, parts.length, `${def.coinsChance}% chance to gain ${def.coins}x that card's sell value`);
    if (def.salvageChance) parts.push(`${def.salvageChance}% chance to Salvage`);
    if (def.do === "salvage") parts.push(def.chance ? `${def.chance}% chance to Salvage` : "Salvage");
    if (def.do === "discover") parts.push(def.chance ? `${def.chance}% chance to Discover` : "Discover");
    if (def.spreadMark) parts.push(`${def.spreadMark}% chance its Mark spreads to an unrevealed card`);
    if (def.markChance) parts.push(`${def.markChance}% chance to Mark an additional card`);
    if (def.echoBoost) parts.push(`it is ${def.echoBoost}% more likely to Echo`);
    if (def.transmuteBoost) parts.push(`Transmute is ${def.transmuteBoost}% more likely`);
    return `When ${when}: ${parts.join(", ")}.`;
  }
  return "";
}

export function isKingCard(cardId) {
  return !!getCardDef(cardId)?.king;
}

export function getDisplayedEntries(state) {
  const seen = new Set();
  return (Array.isArray(state.displayed) ? state.displayed : [])
    .filter((entry) => {
      if (!entry || typeof entry.id !== "string" || seen.has(entry.id)) return false;
      if (!getCardDef(entry.id)) return false;
      if ((state.collection?.[entry.id] || 0) <= 0) return false;
      seen.add(entry.id);
      return true;
    })
    .slice(0, CASE_SIZE);
}

// Aggregates the displayed cards into engine capabilities. Blueprint counts
// as a second copy of slot 1. A verb's supports are inert without its King.
export function getEngine(state) {
  const entries = getDisplayedEntries(state);
  const slots = entries.map((entry) => entry.id);
  const defs = [];
  for (let index = 0; index < slots.length; index += 1) {
    let def = getCardDef(slots[index]);
    if (def?.king === "blueprint" && index !== 0 && slots[0]) {
      const first = getCardDef(slots[0]);
      if (first && !first.prestige) def = first;
    }
    defs.push({ slot: index, id: slots[index], def });
  }

  const kings = new Set(defs.map(({ def }) => def?.king).filter(Boolean));
  const engine = {
    slots,
    kings,
    packSize: 0,
    dupBias: 0,
    fractureChance: 0,
    fractureDepth: 1,
    fusionDepth: 1,
    fusionTwice: false,
    markExtraChance: 0,
    markEveryPack: 0,
    markBiasHigh: 0,
    markSpread: 0,
    mimicBiasHigh: 0,
    mimicBiasMarked: 0,
    transmuteChance: 20,
    transmuteUp: 1,
    transmuteBiasMarked: 0,
    echoCommonChance: 100,
    echoRareChance: 100,
    echoAllBoost: 0,
    catalystChance: 25,
    mysterySize: 0,
    mysteryFuture: 1,
    salvagePacks: 1,
    discoverKeep: 1,
    discoverEnhance: false,
    reveal: [],       // {slot, id, def} trigger supports, in slot order
    thresholds: [],   // coinsEarned/packsOpened counters
    onDupSold: [],
    onPackOpened: [],
    onSetCompleted: [],
    onFusion: [],
    onMysteryOpened: [],
  };

  for (const item of defs) {
    const def = item.def;
    if (!def || def.prestige) continue;
    if (def.mod) {
      switch (def.mod) {
        case "packSize": engine.packSize += def.v; break;
        case "dupBias": engine.dupBias += def.v; break;
        case "fractureChance": engine.fractureChance += def.v; break;
        case "fractureDepth": engine.fractureDepth += def.v; break;
        case "fusionDepth": engine.fusionDepth += def.v; break;
        case "fusionTwice": engine.fusionTwice = true; break;
        case "markExtraChance": engine.markExtraChance += def.v; break;
        case "markEveryPack": engine.markEveryPack += def.v; break;
        case "markBiasHigh": engine.markBiasHigh += def.v; break;
        case "markSpread": engine.markSpread += def.v; break;
        case "mimicBiasHigh": engine.mimicBiasHigh += def.v; break;
        case "mimicBiasMarked": engine.mimicBiasMarked += def.v; break;
        case "transmuteChance": engine.transmuteChance += def.v; break;
        case "transmuteUp": engine.transmuteUp += def.v; break;
        case "transmuteBiasMarked": engine.transmuteBiasMarked += def.v; break;
        case "echoCommonBoost": engine.echoCommonChance += def.v; break;
        case "echoRareBoost": engine.echoRareChance += def.v; break;
        case "echoAllBoost": engine.echoAllBoost += def.v; break;
        case "catalystChance": engine.catalystChance += def.v; break;
        case "mysterySize": engine.mysterySize += def.v; break;
        case "mysteryFuture": engine.mysteryFuture *= Math.max(1, def.v); break;
        case "salvageBoost": engine.salvagePacks += def.v; break;
        case "discoverBoost": engine.discoverKeep += def.v; break;
        case "discoverEnhance": engine.discoverEnhance = true; break;
        default: break;
      }
      continue;
    }
    if (def.on) {
      const record = { slot: item.slot, id: item.id, def };
      if (def.on === "coinsEarned" || def.on === "packsOpened") engine.thresholds.push(record);
      else if (def.on === "dupSold") engine.onDupSold.push(record);
      else if (def.on === "packOpened") engine.onPackOpened.push(record);
      else if (def.on === "setCompleted") engine.onSetCompleted.push(record);
      else if (def.on === "fusion") engine.onFusion.push(record);
      else if (def.on === "mysteryOpened") engine.onMysteryOpened.push(record);
      else engine.reveal.push(record);
    }
  }
  return engine;
}

export function revealTriggerMatches(def, pull) {
  const order = RARITIES[pull.rarity].order;
  switch (def.on) {
    case "commonReveal": return pull.rarity === "common";
    case "uncommonReveal": return pull.rarity === "uncommon";
    case "rareReveal": return order >= RARITIES.rare.order;
    case "epicReveal": return order >= RARITIES.epic.order;
    case "anyReveal": return true;
    case "markedReveal": return !!pull.marked;
    case "dupReveal": return !pull.isNew;
    case "newReveal": return !!pull.isNew;
    default: return false;
  }
}

export const CASE_MILESTONES = [
  { slot: 1, label: "Open the shop", met: () => true },
  {
    slot: 2,
    label: "Finish any set",
    met: (state) => SETS.some((set) => set.cards.every((card) => (state.collection?.[card.id] || 0) > 0)),
  },
  { slot: 3, label: "Open 150 packs", met: (state) => (state.packsOpened || 0) >= 150 },
  {
    slot: 4,
    label: "Finish 4 sets",
    met: (state) => SETS.filter((set) => set.cards.every((card) => (state.collection?.[card.id] || 0) > 0)).length >= 4,
  },
  {
    slot: 5,
    label: "Pull a Mythic or better",
    met: (state) => Object.keys(state.collection || {}).some((id) => {
      const card = getCard(id);
      return card && (state.collection[id] || 0) > 0 && RARITIES[card.rarity].order >= RARITIES.mythic.order;
    }),
  },
  {
    slot: 6,
    label: "Finish 8 sets",
    met: (state) => SETS.filter((set) => set.cards.every((card) => (state.collection?.[card.id] || 0) > 0)).length >= 8,
  },
];

export function getCaseSlots(state) {
  const milestones = CASE_MILESTONES.map((milestone) => ({
    slot: milestone.slot,
    label: milestone.label,
    met: milestone.met(state),
  }));
  return {
    slots: milestones.filter((milestone) => milestone.met).length,
    milestones,
  };
}
