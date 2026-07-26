import { RARITIES, SETS, formatNumber, getCard, getCardRulesId, getSet } from "./gameData.js";

export const CASE_SIZE = 6;

// ---------------------------------------------------------------------------
// Verb engine card definitions (see docs/ENGINE_SPEC.md).
//
// Every chance source stands alone: a card that grants "+X% chance to
// Fracture" fractures packs all by itself. The chase card of each early set
// is that verb's signature — its biggest chance source or its defining rule —
// not a gate. Pure dials (biases, depths, preferences) modify a verb and stay
// inert until some source feeds them. Card text is player-facing only.
//
// Definition grammar (one per card):
//   { signature: true, sig: <verb>, ... }           — a set's chase card
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

// Verb display names, keyed by verb id (used for signature card labels).
export const KINGS = {
  commonEcho: { name: "Common Echo" },
  mark: { name: "Mark" },
  salvage: { name: "Salvage" },
  mimic: { name: "Mimic" },
  rareEcho: { name: "Rare Echo" },
  fusion: { name: "Fusion" },
  transmute: { name: "Transmute" },
  fracture: { name: "Fracture" },
  catalyst: { name: "Catalyst" },
  blueprint: { name: "Blueprint" },
  relay: { name: "Relay" },
  autopilot: { name: "Autopilot" },
};

// Chase cards are their set's signature: the verb's biggest chance source, or
// a unique rule where one genuinely exists. Nothing is gated on them — any
// chance source works on its own.
export const SIGNATURES = {
  corner: { sig: "commonEcho", mod: "echoCommonBoost", v: 50, note: "Common cards have +50% Echo. Echo repeats that card's reveal effects; chance above 100% adds more Echoes." },
  circuit: { sig: "mark", mod: "markEveryPack", v: 1, note: "Each pack contains one Marked card. Marks are visible before the card is revealed." },
  frontier: { sig: "salvage", on: "dupSold", salvageChance: 4, note: "Each duplicate sold has a 4% chance to Salvage. Salvage opens a free Mystery Pack." },
  abyss: { sig: "mimic", mod: "mimicPack", v: 1, note: "Whenever you open a pack, Mimic makes one unrevealed card copy another unrevealed card." },
  crown: { sig: "rareEcho", mod: "echoRareBoost", v: 50, note: "Rare-or-better cards have +50% Echo. Echo repeats that card's reveal effects; chance above 100% adds more Echoes." },
  verdant: { sig: "fusion", mod: "fusionRule", v: 1, note: "After a pack is revealed, Fusion combines each same-rarity pair into one card of the next rarity. The new card reveals again." },
  polar: { sig: "transmute", mod: "transmuteChance", v: 50, note: "Revealed cards have +50% Transmute. Transmute moves an unrevealed card toward the revealed card's rarity." },
  ember: { sig: "fracture", mod: "fractureChance", v: 35, note: "Packs have +35% Fracture. Fracture spills another pack into the same reveal." },
  cloud: { sig: "catalyst", mod: "catalystChance", v: 75, note: "Whenever an unrevealed card gains a Mark, copy, or Transmute, Catalyst has +75% chance to spread it to another card." },
  glass: { sig: "blueprint", mod: "blueprintRule", v: 1, note: "Blueprint copies the exact effect of the card in display slot 1." },
  harbor: { sig: "relay", mod: "relayRule", v: 1, note: "Whenever a displayed card triggers, Relay also triggers the displayed card immediately to its right, if able." },
  orchard: { sig: "autopilot", mod: "autopilotRule", v: 1, note: "Whenever you would Discover, Autopilot chooses an enhanced option automatically." },
};

// Set id -> signature verb, carried by each early set's chase card (card 12).
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

// Support definitions per set, cards 1..11 (card 12 is the signature or
// capstone). Each set leans toward its signature verb while cross-pollinating.
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

