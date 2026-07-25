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
// Reveal triggers: commonReveal, uncommonReveal, rareReveal, epicReveal,
//   anyReveal, markedReveal, dupReveal, newReveal, foilReveal, mimicReveal,
//   transmutedReveal, fusedReveal, mysteryReveal, signalLied, markedDupReveal,
//   displayedDupReveal, chaseReveal, firstReveal, lastReveal, dupStreak,
//   packFinishDups, packFinishNoRare
// Event triggers: dupSold (per duplicate), saleMade (per sale), packOpened,
//   setCompleted, fusion, mysteryOpened, fractured, discovered
// Watermark triggers (every: n, never timers): coinsEarned, packsOpened,
//   dupsRevealed, cardsRevealed, fusionsDone, mysteriesOpened
// Payoffs: coins (multiple of the trigger card's sell value), coinsFlat,
//   coinsChance, coinsPack (multiples of a loose pack's price), coinsPerSet,
//   salvageChance, do: salvage | discover | boon | packs |
//   fuseLift | salvageScaling | triggerAll (+ chance), spreadMark,
//   markChance, echoBoost, transmuteBoost
// Knobs: packSize, packSizeChance, packSizePerSets, dupBias, fractureChance,
//   fractureDepth, fractureMarked, fractureWild, fusionDepth, fusionSolo,
//   fusionCross, fusionFoil, markExtraChance, markBiasHigh, markSpread,
//   markTruth, mimicBiasHigh, mimicBiasMarked, mimicTwice, mimicPerfect,
//   transmuteChance, transmuteUp, transmuteBiasMarked, echoCommonBoost,
//   echoRareBoost, echoChain, catalystChance, mysterySize, mysteryFuture,
//   mysteryFloor, mysteryNewGuarantee, mysteryMarked, mysteryPity,
//   salvageBoost, salvageEcho, discoverBoost, discoverOptions,
//   discoverPersist, discoverConsolation,
//   thresholdDiscount, gradeBias, noFalseSignals, relayDepth, packEncore
// ---------------------------------------------------------------------------

