import { RARITIES, SETS, formatNumber, getCard, getSet } from "./gameData.js";

export const CASE_SIZE = 6;
export const RAMP_FULL_MINUTES = 30;
export const RAMP_FLOOR = 0.25;

// Aggregate safety caps. Individual card values are hand-tuned; these keep
// stacked six-card loadouts inside playable bounds.
export const EFFECT_CAPS = {
  packDiscount: 50,
  rarityWeight: 300,
  freePack: 60,
  godPack: 25,
  extraCard: 60,
  dupReroll: 75,
  crossSet: 50,
  interest: 8,
  amplify: 300,
  premiumShare: 0.9,
};

// Every card carries exactly one hand-authored effect. Sets act as schools:
// each has a mechanical identity, and rarity scales the magnitude. Specs are
// [type, value] with optional flags; `ramp` effects grow with display time and
// reset when unseated, `meta` effects interact with the Rewrite loop.
const SET_EFFECT_SPECS = {
  corner: [
    ["income", 1],
    ["dupValue", 8],
    ["setDupValue", 20],
    ["inscriptionIncome", 1, { meta: true }],
    ["income", 2],
    ["freePack", 4],
    ["dupValue", 15],
    ["interest", 0.5],
    ["packDiscount", 6],
    ["freePack", 8],
    ["income", 12],
    ["godPack", 1],
  ],
  circuit: [
    ["income", 3],
    ["freePack", 3],
    ["crossSet", 4],
    ["dupReroll", 5],
    ["dupValue", 10],
    ["extraCard", 4],
    ["crossSet", 7],
    ["setDupValue", 35],
    ["autoOpen", 45],
    ["rarityWeight", 12],
    ["autoOpen", 30],
    ["extraCard", 10],
  ],
  frontier: [
    ["dupValue", 6],
    ["interest", 0.4],
    ["income", 4],
    ["freePack", 5],
    ["setDupValue", 25],
    ["packDiscount", 8],
    ["interest", 0.8],
    ["income", 8],
    ["dupValue", 25],
    ["interest", 1.2],
    ["packDiscount", 12],
    ["interest", 2],
  ],
  abyss: [
    ["godPack", 0.2],
    ["freePack", 6],
    ["dupReroll", 6],
    ["crossSet", 5],
    ["extraCard", 3],
    ["rarityWeight", 10],
    ["dupReroll", 10],
    ["godPack", 0.5],
    ["extraCard", 7],
    ["crossSet", 12],
    ["godPack", 1.5],
    ["godPack", 2.5],
  ],
  crown: [
    ["rarityWeight", 4],
    ["pity", 40],
    ["dupValue", 12],
    ["crossSet", 6],
    ["income", 5],
    ["rarityWeight", 15],
    ["pity", 30],
    ["godPack", 0.8],
    ["rarityWeight", 25],
    ["pity", 22],
    ["rarityWeight", 40],
    ["pity", 15],
  ],
  verdant: [
    ["income", 6, { ramp: true }],
    ["dupValue", 18, { ramp: true }],
    ["freePack", 7, { ramp: true }],
    ["income", 15, { ramp: true }],
    ["rarityWeight", 14, { ramp: true }],
    ["packDiscount", 10, { ramp: true }],
    ["dupValue", 35, { ramp: true }],
    ["rarityWeight", 30, { ramp: true }],
    ["income", 60, { ramp: true }],
    ["interest", 2.5, { ramp: true }],
    ["extraCard", 12, { ramp: true }],
    ["income", 150, { ramp: true }],
  ],
  polar: [
    ["dupReroll", 4],
    ["pity", 45],
    ["setDupValue", 30],
    ["pity", 35],
    ["dupReroll", 12],
    ["dupReroll", 16],
    ["pity", 18],
    ["dupReroll", 22],
    ["rarityWeight", 60],
    ["pity", 12],
    ["dupReroll", 30],
    ["pity", 8],
  ],
  ember: [
    ["dupValue", 9],
    ["freePack", 9],
    ["setDupValue", 45],
    ["autoOpen", 38],
    ["dupValue", 30],
    ["autoOpen", 24],
    ["freePack", 15],
    ["dupValue", 60],
    ["godPack", 3],
    ["autoOpen", 16],
    ["dupValue", 100],
    ["godPack", 4],
  ],
  cloud: [
    ["packDiscount", 4],
    ["freePack", 10],
    ["packDiscount", 9],
    ["interest", 1.5],
    ["freePack", 18],
    ["packDiscount", 15],
    ["interest", 3],
    ["freePack", 22],
    ["packDiscount", 20],
    ["interest", 4],
    ["packDiscount", 25],
    ["freePack", 30],
  ],
  glass: [
    ["crossSet", 8],
    ["dupReroll", 8],
    ["crossSet", 15],
    ["extraCard", 8],
    ["crossSet", 18],
    ["dupReroll", 25],
    ["extraCard", 15],
    ["crossSet", 22],
    ["extraCard", 18],
    ["rarityWeight", 120],
    ["extraCard", 22],
    ["crossSet", 30],
  ],
  harbor: [
    ["crossSet", 9],
    ["freePack", 12],
    ["crossSet", 16],
    ["setPackDiscount", 20],
    ["pity", 10],
    ["crossSet", 24],
    ["godPack", 5],
    ["freePack", 28],
    ["dupReroll", 35],
    ["crossSet", 32],
    ["rarityWeight", 180],
    ["godPack", 6],
  ],
  orchard: [
    ["offline", 15],
    ["autoOpen", 20],
    ["offline", 40],
    ["interest", 3.5],
    ["autoOpen", 12],
    ["offline", 80],
    ["autoOpen", 9],
    ["offline", 150],
    ["headStart", 40, { meta: true }],
    ["autoOpen", 6],
    ["offline", 300],
    ["autoOpen", 4],
  ],
  hollow: [
    ["income", 7],
    ["income", 90],
    ["income", 220],
    ["setPackDiscount", 30],
    ["income", 1_400],
    ["income", 3_800],
    ["income", 14_000],
    ["rarityWeight", 240],
    ["income", 210_000],
    ["income", 900_000],
    ["inscriptionGain", 40, { meta: true }],
    ["income", 2_000_000],
  ],
  prism: [
    ["rarityWeight", 6],
    ["crossSet", 20],
    ["rarityWeight", 90],
    ["extraCard", 20],
    ["godPack", 5.5],
    ["rarityWeight", 150],
    ["pity", 6],
    ["extraCard", 25],
    ["rarityWeight", 300],
    ["extraCard", 28],
    ["crossSet", 35],
    ["rarityWeight", 400],
  ],
  signal: [
    ["pity", 50],
    ["pity", 9],
    ["godPack", 4.5],
    ["pity", 7],
    ["freePack", 32],
    ["pity", 5],
    ["godPack", 7],
    ["pity", 4],
    ["godPack", 8],
    ["pity", 3],
    ["keepCoins", 25, { meta: true }],
    ["godPack", 10],
  ],
  observatory: [
    ["offline", 20],
    ["rarityWeight", 130],
    ["crossSet", 26],
    ["interest", 5],
    ["dupReroll", 40],
    ["offline", 400],
    ["pity", 2],
    ["rarityWeight", 500],
    ["interest", 6],
    ["dupReroll", 50],
    ["godPack", 12],
    ["rarityWeight", 650],
  ],
  foundry: [
    ["dupReroll", 7],
    ["setDupValue", 150],
    ["dupValue", 200],
    ["extraCard", 30],
    ["autoOpen", 3],
    ["dupValue", 350],
    ["dupReroll", 60],
    ["dupValue", 500],
    ["inscriptionGain", 80, { meta: true }],
    ["godPack", 15],
    ["autoOpen", 2],
    ["dupValue", 900],
  ],
  apocalypse: [
    ["income", 9],
    ["income", 30_000],
    ["offline", 600],
    ["interest", 7],
    ["income", 3_500_000],
    ["packDiscount", 30],
    ["income", 40_000_000],
    ["keepCoins", 40, { meta: true }],
    ["interest", 8],
    ["income", 400_000_000],
    ["freePack", 35],
    ["income", 900_000_000],
  ],
  lastlight: [
    ["amplify", 5],
    ["amplify", 12],
    ["amplify", 16],
    ["amplify", 20],
    ["amplify", 25],
    ["amplify", 30],
    ["amplify", 35],
    ["amplify", 40],
    ["amplify", 45],
    ["amplify", 55],
    ["amplify", 65],
    ["amplify", 80],
  ],
  unwritten: [
    ["inscriptionIncome", 3, { meta: true }],
    ["headStart", 120, { meta: true }],
    ["inscriptionGain", 25, { meta: true }],
    ["keepCoins", 60, { meta: true }],
    ["inscriptionIncome", 50, { meta: true }],
    ["inscriptionGain", 120, { meta: true }],
    ["headStart", 400, { meta: true }],
    ["keepCoins", 80, { meta: true }],
    ["inscriptionGain", 200, { meta: true }],
    ["inscriptionIncome", 500, { meta: true }],
    ["headStart", 1_200, { meta: true }],
    ["nameless", 100, { meta: true }],
  ],
};