// Cross-engine capstones for late sets whose chase card is not a signature.
const CAPSTONES = {
  hollow: { on: "fusion", do: "salvage", note: "Whenever Fusion happens, Salvage." },
  prism: { mod: "echoAllBoost", v: 50, note: "All cards have +50% Echo." },
  signal: { mod: "salvageBoost", v: 5, note: "Each Salvage opens one additional Mystery Pack." },
  observatory: { mod: "markEveryPack", v: 1, note: "Each pack contains one additional Marked card." },
  foundry: { mod: "fusionTwice", v: 1, note: "After Fusion settles, run the full Fusion chain again." },
  apocalypse: { on: "mysteryOpened", do: "salvage", chance: 50, note: "Whenever a Mystery Pack opens, 50% chance to Salvage." },
  lastlight: { mod: "discoverEnhance", v: 1, note: "Every Discover option is enhanced." },
};

// Every live card carries the id of the legacy card it was printed from;
// definitions key off that legacy identity, so effects survive reprints.
const splitLegacyId = (legacyId) => {
  const at = legacyId.lastIndexOf("-");
  return [legacyId.slice(0, at), Number(legacyId.slice(at + 1)) - 1];
};

// Marquee reprints with bespoke rules. Keeping these in the engine (rather
// than the card renderer) ensures the real game and every simulator agree.
// Blank cards remain displayable, but deliberately contribute no rules text
// and no effect.
const CARD_OVERRIDES = {
  "corner-02": { support: true, on: "commonReveal", coinsFlat: 100 },
  "corner-04": { support: true, blank: true },
  "corner-08": { support: true, on: "packsOpened", every: 10, do: "discover" },
  "corner-10": {
    support: true,
    on: "echo",
    addCards: 1,
    note: "Whenever you Echo, add 1 card to the opened pack.",
  },
  "corner-11": { support: true, blank: true },
  "circuit-05": { support: true, on: "markedReveal", coinsFlat: 200 },
  "circuit-06": { support: true, blank: true },
  "circuit-11": {
    support: true,
    mod: "echoMarkedBoost",
    v: 25,
    note: "Marked cards have +25% Echo.",
  },
  "crown-01": {
    support: true,
    mod: "echoRareBoost",
    v: 100,
    note: "Rare-or-better cards Echo an additional time.",
  },
  "crown-03": {
    support: true,
    on: "epicReveal",
    coinsFlat: 1_000,
    note: "Whenever you reveal an Epic-or-better card, gain 1,000 cash.",
  },
  "crown-04": { support: true, blank: true },
  "crown-07": {
    support: true,
    on: "legendaryReveal",
    do: "randomPack",
    note: "Whenever you reveal a Legendary-or-better card, gain a random pack from any set, even one not yet unlocked.",
  },
  "crown-08": {
    support: true,
    mod: "markStacking",
    v: 1,
    note: "Marks applied to Marked cards stack.",
  },
  "corner-12": {
    signature: true,
    sig: "commonEcho",
    mod: "echoCommonBoost",
    v: 100,
    note: "Common cards have +100% Echo.",
  },
  "crown-09": {
    support: true,
    mod: "passivePerDiscovered",
    v: 1,
    note: "Gain cash per second equal to the number of cards you've discovered.",
  },
  "crown-10": {
    support: true,
    on: "coinsEarned",
    every: 1_000,
    do: "revealDuplicate",
    note: "For every 1,000 cash you earn, reveal a random duplicate card.",
  },
  "circuit-12": {
    signature: true,
    sig: "mark",
    mod: "markExtraChance",
    v: 100,
    note: "Packs have +100% chance to contain a Marked card.",
  },
  "crown-11": {
    support: true,
    on: "commonReveal",
    commonOnlyPacks: true,
    addCards: 1,
    chance: 50,
    rarity: "common",
    note: "Your packs only include Common cards. Whenever you reveal a Common card, 50% chance to add 1 Common card to the opened pack.",
  },
  "observatory-01": {
    support: true,
    on: "leftTriggered",
    do: "discover",
    chance: 5,
    note: "Whenever you trigger the display card to the left, 5% chance to Discover.",
  },
  "observatory-02": {
    support: true,
    on: "markedReveal",
    do: "triggerLeft",
    note: "Whenever you reveal a Marked card, trigger the display card to the left.",
  },
  "observatory-03": {
    support: true,
    on: "coinsEarned",
    every: 1_000,
    do: "boon",
    boon: "insight",
    note: "For every 1,000 cash you gain, your next Mark gains one additional Mark.",
  },
  "observatory-04": {
    support: true,
    mod: "transmuteChance",
    v: 60,
    note: "Cards have +60% Transmute.",
  },
  "crown-12": {
    signature: true,
    sig: "rareEcho",
    mod: "echoRareBoost",
    v: 50,
    note: "Rare-or-better cards have +50% Echo.",
  },
  "observatory-05": {
    support: true,
    on: "packOpened",
    do: "discover",
    note: "Whenever you open a pack, Discover.",
  },
  "observatory-06": {
    support: true,
    on: "markedReveal",
    do: "echoMarked",
    note: "Whenever you reveal a Marked card, Echo all Marked cards.",
  },
  "observatory-07": {
    support: true,
    on: "firstReveal",
    do: "revealRest",
    note: "Whenever you reveal a pack's first card, also reveal the rest.",
  },
};

