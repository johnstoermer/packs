// PACKWORKS core data — the 50-card Packworks Core set and its four
// rarities. Cards pay cash by rarity when revealed; Salvage tears a revealed
// card into Scrap. Twenty cards carry printed effects; the other thirty are
// collection cards with no effect.

export const RARITIES = {
  common: {
    id: "common",
    order: 0,
    label: "Common",
    short: "C",
    odds: 0.74,
    rateLabel: "74%",
    sellValue: 1,
    scrapValue: 1,
    color: "#aeb6b2",
    deep: "#626b66",
  },
  rare: {
    id: "rare",
    order: 1,
    label: "Rare",
    short: "R",
    odds: 0.2,
    rateLabel: "20%",
    sellValue: 4,
    scrapValue: 2,
    color: "#5aa8ff",
    deep: "#285f9f",
  },
  epic: {
    id: "epic",
    order: 2,
    label: "Epic",
    short: "E",
    odds: 0.05,
    rateLabel: "5%",
    sellValue: 15,
    scrapValue: 4,
    color: "#b475ff",
    deep: "#68409b",
  },
  legendary: {
    id: "legendary",
    order: 3,
    label: "Legendary",
    short: "L",
    odds: 0.01,
    rateLabel: "1%",
    sellValue: 60,
    scrapValue: 8,
    color: "#ffd15c",
    deep: "#a86b12",
  },
};

export const RARITY_IDS = ["common", "rare", "epic", "legendary"];

// Retired rarity names from earlier designs collapse onto the live four so
// stray identifiers never crash a lookup.
const LEGACY_RARITY_COLLAPSE = {
  uncommon: "rare",
  mythic: "legendary",
  divine: "legendary",
  nameless: "legendary",
  exalted: "epic",
  ascendant: "epic",
  celestial: "legendary",
};

export function canonicalRarityId(rarity) {
  if (RARITIES[rarity]) return rarity;
  return LEGACY_RARITY_COLLAPSE[rarity] || "common";
}

export function rarityIdAtOrder(order) {
  return RARITY_IDS[Math.max(0, Math.min(RARITY_IDS.length - 1, order))];
}

// [name, rarity, artId, effectId or null, flavor]
// artId is the directory key under public/card-art-pixel.
const CARD_ROWS = [
  // Commons (24)
  ["Coinbud", "common", "corner-01", "commonCashBonus", "It never sees a Common — only small change with potential."],
  ["Pennigeon", "common", "corner-02", null, "Roosts wherever loose change collects."],
  ["Duplop", "common", "corner-03", null, "If you have one, you have several."],
  ["Bankslime", "common", "corner-05", null, "Absorbs deposits. Rarely issues refunds."],
  ["Packross", "common", "corner-09", null, "Migrates from shelf to shelf, always sealed."],
  ["Echowl", "common", "corner-10", null, "Asks who. Answers who. Asks who again."],
  ["Foilmonk", "common", "corner-06", "foilChance", "It polishes every card it meets, just in case."],
  ["Scrapcup", "common", "signal-05", "extraCommon", "One sip of Scrap and something small climbs out."],
  ["Mergeimp", "common", "hollow-08", "fuseSalvage", "It tears up the merger paperwork for parts."],
  ["Marklet", "common", "circuit-01", null, "Leaves a little glow wherever it lands."],
  ["Bountibot", "common", "circuit-02", null, "Programmed to celebrate every pull."],
  ["Cresthopper", "common", "circuit-03", null, "Jumps straight to the best card in the room."],
  ["Glyphguard", "common", "circuit-04", null, "On duty beside the binder, day and night."],
  ["Reverbogre", "common", "circuit-09", null, "Everything it says, it says twice. Twice."],
  ["Echoboard", "common", "corner-07", null, "Still displaying last week's best pull."],
  ["Resonash", "common", "unwritten-09", null, "The ember that remembers the whole fire."],
  ["Questhorn", "common", "prism-07", null, "One note, and everyone checks their collection."],
  ["Coincrow", "common", "crown-09", null, "Hoards shiny things. Files them by rarity."],
  ["Tripmoss", "common", "unwritten-02", null, "Soft landing for dropped cards."],
  ["Coinfern", "common", "unwritten-06", null, "Unfurls a fresh leaf for every payday."],
  ["Sootroc", "common", "hollow-10", null, "Nests in the warm side of the shredder."],
  ["Shiftguin", "common", "lastlight-05", null, "Waddles in wearing a different rarity every day."],
  ["Cryoworm", "common", "prism-05", null, "Keeps the rarest pulls perfectly chilled."],
  ["Questchrome", "common", "observatory-11", null, "Reflects the card you were hoping for."],
  // Rares (14)
  ["Scrapactus", "rare", "apocalypse-04", "salvageChance", "It never sees a spare card — only tomorrow's parts."],
  ["Salvatort", "rare", "apocalypse-03", "commonScrapDouble", "The plainer the print, the cleaner the cut."],
  ["Recyclen", "rare", "foundry-11", "rerollCommon", "Feed it a Common and it hands back a maybe."],
  ["Bellpack", "rare", "foundry-05", "packOpenAddCards", "Rings once for the pack, three more for the bonus."],
  ["Heartmerge", "rare", "verdant-12", "fuseSameRarity", "Two of a kind is one waiting to happen."],
  ["Fusihare", "rare", "unwritten-07", "fuseJump", "Sometimes the leap clears a whole tier."],
  ["Boiloreverb", "rare", "foundry-01", "fuseTriggerRight", "The bang carries one bench to the right."],
  ["Scrapanvil", "rare", "foundry-06", "salvageAddCard", "Strike quality metal and sparks become cards."],
  ["Zeraph", "rare", "circuit-12", null, "It knows which card you'll flip before you do."],
  ["Locklure", "rare", "crown-11", null, "The shine is the trap. The trap is also shiny."],
  ["Questhound", "rare", "lastlight-10", null, "Points at sealed packs. Never wrong."],
  ["Salvoon", "rare", "signal-12", null, "Drifts over the scrapyard, taking inventory."],
  ["Goldgorge", "rare", "unwritten-08", null, "Swallowed a fortune. Still hungry."],
  ["Twinmoon", "rare", "lastlight-09", null, "Everything under it happens in pairs."],
  // Epics (8)
  ["Rarehouse", "epic", "apocalypse-08", "packOpenRarePlus", "Half your cash buys the good shelf."],
  ["Reclaimotive", "epic", "lastlight-11", "salvagePackBurst", "Twenty ruined prints become one unopened possibility."],
  ["Cinderscrap", "epic", "unwritten-04", "noCashDoubleScrap", "It burned the till and doubled the yard."],
  ["Firstseer", "epic", "observatory-07", "firstRevealAll", "One glance and the whole pack gives itself away."],
  ["Foilpress", "epic", "foundry-03", "foilFuseLegendary", "Two mirrors go in. A legend comes out."],
  ["Encorekeep", "epic", "hollow-05", "firstSlotEcho", "The front of the case always gets an encore."],
  ["Regalynx", "epic", "crown-10", null, "It only appears when the pull deserves an audience."],
  ["Pacturion", "epic", "crown-07", null, "Guards the terms of every trade ever made."],
  // Legendaries (4)
  ["Omniecho", "legendary", "prism-12", "revealTwice", "Every reveal happens once more, everywhere at once."],
  ["Mimistar", "legendary", "abyss-12", "copyRight", "It becomes its neighbor, only brighter."],
  ["Lunaglyph", "legendary", "observatory-06", null, "The rarest ink only shows by moonlight."],
  ["Dawnrift", "legendary", "lastlight-07", null, "Where it opens, the morning spills through."],
];