export const CARD_EFFECTS = Object.fromEntries(SETS.flatMap((set) => {
  const specs = SET_EFFECT_SPECS[set.id] || [];
  return set.cards.map((card, index) => {
    const [type, value, flags = {}] = specs[index] || ["income", 1];
    return [card.id, { type, value, ramp: !!flags.ramp, meta: !!flags.meta }];
  });
}));

export function getCardEffect(cardId) {
  return CARD_EFFECTS[cardId] || null;
}

export function describeCardEffect(cardId) {
  const effect = getCardEffect(cardId);
  const card = getCard(cardId);
  if (!effect || !card) return "";
  const setName = getSet(card.setId).name;
  const v = effect.value;
  const base = {
    income: `+${formatNumber(v)}/s cash while displayed`,
    dupValue: `Duplicates sell for ${v}% more`,
    setDupValue: `${setName} duplicates bank ${v}% more value`,
    packDiscount: `All packs cost ${v}% less`,
    setPackDiscount: `${setName} packs cost ${v}% less`,
    rarityWeight: `Premium-card pull weight +${v}%`,
    freePack: `${v}% chance each opened pack refunds a free pack`,
    godPack: `${v}% chance after each pack to bless the next into a GOD PACK`,
    extraCard: `${v}% chance packs contain a 7th card`,
    dupReroll: `${v}% chance a duplicate pull becomes a card you don't own`,
    crossSet: `Each pull has a ${v}% chance to come from another unlocked set`,
    interest: `Cash earns ${v}% interest per minute`,
    offline: `Offline earnings +${v}%`,
    pity: `Every ${v} packs opened, one pull is guaranteed premium`,
    autoOpen: `Auto-opens a table pack every ${v}s`,
    amplify: `Other displayed effects are ${v}% stronger`,
    inscriptionGain: `+${v}% Inscriptions earned on Rewrite`,
    inscriptionIncome: `+${formatNumber(v)}/s cash per Inscription held`,
    headStart: `Rewrites begin with ${v} free Corner Critters packs`,
    keepCoins: `Keep ${v}% of your cash through a Rewrite`,
    nameless: "Unlocks REWRITE, and Inscriptions earned are doubled",
  }[effect.type] || "";
  const suffixes = [];
  if (effect.ramp) suffixes.push(`Grows to full power over ${RAMP_FULL_MINUTES} min on display; resets when unseated`);
  if (effect.meta) suffixes.push("Meta effect: shapes the Rewrite loop");
  return suffixes.length ? `${base}. ${suffixes.join(". ")}.` : `${base}.`;
}