export const CARD_DEFS = Object.fromEntries(SETS.flatMap((set) => set.cards.map((card) => {
  const rulesId = getCardRulesId(card);
  const [legacySetId, legacyIndex] = splitLegacyId(rulesId);
  const override = CARD_OVERRIDES[rulesId];
  if (override) return [card.id, override];
  if (legacyIndex === 11) {
    if (legacySetId === "unwritten") return [card.id, { prestige: true }];
    const signature = SIGNATURES[legacySetId];
    if (signature) return [card.id, { signature: true, ...signature }];
    return [card.id, { capstone: true, ...CAPSTONES[legacySetId] }];
  }
  return [card.id, { support: true, ...(S[legacySetId]?.[legacyIndex] || { on: "anyReveal", coins: 1 }) }];
})));

export function getCardDef(cardId) {
  return CARD_DEFS[cardId] || null;
}

// Verb -> the live card id carrying that verb's signature.
export const SIGNATURE_CARDS = Object.fromEntries(
  Object.entries(CARD_DEFS)
    .filter(([, def]) => def.sig)
    .map(([cardId, def]) => [def.sig, cardId]),
);

const TRIGGER_LABEL = {
  commonReveal: "you reveal a Common card",
  uncommonReveal: "you reveal an Uncommon card",
  rareReveal: "you reveal a Rare-or-better card",
  legendaryReveal: "you reveal a Legendary-or-better card",
  epicReveal: "you reveal an Epic-or-better card",
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
  echo: "you Echo",
  leftTriggered: "you trigger the display card to the left",
  displayed: "you display this card",
};

const EVERY_LABEL = {
  coinsEarned: (n) => `${formatNumber(n)} cash you earn`,
  packsOpened: (n) => `${n} packs you open`,
  dupsRevealed: (n) => `${n} duplicates you reveal`,
  cardsRevealed: (n) => `${n} cards you reveal`,
  fusionsDone: (n) => `${n} Fusions`,
  mysteriesOpened: (n) => `${n} Mystery Packs opened`,
};