export const KINGS = {
  commonEcho: {
    name: "Common Echo",
    text: "Common cards you reveal have a 25% chance to Echo — their reveal effects happen again. Echo chance past 100% causes additional Echoes.",
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
    text: "Rare-or-better cards you reveal have a 25% chance to Echo — their reveal effects happen again. Echo chance past 100% causes additional Echoes.",
  },
  fusion: {
    name: "Fusion",
    text: "After a pack is fully revealed, pairs of same-rarity cards fuse into one card of the next rarity — which reveals again.",
  },
  transmute: {
    name: "Transmute",
    text: "When you reveal a card, one unrevealed card may visibly Transmute toward that card's rarity. Transmute chance past 100% affects additional cards.",
  },
  fracture: {
    name: "Fracture",
    text: "Packs you open may Fracture, spilling a second pack into the same reveal.",
  },
  catalyst: {
    name: "Catalyst",
    text: "When an unrevealed card gains a Mark, a copy, or a Transmute, that property may spread to another unrevealed card. Spread chance past 100% can spread twice.",
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
// Every card's effect text must be unique across the whole pool; shared
// templates are held to at most three cards with strongly escalating numbers
// (enforced by tests/engine.test.mjs).
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
    { mod: "echoChain", v: 20 },
    { on: "uncommonReveal", coins: 2 },
    { on: "markedReveal", echoBoost: 25 },
  ],
  frontier: [
    { on: "dupSold", salvageChance: 1.5 },
    { on: "dupsRevealed", every: 25, do: "salvage" },
    { on: "dupReveal", do: "boon", boon: "acceleration", chance: 20 },
    { mod: "mysterySize", v: 1 },
    { on: "setCompleted", do: "salvage" },
    { on: "dupSold", coinsFlat: 1 },
    { mod: "salvageBoost", v: 1 },
    { on: "mysteryOpened", coinsFlat: 40 },
    { mod: "mysteryFloor", v: 1 },
    { on: "rareReveal", coins: 3 },
    { mod: "salvageEcho", v: 15 },
  ],
  abyss: [
    { mod: "mimicBiasHigh", v: 1 },
    { on: "mimicReveal", coins: 4 },
    { mod: "dupBias", v: 12 },
    { mod: "mimicBiasMarked", v: 1 },
    { on: "firstReveal", coins: 3 },
    { mod: "mimicTwice", v: 65 },
    { on: "epicReveal", coins: 4 },
    { mod: "packSizeChance", v: 30 },
    { on: "dupsRevealed", every: 40, do: "discover" },
    { on: "dupReveal", echoBoost: 20 },
    { on: "mysteryReveal", coins: 6 },
  ],
  crown: [
    { on: "rareReveal", do: "boon", boon: "resonance", chance: 30 },
    { mod: "echoRareBoost", v: 15 },
    { on: "epicReveal", coinsFlat: 60 },
    { on: "rareReveal", echoBoost: 20 },
    { on: "markedDupReveal", coins: 6 },
    { on: "rareReveal", do: "discover", chance: 25 },
    { on: "rareReveal", coinsPack: 1 },
    { on: "epicReveal", spreadMark: 50 },
    { on: "anyReveal", coins: 1 },
    { on: "setCompleted", coinsPerSet: 400 },
    { on: "chaseReveal", coins: 10 },
  ],
  verdant: [
    { on: "dupStreak", do: "discover" },
    { on: "fusedReveal", coins: 5 },
    { on: "fusion", coinsFlat: 25 },
    { mod: "fusionDepth", v: 1 },
    { on: "fusion", do: "salvage", chance: 30 },
    { on: "dupReveal", do: "fuseLift", chance: 20 },
    { mod: "fusionSolo", v: 25 },
    { on: "fusion", do: "boon", boon: "catalyst", chance: 35 },
    { on: "fusion", echoBoost: 30 },
    { mod: "fusionCross", v: 1 },
    { on: "fusionsDone", every: 12, do: "discover" },
  ],
  polar: [
    { mod: "transmuteChance", v: 15 },
    { on: "commonReveal", transmuteBoost: 10 },
    { mod: "transmuteUp", v: 1 },
    { on: "transmutedReveal", coins: 5 },
    { on: "markedReveal", transmuteBoost: 25 },
    { on: "signalLied", coins: 6 },
    { mod: "transmuteBiasMarked", v: 1 },
    { on: "rareReveal", transmuteBoost: 20 },
    { on: "transmutedReveal", do: "discover", chance: 40 },
    { mod: "noFalseSignals", v: 80 },
    { on: "epicReveal", do: "boon", boon: "reflection" },
  ],
  ember: [
    { mod: "fractureChance", v: 8 },
    { on: "packOpened", coinsFlat: 15 },
    { on: "fractured", coinsPack: 2 },
    { mod: "fractureDepth", v: 1 },
    { on: "packFinishNoRare", coinsPack: 1 },
    { mod: "fractureWild", v: 1 },
    { mod: "fractureChance", v: 16 },
    { mod: "fractureMarked", v: 70 },
    { on: "fusion", coins: 8 },
    { on: "fractured", do: "boon", boon: "insight" },
    { on: "fractured", do: "salvage", chance: 40 },
  ],
  cloud: [
    { on: "uncommonReveal", coinsFlat: 8 },
    { on: "markedReveal", do: "boon", boon: "insight", chance: 30 },
    { mod: "markSpread", v: 25 },
    { on: "foilReveal", coins: 8 },
    { mod: "catalystChance", v: 30 },
    { mod: "foilChance", v: 6 },
    { on: "mimicReveal", do: "discover", chance: 40 },
    { on: "foilReveal", do: "salvage", chance: 50 },
    { on: "setCompleted", do: "boon", boon: "insight" },
    { on: "mysteryOpened", coins: 5 },
    { mod: "thresholdDiscount", v: 20 },
  ],
  glass: [
    { on: "mimicReveal", echoBoost: 40 },
    { mod: "dupBias", v: 30 },
    { on: "newReveal", coinsFlat: 150 },
    { on: "packFinishDups", do: "discover" },
    { mod: "gradeBias", v: 60 },
    { on: "displayedDupReveal", coins: 10 },
    { on: "epicReveal", echoBoost: 40 },
    { on: "chaseReveal", do: "discover" },
    { mod: "discoverOptions", v: 1 },
    { on: "foilReveal", echoBoost: 60 },
    { on: "mysteryReveal", echoBoost: 50 },
  ],
  harbor: [
    { on: "lastReveal", coins: 4 },
    { on: "coinsEarned", every: 5_000, do: "salvage" },
    { on: "mysteryOpened", do: "discover", chance: 35 },
    { mod: "mysteryFuture", v: 2 },
    { on: "dupSold", salvageChance: 5 },
    { mod: "relayDepth", v: 1 },
    { mod: "mysteryNewGuarantee", v: 1 },
    { mod: "mysterySize", v: 4 },
    { on: "mysteryReveal", do: "boon", boon: "acceleration", chance: 30 },
    { on: "saleMade", do: "salvage", chance: 60 },
    { on: "packOpened", do: "boon", boon: "resonance", chance: 25 },
  ],
  orchard: [
    { on: "packsOpened", every: 10, do: "discover" },
    { mod: "discoverBoost", v: 1 },
    { on: "epicReveal", do: "discover", chance: 40 },
    { on: "discovered", coinsPack: 3 },
    { mod: "thresholdDiscount", v: 35 },
    { on: "setCompleted", do: "discover" },
    { mod: "discoverPersist", v: 30 },
    { on: "setCompleted", do: "packs", n: 3 },
    { mod: "mysteryMarked", v: 60 },
    { on: "fusedReveal", do: "discover", chance: 50 },
    { mod: "discoverConsolation", v: 75 },
  ],
  hollow: [
    { on: "commonReveal", do: "boon", boon: "resonance", chance: 15 },
    { on: "commonReveal", coinsPack: 1 },
    { mod: "echoChain", v: 35 },
    { on: "dupReveal", coins: 18 },
    { mod: "packEncore", v: 20, n: 3 },
    { on: "fusion", coinsPack: 4 },
    { mod: "fusionDepth", v: 2 },
    { on: "epicReveal", coinsPack: 3 },
    { on: "packFinishNoRare", do: "boon", boon: "resonance" },
    { on: "setCompleted", coinsFlat: 60_000 },
    { on: "mysteryOpened", do: "packs", n: 1 },
  ],
  prism: [
    { on: "foilReveal", do: "discover", chance: 45 },
    { mod: "foilChance", v: 10 },
    { on: "anyReveal", coins: 12 },
    { on: "markedReveal", echoBoost: 60 },
    { on: "transmutedReveal", echoBoost: 70 },
    { on: "epicReveal", do: "boon", boon: "insight" },
    { on: "cardsRevealed", every: 60, do: "discover" },
    { on: "epicReveal", echoBoost: 75 },
    { mod: "transmuteUp", v: 2 },
    { on: "fusion", do: "boon", boon: "resonance" },
    { mod: "catalystChance", v: 50 },
  ],
  signal: [
    { on: "signalLied", do: "discover", chance: 50 },
    { on: "lastReveal", do: "salvage", chance: 25 },
    { on: "saleMade", do: "boon", boon: "acceleration" },
    { on: "mysteriesOpened", every: 6, do: "salvage" },
    { on: "mysteryOpened", do: "salvage", chance: 25 },
    { mod: "mysteryPity", v: 10 },
    { mod: "salvageEcho", v: 35 },
    { on: "mysteryOpened", coins: 12 },
    { on: "setCompleted", do: "salvageScaling" },
    { on: "rareReveal", coins: 35 },
    { mod: "discoverOptions", v: 2 },
  ],
  observatory: [
    { on: "newReveal", do: "discover", chance: 35 },
    { mod: "markTruth", v: 90 },
    { on: "markedReveal", coins: 45 },
    { mod: "transmuteChance", v: 60 },
    { on: "packsOpened", every: 8, do: "discover" },
    { mod: "markSpread", v: 45 },
    { on: "firstReveal", do: "discover", chance: 30 },
    { mod: "echoRareBoost", v: 60 },
    { on: "markedReveal", spreadMark: 85 },
    { mod: "mimicPerfect", v: 80 },
    { on: "markedReveal", do: "discover", chance: 45 },
  ],
  foundry: [
    { on: "fusedReveal", echoBoost: 60 },
    { on: "fusion", do: "packs", n: 1, chance: 30 },
    { mod: "fusionFoil", v: 50 },
    { on: "fusedReveal", coins: 30 },
    { mod: "packSize", v: 4 },
    { on: "fusion", do: "salvage" },
    { on: "fractured", do: "fuseLift" },
    { on: "transmutedReveal", coins: 25 },
    { mod: "fractureDepth", v: 2 },
    { on: "fusion", do: "discover", chance: 60 },
    { on: "fusionsDone", every: 15, do: "salvage" },
  ],
  apocalypse: [
    { on: "packFinishNoRare", do: "salvage", chance: 60 },
    { on: "commonReveal", coinsFlat: 200_000 },
    { on: "coinsEarned", every: 2_000_000, do: "salvage" },
    { on: "dupSold", salvageChance: 12 },
    { on: "anyReveal", coinsChance: 30, coins: 90 },
    { on: "mysteryOpened", do: "boon", boon: "acceleration", chance: 50 },
    { on: "mysteryOpened", coinsFlat: 1_500_000 },
    { mod: "mysteryFloor", v: 2 },
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
    { mod: "fusionSolo", v: 60 },
    { mod: "mysterySize", v: 10 },
    { mod: "discoverBoost", v: 3 },
    { mod: "salvageBoost", v: 4 },
  ],
  unwritten: [
    { on: "newReveal", coins: 25 },
    { mod: "discoverPersist", v: 60 },
    { mod: "mysteryFuture", v: 5 },
    { on: "saleMade", do: "salvage" },
    { mod: "packSizePerSets", v: 5 },
    { on: "fusion", coins: 20 },
    { mod: "fusionDepth", v: 4 },
    { mod: "mysteryPity", v: 25 },
    { on: "anyReveal", echoBoost: 100 },
    { on: "fractured", do: "discover", chance: 50 },
    { on: "setCompleted", do: "triggerAll" },
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
  foilReveal: "you reveal a foil card",
  mimicReveal: "you reveal a copy",
  transmutedReveal: "you reveal a Transmuted card",
  fusedReveal: "you reveal a card born from Fusion",
  mysteryReveal: "you reveal a Mystery Pack card",
  signalLied: "a rarity signal lies to you",
  markedDupReveal: "you reveal a Marked duplicate",
  displayedDupReveal: "you reveal a duplicate of a displayed card",
  chaseReveal: "you reveal a set's chase card",
  firstReveal: "you reveal a pack's first card",
  lastReveal: "you reveal a pack's last card",
  dupStreak: "you reveal 3 duplicates in a row",
  packFinishDups: "a pack finishes with 4 or more duplicates",
  packFinishNoRare: "a pack finishes without a Rare or better",
  dupSold: "a duplicate is sold",
  saleMade: "you sell your duplicates",
  packOpened: "you open a pack",
  setCompleted: "you complete a set",
  fusion: "cards Fuse",
  mysteryOpened: "a Mystery Pack opens",
  fractured: "a pack Fractures",
  discovered: "you Discover",
};

const EVERY_LABEL = {
  coinsEarned: (n) => `${formatNumber(n)} coins you earn`,
  packsOpened: (n) => `${n} packs you open`,
  dupsRevealed: (n) => `${n} duplicates you reveal`,
  cardsRevealed: (n) => `${n} cards you reveal`,
  fusionsDone: (n) => `${n} Fusions`,
  mysteriesOpened: (n) => `${n} Mystery Packs opened`,
};

const MOD_TEXT = {
  packSize: (v) => `Packs you open contain ${v} additional card${v > 1 ? "s" : ""}.`,
  packSizeChance: (v) => `Packs have a ${v}% chance to contain an additional card.`,
  packSizePerSets: (v) => `Packs contain one additional card for every ${v} sets you've completed.`,
  dupBias: (v) => `Cards in your packs are ${v}% more likely to be duplicates.`,
  fractureChance: (v) => `Packs are ${v}% more likely to Fracture.`,
  fractureDepth: (v) => `Fractured packs can Fracture ${v} additional time${v > 1 ? "s" : ""}.`,
  fractureMarked: (v) => `Cards spilled by a Fracture have a ${v}% chance to arrive Marked.`,
  fractureWild: () => "Fractured packs may spill from any unlocked set.",
  fusionDepth: (v) => `Fusions can climb ${v} additional rarity step${v > 1 ? "s" : ""}.`,
  fusionSolo: (v) => `Lone cards with no Fusion partner have a ${v}% chance to Fuse upward alone.`,
  fusionCross: () => "Fusion pairs may form across adjacent rarities.",
  fusionFoil: (v) => `Fused cards have a ${v}% chance to emerge foil.`,
  markExtraChance: (v) => `Packs have a ${v}% chance to contain an additional Marked card.`,
  markBiasHigh: () => "Marks prefer the highest-rarity card in the pack.",
  markSpread: (v) => `Revealed Marks are ${v}% more likely to spread to an unrevealed card.`,
  markTruth: (v) => `Marked cards' signals are ${v}% less likely to lie.`,
  foilChance: (v) => `Cards are ${v}% more likely to be foil.`,
  mimicBiasHigh: () => "Copies prefer the highest-rarity card in the pack.",
  mimicBiasMarked: () => "Copies prefer Marked cards.",
  mimicTwice: (v) => `Mimic has a ${v}% chance to copy a second card.`,
  mimicPerfect: (v) => `Copies have a ${v}% chance to keep the original's foil and grade.`,
  transmuteChance: (v) => `Transmutes are ${v}% more likely to happen.`,
  transmuteUp: (v) => `Transmutes climb ${v} additional rarity step${v > 1 ? "s" : ""} upward.`,
  transmuteBiasMarked: () => "Transmutes prefer Marked cards.",
  echoCommonBoost: (v) => `Common reveals are ${v}% more likely to Echo.`,
  echoRareBoost: (v) => `Rare-or-better reveals are ${v}% more likely to Echo.`,
  echoAllBoost: (v) => `All Echo chances are ${v}% higher.`,
  echoChain: (v) => `Echoes have a ${v}% chance to Echo again.`,
  catalystChance: (v) => `Properties are ${v}% more likely to spread between unrevealed cards.`,
  mysterySize: (v) => `Mystery Packs contain ${v} additional card${v > 1 ? "s" : ""}.`,
  mysteryFuture: (v) => `Mystery Packs are ${v}x as likely to hold a card from a set you haven't unlocked.`,
  mysteryFloor: (v) => (v >= 2
    ? "Mystery Packs strongly prefer Rare-or-better cards."
    : "Mystery Packs prefer Uncommon-or-better cards."),
  mysteryNewGuarantee: () => "Mystery Packs prefer cards you don't own.",
  mysteryMarked: (v) => `Mystery Pack cards have a ${v}% chance to arrive Marked.`,
  mysteryPity: (v) => `Mystery Packs have a ${v}% chance to contain the rarest card you're missing.`,
  salvageBoost: (v) => `Each Salvage creates ${v} additional Mystery Pack${v > 1 ? "s" : ""}.`,
  salvageEcho: (v) => `Salvages have a ${v}% chance to trigger one additional Salvage.`,
  discoverBoost: (v) => `When you Discover, you may keep ${v} additional option${v > 1 ? "s" : ""}.`,
  discoverOptions: (v) => (v >= 2 ? "Discover offers all five options." : "Discover offers a fourth option."),
  discoverPersist: (v) => `Consumed Discover picks have a ${v}% chance to linger.`,
  discoverConsolation: (v) => `Skipped Discovers have a ${v}% chance to still grant one random pick.`,
  thresholdDiscount: (v) => `Cards that trigger every so-many coins or packs trigger ${v}% sooner.`,
  gradeBias: (v) => `Pulled cards have a ${v}% chance to grade one step higher.`,
  noFalseSignals: (v) => `Rarity signals are ${v}% less likely to lie.`,
  relayDepth: (v) => `The Relay spark jumps ${v} additional card${v > 1 ? "s" : ""}.`,
  packEncore: (v, def) => `When you reveal a pack's last card: ${v}% chance the pack continues with ${def?.n || 3} bonus cards.`,
  markEveryPack: () => "Packs contain one additional Marked card.",
  fusionTwice: () => "After Fusions settle, the chain runs one full extra pass.",
  discoverEnhance: () => "Your Discover choices are always enhanced.",
};

const BOON_CLAUSE = Object.fromEntries(DISCOVER_POOL.map((option) => [
  option.id,
  `${option.name} (${option.text.charAt(0).toLowerCase()}${option.text.slice(1, -1)})`,
]));

export function describeCard(cardId) {
  const def = getCardDef(cardId);
  if (!def) return "";
  if (def.prestige) {
    return "Completing every set awakens this card. It unlocks REWRITE — begin again, permanently inscribed.";
  }
  if (def.king) return KINGS[def.king].text;
  if (def.capstone && def.note) return def.note;
  if (def.mod) return MOD_TEXT[def.mod] ? MOD_TEXT[def.mod](def.v, def) : "";
  if (def.on) {
    const when = TRIGGER_LABEL[def.on] || def.on;
    const parts = [];
    if (def.every) {
      const noun = (EVERY_LABEL[def.on] || EVERY_LABEL.packsOpened)(def.every);
      const act = def.do === "salvage" ? "Salvage" : "Discover";
      return `Every ${noun}, ${act}.`;
    }
    if (def.coins) {
      if (def.on === "fusion") parts.push(`gain ${def.coins}x the fused card's sell value`);
      else if (def.on === "mysteryOpened") parts.push(`gain ${def.coins}x its rarest card's sell value`);
      else parts.push(`gain ${def.coins}x that card's sell value`);
    }
    if (def.coinsFlat) parts.push(`gain ${formatNumber(def.coinsFlat)} coin${def.coinsFlat === 1 ? "" : "s"}`);
    if (def.coinsPack) parts.push(`gain ${def.coinsPack}x the price of a loose pack`);
    if (def.coinsPerSet) parts.push(`gain ${formatNumber(def.coinsPerSet)} coins for each set you've completed`);
    if (def.coinsChance) parts.splice(0, parts.length, `${def.coinsChance}% chance to gain ${def.coins}x that card's sell value`);
    if (def.salvageChance) parts.push(`${def.salvageChance}% chance to Salvage`);
    if (def.do === "salvage") parts.push(def.chance ? `${def.chance}% chance to Salvage` : "Salvage");
    if (def.do === "discover") parts.push(def.chance ? `${def.chance}% chance to Discover` : "Discover");
    if (def.do === "boon") {
      const clause = `gain ${BOON_CLAUSE[def.boon] || def.boon}`;
      parts.push(def.chance ? `${def.chance}% chance to ${clause}` : clause);
    }
    if (def.do === "packs") {
      const clause = `gain ${def.n} loose pack${def.n > 1 ? "s" : ""}`;
      parts.push(def.chance ? `${def.chance}% chance to ${clause}` : clause);
    }
    if (def.do === "fuseLift") {
      const clause = "your next Fusion climbs one extra step";
      parts.push(def.chance ? `${def.chance}% chance ${clause}` : clause);
    }
    if (def.do === "salvageScaling") parts.push("Salvage once, plus once more for every 4 sets you've completed");
    if (def.do === "triggerAll") parts.push("every displayed card triggers");
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
    packSizeChance: 0,
    packSizePerSets: 0,
    dupBias: 0,
    fractureChance: 0,
    fractureDepth: 1,
    fractureMarked: 0,
    fractureWild: false,
    fusionDepth: 1,
    fusionTwice: false,
    fusionSolo: 0,
    fusionCross: false,
    fusionFoil: 0,
    markExtraChance: 0,
    markEveryPack: 0,
    markBiasHigh: 0,
    markSpread: 0,
    markTruth: 0,
    mimicBiasHigh: 0,
    mimicBiasMarked: 0,
    mimicTwice: 0,
    mimicPerfect: 0,
    transmuteChance: 20,
    transmuteUp: 1,
    transmuteBiasMarked: 0,
    echoCommonChance: 25,
    echoRareChance: 25,
    echoAllBoost: 0,
    echoChain: 0,
    catalystChance: 25,
    mysterySize: 0,
    mysteryFuture: 1,
    mysteryFloor: 0,
    mysteryNewGuarantee: false,
    mysteryMarked: 0,
    mysteryPity: 0,
    salvagePacks: 1,
    salvageEcho: 0,
    discoverKeep: 1,
    discoverEnhance: false,
    discoverOptions: 0,
    discoverPersist: 0,
    discoverConsolation: 0,
    thresholdDiscount: 0,
    gradeBias: 0,
    noFalseSignals: 0,
    relayDepth: 1,
    packEncore: null,
    kingSlots: {},    // verb -> displayed card id introducing it
    reveal: [],       // {slot, id, def} trigger supports, in slot order
    thresholds: [],   // coinsEarned/packsOpened/lifetime-stat watermarks
    onDupSold: [],
    onSaleMade: [],
    onPackOpened: [],
    onSetCompleted: [],
    onFusion: [],
    onMysteryOpened: [],
    onFractured: [],
    onDiscovered: [],
  };

  for (const item of defs) {
    const def = item.def;
    if (!def || def.prestige) continue;
    if (def.king) {
      if (!(def.king in engine.kingSlots)) engine.kingSlots[def.king] = item.id;
      continue;
    }
    if (def.mod) {
      switch (def.mod) {
        case "packSize": engine.packSize += def.v; break;
        case "packSizeChance": engine.packSizeChance += def.v; break;
        case "packSizePerSets": engine.packSizePerSets = Math.max(1, def.v); break;
        case "dupBias": engine.dupBias += def.v; break;
        case "fractureChance": engine.fractureChance += def.v; break;
        case "fractureDepth": engine.fractureDepth += def.v; break;
        case "fractureMarked": engine.fractureMarked += def.v; break;
        case "fractureWild": engine.fractureWild = true; break;
        case "fusionDepth": engine.fusionDepth += def.v; break;
        case "fusionTwice": engine.fusionTwice = true; break;
        case "fusionSolo": engine.fusionSolo += def.v; break;
        case "fusionCross": engine.fusionCross = true; break;
        case "fusionFoil": engine.fusionFoil += def.v; break;
        case "markExtraChance": engine.markExtraChance += def.v; break;
        case "markEveryPack": engine.markEveryPack += def.v; break;
        case "markBiasHigh": engine.markBiasHigh += def.v; break;
        case "markSpread": engine.markSpread += def.v; break;
        case "markTruth": engine.markTruth += def.v; break;
        case "mimicBiasHigh": engine.mimicBiasHigh += def.v; break;
        case "mimicBiasMarked": engine.mimicBiasMarked += def.v; break;
        case "mimicTwice": engine.mimicTwice += def.v; break;
        case "mimicPerfect": engine.mimicPerfect += def.v; break;
        case "transmuteChance": engine.transmuteChance += def.v; break;
        case "transmuteUp": engine.transmuteUp += def.v; break;
        case "transmuteBiasMarked": engine.transmuteBiasMarked += def.v; break;
        case "echoCommonBoost": engine.echoCommonChance += def.v; break;
        case "echoRareBoost": engine.echoRareChance += def.v; break;
        case "echoAllBoost": engine.echoAllBoost += def.v; break;
        case "echoChain": engine.echoChain += def.v; break;
        case "catalystChance": engine.catalystChance += def.v; break;
        case "mysterySize": engine.mysterySize += def.v; break;
        case "mysteryFuture": engine.mysteryFuture *= Math.max(1, def.v); break;
        case "mysteryFloor": engine.mysteryFloor = Math.max(engine.mysteryFloor, def.v); break;
        case "mysteryNewGuarantee": engine.mysteryNewGuarantee = true; break;
        case "mysteryMarked": engine.mysteryMarked += def.v; break;
        case "mysteryPity": engine.mysteryPity += def.v; break;
        case "salvageBoost": engine.salvagePacks += def.v; break;
        case "salvageEcho": engine.salvageEcho += def.v; break;
        case "discoverBoost": engine.discoverKeep += def.v; break;
        case "discoverEnhance": engine.discoverEnhance = true; break;
        case "discoverOptions": engine.discoverOptions = Math.max(engine.discoverOptions, def.v); break;
        case "discoverPersist": engine.discoverPersist += def.v; break;
        case "discoverConsolation": engine.discoverConsolation += def.v; break;
        case "thresholdDiscount": engine.thresholdDiscount += def.v; break;
        case "gradeBias": engine.gradeBias += def.v; break;
        case "noFalseSignals": engine.noFalseSignals += def.v; break;
        case "relayDepth": engine.relayDepth += def.v; break;
        case "packEncore": engine.packEncore = { chance: def.v, n: def.n || 3 }; break;
        default: break;
      }
      continue;
    }
    if (def.on) {
      const record = { slot: item.slot, id: item.id, def };
      if (WATERMARK_TRIGGERS.has(def.on)) engine.thresholds.push(record);
      else if (def.on === "dupSold") engine.onDupSold.push(record);
      else if (def.on === "saleMade") engine.onSaleMade.push(record);
      else if (def.on === "packOpened") engine.onPackOpened.push(record);
      else if (def.on === "setCompleted") engine.onSetCompleted.push(record);
      else if (def.on === "fusion") engine.onFusion.push(record);
      else if (def.on === "mysteryOpened") engine.onMysteryOpened.push(record);
      else if (def.on === "fractured") engine.onFractured.push(record);
      else if (def.on === "discovered") engine.onDiscovered.push(record);
      else engine.reveal.push(record);
    }
  }
  return engine;
}

export const WATERMARK_TRIGGERS = new Set([
  "coinsEarned",
  "packsOpened",
  "dupsRevealed",
  "cardsRevealed",
  "fusionsDone",
  "mysteriesOpened",
]);

// Maps a watermark trigger to the lifetime total it watches.
export function watermarkTotal(state, trigger) {
  switch (trigger) {
    case "coinsEarned": return Math.floor(Math.max(0, state.lifetimeCoins || 0));
    case "packsOpened": return Math.floor(Math.max(0, state.packsOpened || 0));
    case "dupsRevealed": return Math.floor(Math.max(0, state.lifetimeStats?.dups || 0));
    case "cardsRevealed": return Math.floor(Math.max(0, state.lifetimeStats?.cards || 0));
    case "fusionsDone": return Math.floor(Math.max(0, state.lifetimeStats?.fusions || 0));
    case "mysteriesOpened": return Math.floor(Math.max(0, state.lifetimeStats?.mysteries || 0));
    default: return 0;
  }
}

// `extra` carries reveal-time context: { cards, state }. Conditions that need
// it return false when it is absent so the matcher stays safe to call bare.
export function revealTriggerMatches(def, pull, extra = null) {
  const order = RARITIES[pull.rarity].order;
  const live = (entry) => !entry.fusedAway;
  switch (def.on) {
    case "commonReveal": return pull.rarity === "common";
    case "uncommonReveal": return pull.rarity === "uncommon";
    case "rareReveal": return order >= RARITIES.rare.order;
    case "epicReveal": return order >= RARITIES.epic.order;
    case "anyReveal": return true;
    case "markedReveal": return !!pull.marked;
    case "dupReveal": return !pull.isNew;
    case "newReveal": return !!pull.isNew;
    case "foilReveal": return !!pull.foil;
    case "mimicReveal": return pull.mimicOf !== null && pull.mimicOf !== undefined;
    case "transmutedReveal": return !!pull.transmuted;
    case "fusedReveal": return pull.fusedFrom !== null && pull.fusedFrom !== undefined;
    case "mysteryReveal": return !!pull.fromMystery;
    case "signalLied": return !!pull.falseSignal;
    case "markedDupReveal": return !!pull.marked && !pull.isNew;
    case "displayedDupReveal":
      return !pull.isNew && !!extra?.state
        && (Array.isArray(extra.state.displayed) ? extra.state.displayed : [])
          .some((entry) => entry && entry.id === pull.card.id);
    case "chaseReveal": {
      const set = getSet(pull.card.setId);
      return !!set && set.cards[set.cards.length - 1]?.id === pull.card.id;
    }
    case "firstReveal":
      return !!extra?.cards && extra.cards.filter((entry) => live(entry) && entry.revealed).length === 1;
    case "lastReveal":
      return !!extra?.cards && extra.cards.every((entry) => !live(entry) || entry.revealed);
    case "dupStreak":
      return !pull.isNew && (extra?.state?.counters?.dupStreak || 0) >= 3;
    case "packFinishDups":
      return !!extra?.cards
        && extra.cards.every((entry) => !live(entry) || entry.revealed)
        && extra.cards.filter((entry) => live(entry) && entry.revealed && !entry.isNew).length >= 4;
    case "packFinishNoRare":
      return !!extra?.cards
        && extra.cards.every((entry) => !live(entry) || entry.revealed)
        && extra.cards.every((entry) => !live(entry) || RARITIES[entry.rarity].order < RARITIES.rare.order);
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
  if (state?.adminMode) {
    return {
      slots: CASE_SIZE,
      milestones: CASE_MILESTONES.map((milestone) => ({ slot: milestone.slot, label: milestone.label, met: true })),
    };
  }
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