export function getRampScale(displayedAt, now) {
  const at = Number.isFinite(displayedAt) ? displayedAt : now;
  const minutes = Math.max(0, (now - at) / 60_000);
  return RAMP_FLOOR + (1 - RAMP_FLOOR) * Math.min(1, minutes / RAMP_FULL_MINUTES);
}

export function getDisplayedEntries(state) {
  const seen = new Set();
  return (Array.isArray(state.displayed) ? state.displayed : [])
    .filter((entry) => {
      if (!entry || typeof entry.id !== "string" || seen.has(entry.id)) return false;
      if (!getCardEffect(entry.id)) return false;
      if ((state.collection?.[entry.id] || 0) <= 0) return false;
      seen.add(entry.id);
      return true;
    })
    .slice(0, CASE_SIZE);
}

const EMPTY_MODIFIERS = {
  income: 0,
  dupValue: 0,
  setDupValue: {},
  packDiscount: 0,
  setPackDiscount: {},
  rarityWeight: 0,
  freePack: 0,
  godPack: 0,
  extraCard: 0,
  dupReroll: 0,
  crossSet: 0,
  interest: 0,
  offline: 0,
  pityEvery: 0,
  autoOpenEvery: 0,
  amplify: 0,
  inscriptionGain: 0,
  inscriptionIncome: 0,
  headStart: 0,
  keepCoins: 0,
  namelessDisplayed: false,
};