const MOD_TEXT = {
  packSize: (v) => `Each pack you open contains ${v} additional card${v > 1 ? "s" : ""}.`,
  packSizeChance: (v) => `Each pack has a ${v}% chance to contain one additional card.`,
  packSizePerSets: (v) => `Each pack contains one additional card for every ${v} completed sets.`,
  dupBias: (v) => `Cards in your packs are ${v}% more likely to be duplicates.`,
  fractureChance: (v) => `Packs have +${v}% Fracture. Fracture spills another pack into the same reveal.`,
  fractureDepth: (v) => `Fracture can spill ${v} additional pack${v > 1 ? "s" : ""}.`,
  fractureMarked: (v) => `Cards spilled by Fracture have a ${v}% chance to arrive Marked.`,
  fractureWild: () => "Fracture may spill a pack from any unlocked set.",
  fusionDepth: (v) => `Fusion can climb ${v} additional rarity step${v > 1 ? "s" : ""}.`,
  fusionSolo: (v) => `A card without a Fusion partner has a ${v}% chance to Fuse upward alone.`,
  fusionCross: () => "Fusion pairs may form across adjacent rarities.",
  fusionFoil: (v) => `Cards created by Fusion have a ${v}% chance to be foil.`,
  markExtraChance: (v) => `Packs have +${v}% chance to contain a Marked card.`,
  markBiasHigh: () => "Marks prefer the highest-rarity card in the pack.",
  markSpread: (v) => `Revealed Marks have +${v}% chance to spread to an unrevealed card.`,
  markTruth: (v) => `Marked cards' signals are ${v}% less likely to lie.`,
  foilChance: (v) => `Cards have +${v}% chance to be foil.`,
  mimicBiasHigh: () => "Copies prefer the highest-rarity card in the pack.",
  mimicBiasMarked: () => "Copies prefer Marked cards.",
  mimicTwice: (v) => `Mimic has a ${v}% chance to copy a second card.`,
  mimicPerfect: (v) => `Copies have a ${v}% chance to keep the original's foil and grade.`,
  transmuteChance: (v) => `Revealed cards have +${v}% Transmute.`,
  transmuteUp: (v) => `Transmutes climb ${v} additional rarity step${v > 1 ? "s" : ""} upward.`,
  transmuteBiasMarked: () => "Transmutes prefer Marked cards.",
  echoCommonBoost: (v) => `Common cards have +${v}% Echo.`,
  echoRareBoost: (v) => `Rare-or-better cards have +${v}% Echo.`,
  echoMarkedBoost: (v) => `Marked cards have +${v}% Echo.`,
  echoAllBoost: (v) => `All cards have +${v}% Echo.`,
  echoChain: (v) => `Echo has a ${v}% chance to repeat again.`,
  catalystChance: (v) => `Catalyst has +${v}% chance to spread Marks, copies, and Transmutes to another unrevealed card.`,
  mysterySize: (v) => `Each Mystery Pack contains ${v} additional card${v > 1 ? "s" : ""}.`,
  mysteryFuture: (v) => `Mystery Packs are ${v}× as likely to contain a card from a locked set.`,
  mysteryFloor: (v) => (v >= 2
    ? "Mystery Packs strongly prefer Rare-or-better cards."
    : "Mystery Packs prefer Uncommon-or-better cards."),
  mysteryNewGuarantee: () => "Mystery Packs prefer cards you don't own.",
  mysteryMarked: (v) => `Mystery Pack cards have a ${v}% chance to arrive Marked.`,
  mysteryPity: (v) => `Mystery Packs have a ${v}% chance to contain the rarest card you're missing.`,
  salvageBoost: (v) => `Each Salvage opens ${v} additional Mystery Pack${v > 1 ? "s" : ""}.`,
  salvageEcho: (v) => `Salvage has a ${v}% chance to repeat.`,
  discoverBoost: (v) => `Whenever you Discover, keep ${v} additional option${v > 1 ? "s" : ""}.`,
  discoverOptions: (v) => (v >= 2 ? "Discover offers all five options." : "Discover offers a fourth option."),
  discoverPersist: (v) => `Consumed Discover picks have a ${v}% chance to linger.`,
  discoverConsolation: (v) => `Skipped Discovers have a ${v}% chance to still grant one random pick.`,
  thresholdDiscount: (v) => `Cash and pack thresholds trigger ${v}% sooner.`,
  gradeBias: (v) => `Pulled cards have a ${v}% chance to grade one step higher.`,
  noFalseSignals: (v) => `Rarity signals are ${v}% less likely to lie.`,
  relayDepth: (v) => `Relay jumps ${v} additional card${v > 1 ? "s" : ""} to the right.`,
  packEncore: (v, def) => `Whenever you reveal a pack's last card, it has a ${v}% chance to continue with ${def?.n || 3} bonus cards.`,
  markEveryPack: () => "Each pack contains one additional Marked card.",
  fusionTwice: () => "After Fusion settles, run the full Fusion chain again.",
  discoverEnhance: () => "Every Discover option is enhanced.",
  markStacking: () => "Marks applied to Marked cards stack.",
  passivePerDiscovered: (v) => `Gain ${v} cash per second for each card you've discovered.`,
};

const BOON_CLAUSE = Object.fromEntries(DISCOVER_POOL.map((option) => [
  option.id,
  `${option.name} (${option.text.charAt(0).toLowerCase()}${option.text.slice(1, -1)})`,
]));

