import { getCardIdentity } from "./cardIdentities.js";
import { CORE_ART_TRANSFERS } from "./coreArtTransfers.js";
import { CORE_SET_MANIFEST } from "./coreSetManifest.js";

const LEGACY_RARITY_COLLAPSE = {
  common: "common",
  uncommon: "uncommon",
  rare: "rare",
  epic: "epic",
  legendary: "legendary",
  mythic: "mythic",
  exalted: "mythic",
  ascendant: "mythic",
  celestial: "mythic",
  divine: "mythic",
  astral: "mythic",
  eternal: "divine",
  primordial: "divine",
  transcendent: "divine",
  empyrean: "divine",
  absolute: "divine",
  singularity: "divine",
  nameless: "nameless",
};

export function canonicalRarityId(rarity) {
  return LEGACY_RARITY_COLLAPSE[rarity] || "common";
}

const RARITY_SCALE = [
  {
    id: "common",
    label: "Common",
    short: "C",
    rateLabel: "75%",
    odds: 0.75,
    color: "#aeb6b2",
    deep: "#626b66",
    border: "Gray",
    sellValue: 1,
  },
  {
    id: "uncommon",
    label: "Uncommon",
    short: "U",
    rateLabel: "18%",
    odds: 0.18,
    color: "#62cf86",
    deep: "#267247",
    border: "Green",
    sellValue: 2,
  },
  {
    id: "rare",
    label: "Rare",
    short: "R",
    rateLabel: "5%",
    odds: 0.05,
    color: "#5aa8ff",
    deep: "#285f9f",
    border: "Blue",
    sellValue: 5,
  },
  {
    id: "epic",
    label: "Epic",
    short: "E",
    rateLabel: "1.5%",
    odds: 0.015,
    color: "#b475ff",
    deep: "#68409b",
    border: "Purple",
    sellValue: 12,
  },
  {
    id: "legendary",
    label: "Legendary",
    short: "L",
    rateLabel: "0.4%",
    odds: 0.004,
    color: "#ffd15c",
    deep: "#a86b12",
    border: "Gold",
    sellValue: 30,
  },
  {
    id: "mythic",
    label: "Mythic",
    short: "M",
    rateLabel: "0.09%",
    odds: 0.0009,
    color: "#ff934d",
    deep: "#a5441d",
    border: "Orange",
    sellValue: 75,
  },
  {
    id: "divine",
    label: "Divine",
    short: "D",
    rateLabel: "0.01%",
    odds: 0.0001,
    color: "#f4e8ff",
    deep: "#59317f",
    border: "Prismatic halo with inward gravity",
    sellValue: 1_000,
  },
  {
    id: "nameless",
    label: "Nameless",
    short: "N",
    rateLabel: "Completion unlock",
    odds: 0,
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

const DEFAULT_SET_TAGS = ["swarm", "tempo", "relic", "fortress"];

const makeCards = (setId, entries) => entries.map((entry, index) => {
  const id = `${setId}-${String(index + 1).padStart(2, "0")}`;
  const identity = getCardIdentity(id);
  const rarity = canonicalRarityId(entry.rarity);
  return {
    id,
    number: index + 1,
    setId,
    tag: entry.tag || (SET_TAGS[setId] || DEFAULT_SET_TAGS)[index % DEFAULT_SET_TAGS.length],
    power: entry.power || RARITIES[rarity].duelPower + (index % 3),
    guard: entry.guard || 1 + RARITIES[rarity].order + ((index + 1) % 3),
    subject: entry.subject || entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    ...entry,
    rarity,
    ...identity,
  };
});

export const PACK_TYPES = [
  {
    id: "loose",
    name: "Standard",
    label: "Standard",
    short: "PACK",
    packs: 1,
    cardCount: 6,
    costFactor: 100,
    discount: 0,
    manualBonus: true,
    unlockBeat: 1,
    packType: true,
    rarityShift: 0,
    guaranteedFoil: false,
    description: "Standard distribution.",
    featuredNames: ["Bankslime", "Coinbud", "Packross"],
    colors: ["#ffd44f", "#68d9ec", "#082d61"],
  },
  {
    id: "rare",
    name: "Rare",
    label: "Rare",
    short: "RARE",
    packs: 1,
    cardCount: 6,
    costFactor: 10_000,
    discount: 0,
    manualBonus: true,
    unlockBeat: 1,
    packType: true,
    rarityShift: 2,
    guaranteedFoil: false,
    description: "Common and Uncommon removed.",
    featuredNames: ["Echowl", "Portalink", "Catalystag"],
    colors: ["#71b8ff", "#b475ff", "#14295c"],
  },
  {
    id: "mega-standard",
    name: "Mega Standard",
    label: "Mega Standard",
    short: "MEGA",
    packs: 1,
    cardCount: 36,
    costFactor: 10_000,
    discount: 0,
    manualBonus: true,
    unlockBeat: 1,
    packType: true,
    rarityShift: 0,
    guaranteedFoil: false,
    description: "Standard distribution.",
    featuredNames: ["Rootpack", "Absolumute", "Reverbogre"],
    colors: ["#ffb64d", "#86dc7c", "#66300e"],
  },
  {
    id: "mega-rare",
    name: "Mega Rare",
    label: "Mega Rare",
    short: "M-RARE",
    packs: 1,
    cardCount: 36,
    costFactor: 1_000_000,
    discount: 0,
    manualBonus: true,
    unlockBeat: 1,
    packType: true,
    rarityShift: 2,
    guaranteedFoil: false,
    description: "Common and Uncommon removed.",
    featuredNames: ["Omniecho", "Prismorph", "Luxquest"],
    colors: ["#e8d7ff", "#ffbd59", "#35145d"],
  },
  {
    id: "collector",
    name: "Collector",
    label: "Collector",
    short: "FOIL",
    packs: 1,
    cardCount: 6,
    costFactor: 10_000,
    discount: 0,
    manualBonus: true,
    unlockBeat: 1,
    packType: true,
    rarityShift: 0,
    guaranteedFoil: true,
    description: "Standard distribution with a guaranteed foil.",
    featuredNames: ["Foilmonk", "Foilvan", "Foilpress"],
    colors: ["#ff8bd8", "#73efff", "#492267"],
  },
];

export const PACK_PRODUCTS = [
  ...PACK_TYPES,
  {
    id: "case",
    label: "Case",
    short: "CASE",
    packs: 144,
    costFactor: 1_190,
    discount: 17,
    manualBonus: true,
    unlockBeat: 5,
    bulk: true,
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
    bulk: true,
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
    bulk: true,
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

const BASE_SETS = [
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
    packCost: 20,
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
    packCost: 40,
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
    packCost: 80,
    unlockRequirements: [
      { type: "completeSet", setId: "circuit" },
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
    packCost: 150,
    unlockRequirements: [
      { type: "completeSet", setId: "circuit" },
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

const EXPANSION_SET_SPECS = [
  {
    id: "verdant",
    name: "Verdant Machine",
    short: "VM",
    tagline: "A greenhouse learning how to walk",
    unlock: { any: ["frontier", "abyss"] },
    packCost: 300,
    colors: ["#86cf72", "#d6a94a", "#253f37"],
    art: "greenhouse",
    cards: [
      ["Mossbolt Mouse", "common", "Tiny paws keep the gears clean."],
      ["Fernwheel Beetle", "common", "Every turn grows another frond."],
      ["Irrigation Imp", "common", "It waters everything except schedules."],
      ["Glasshouse Hare", "uncommon", "Spring follows close behind."],
      ["Pollen Drone", "uncommon", "A perfect route between imperfect flowers."],
      ["Vinebound Porter", "rare", "Carries the garden toward daylight."],
      ["Orchid Automaton", "rare", "Precision learned to bloom."],
      ["Rootline Stag", "epic", "Its antlers map the buried network."],
      ["Boiler Bloom", "legendary", "Steam is only impatient rain."],
      ["Canopy Engine", "mythic", "The forest runs on quiet momentum."],
      ["The Walking Conservatory", "mythic", "No climate could contain it."],
      ["Heartseed Colossus", "mythic", "One pulse wakes a thousand acres."],
    ],
  },
  {
    id: "polar",
    name: "Polar Archive",
    short: "PA",
    tagline: "Every lost page waits beneath the ice",
    unlock: { any: ["abyss", "crown"] },
    packCost: 600,
    colors: ["#bfe9f2", "#6ba6bf", "#1c2c46"],
    art: "archive",
    cards: [
      ["Snowquill Mouse", "common", "Its tracks are meticulous footnotes."],
      ["Index Penguin", "common", "Nothing escapes the catalog."],
      ["Frostbite Bookworm", "common", "A cold appetite for warm stories."],
      ["Lantern Scribe", "uncommon", "One sentence holds back the whiteout."],
      ["Shelfwalker Yak", "uncommon", "The stacks travel when it does."],
      ["Ink-Ice Fox", "rare", "Its tail edits the horizon."],
      ["Whiteout Curator", "epic", "The storm files every loose page."],
      ["Library Beneath Ice", "legendary", "Silence preserves what kingdoms forgot."],
      ["Aurora Archivist", "mythic", "The sky becomes a living index."],
      ["Glacier Atlas", "mythic", "Mountains turn with every page."],
      ["The Unburned Page", "exalted", "All winter gathered around one answer."],
      ["Keeper of Absolute Zero", "exalted", "Even memory freezes before the throne."],
    ],
  },
  {
    id: "ember",
    name: "Emberline",
    short: "EL",
    tagline: "The last railway through a burning world",
    unlock: { any: ["crown", "frontier"] },
    packCost: 1_000,
    colors: ["#ff8a42", "#c83d29", "#261c21"],
    art: "railway",
    cards: [
      ["Ash Ticket Toad", "common", "Fare paid. Destination uncertain."],
      ["Cinder Switchcat", "common", "One lever changes the whole horizon."],
      ["Coalcar Crab", "uncommon", "Built low against the sparks."],
      ["Spark Rail Pup", "uncommon", "Always racing the departure bell."],
      ["Smokestack Roc", "rare", "Its wings darken noon."],
      ["Lava Conductor", "epic", "Every gesture reroutes the fire."],
      ["The Last Station", "legendary", "No return tickets are sold."],
      ["Furnace Nomad", "mythic", "Home is wherever the boiler cools."],
      ["Brass Magma Wyrm", "mythic", "The engine learned to hunt."],
      ["Eclipse Express", "exalted", "Night arrives exactly on schedule."],
      ["Crown of Cinders", "ascendant", "The rails bow beneath it."],
      ["Terminal at the Sun", "ascendant", "The final platform faces forever."],
    ],
  },
  {
    id: "cloud",
    name: "Cloud Bazaar",
    short: "CB",
    tagline: "Everything has a price above the weather",
    unlock: { any: ["verdant", "ember"] },
    packCost: 1_500,
    colors: ["#7fc9f1", "#f0b44d", "#35466e"],
    art: "sky-market",
    cards: [
      ["Kitefin Minnow", "common", "A ribbon is current enough."],
      ["Parcel Puff", "common", "Special delivery, lightly condensed."],
      ["Bellwing Vendor", "uncommon", "You hear the bargains approaching."],
      ["Raincoin Monkey", "rare", "Every storm leaves change behind."],
      ["Thunder Teahouse", "epic", "The house blend crackles."],
      ["Skybridge Caravan", "legendary", "Never look down at wholesale."],
      ["Monsoon Merchant", "mythic", "Bad weather improves the margins."],
      ["Nimbus Leviathan", "mythic", "The market parts around it."],
      ["Auction of Winds", "exalted", "The winning bid changes direction."],
      ["Palace on a Draft", "ascendant", "A kingdom balanced on an upcurrent."],
      ["Northstar Broker", "celestial", "Every compass has its asking price."],
      ["The Market Above Night", "celestial", "The whole world shops by its glow."],
    ],
  },
  {
    id: "glass",
    name: "Glass Desert",
    short: "GD",
    tagline: "The horizon breaks into a thousand answers",
    unlock: { any: ["polar", "ember"] },
    packCost: 2_200,
    colors: ["#9fe3e8", "#e7b867", "#865b82"],
    art: "glass-desert",
    cards: [
      ["Shardfoot Lizard", "common", "Never steps on the same reflection."],
      ["Mirror Scarab", "uncommon", "Carries several skies at once."],
      ["Prism Jackal", "rare", "The pack arrives in afterimages."],
      ["Singing Dune", "epic", "The note cuts cleaner than wind."],
      ["Glassstorm Rider", "legendary", "Speed is the safest shelter."],
      ["Oasis of Echoes", "mythic", "Every drink remembers another traveler."],
      ["Diamond Nomad", "exalted", "Nothing owned. Nothing opaque."],
      ["Refraction Sphinx", "ascendant", "Its riddle separates the light."],
      ["The Transparent City", "ascendant", "Visible only by what it bends."],
      ["Sun Splitter", "celestial", "Daylight becomes a dozen roads."],
      ["Halo Buried in Sand", "divine", "The desert guarded its oldest dawn."],
      ["Godglass Horizon", "divine", "Reality ends with a hairline crack."],
    ],
  },
  {
    id: "harbor",
    name: "Nocturne Harbor",
    short: "NH",
    tagline: "No ship docks twice beneath these moons",
    unlock: { any: ["cloud", "glass"] },
    packCost: 3_000,
    colors: ["#7fb5b5", "#b68c64", "#20283d"],
    art: "harbor",
    cards: [
      ["Docklight Crab", "common", "A small beacon for smaller voyages."],
      ["Tideclock Smuggler", "rare", "Moonrise is the only alibi."],
      ["Fog Bell Ferryman", "epic", "The crossing begins after the ninth ring."],
      ["Ghostwake Cutter", "legendary", "Its wake reaches shore first."],
      ["Moon Anchor", "mythic", "The tide strains against heaven."],
      ["Velvet Kraken", "exalted", "The harbor wears its embrace."],
      ["The Ninth Lighthouse", "ascendant", "Eight beams warn. One invites."],
      ["Harbor Under Two Moons", "celestial", "Every tide disagrees."],
      ["Saint of Shipwrecks", "divine", "The drowned leave lanterns at her feet."],
      ["Starboard Revenant", "astral", "Still holding course beyond death."],
      ["Constellation Fleet", "astral", "The formation redraws the night."],
      ["The Port That Sailed Away", "astral", "Only the empty coast remembers."],
    ],
  },
  {
    id: "orchard",
    name: "Clockwork Orchard",
    short: "CO",
    tagline: "Every season turns on hidden teeth",
    unlock: { any: ["cloud", "verdant"] },
    packCost: 4_000,
    colors: ["#8fbf64", "#d48743", "#395b58"],
    art: "orchard",
    cards: [
      ["Windup Worm", "common", "One more turn before breakfast."],
      ["Copper Blossom", "epic", "It opens at the sound of noon."],
      ["Gearfruit Grafter", "legendary", "Tomorrow grows on a brass branch."],
      ["Cider Golem", "mythic", "A good vintage needs strong hands."],
      ["Orchard Chronometer", "exalted", "Ripeness measured to the second."],
      ["Pendulum Pear Tree", "ascendant", "The whole grove keeps its rhythm."],
      ["Comet Pollinator", "celestial", "Spring follows its burning route."],
      ["Golden Season", "divine", "Autumn perfected itself once."],
      ["Zodiac Scarecrow", "astral", "Even the constellations keep away."],
      ["Tree of Returning Spring", "eternal", "Winter never wins the rematch."],
      ["The Never-Fallen Apple", "eternal", "Gravity waits for permission."],
      ["Harvest Without End", "eternal", "The last basket is never the last."],
    ],
  },
  {
    id: "hollow",
    name: "Hollow Mountain",
    short: "HM",
    tagline: "A deeper world remembers the first stone",
    unlock: { any: ["glass", "polar"] },
    packCost: 5_200,
    colors: ["#846bb0", "#dc724f", "#27343b"],
    art: "cavern",
    cards: [
      ["Cave Candle Newt", "common", "A patient flame in patient dark."],
      ["Basalt Pilgrim", "legendary", "Every step descends into history."],
      ["Echo-Eater", "mythic", "The cavern goes quiet behind it."],
      ["Crystal Ram", "exalted", "A charge sharp enough to refract."],
      ["Upside-Down Citadel", "ascendant", "Its foundations hang from heaven."],
      ["Meteor Vein", "celestial", "The sky was buried here."],
      ["Throne of Pressure", "divine", "Only mountains survive the coronation."],
      ["Deep Constellation", "astral", "Stars with no surface names."],
      ["Mountain Remembering", "eternal", "Every quarry mark becomes a face."],
      ["First Stone Giant", "primordial", "Before footsteps, there was this."],
      ["The World Below Roots", "primordial", "Forests are only its ceiling."],
      ["Heart Before Fire", "primordial", "The planet learned heat from it."],
    ],
  },
  {
    id: "prism",
    name: "Prism Menagerie",
    short: "PM",
    tagline: "Color keeps creatures reality could not",
    unlock: { any: ["orchard", "hollow"] },
    packCost: 6_500,
    colors: ["#f3d8ff", "#5dcbd0", "#3a2956"],
    art: "menagerie",
    cards: [
      ["Colorless Finch", "common", "The branch fades after each song."],
      ["Velvet Chameleon", "mythic", "Soft enough to hide between hues."],
      ["Gleam Antler", "exalted", "Moonlight chooses a dozen paths."],
      ["Silver-Mirror Moth", "ascendant", "Night watches itself in the wings."],
      ["Comet Koi", "celestial", "The pond could not keep the sky."],
      ["Halo Lion", "divine", "Day circles the patient king."],
      ["Zodiac Serpent", "astral", "Its scales rearrange the calendar."],
      ["Forever Peacock", "eternal", "Every eye opens onto another world."],
      ["First-Spectrum Beast", "primordial", "Color remembers being wild."],
      ["Creature Beyond Frame", "transcendent", "Containment was only a suggestion."],
      ["The Impossible Habitat", "transcendent", "Every climate agrees for one breath."],
      ["Keeper of All Colors", "transcendent", "Nothing leaves without a shade."],
    ],
  },
  {
    id: "signal",
    name: "Sunken Signal",
    short: "SS",
    tagline: "Something below the trench is answering",
    unlock: { all: ["harbor"] },
    packCost: 8_000,
    colors: ["#57c4db", "#786bd0", "#152b3a"],
    art: "deep-signal",
    cards: [
      ["Antenna Shrimp", "common", "Tiny feelers scan an endless band."],
      ["Beacon Eel", "exalted", "The warning coils around old iron."],
      ["Silver Sonar Ray", "ascendant", "One pulse outlines the impossible."],
      ["Satellite Nautilus", "celestial", "Its orbit ended under pressure."],
      ["Choir of Buoys", "divine", "The waves carry a single chord."],
      ["Starcode Whale", "astral", "The message migrates with it."],
      ["The Repeating Distress", "eternal", "No sender. No final loop."],
      ["Oldest Broadcast", "primordial", "The stone dish was already listening."],
      ["Message Beyond Water", "transcendent", "The symbols descend without translation."],
      ["Sun Beneath the Trench", "empyrean", "Depth could not extinguish it."],
      ["The Listening Ocean", "empyrean", "Every current turns toward the sound."],
      ["Reply From Tomorrow", "empyrean", "The answer arrived before the question."],
    ],
  },
  {
    id: "observatory",
    name: "Pale Observatory",
    short: "PO",
    tagline: "At the edge of space, precision becomes faith",
    unlock: { any: ["prism", "hollow"] },
    packCost: 10_000,
    colors: ["#e3ecea", "#c2ab75", "#303e57"],
    art: "observatory",
    cards: [
      ["Dustcap Rover", "common", "Small wheels beneath a larger silence."],
      ["Mercury Telescope", "ascendant", "The lens chooses its own shape."],
      ["Comet Cartographer", "celestial", "A burning route becomes a clean line."],
      ["Halo Orrery", "divine", "Every orbit turns without friction."],
      ["Constellation Hound", "astral", "It points before the stars appear."],
      ["The Unsetting Moon", "eternal", "Night can no longer advance."],
      ["First Observer", "primordial", "The oldest gaze still looks outward."],
      ["Lens Past Reality", "transcendent", "Focus continues after truth ends."],
      ["Dawn Calibration", "empyrean", "The instruments drink first light."],
      ["Zero-Parallax Eye", "absolute", "Nothing can hide behind distance."],
      ["The Perfect Eclipse", "absolute", "Alignment admits no witness error."],
      ["Observatory Outside Space", "absolute", "The universe hangs inside its view."],
    ],
  },
  {
    id: "foundry",
    name: "Eventide Foundry",
    short: "EF",
    tagline: "The final shift manufactures the impossible",
    unlock: { all: ["observatory", "signal"] },
    packCost: 12_500,
    colors: ["#f2bd63", "#6651a1", "#241f2a"],
    art: "cosmic-foundry",
    cards: [
      ["Rivet Mite", "common", "A tiny fastener for enormous work."],
      ["Star-Iron Ladle", "celestial", "The pour cools into constellations."],
      ["Halo Press", "divine", "Each strike stamps a new dawn."],
      ["Constellation Welder", "astral", "The pattern holds after the sparks."],
      ["Last Shift Bell", "eternal", "No worker remembers clocking in."],
      ["Anvil Before Suns", "primordial", "Every star inherited its ringing."],
      ["Forge Beyond Form", "transcendent", "Material enters. Meaning leaves."],
      ["Empyrean Crucible", "empyrean", "Heaven boils without spilling."],
      ["Absolute Blueprint", "absolute", "Every possible flaw is already crossed out."],
      ["Gravity Hammer", "singularity", "The swing begins at the impact."],
      ["Blackstar Assembly Line", "singularity", "Production bends toward one point."],
      ["The Final Manufactured Thing", "singularity", "After it, the tools fell quiet."],
    ],
  },
  {
    id: "apocalypse",
    name: "Quiet Apocalypse",
    short: "QA",
    tagline: "The world ended without raising its voice",
    unlock: { all: ["foundry"] },
    packCost: 15_000,
    colors: ["#c9baa5", "#8da18c", "#43464f"],
    art: "quiet-city",
    cards: [
      ["Tea Cup Survivor", "common", "The steam has almost stopped."],
      ["Halo in the Weeds", "divine", "No one came to claim the miracle."],
      ["Empty Sky Map", "astral", "Several familiar lights are missing."],
      ["Clock Still Ticking", "eternal", "The hour no longer needs witnesses."],
      ["The First Ruin", "primordial", "Beauty learned how to remain."],
      ["Silence Crossing Main Street", "transcendent", "Even the dust holds still."],
      ["Sunrise After Everyone", "empyrean", "Morning kept its appointment."],
      ["House Without Outside", "absolute", "Every door returns to the room."],
      ["The Unbroken Window", "absolute", "One reflection refuses the damage."],
      ["City Folding Inward", "singularity", "The blocks arrive before they leave."],
      ["Last Birdsong", "singularity", "One note carries the empty world."],
      ["A Peaceful End", "singularity", "The sky closes without thunder."],
    ],
  },
  {
    id: "lastlight",
    name: "Last Light",
    short: "LL",
    tagline: "What remains when darkness has won everywhere else",
    unlock: { all: ["apocalypse"] },
    packCost: 18_000,
    colors: ["#f5d37a", "#9d7bbb", "#171923"],
    art: "last-light",
    cards: [
      ["Matchstick Moth", "common", "Its wings shelter one second of warmth."],
      ["Night's Final Diagram", "astral", "The lines explain where daylight went."],
      ["Lantern That Outlived Time", "eternal", "The stopped clocks glow around it."],
      ["Original Spark", "primordial", "All fire remembers this shape."],
      ["Glow Beyond Color", "transcendent", "No eye agrees on what it saw."],
      ["The Penultimate Sun", "empyrean", "One star waits behind it."],
      ["Crown of Daybreak", "empyrean", "A kingdom rises for one minute."],
      ["Light With No Source", "absolute", "Nothing casts it. Everything answers."],
      ["The White Horizon", "absolute", "A perfect line against forever."],
      ["Star Collapsing Slowly", "singularity", "The final second has immense gravity."],
      ["Shadow Eating Noon", "singularity", "Day disappears from the center outward."],
      ["The Last Light", "singularity", "Darkness finally has an edge."],
    ],
  },
  {
    id: "unwritten",
    name: "Unwritten",
    short: "UW",
    tagline: "Beyond the last page, names stop working",
    unlock: { allSets: true },
    packCost: 22_000,
    colors: ["#f2e7cd", "#b48ad3", "#25202c"],
    art: "unwritten",
    cards: [
      ["Blank Margin Beetle", "common", "It lives where the story cannot reach."],
      ["Story With No Ending", "eternal", "The road continues after the cover."],
      ["The First Word", "primordial", "Meaning wakes before language."],
      ["Page Beyond Paper", "transcendent", "Turn it and enter somewhere real."],
      ["Ink Made of Dawn", "empyrean", "Every stroke begins a morning."],
      ["Perfect Erasure", "absolute", "Even absence becomes immaculate."],
      ["Library Outside Meaning", "absolute", "The shelves contain what cannot be understood."],
      ["Punctuation Well", "singularity", "Every pause falls toward the center."],
      ["The Missing Chapter", "singularity", "Its absence changes every ending."],
      ["Authorless Hand", "singularity", "The world appears beneath each gesture."],
      ["Book Closing Inward", "singularity", "All distance fits between two covers."],
      ["What Was Never Named", "nameless", "It changes whenever language approaches."],
    ],
  },
];

function unlockSpecToRequirements(unlock) {
  if (!unlock) return [];
  if (unlock.allSets) return [{ type: "completeAllSets" }];
  const all = (unlock.all || []).map((setId) => ({ type: "completeSet", setId }));
  const any = unlock.any?.length ? [{ type: "completeAnySet", setIds: unlock.any }] : [];
  return [...all, ...any];
}

// The twenty legacy print runs are kept as raw card material; the live game
// regroups them into five 48-card print lines below.
const LEGACY_SETS = [
  ...BASE_SETS,
  ...EXPANSION_SET_SPECS.map(({ cards, unlock, ...set }) => ({
    ...set,
    unlockRequirements: unlockSpecToRequirements(unlock),
    unlockCost: 0,
    baseValue: Math.max(1, Math.round(set.packCost / 2)),
    cards: makeCards(set.id, cards.map(([name, rarity, flavor]) => ({ name, rarity, flavor }))),
  })),
];

// ---------------------------------------------------------------------------
// The five print lines: 48 cards each, built from four legacy sets apiece so
// every line leans toward a family of verbs. All five share one rarity
// distribution; the final line swaps its last Divine slot for the Nameless
// finale. Chase cards keep chase-hood: each legacy chase is pinned to a high
// slot so rarity itself routes players toward builds.
// ---------------------------------------------------------------------------

// 48 source slots, tapered from Common through Divine. These retired print
// lines only supply identities to the live 98-card set below.
const SET_RARITY_LADDER = [
  ...Array(13).fill("common"),
  ...Array(10).fill("uncommon"),
  ...Array(8).fill("rare"),
  ...Array(6).fill("epic"),
  ...Array(5).fill("legendary"),
  ...Array(4).fill("mythic"),
  ...Array(2).fill("divine"),
];

// chaseSlots: legacy set id -> 1-indexed ladder slot for its chase card.
// The live set pins all strategy signatures independently below.
const PRINT_LINES = [
  {
    id: "marquee",
    name: "Midnight Marquee",
    short: "MM",
    tagline: "Every reveal repeats down the boulevard",
    packCost: 10,
    unlockCost: 0,
    colors: ["#f7c95d", "#ea4f8e", "#1c2b46"],
    art: "neon",
    legacy: ["corner", "circuit", "crown", "observatory"],
    chaseSlots: { corner: 31, circuit: 34, crown: 40, observatory: 48 },
  },
  {
    id: "tideworks",
    name: "Tideworks",
    short: "TW",
    tagline: "Everything lost returns on the next tide",
    packCost: 120,
    unlockCost: 4_000,
    colors: ["#6fc7d9", "#e8a54b", "#173042"],
    art: "harbor",
    legacy: ["frontier", "harbor", "signal", "apocalypse"],
    chaseSlots: { frontier: 31, harbor: 34, signal: 47, apocalypse: 48 },
  },
  {
    id: "forgeline",
    name: "Forgeline",
    short: "FL",
    tagline: "Where broken packs are smelted into better ones",
    packCost: 900,
    unlockCost: 35_000,
    colors: ["#ff8a42", "#86cf72", "#26201f"],
    art: "railway",
    legacy: ["verdant", "ember", "foundry", "hollow"],
    chaseSlots: { verdant: 31, ember: 34, foundry: 47, hollow: 48 },
  },
  {
    id: "mirrorfield",
    name: "Mirrorfield",
    short: "MF",
    tagline: "The ice shows what the card will become",
    packCost: 4_500,
    unlockCost: 220_000,
    colors: ["#bfe9f2", "#b485e8", "#1d2440"],
    art: "archive",
    legacy: ["abyss", "polar", "cloud", "prism"],
    chaseSlots: { abyss: 31, polar: 34, cloud: 40, prism: 48 },
  },
  {
    id: "lastarchive",
    name: "The Last Archive",
    short: "LA",
    tagline: "Every collection ends between these covers",
    packCost: 15_000,
    unlockCost: 800_000,
    colors: ["#f4f4f2", "#9c7cff", "#23222b"],
    art: "unwritten",
    legacy: ["glass", "orchard", "lastlight", "unwritten"],
    chaseSlots: { glass: 31, orchard: 34, lastlight: 47, unwritten: 48 },
  },
];

export const LEGACY_CARD_MAP = {};
export const LEGACY_SET_MAP = {};

const LEGACY_ORDER = Object.fromEntries(LEGACY_SETS.map((set, index) => [set.id, index]));

const buildPrintLine = (spec, index) => {
  const isFinal = index === PRINT_LINES.length - 1;
  const ladder = [...SET_RARITY_LADDER];
  if (isFinal) ladder[47] = "nameless";

  const slots = new Array(48).fill(null);
  const supports = [];
  for (const legacySetId of spec.legacy) {
    LEGACY_SET_MAP[legacySetId] = spec.id;
    const legacySet = LEGACY_SETS.find((set) => set.id === legacySetId);
    legacySet.cards.forEach((card, cardIndex) => {
      if (cardIndex === 11) {
        slots[spec.chaseSlots[legacySetId] - 1] = card;
      } else {
        supports.push({ card, order: LEGACY_ORDER[legacySetId] * 12 + cardIndex });
      }
    });
  }
  supports.sort((a, b) => a.order - b.order);
  let cursor = 0;
  for (let slot = 0; slot < 48; slot += 1) {
    if (!slots[slot]) slots[slot] = supports[cursor++].card;
  }

  const previous = index > 0 ? PRINT_LINES[index - 1].id : null;
  const built = {
    id: spec.id,
    name: spec.name,
    short: spec.short,
    tagline: spec.tagline,
    packCost: spec.packCost,
    unlockCost: spec.unlockCost,
    unlockRequirements: previous ? [{ type: "collectFromSet", setId: previous, count: 20 }] : [],
    baseValue: Math.max(1, Math.round(spec.packCost / 2)),
    colors: spec.colors,
    art: spec.art,
    cards: makeCards(spec.id, slots.map((legacyCard, slot) => ({
      name: legacyCard.name,
      rarity: ladder[slot],
      flavor: legacyCard.flavor,
      subject: legacyCard.subject,
      tag: legacyCard.tag,
      legacy: legacyCard.id,
      rulesId: legacyCard.id,
      artId: legacyCard.id,
    }))),
  };
  built.cards.forEach((card) => {
    LEGACY_CARD_MAP[card.legacy] = card.id;
  });
  return built;
};

const PRE_CORE_PRINT_LINES = PRINT_LINES.map((spec, index) => buildPrintLine(spec, index));
const PRE_CORE_CARDS = PRE_CORE_PRINT_LINES.flatMap((set) => set.cards);
const PRE_CORE_CARD_BY_ID = new Map(PRE_CORE_CARDS.map((card) => [card.id, card]));

// One 98-card set with strictly fewer identities at every higher normal tier.
// Nameless is a completion reward rather than a normal rarity roll.
const CORE_RARITY_COUNTS = [
  ["common", 25],
  ["uncommon", 21],
  ["rare", 16],
  ["epic", 12],
  ["legendary", 9],
  ["mythic", 8],
  ["divine", 6],
  ["nameless", 1],
];
const CORE_RARITY_LADDER = CORE_RARITY_COUNTS.flatMap(([rarity, count]) => Array(count).fill(rarity));

const selectedSources = CORE_SET_MANIFEST.map(([id, expectedName]) => {
  const card = PRE_CORE_CARD_BY_ID.get(id);
  if (!card) throw new Error(`Core manifest references missing card ${id}`);
  if (card.name !== expectedName) {
    throw new Error(`Core manifest name mismatch for ${id}: expected ${expectedName}, got ${card.name}`);
  }
  return card;
});
if (selectedSources.length !== CORE_RARITY_LADDER.length) {
  throw new Error(`Core rarity ladder has ${CORE_RARITY_LADDER.length} slots for ${selectedSources.length} cards`);
}

const CORE_PINNED_RARITIES = {
  "marquee-10": "legendary", // Common Echo / Echowl
  "marquee-23": "legendary", // Rare Echo / Resonash
  "marquee-34": "mythic", // Mark / Zeraph
  "tideworks-11": "legendary", // Salvage / Reclaimotive
  "forgeline-08": "legendary", // Catalyst / Catalystag
  "forgeline-31": "legendary", // Fusion / Heartmerge
  "mirrorfield-31": "legendary", // Mimic / Mimistar
  "mirrorfield-34": "mythic", // Transmute / Absolumute
  "lastarchive-29": "mythic", // Fracture / Dawnrift
  "marquee-37": "mythic", // Blueprint / Truescope
  "tideworks-34": "legendary", // Relay / Portalink
  "lastarchive-34": "legendary", // Autopilot / Autoharvest
  "lastarchive-48": "nameless", // Nameling / completion reward
};
const remainingRarityCounts = Object.fromEntries(CORE_RARITY_COUNTS);
for (const rarity of Object.values(CORE_PINNED_RARITIES)) {
  remainingRarityCounts[rarity] -= 1;
  if (remainingRarityCounts[rarity] < 0) throw new Error(`Too many pinned ${rarity} cards`);
}
const remainingRarityLadder = CORE_RARITY_COUNTS.flatMap(([rarity]) => (
  Array(remainingRarityCounts[rarity]).fill(rarity)
));
const rankedCore = selectedSources.filter((card) => !CORE_PINNED_RARITIES[card.id]).sort((left, right) => (
  RARITIES[left.rarity].order - RARITIES[right.rarity].order
  || CORE_SET_MANIFEST.findIndex(([id]) => id === left.id)
    - CORE_SET_MANIFEST.findIndex(([id]) => id === right.id)
));
const coreRarityById = new Map([
  ...Object.entries(CORE_PINNED_RARITIES),
  ...rankedCore.map((card, index) => [card.id, remainingRarityLadder[index]]),
]);

const CORE_SET = {
  id: "core",
  name: "Packworks Core",
  short: "PW",
  tagline: "Every machine, creature, and impossible pull in one print run",
  packCost: 10,
  unlockCost: 0,
  unlockRequirements: [],
  baseValue: 5,
  colors: ["#ffd44f", "#68d9ec", "#082d61"],
  art: "factory",
  cards: selectedSources.map((source, index) => {
    const donorId = CORE_ART_TRANSFERS[source.id];
    const donor = donorId ? PRE_CORE_CARD_BY_ID.get(donorId) : null;
    if (donorId && !donor) throw new Error(`Core art donor ${donorId} for ${source.id} does not exist`);
    const rarity = coreRarityById.get(source.id);
    return {
      ...source,
      number: index + 1,
      setId: "core",
      rarity,
      power: RARITIES[rarity].duelPower + (index % 3),
      guard: 1 + RARITIES[rarity].order + ((index + 1) % 3),
      artId: donor?.artId || source.artId,
      artTransferredFrom: donor?.id || null,
    };
  }),
};

// Save migration now funnels every retired print line into the single Core
// stock bucket. Only selected legacy card identities map into the live set;
// retired cards are intentionally discarded by hydration.
for (const key of Object.keys(LEGACY_CARD_MAP)) delete LEGACY_CARD_MAP[key];
for (const card of CORE_SET.cards) LEGACY_CARD_MAP[card.legacy] = card.id;
for (const key of Object.keys(LEGACY_SET_MAP)) LEGACY_SET_MAP[key] = CORE_SET.id;
for (const line of PRINT_LINES) LEGACY_SET_MAP[line.id] = CORE_SET.id;

export const SETS = [CORE_SET];

export const ALL_CARDS = CORE_SET.cards;

export function getCardRulesId(card) {
  return card?.rulesId || card?.legacy || card?.id || "";
}

export function getCardArtId(card) {
  return card?.artId || card?.legacy || card?.id || "";
}

export function getSet(id) {
  return SETS.find((set) => set.id === id) || SETS[0];
}

export function getPackType(id) {
  return PACK_TYPES.find((packType) => packType.id === id) || PACK_TYPES[0];
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
