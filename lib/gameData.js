const RARITY_SCALE = [
  {
    id: "common",
    label: "Common",
    short: "C",
    rateLabel: "~45%",
    odds: 0.45,
    color: "#aeb6b2",
    deep: "#626b66",
    border: "Gray",
    sellValue: 1,
  },
  {
    id: "uncommon",
    label: "Uncommon",
    short: "U",
    rateLabel: "24%",
    odds: 0.24,
    color: "#62cf86",
    deep: "#267247",
    border: "Green",
    sellValue: 2,
  },
  {
    id: "rare",
    label: "Rare",
    short: "R",
    rateLabel: "15%",
    odds: 0.15,
    color: "#5aa8ff",
    deep: "#285f9f",
    border: "Blue",
    sellValue: 5,
  },
  {
    id: "epic",
    label: "Epic",
    short: "E",
    rateLabel: "8%",
    odds: 0.08,
    color: "#b475ff",
    deep: "#68409b",
    border: "Purple",
    sellValue: 12,
  },
  {
    id: "legendary",
    label: "Legendary",
    short: "L",
    rateLabel: "4%",
    odds: 0.04,
    color: "#ffd15c",
    deep: "#a86b12",
    border: "Gold",
    sellValue: 30,
  },
  {
    id: "mythic",
    label: "Mythic",
    short: "M",
    rateLabel: "2%",
    odds: 0.02,
    color: "#ff934d",
    deep: "#a5441d",
    border: "Orange",
    sellValue: 75,
  },
  {
    id: "exalted",
    label: "Exalted",
    short: "X",
    rateLabel: "1%",
    odds: 0.01,
    color: "#fff0b8",
    deep: "#9b8036",
    border: "White-gold, slow shimmer",
    sellValue: 180,
  },
  {
    id: "ascendant",
    label: "Ascendant",
    short: "AS",
    rateLabel: "0.5%",
    odds: 0.005,
    color: "#dce8ee",
    deep: "#71838b",
    border: "Silver, sweeping gleam",
    sellValue: 400,
  },
  {
    id: "celestial",
    label: "Celestial",
    short: "CE",
    rateLabel: "0.25%",
    odds: 0.0025,
    color: "#8cc9ff",
    deep: "#365f91",
    border: "Drifting starfield",
    sellValue: 1_100,
  },
  {
    id: "divine",
    label: "Divine",
    short: "D",
    rateLabel: "0.1%",
    odds: 0.001,
    color: "#fff5c7",
    deep: "#a87720",
    border: "Pulsing halo",
    sellValue: 4_000,
  },
  {
    id: "astral",
    label: "Astral",
    short: "AT",
    rateLabel: "0.05%",
    odds: 0.0005,
    color: "#bba6ff",
    deep: "#594a99",
    border: "Constellation lines that redraw",
    sellValue: 15_000,
  },
  {
    id: "eternal",
    label: "Eternal",
    short: "ET",
    rateLabel: "0.02%",
    odds: 0.0002,
    color: "#75e3cc",
    deep: "#287767",
    border: "Slowly rotating pattern",
    sellValue: 60_000,
  },
  {
    id: "primordial",
    label: "Primordial",
    short: "P",
    rateLabel: "0.01%",
    odds: 0.0001,
    color: "#ff6c58",
    deep: "#982d27",
    border: "Churning, unstable",
    sellValue: 250_000,
  },
  {
    id: "transcendent",
    label: "Transcendent",
    short: "TR",
    rateLabel: "0.005%",
    odds: 0.00005,
    color: "#ff8fe8",
    deep: "#8e277d",
    border: "Bleeds past the card edge",
    sellValue: 1_100_000,
  },
  {
    id: "empyrean",
    label: "Empyrean",
    short: "EM",
    rateLabel: "0.002%",
    odds: 0.00002,
    color: "#ffe982",
    deep: "#a97513",
    border: "Casts light onto neighboring cards",
    sellValue: 5_000_000,
  },
  {
    id: "absolute",
    label: "Absolute",
    short: "AB",
    rateLabel: "0.001%",
    odds: 0.00001,
    color: "#e8ffff",
    deep: "#568a92",
    border: "Refracts whatever is behind it",
    sellValue: 25_000_000,
  },
  {
    id: "singularity",
    label: "Singularity",
    short: "SG",
    rateLabel: "0.0005%",
    odds: 0.000005,
    color: "#9c7cff",
    deep: "#3a286b",
    border: "Pulls inward and warps the art",
    sellValue: 150_000_000,
  },
  {
    id: "nameless",
    label: "Nameless",
    short: "N",
    rateLabel: "0.0001%",
    odds: 0.000001,
    color: "#f4f4f2",
    deep: "#333538",
    border: "Flickers between every other border",
    sellValue: 1_000_000_000,
  },
];