export function describeCard(cardId) {
  const def = getCardDef(cardId);
  if (!def || def.blank) return "";
  if (def.prestige) {
    return "Complete every set to awaken this card. Unlock Rewrite: begin again with permanent Inscriptions.";
  }
  if (def.note) return def.note;
  if (def.mod) return MOD_TEXT[def.mod] ? MOD_TEXT[def.mod](def.v, def) : "";
  if (def.on) {
    const when = TRIGGER_LABEL[def.on] || def.on;
    const parts = [];
    if (def.every) {
      const noun = (EVERY_LABEL[def.on] || EVERY_LABEL.packsOpened)(def.every);
      const act = def.do === "salvage" ? "Salvage" : "Discover";
      return `For every ${noun}, ${act}.`;
    }
    if (def.coins) {
      const multiple = def.coins === 1 ? "" : `${def.coins}× `;
      if (def.on === "fusion") parts.push(`gain cash equal to ${multiple}the fused card's sell value`);
      else if (def.on === "mysteryOpened") parts.push(`gain cash equal to ${multiple}its rarest card's sell value`);
      else parts.push(`gain cash equal to ${multiple}that card's sell value`);
    }
    if (def.coinsFlat) parts.push(`gain ${formatNumber(def.coinsFlat)} cash`);
    if (def.coinsPack) {
      const multiple = def.coinsPack === 1 ? "" : `${def.coinsPack}× `;
      parts.push(`gain cash equal to ${multiple}the price of a loose pack`);
    }
    if (def.coinsPerSet) parts.push(`gain ${formatNumber(def.coinsPerSet)} cash for each completed set`);
    if (def.coinsChance) {
      const multiple = def.coins === 1 ? "" : `${def.coins}× `;
      parts.splice(0, parts.length, `${def.coinsChance}% chance to gain cash equal to ${multiple}that card's sell value`);
    }
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
      const clause = "your next Fusion climbs one additional rarity step";
      parts.push(def.chance ? `${def.chance}% chance for ${clause}` : clause);
    }
    if (def.do === "salvageScaling") parts.push("Salvage, plus one additional time for every 4 completed sets");
    if (def.do === "triggerAll") parts.push("every displayed card triggers");
    if (def.do === "randomPack") parts.push("gain a random pack from any set");
    if (def.do === "revealDuplicate") parts.push("reveal a random duplicate card");
    if (def.do === "triggerLeft") parts.push("trigger the display card to the left");
    if (def.do === "echoMarked") parts.push("Echo all Marked cards");
    if (def.do === "revealRest") parts.push("also reveal the rest of the pack");
    if (def.addCards) {
      const rarity = def.rarity ? `${def.rarity.charAt(0).toUpperCase()}${def.rarity.slice(1)} ` : "";
      const clause = `add ${def.addCards} ${rarity}card${def.addCards > 1 ? "s" : ""} to the opened pack`;
      parts.push(def.chance ? `${def.chance}% chance to ${clause}` : clause);
    }
    if (def.spreadMark) parts.push(`its Mark has a ${def.spreadMark}% chance to spread to an unrevealed card`);
    if (def.markChance) parts.push(`${def.markChance}% chance to Mark one additional card`);
    if (def.echoBoost) parts.push(`it gains +${def.echoBoost}% Echo`);
    if (def.transmuteBoost) parts.push(`Transmute gains +${def.transmuteBoost}% chance`);
    return `Whenever ${when}, ${parts.join("; ")}.`;
  }
  return "";
}