export function getDisplayModifiers(state, now = Date.now()) {
  const entries = getDisplayedEntries(state);
  if (!entries.length) return { ...EMPTY_MODIFIERS, setDupValue: {}, setPackDiscount: {} };

  const mods = { ...EMPTY_MODIFIERS, setDupValue: {}, setPackDiscount: {} };
  const amplifyTotal = Math.min(
    EFFECT_CAPS.amplify,
    entries.reduce((total, entry) => {
      const effect = getCardEffect(entry.id);
      return effect.type === "amplify" ? total + effect.value : total;
    }, 0),
  );
  const amp = 1 + amplifyTotal / 100;
  mods.amplify = amplifyTotal;

  for (const entry of entries) {
    const effect = getCardEffect(entry.id);
    const card = getCard(entry.id);
    if (!effect || !card || effect.type === "amplify") continue;
    const scale = effect.ramp ? getRampScale(entry.at, now) : 1;
    const value = effect.value * scale * amp;
    switch (effect.type) {
      case "income": mods.income += value; break;
      case "dupValue": mods.dupValue += value; break;
      case "setDupValue":
        mods.setDupValue[card.setId] = (mods.setDupValue[card.setId] || 0) + value;
        break;
      case "packDiscount": mods.packDiscount += value; break;
      case "setPackDiscount":
        mods.setPackDiscount[card.setId] = (mods.setPackDiscount[card.setId] || 0) + value;
        break;
      case "rarityWeight": mods.rarityWeight += value; break;
      case "freePack": mods.freePack += value; break;
      case "godPack": mods.godPack += value; break;
      case "extraCard": mods.extraCard += value; break;
      case "dupReroll": mods.dupReroll += value; break;
      case "crossSet": mods.crossSet += value; break;
      case "interest": mods.interest += value; break;
      case "offline": mods.offline += value; break;
      case "pity":
        // Guarantees compound by taking the shortest displayed interval.
        mods.pityEvery = mods.pityEvery ? Math.min(mods.pityEvery, effect.value) : effect.value;
        break;
      case "autoOpen":
        mods.autoOpenEvery = mods.autoOpenEvery
          ? Math.min(mods.autoOpenEvery, effect.value)
          : effect.value;
        break;
      case "inscriptionGain": mods.inscriptionGain += value; break;
      case "inscriptionIncome": mods.inscriptionIncome += value; break;
      case "headStart": mods.headStart += Math.round(effect.value * amp); break;
      case "keepCoins": mods.keepCoins = Math.min(95, mods.keepCoins + effect.value); break;
      case "nameless":
        mods.namelessDisplayed = true;
        mods.inscriptionGain += effect.value;
        break;
      default: break;
    }
  }

  mods.packDiscount = Math.min(EFFECT_CAPS.packDiscount, mods.packDiscount);
  mods.rarityWeight = Math.min(EFFECT_CAPS.rarityWeight, mods.rarityWeight);
  mods.freePack = Math.min(EFFECT_CAPS.freePack, mods.freePack);
  mods.godPack = Math.min(EFFECT_CAPS.godPack, mods.godPack);
  mods.extraCard = Math.min(EFFECT_CAPS.extraCard, mods.extraCard);
  mods.dupReroll = Math.min(EFFECT_CAPS.dupReroll, mods.dupReroll);
  mods.crossSet = Math.min(EFFECT_CAPS.crossSet, mods.crossSet);
  mods.interest = Math.min(EFFECT_CAPS.interest, mods.interest);
  mods.autoOpenEvery = mods.autoOpenEvery ? Math.max(2, mods.autoOpenEvery) : 0;
  return mods;
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