export const RARITIES = Object.fromEntries(RARITY_SCALE.map((rarity, order) => [
  rarity.id,
  {
    ...rarity,
    income: 0,
    duelPower: 2 + order * 3,
    forgeYield: Math.max(1, Math.round(1.7 ** order)),
    introducedBeat: 1,
    autoCertifiedAt: null,
    order,
  },
]));

export const FUSION_THRESHOLDS = [2, 4, 8, 16, 32];

export const ARCHETYPES = [
  {
    id: "swarm",
    label: "Swarm",
    mark: "SW",
    color: "#edb94d",
    detail: "Wide boards turn small bodies into pressure.",
  },
  {
    id: "tempo",
    label: "Tempo",
    mark: "TM",
    color: "#56c6d0",
    detail: "Fast cards steal rounds before power can stabilize.",
  },
  {
    id: "relic",
    label: "Relic",
    mark: "RL",
    color: "#b485e8",
    detail: "Artifacts compound when the same plan repeats.",
  },
  {
    id: "fortress",
    label: "Fortress",
    mark: "FT",
    color: "#e77a58",
    detail: "Heavy lines absorb variance and close late.",
  },
];

const SET_TAGS = {
  corner: ["swarm", "tempo", "relic", "fortress"],
  circuit: ["tempo", "relic", "swarm", "fortress"],
  frontier: ["fortress", "tempo", "swarm", "relic"],
  abyss: ["relic", "fortress", "tempo", "swarm"],
  crown: ["fortress", "relic", "swarm", "tempo"],
};

const makeCards = (setId, entries) => entries.map((entry, index) => ({
  id: `${setId}-${String(index + 1).padStart(2, "0")}`,
  number: index + 1,
  setId,
  tag: entry.tag || SET_TAGS[setId][index % SET_TAGS[setId].length],
  power: entry.power || RARITIES[entry.rarity].duelPower + (index % 3),
  guard: entry.guard || 1 + RARITIES[entry.rarity].order + ((index + 1) % 3),
  ...entry,
}));

export const PACK_PRODUCTS = [
  {
    id: "loose",
    label: "Loose pack",
    short: "PACK",
    packs: 1,
    costFactor: 10,
    discount: 0,
    manualBonus: true,
    unlockBeat: 1,
  },
  {
    id: "case",
    label: "Case",
    short: "CASE",
    packs: 144,
    costFactor: 1_190,
    discount: 17,
    manualBonus: true,
    unlockBeat: 5,
  },
  {
    id: "pallet",
    label: "Pallet",
    short: "PLT",
    packs: 3_456,
    costFactor: 25_000,
    discount: 28,
    manualBonus: false,
    unlockBeat: 10,
  },
  {
    id: "wholesale",
    label: "Wholesale lot",
    short: "LOT",
    packs: 5_000,
    costFactor: 32_000,
    discount: 36,
    manualBonus: false,
    unlockBeat: 10,
  },
];

export const CLEAN_UPGRADES = [
  {
    id: "shelf",
    name: "Dealer tray",
    detail: "+20% duplicate sale value",
    baseCost: 25,
    growth: 1.82,
    unlockPacks: 5,
    max: 20,
  },
  {
    id: "lamp",
    name: "Inspection lamp",
    detail: "+5% premium-card weight",
    baseCost: 90,
    growth: 1.92,
    unlockPacks: 20,
    max: 15,
  },
  {
    id: "supplier",
    name: "Supplier terms",
    detail: "2.5% off packs",
    baseCost: 280,
    growth: 2.04,
    unlockPacks: 50,
    max: 12,
  },
];

export const SETS = [
  {
    id: "corner",
    name: "Corner Critters",
    short: "CC",
    tagline: "Small legends from around the block",
    packCost: 10,
    unlockRequirements: [],
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
    packCost: 28,
    unlockRequirements: [
      { type: "completeSet", setId: "corner" },
    ],
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
    packCost: 75,
    unlockRequirements: [
      { type: "completeSet", setId: "circuit" },
    ],
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
    packCost: 220,
    unlockRequirements: [
      { type: "completeSet", setId: "frontier" },
    ],
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
    packCost: 700,
    unlockRequirements: [
      { type: "completeSet", setId: "abyss" },
    ],
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