export const CARD_KEYWORD_GLOSSARY = {
  Echo: {
    tone: "violet",
    reminder: "Repeats the revealed card's effects. Chance above 100% adds more repeats.",
    aliases: ["Echo", "Echoes"],
  },
  Mark: {
    tone: "gold",
    reminder: "A visible sign placed on a card before it is revealed.",
    aliases: ["Mark", "Marks", "Marked"],
  },
  Salvage: {
    tone: "green",
    reminder: "Opens a free Mystery Pack immediately.",
    aliases: ["Salvage", "Salvages"],
  },
  "Mystery Pack": {
    tone: "blue",
    reminder: "A free pack that can reach beyond the current set.",
    aliases: ["Mystery Pack", "Mystery Packs"],
  },
  Mimic: {
    tone: "violet",
    reminder: "Makes one unrevealed card copy another unrevealed card.",
    aliases: ["Mimic"],
  },
  Fusion: {
    tone: "gold",
    reminder: "Combines a same-rarity pair into one card of the next rarity.",
    aliases: ["Fusion", "Fusions", "Fuse", "Fused"],
  },
  Transmute: {
    tone: "blue",
    reminder: "Moves an unrevealed card toward the revealed card's rarity.",
    aliases: ["Transmute", "Transmutes", "Transmuted"],
  },
  Fracture: {
    tone: "red",
    reminder: "Spills another pack into the current reveal.",
    aliases: ["Fracture", "Fractures", "Fractured"],
  },
  Catalyst: {
    tone: "green",
    reminder: "Spreads a Mark, copy, or Transmute to another unrevealed card.",
    aliases: ["Catalyst"],
  },
  Blueprint: {
    tone: "blue",
    reminder: "Copies the exact effect of the card in display slot 1.",
    aliases: ["Blueprint"],
  },
  Relay: {
    tone: "gold",
    reminder: "Also triggers the displayed card immediately to the right.",
    aliases: ["Relay"],
  },
  Discover: {
    tone: "green",
    reminder: "Offers a choice of temporary upgrades.",
    aliases: ["Discover", "Discovers"],
  },
  Autopilot: {
    tone: "blue",
    reminder: "Chooses an enhanced Discover option automatically.",
    aliases: ["Autopilot"],
  },
  Rewrite: {
    tone: "violet",
    reminder: "Resets the collection and shop in exchange for permanent Inscriptions.",
    aliases: ["Rewrite"],
  },
  Common: { tone: "rarity", aliases: ["Common"] },
  Uncommon: { tone: "rarity", aliases: ["Uncommon"] },
  Rare: { tone: "rarity", aliases: ["Rare"] },
  Epic: { tone: "rarity", aliases: ["Epic"] },
  foil: { tone: "foil", aliases: ["foil"] },
  duplicate: { tone: "neutral", aliases: ["duplicate", "duplicates"] },
  display: { tone: "neutral", aliases: ["display", "displayed"] },
  cash: { tone: "cash", aliases: ["cash"] },
  pack: { tone: "neutral", aliases: ["pack", "packs"] },
};

const KEYWORD_ALIASES = Object.entries(CARD_KEYWORD_GLOSSARY)
  .flatMap(([keyword, entry]) => entry.aliases.map((alias) => ({ alias, keyword })))
  .sort((a, b) => b.alias.length - a.alias.length);