export const CORE_SET = {
  id: "core",
  name: "Packworks Core",
  short: "PW",
  tagline: "Fifty cards, one press, every impossible pull",
  packCost: 12,
  colors: ["#ffd44f", "#68d9ec", "#082d61"],
  art: "factory",
  cards: CARD_ROWS.map(([name, rarity, artId, effectId, flavor], index) => ({
    id: `core-${String(index + 1).padStart(2, "0")}`,
    number: index + 1,
    setId: "core",
    name,
    rarity,
    artId,
    effectId,
    flavor,
  })),
};

if (CORE_SET.cards.length !== 50) {
  throw new Error(`Packworks Core must hold exactly 50 cards, found ${CORE_SET.cards.length}`);
}
{
  const effectCount = CORE_SET.cards.filter((card) => card.effectId).length;
  if (effectCount !== 20) {
    throw new Error(`Packworks Core must hold exactly 20 effect cards, found ${effectCount}`);
  }
}

export const SETS = [CORE_SET];
export const ALL_CARDS = CORE_SET.cards;

export const PACK_TYPES = [
  {
    id: "loose",
    name: "Core Pack",
    label: "Core Pack",
    short: "PACK",
    cardCount: 6,
    cost: CORE_SET.packCost,
    description: "SIX CARDS / EVERY RARITY IN PLAY",
    featuredNames: ["Omniecho", "Rarehouse", "Scrapactus"],
    colors: ["#ffd44f", "#68d9ec", "#082d61"],
  },
];

const CARD_BY_ID = new Map(ALL_CARDS.map((card) => [card.id, card]));

export function getCard(id) {
  return CARD_BY_ID.get(id) || null;
}

export function getSet(id) {
  return SETS.find((set) => set.id === id) || CORE_SET;
}

export function getPackType(id) {
  return PACK_TYPES.find((type) => type.id === id) || PACK_TYPES[0];
}

export function getCardArtId(card) {
  return card.artId || card.id;
}

// Art tooling compatibility: art prompts are filed under the same key the
// renderer uses.
export function getCardRulesId(card) {
  return card.id;
}

export function formatNumber(value) {
  const number = Number(value) || 0;
  const abs = Math.abs(number);
  if (abs >= 1e12) return `${(number / 1e12).toFixed(2).replace(/\.?0+$/, "")}T`;
  if (abs >= 1e9) return `${(number / 1e9).toFixed(2).replace(/\.?0+$/, "")}B`;
  if (abs >= 1e6) return `${(number / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (abs >= 10_000) return `${(number / 1e3).toFixed(1).replace(/\.?0+$/, "")}K`;
  return number.toLocaleString("en-US");
}

export function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed) {
  let state = hashString(String(seed)) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}
