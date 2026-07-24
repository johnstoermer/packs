export const RARITIES = {
  common: {
    id: "common",
    label: "Common",
    short: "C",
    color: "#c7d0ca",
    deep: "#66736c",
    value: 1,
    dust: 1,
    order: 0,
  },
  uncommon: {
    id: "uncommon",
    label: "Uncommon",
    short: "U",
    color: "#67d7a0",
    deep: "#28734f",
    value: 4,
    dust: 3,
    order: 1,
  },
  rare: {
    id: "rare",
    label: "Rare",
    short: "R",
    color: "#57a9ff",
    deep: "#285c9a",
    value: 15,
    dust: 10,
    order: 2,
  },
  epic: {
    id: "epic",
    label: "Epic",
    short: "E",
    color: "#b87cff",
    deep: "#6940a0",
    value: 72,
    dust: 35,
    order: 3,
  },
  legendary: {
    id: "legendary",
    label: "Legendary",
    short: "L",
    color: "#ffd36a",
    deep: "#a96c18",
    value: 420,
    dust: 150,
    order: 4,
  },
};

const makeCards = (setId, entries) => entries.map((entry, index) => ({
  id: `${setId}-${String(index + 1).padStart(2, "0")}`,
  number: index + 1,
  setId,
  ...entry,
}));