const KEYWORD_BY_ALIAS = new Map(KEYWORD_ALIASES.map(({ alias, keyword }) => [alias.toLowerCase(), keyword]));
const RULE_TOKEN_PATTERN = new RegExp(
  `(\\+?\\d[\\d,]*(?:\\.\\d+)?(?:%|×)?|${KEYWORD_ALIASES
    .map(({ alias }) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})`,
  "gi",
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

const TRIGGER_TITLE = {
  commonReveal: "Common Reveal",
  uncommonReveal: "Uncommon Reveal",
  rareReveal: "Rare Reveal",
  legendaryReveal: "Legendary Reveal",
  epicReveal: "Epic Reveal",
  anyReveal: "Card Reveal",
  markedReveal: "Marked Reveal",
  dupReveal: "Duplicate Reveal",
  newReveal: "First Copy",
  foilReveal: "Foil Reveal",
  mimicReveal: "Mimic Reveal",
  transmutedReveal: "Transmute Reveal",
  fusedReveal: "Fusion Reveal",
  mysteryReveal: "Mystery Reveal",
  signalLied: "False Signal",
  markedDupReveal: "Marked Duplicate",
  displayedDupReveal: "Case Duplicate",
  chaseReveal: "Chase Reveal",
  firstReveal: "Opening Card",
  lastReveal: "Closing Card",
  dupStreak: "Duplicate Streak",
  packFinishDups: "Duplicate Pack",
  packFinishNoRare: "Dry Pack",
  dupSold: "Duplicate Sale",
  saleMade: "Pile Sale",
  packOpened: "Pack Open",
  setCompleted: "Set Complete",
  fusion: "Fusion",
  mysteryOpened: "Mystery Open",
  fractured: "Fracture",
  discovered: "Discover",
  echo: "Echo",
  leftTriggered: "Left Trigger",
  displayed: "Display",
  coinsEarned: "Cash Threshold",
  packsOpened: "Pack Threshold",
  dupsRevealed: "Duplicate Threshold",
  cardsRevealed: "Reveal Threshold",
  fusionsDone: "Fusion Threshold",
  mysteriesOpened: "Mystery Threshold",
};

const MOD_TITLE = {
  packSize: "Pack Size",
  packSizeChance: "Pack Size",
  packSizePerSets: "Pack Size",
  dupBias: "Duplicate Bias",
  fractureChance: "Fracture",
  fractureDepth: "Deep Fracture",
  fractureMarked: "Marked Fracture",
  fractureWild: "Wild Fracture",
  fusionDepth: "Fusion",
  fusionSolo: "Solo Fusion",
  fusionCross: "Cross Fusion",
  fusionFoil: "Foil Fusion",
  markExtraChance: "Mark",
  markBiasHigh: "High Mark",
  markSpread: "Spreading Mark",
  markTruth: "True Mark",
  foilChance: "Foil",
  mimicBiasHigh: "High Mimic",
  mimicBiasMarked: "Marked Mimic",
  mimicTwice: "Double Mimic",
  mimicPerfect: "Perfect Mimic",
  transmuteChance: "Transmute",
  transmuteUp: "Greater Transmute",
  transmuteBiasMarked: "Marked Transmute",
  echoCommonBoost: "Common Echo",
  echoRareBoost: "Rare Echo",
  echoMarkedBoost: "Marked Echo",
  echoAllBoost: "Open Echo",
  echoChain: "Chain Echo",
  catalystChance: "Catalyst",
  mysterySize: "Mystery Size",
  mysteryFuture: "Future Mystery",
  mysteryFloor: "Mystery Quality",
  mysteryNewGuarantee: "Unseen Mystery",
  mysteryMarked: "Marked Mystery",
  mysteryPity: "Missing Mystery",
  salvageBoost: "Greater Salvage",
  salvageEcho: "Echoing Salvage",
  discoverBoost: "Greater Discover",
  discoverOptions: "Wide Discover",
  discoverPersist: "Lingering Discover",
  discoverConsolation: "Consolation",
  thresholdDiscount: "Short Threshold",
  gradeBias: "Higher Grade",
  noFalseSignals: "True Signal",
  relayDepth: "Deep Relay",
  packEncore: "Encore",
  markEveryPack: "Pack Mark",
  fusionTwice: "Double Fusion",
  discoverEnhance: "Enhanced Discover",
  markStacking: "Stacked Marks",
  passivePerDiscovered: "Living Collection",
};

export function getCardRules(cardId) {
  const def = getCardDef(cardId);
  if (!def || def.blank) return null;
  const text = describeCard(cardId);
  const tokens = tokenizeCardText(text);
  const keywords = [...new Set(tokens.filter((token) => token.keyword).map((token) => token.keyword))];
  const title = def.sig
    ? KINGS[def.sig].name
    : def.prestige
      ? "Rewrite"
      : def.on
        ? TRIGGER_TITLE[def.on] || "Triggered Effect"
        : MOD_TITLE[def.mod] || "Display Effect";
  const eyebrow = def.signature
    ? "Signature"
    : def.capstone
      ? "Capstone"
      : def.prestige
        ? "Prestige"
        : def.on
          ? def.every ? "Threshold" : "Triggered"
          : "Passive";
  return {
    eyebrow,
    title,
    text,
    tokens,
    keywords,
    reminders: keywords
      .map((keyword) => ({ keyword, ...CARD_KEYWORD_GLOSSARY[keyword] }))
      .filter((entry) => entry.reminder)
      .slice(0, 2),
  };
}

export function isKingCard(cardId) {
  return !!getCardDef(cardId)?.sig;
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
// as a second copy of slot 1. Chance sources stand alone; pure dials stay
// inert until a source feeds them.
export function getEngine(state) {
  const entries = getDisplayedEntries(state);
  const slots = entries.map((entry) => entry.id);
  const defs = [];
  for (let index = 0; index < slots.length; index += 1) {
    let def = getCardDef(slots[index]);
    if (def?.sig === "blueprint" && index !== 0 && slots[0]) {
      const first = getCardDef(slots[0]);
      if (first && !first.prestige) def = first;
    }
    defs.push({ slot: index, id: slots[index], def });
  }

  const kings = new Set(defs.map(({ def }) => def?.sig).filter(Boolean));
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
    markStacking: false,
    markBiasHigh: 0,
    markSpread: 0,
    markTruth: 0,
    mimicBiasHigh: 0,
    mimicBiasMarked: 0,
    mimicTwice: 0,
    mimicPerfect: 0,
    mimicPack: 0,
    transmuteChance: 0,
    transmuteUp: 1,
    transmuteBiasMarked: 0,
    echoCommonChance: 0,
    echoRareChance: 0,
    echoMarkedChance: 0,
    echoAllBoost: 0,
    echoChain: 0,
    catalystChance: 0,
    fusionRule: 0,
    relayRule: 0,
    autopilotRule: 0,
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
    foilChance: 0,
    relayDepth: 1,
    packEncore: null,
    commonOnlyPacks: false,
    passivePerDiscovered: 0,
    kingSlots: {},    // verb -> displayed signature card id, for attribution
    records: [],      // all trigger supports, used by positional effects
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
    onEcho: [],
    onLeftTriggered: [],
    onDisplayed: [],
  };

  for (const item of defs) {
    const def = item.def;
    if (!def || def.prestige || def.blank) continue;
    if (def.sig && !(def.sig in engine.kingSlots)) engine.kingSlots[def.sig] = item.id;
    if (def.commonOnlyPacks) engine.commonOnlyPacks = true;
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
        case "markStacking": engine.markStacking = true; break;
        case "markBiasHigh": engine.markBiasHigh += def.v; break;
        case "markSpread": engine.markSpread += def.v; break;
        case "markTruth": engine.markTruth += def.v; break;
        case "mimicBiasHigh": engine.mimicBiasHigh += def.v; break;
        case "mimicBiasMarked": engine.mimicBiasMarked += def.v; break;
        case "mimicTwice": engine.mimicTwice += def.v; break;
        case "mimicPerfect": engine.mimicPerfect += def.v; break;
        case "mimicPack": engine.mimicPack += def.v; break;
        case "fusionRule": engine.fusionRule += def.v; break;
        case "blueprintRule": break;
        case "relayRule": engine.relayRule += def.v; break;
        case "autopilotRule": engine.autopilotRule += def.v; break;
        case "foilChance": engine.foilChance += def.v; break;
        case "transmuteChance": engine.transmuteChance += def.v; break;
        case "transmuteUp": engine.transmuteUp += def.v; break;
        case "transmuteBiasMarked": engine.transmuteBiasMarked += def.v; break;
        case "echoCommonBoost": engine.echoCommonChance += def.v; break;
        case "echoRareBoost": engine.echoRareChance += def.v; break;
        case "echoMarkedBoost": engine.echoMarkedChance += def.v; break;
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
        case "passivePerDiscovered": engine.passivePerDiscovered += def.v; break;
        default: break;
      }
      continue;
    }
    if (def.on) {
      const record = { slot: item.slot, id: item.id, def };
      engine.records.push(record);
      if (WATERMARK_TRIGGERS.has(def.on)) engine.thresholds.push(record);
      else if (def.on === "dupSold") engine.onDupSold.push(record);
      else if (def.on === "saleMade") engine.onSaleMade.push(record);
      else if (def.on === "packOpened") engine.onPackOpened.push(record);
      else if (def.on === "setCompleted") engine.onSetCompleted.push(record);
      else if (def.on === "fusion") engine.onFusion.push(record);
      else if (def.on === "mysteryOpened") engine.onMysteryOpened.push(record);
      else if (def.on === "fractured") engine.onFractured.push(record);
      else if (def.on === "discovered") engine.onDiscovered.push(record);
      else if (def.on === "echo") engine.onEcho.push(record);
      else if (def.on === "leftTriggered") engine.onLeftTriggered.push(record);
      else if (def.on === "displayed") engine.onDisplayed.push(record);
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
    case "legendaryReveal": return order >= RARITIES.legendary.order;
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
    label: "Find 12 Core cards",
    met: (state) => SETS[0].cards.filter((card) => (state.collection?.[card.id] || 0) > 0).length >= 12,
  },
  { slot: 3, label: "Open 75 packs", met: (state) => (state.packsOpened || 0) >= 75 },
  {
    slot: 4,
    label: "Find 36 Core cards",
    met: (state) => SETS[0].cards.filter((card) => (state.collection?.[card.id] || 0) > 0).length >= 36,
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
    label: "Find 72 Core cards",
    met: (state) => SETS[0].cards.filter((card) => (state.collection?.[card.id] || 0) > 0).length >= 72,
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