export const SETS = [
  {
    id: "corner",
    name: "Corner Critters",
    short: "CC",
    tagline: "Small legends from around the block",
    unlockCost: 0,
    baseValue: 5,
    colors: ["#f7c95d", "#e8683b", "#223c3f"],
    art: "city",
    cards: makeCards("corner", [
      { name: "Alley Sprout", rarity: "common", flavor: "Always first through the fence.", subject: "sprout" },
      { name: "Pavement Pigeon", rarity: "common", flavor: "Owns every bench in town.", subject: "bird" },
      { name: "Mop Bucket Mimic", rarity: "common", flavor: "The cleanest ambush.", subject: "mimic" },
      { name: "Bodega Beetle", rarity: "common", flavor: "Works the late shift.", subject: "beetle" },
      { name: "Bus Stop Blob", rarity: "common", flavor: "Still waiting for the 4:10.", subject: "blob" },
      { name: "Fire Escape Fox", rarity: "uncommon", flavor: "Never takes the stairs.", subject: "fox" },
      { name: "Rooftop Raccoon", rarity: "uncommon", flavor: "A collector of fine lids.", subject: "raccoon" },
      { name: "Meter Muncher", rarity: "uncommon", flavor: "Exact change only.", subject: "muncher" },
      { name: "Crosswalk King", rarity: "rare", flavor: "Traffic moves when he says.", subject: "king" },
      { name: "Midnight Courier", rarity: "rare", flavor: "Every parcel arrives before dawn.", subject: "courier" },
      { name: "The Last Newsstand", rarity: "epic", flavor: "It remembers every headline.", subject: "stand" },
      { name: "Mayor Mooncat", rarity: "legendary", flavor: "Nine terms. Nine lives.", subject: "mooncat" },
    ]),
  },
  {
    id: "circuit",
    name: "Neon Circuit",
    short: "NC",
    tagline: "Machines dreaming after closing time",
    unlockCost: 4200,
    baseValue: 45,
    colors: ["#62e6d1", "#ea4f8e", "#17284e"],
    art: "neon",
    cards: makeCards("circuit", [
      { name: "Pocket Relay", rarity: "common", flavor: "Passes the spark along.", subject: "relay" },
      { name: "Tape Deck Drone", rarity: "common", flavor: "Side B contains its orders.", subject: "drone" },
      { name: "Static Hopper", rarity: "common", flavor: "Feeds on dead channels.", subject: "hopper" },
      { name: "Pixel Warden", rarity: "common", flavor: "No sprite leaves the grid.", subject: "warden" },
      { name: "Copper Crawler", rarity: "common", flavor: "Repairs traces while you sleep.", subject: "crawler" },
      { name: "Arcade Phantom", rarity: "uncommon", flavor: "One credit remains.", subject: "phantom" },
      { name: "Signal Skater", rarity: "uncommon", flavor: "Rides the carrier wave.", subject: "skater" },
      { name: "Chrome Familiar", rarity: "uncommon", flavor: "Polished beyond recognition.", subject: "familiar" },
      { name: "Overclock Ogre", rarity: "rare", flavor: "Runs hot. Hits harder.", subject: "ogre" },
      { name: "The Blue Screen", rarity: "rare", flavor: "Everything stops to admire it.", subject: "screen" },
      { name: "Motherboard City", rarity: "epic", flavor: "Every light is a living room.", subject: "city" },
      { name: "Zero-Day Seraph", rarity: "legendary", flavor: "It arrived before the warning.", subject: "seraph" },
    ]),
  },
  {
    id: "frontier",
    name: "Gilded Frontier",
    short: "GF",
    tagline: "Dust, brass, and impossible horizons",
    unlockCost: 310000,
    baseValue: 620,
    colors: ["#f2b85b", "#bd5c3d", "#293943"],
    art: "desert",
    cards: makeCards("frontier", [
      { name: "Cactus Squire", rarity: "common", flavor: "Prickly about protocol.", subject: "squire" },
      { name: "Tin Spur Tortoise", rarity: "common", flavor: "Never late. Never early.", subject: "tortoise" },
      { name: "Mesa Moth", rarity: "common", flavor: "Follows the furnace sun.", subject: "moth" },
      { name: "Tumbleweed Pup", rarity: "common", flavor: "Comes when the wind calls.", subject: "pup" },
      { name: "Prospector Mole", rarity: "common", flavor: "Struck glitter again.", subject: "mole" },
      { name: "Brassback Bison", rarity: "uncommon", flavor: "Built to cross forever.", subject: "bison" },
      { name: "Sunset Duelist", rarity: "uncommon", flavor: "Draws at the last light.", subject: "duelist" },
      { name: "Railway Revenant", rarity: "uncommon", flavor: "The midnight line has no stops.", subject: "revenant" },
      { name: "Canyon Colossus", rarity: "rare", flavor: "Mountains are only older rivals.", subject: "colossus" },
      { name: "Goldrush Griffin", rarity: "rare", flavor: "Guards a vein above the clouds.", subject: "griffin" },
      { name: "The Endless Engine", rarity: "epic", flavor: "Fueled by the edge of the map.", subject: "engine" },
      { name: "High Noon Titan", rarity: "legendary", flavor: "At twelve, the shadows surrender.", subject: "titan" },
    ]),
  },
  {
    id: "abyss",
    name: "Abyssal Bloom",
    short: "AB",
    tagline: "A garden beneath the final tide",
    unlockCost: 26000000,
    baseValue: 11000,
    colors: ["#69d9d0", "#7767d7", "#101d36"],
    art: "ocean",
    cards: makeCards("abyss", [
      { name: "Pebble Polyp", rarity: "common", flavor: "A reef begins with one.", subject: "polyp" },
      { name: "Lantern Minnow", rarity: "common", flavor: "A pocket-sized dawn.", subject: "minnow" },
      { name: "Velvet Urchin", rarity: "common", flavor: "Softer than it looks. Barely.", subject: "urchin" },
      { name: "Bubble Hermit", rarity: "common", flavor: "Home is a rising thing.", subject: "hermit" },
      { name: "Kelp Kite", rarity: "common", flavor: "The current holds the string.", subject: "kite" },
      { name: "Prism Jelly", rarity: "uncommon", flavor: "A rainbow with a pulse.", subject: "jelly" },
      { name: "Trench Gardener", rarity: "uncommon", flavor: "Tends what the sun cannot.", subject: "gardener" },
      { name: "Pearlback Ray", rarity: "uncommon", flavor: "Night glides beneath it.", subject: "ray" },
      { name: "Cathedral Crab", rarity: "rare", flavor: "Its shell holds a congregation.", subject: "crab" },
      { name: "Tideglass Whale", rarity: "rare", flavor: "The whole sea passes through.", subject: "whale" },
      { name: "Garden of Teeth", rarity: "epic", flavor: "Every petal remembers hunger.", subject: "garden" },
      { name: "The Drowned Star", rarity: "legendary", flavor: "Still burning. Still sinking.", subject: "star" },
    ]),
  },
  {
    id: "crown",
    name: "Crownfall",
    short: "CF",
    tagline: "The last court at the end of history",
    unlockCost: 3800000000,
    baseValue: 220000,
    colors: ["#f0c76a", "#a44655", "#211f30"],
    art: "castle",
    cards: makeCards("crown", [
      { name: "Page of Ash", rarity: "common", flavor: "Carries letters no one will read.", subject: "page" },
      { name: "Candle Guard", rarity: "common", flavor: "One flame remains on duty.", subject: "guard" },
      { name: "Velvet Rat", rarity: "common", flavor: "A minor title. Major appetite.", subject: "rat" },
      { name: "Bell Tower Bat", rarity: "common", flavor: "Counts the hours backward.", subject: "bat" },
      { name: "Porcelain Hound", rarity: "common", flavor: "Cracked, never broken.", subject: "hound" },
      { name: "Thorn Chancellor", rarity: "uncommon", flavor: "Every decree draws blood.", subject: "chancellor" },
      { name: "Gilt Executioner", rarity: "uncommon", flavor: "The blade is ceremonial. Mostly.", subject: "executioner" },
      { name: "Hollow Herald", rarity: "uncommon", flavor: "Announces what has already happened.", subject: "herald" },
      { name: "Banquet of Crows", rarity: "rare", flavor: "The guests arrived early.", subject: "crows" },
      { name: "The Unseated Queen", rarity: "rare", flavor: "A throne is only furniture.", subject: "queen" },
      { name: "Kingdom in a Locket", rarity: "epic", flavor: "Open only in times of peace.", subject: "locket" },
      { name: "The Final Coronation", rarity: "legendary", flavor: "There was no one left to applaud.", subject: "coronation" },
    ]),
  },
];

export const ALL_CARDS = SETS.flatMap((set) => set.cards);

export const UPGRADE_DEFS = [
  {
    id: "fingers",
    name: "Quick Hands",
    label: "Manual packs pay more",
    detail: "+38% manual pack value",
    baseCost: 45,
    growth: 1.67,
    unlockAt: 0,
    max: 30,
  },
  {
    id: "sorter",
    name: "Tabletop Sorter",
    label: "Opens packs while you work",
    detail: "+0.10 packs per second",
    baseCost: 120,
    growth: 1.74,
    unlockAt: 3,
    max: 40,
  },
  {
    id: "scanner",
    name: "Market Scanner",
    label: "Prices every pull correctly",
    detail: "+22% value from all cards",
    baseCost: 520,
    growth: 1.71,
    unlockAt: 8,
    max: 30,
  },
  {
    id: "sleeves",
    name: "Archival Sleeves",
    label: "Duplicates become more useful",
    detail: "+40% duplicate dust",
    baseCost: 1650,
    growth: 1.78,
    unlockAt: 16,
    max: 20,
  },
  {
    id: "lights",
    name: "Inspection Lights",
    label: "Spot premium stock",
    detail: "+7% rarity luck",
    baseCost: 5400,
    growth: 1.84,
    unlockAt: 28,
    max: 18,
  },
  {
    id: "case",
    name: "Street Display",
    label: "The binder draws customers",
    detail: "Passive cash from discoveries",
    baseCost: 18000,
    growth: 1.79,
    unlockAt: 45,
    max: 25,
  },
  {
    id: "crew",
    name: "Night Crew",
    label: "A second shift for the line",
    detail: "+0.55 packs per second",
    baseCost: 69000,
    growth: 1.92,
    unlockAt: 75,
    max: 20,
  },
  {
    id: "press",
    name: "Double-Feed Press",
    label: "Sometimes finds a bonus card",
    detail: "+4% chance for a fifth card",
    baseCost: 240000,
    growth: 2.02,
    unlockAt: 120,
    max: 15,
  },
];

export const ACHIEVEMENTS = [
  { id: "first-pack", name: "Fresh Foil", detail: "Open your first pack", test: (s) => s.packsOpened >= 1 },
  { id: "twenty-five", name: "Counter Regular", detail: "Open 25 packs", test: (s) => s.packsOpened >= 25 },
  { id: "century", name: "Case Breaker", detail: "Open 100 packs", test: (s) => s.packsOpened >= 100 },
  { id: "first-rare", name: "Blue Light", detail: "Pull a rare card", test: (s) => rarityCount(s, "rare") >= 1 },
  { id: "first-legend", name: "Gold Room", detail: "Pull a legendary card", test: (s) => rarityCount(s, "legendary") >= 1 },
  { id: "set-complete", name: "Twelve of Twelve", detail: "Complete a card set", test: (s) => completedSets(s) >= 1 },
  { id: "million", name: "Seven Figures", detail: "Earn 1,000,000 lifetime cash", test: (s) => s.lifetimeCoins >= 1_000_000 },
  { id: "reprint", name: "Second Edition", detail: "Begin a reprint", test: (s) => s.reprints >= 1 },
];

export function rarityCount(state, rarity) {
  return ALL_CARDS.reduce((sum, card) => sum + (card.rarity === rarity && state.collection?.[card.id] ? 1 : 0), 0);
}

export function completedSets(state) {
  return SETS.reduce((sum, set) => sum + (set.cards.every((card) => state.collection?.[card.id]) ? 1 : 0), 0);
}

export function getSet(id) {
  return SETS.find((set) => set.id === id) || SETS[0];
}

export function getCard(id) {
  return ALL_CARDS.find((card) => card.id === id);
}

export function formatNumber(value, precision = 1) {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs < 1000) return Math.floor(value).toLocaleString("en-US");
  const units = [
    [1e24, "Sp"],
    [1e21, "Sx"],
    [1e18, "Qi"],
    [1e15, "Qa"],
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  const [scale, suffix] = units.find(([scale]) => abs >= scale) || [1, ""];
  const scaled = value / scale;
  const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : precision;
  return `${scaled.toFixed(digits).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1")}${suffix}`;
}

export function formatRate(value) {
  if (value < 0.01) return "0";
  if (value < 10) return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return formatNumber(value);
}

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
