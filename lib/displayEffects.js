import { RARITIES, SETS, formatNumber, getCard, getSet } from "./gameData.js";

export const CASE_SIZE = 6;
export const RAMP_FULL_MINUTES = 30;
export const RAMP_FLOOR = 0.25;
export const QUICK_OPEN_WINDOW_MS = 8_000;
export const FIRST_PACK_IDLE_MS = 5 * 60_000;

// Aggregate safety caps. Individual card values are hand-tuned; these keep
// stacked six-card loadouts inside playable bounds.
export const EFFECT_CAPS = {
  packDiscount: 50,
  rarityWeight: 300,
  freePack: 60,
  godPack: 25,
  extraCard: 60,
  dupReroll: 75,
  crossSetAll: 60,
  interest: 8,
  bankInterest: 8,
  foilChance: 25,
  offlinePacks: 200,
  amplify: 300,
  gradeFloor: 9,
  premiumShare: 0.9,
};

// Every card carries exactly one hand-authored effect, tied to its name and
// flavor text. Sets act as schools with a mechanical identity; rarity scales
// magnitude inside a school. `ramp` effects grow with display time and reset
// when unseated. `meta` effects shape the Rewrite loop.
//
// Spec: [type, value, flags?]. Types are described in describeCardEffect.
const SET_EFFECT_SPECS = {
  // Corner Critters — street hustle: scrappy cash from the everyday.
  corner: [
    ["firstPackCash", 2],        // Alley Sprout — always first through the fence
    ["income", 1],               // Pavement Pigeon — collects idle crumbs from every bench
    ["dupCash", 8],              // Mop Bucket Mimic — ambushes duplicates for quick cash
    ["inscriptionIncome", 1, { meta: true }], // Bodega Beetle — the late shift pays into the next life
    ["offline", 15],             // Bus Stop Blob — still waiting, so you don't have to
    ["quickCash", 3],            // Fire Escape Fox — never takes the stairs
    ["setDupValue", 35],         // Rooftop Raccoon — a collector of fine lids
    ["packDiscount", 5],         // Meter Muncher — exact change only
    ["autoOpen", 45],            // Crosswalk King — traffic moves when he says
    ["freePack", 8],             // Midnight Courier — extra parcels before dawn
    ["newCardCash", 3],          // The Last Newsstand — fresh headlines pay
    ["godPack", 1],              // Mayor Mooncat — a mayoral blessing
  ],
  // Neon Circuit — machines after closing time: speed and automation.
  circuit: [
    ["quickCash", 5],            // Pocket Relay — passes the spark along
    ["autoOpen", 40],            // Tape Deck Drone — side B contains its orders
    ["dupReroll", 6],            // Static Hopper — turns dead channels into signal
    ["dupValue", 10],            // Pixel Warden — no sprite leaves the grid unsold
    ["offlinePacks", 4],         // Copper Crawler — repairs traces while you sleep
    ["freePack", 6],             // Arcade Phantom — one credit remains
    ["crossSet", 8],             // Signal Skater — rides the carrier wave between sets
    ["foilChance", 3],           // Chrome Familiar — polished beyond recognition
    ["autoOpen", 26],            // Overclock Ogre — runs hot, hits harder
    ["misprintCash", 60],        // The Blue Screen — the famous error, admired and paid for
    ["income", 14],              // Motherboard City — every light is a living room
    ["extraCard", 10],           // Zero-Day Seraph — a payload arrives before the warning
  ],
  // Gilded Frontier — dust and brass: interest and stored value.
  frontier: [
    ["dupValue", 7],             // Cactus Squire — prickly about protocol
    ["interest", 0.4],           // Tin Spur Tortoise — never late, never early
    ["foilCash", 4],             // Mesa Moth — drawn to whatever shines
    ["freePack", 5],             // Tumbleweed Pup — comes when the wind calls
    ["misprintCash", 30],        // Prospector Mole — struck glitter again
    ["offline", 40],             // Brassback Bison — built to cross forever
    ["quickCash", 9],            // Sunset Duelist — draws at the last light
    ["autoOpen", 30],            // Railway Revenant — the midnight line has no stops
    ["setDupValue", 60],         // Canyon Colossus — older rivals fetch higher prices
    ["interest", 1.2],           // Goldrush Griffin — guards a vein above the clouds
    ["packDiscount", 12],        // The Endless Engine — fueled by the edge of the map
    ["bankInterest", 2],         // High Noon Titan — the pile appreciates under the noon sun
  ],
  // Abyssal Bloom — a garden of gambles beneath the tide.
  abyss: [
    ["godPack", 0.2],            // Pebble Polyp — a reef begins with one
    ["foilChance", 2],           // Lantern Minnow — a pocket-sized dawn
    ["dupCash", 12],             // Velvet Urchin — softer than it looks, barely
    ["freePack", 6.5],           // Bubble Hermit — home is a rising thing
    ["crossSet", 6],             // Kelp Kite — the current holds the string
    ["foilCash", 8],             // Prism Jelly — a rainbow with a pulse
    ["dupReroll", 10],           // Trench Gardener — tends what the sun cannot
    ["rarityCash", 2, { minRarity: "rare" }], // Pearlback Ray — pearls glide up at night
    ["extraCard", 7],            // Cathedral Crab — its shell holds a congregation
    ["crossSet", 14],            // Tideglass Whale — the whole sea passes through
    ["godPack", 1.6],            // Garden of Teeth — every petal remembers hunger
    ["godPack", 2.6],            // The Drowned Star — still burning, still sinking
  ],
  // Crownfall — the last court: odds and decree.
  crown: [
    ["rarityWeight", 4],         // Page of Ash — carries letters toward better tiers
    ["pity", 40],                // Candle Guard — one flame remains on duty
    ["dupValue", 13],            // Velvet Rat — a minor title, major appetite
    ["offline", 25],             // Bell Tower Bat — counts the hours backward while you're away
    ["gradeFloor", 6],           // Porcelain Hound — cracked, never broken
    ["rarityWeight", 15],        // Thorn Chancellor — every decree draws blood
    ["rarityCash", 3, { minRarity: "epic" }], // Gilt Executioner — executions pay in gilt
    ["completionCash", 8],       // Hollow Herald — announces what has already happened
    ["extraCard", 8],            // Banquet of Crows — the guests arrived early
    ["dupValue", 28],            // The Unseated Queen — a throne is only furniture to sell
    ["rarityWeight", 40],        // Kingdom in a Locket — open only in times of peace
    ["pity", 15],                // The Final Coronation — the last guaranteed ceremony
  ],
  // Verdant Machine — growth: everything ramps while displayed.
  verdant: [
    ["income", 6, { ramp: true }],        // Mossbolt Mouse — tiny paws keep the gears clean
    ["dupValue", 18, { ramp: true }],     // Fernwheel Beetle — every turn grows another frond
    ["freePack", 7, { ramp: true }],      // Irrigation Imp — waters everything except schedules
    ["income", 16, { ramp: true }],       // Glasshouse Hare — spring follows close behind
    ["crossSet", 10, { ramp: true }],     // Pollen Drone — a perfect route between imperfect flowers
    ["packDiscount", 10, { ramp: true }], // Vinebound Porter — carries the garden toward daylight
    ["rarityWeight", 22, { ramp: true }], // Orchid Automaton — precision learned to bloom
    ["setDupValue", 90, { ramp: true }],  // Rootline Stag — antlers map the buried network
    ["income", 60, { ramp: true }],       // Boiler Bloom — steam is only impatient rain
    ["interest", 2.5, { ramp: true }],    // Canopy Engine — the forest runs on quiet momentum
    ["extraCard", 12, { ramp: true }],    // The Walking Conservatory — no climate could contain it
    ["rampSpeed", 100],                   // Heartseed Colossus — one pulse wakes every acre faster
  ],
  // Polar Archive — preservation: guarantees and second chances.
  polar: [
    ["dupReroll", 4],            // Snowquill Mouse — its tracks are meticulous footnotes
    ["pity", 44],                // Index Penguin — nothing escapes the catalog
    ["setDupValue", 40],         // Frostbite Bookworm — warm stories fetch cold prices
    ["pity", 32],                // Lantern Scribe — one sentence holds back the whiteout
    ["crossSetHunt", 8],         // Shelfwalker Yak — the stacks travel toward what's missing
    ["dupReroll", 16],           // Ink-Ice Fox — its tail edits the horizon
    ["pity", 18],                // Whiteout Curator — the storm files every loose page
    ["dupReroll", 24],           // Library Beneath Ice — silence preserves the unfound
    ["rarityWeight", 60],        // Aurora Archivist — the sky becomes a living index
    ["pity", 11],                // Glacier Atlas — mountains turn with every page
    ["dupReroll", 32],           // The Unburned Page — all winter gathered around one answer
    ["pity", 8],                 // Keeper of Absolute Zero — even memory freezes on schedule
  ],
  // Emberline — the burning railway: momentum and fares repaid.
  ember: [
    ["allDupRefund", 40],        // Ash Ticket Toad — fare paid, destination uncertain
    ["crossSet", 7],             // Cinder Switchcat — one lever changes the whole horizon
    ["dupCash", 20],             // Coalcar Crab — built low against the sparks
    ["quickCash", 14],           // Spark Rail Pup — always racing the departure bell
    ["foilChance", 4],           // Smokestack Roc — its wings darken noon with shimmer
    ["autoOpen", 20],            // Lava Conductor — every gesture reroutes the fire
    ["allDupRefund", 100],       // The Last Station — no return tickets are sold; fares are
    ["offlinePacks", 12],        // Furnace Nomad — opens camp wherever the boiler cools
    ["godPack", 3],              // Brass Magma Wyrm — the engine learned to hunt
    ["autoOpen", 14],            // Eclipse Express — night arrives exactly on schedule
    ["dupValue", 110],           // Crown of Cinders — the rails bow beneath it
    ["godPack", 4.2],            // Terminal at the Sun — the final platform faces forever
  ],
  // Cloud Bazaar — sky commerce: deals, rebates, and free stock.
  cloud: [
    ["packDiscount", 4],         // Kitefin Minnow — a ribbon is current enough
    ["freePack", 10],            // Parcel Puff — special delivery, lightly condensed
    ["buyBulkFree", 10],         // Bellwing Vendor — every tenth bargain rings free
    ["dupCash", 30],             // Raincoin Monkey — every storm leaves change behind
    ["interest", 2],             // Thunder Teahouse — the house blend crackles
    ["packDiscount", 16],        // Skybridge Caravan — never look down at wholesale
    ["dupValue", 65],            // Monsoon Merchant — bad weather improves the margins
    ["freePack", 22],            // Nimbus Leviathan — the market parts around it
    ["buyBulkFree", 6],          // Auction of Winds — every sixth bid wins itself
    ["interest", 4],             // Palace on a Draft — a kingdom balanced on an upcurrent
    ["packDiscount", 26],        // Northstar Broker — every compass has its asking price
    ["freePack", 32],            // The Market Above Night — the whole world shops by its glow
  ],
  // Glass Desert — mirrors: reflections, afterimages, and shine.
  glass: [
    ["dupReroll", 7],            // Shardfoot Lizard — never steps on the same reflection
    ["crossSet", 11],            // Mirror Scarab — carries several skies at once
    ["extraCard", 9],            // Prism Jackal — the pack arrives in afterimages
    ["rarityCash", 4, { minRarity: "legendary" }], // Singing Dune — the note cuts cleaner than wind
    ["quickCash", 40],           // Glassstorm Rider — speed is the safest shelter
    ["dupCash", 45],             // Oasis of Echoes — every drink remembers another traveler
    ["newCardCash", 12],         // Diamond Nomad — nothing owned, everything new
    ["foilChance", 7],           // Refraction Sphinx — its riddle separates the light
    ["extraCard", 18],           // The Transparent City — visible only by what it bends
    ["rarityWeight", 130],       // Sun Splitter — daylight becomes a dozen roads
    ["foilCash", 30],            // Halo Buried in Sand — the desert guarded its oldest dawn
    ["crossSet", 30],            // Godglass Horizon — reality ends with a hairline crack
  ],
  // Nocturne Harbor — smuggling: pulls from beyond the set.
  harbor: [
    ["crossSet", 9],             // Docklight Crab — a small beacon for smaller voyages
    ["freePack", 13],            // Tideclock Smuggler — moonrise is the only alibi
    ["buyBulkFree", 9],          // Fog Bell Ferryman — the crossing begins after the ninth ring
    ["setPackDiscount", 22],     // Ghostwake Cutter — its wake reaches shore first
    ["pity", 10],                // Moon Anchor — the tide strains against heaven
    ["crossSetHunt", 16],        // Velvet Kraken — drags in what the binder lacks
    ["godPack", 5],              // The Ninth Lighthouse — eight beams warn, one invites
    ["crossSet", 26],            // Harbor Under Two Moons — every tide disagrees
    ["dupReroll", 40],           // Saint of Shipwrecks — the drowned trade lanterns for the lost
    ["autoOpen", 8],             // Starboard Revenant — still holding course beyond death
    ["rarityWeight", 200],       // Constellation Fleet — the formation redraws the night
    ["crossSetHunt", 26],        // The Port That Sailed Away — it docks where you're missing cards
  ],
  // Clockwork Orchard — time: offline growth and automation.
  orchard: [
    ["offline", 20],             // Windup Worm — one more turn before breakfast
    ["autoOpen", 18],            // Copper Blossom — it opens at the sound of noon
    ["offlinePacks", 24],        // Gearfruit Grafter — tomorrow grows on a brass branch
    ["bankInterest", 3.5],       // Cider Golem — a good vintage ferments in the pile
    ["autoOpen", 11],            // Orchard Chronometer — ripeness measured to the second
    ["offline", 120],            // Pendulum Pear Tree — the whole grove keeps its rhythm
    ["offlinePacks", 60],        // Comet Pollinator — spring follows its burning route
    ["offline", 220],            // Golden Season — autumn perfected itself once
    ["headStart", 40, { meta: true }], // Zodiac Scarecrow — guards the next season's field
    ["autoOpen", 5],             // Tree of Returning Spring — winter never wins the rematch
    ["offline", 400],            // The Never-Fallen Apple — gravity waits for permission
    ["offlinePacks", 150],       // Harvest Without End — the last basket is never the last
  ],
  // Hollow Mountain — depth: income from the deep world.
  hollow: [
    ["income", 7],               // Cave Candle Newt — a patient flame in patient dark
    ["income", 95],              // Basalt Pilgrim — every step descends into history
    ["dupCash", 70],             // Echo-Eater — the cavern pays out what it swallows
    ["foilCash", 60],            // Crystal Ram — a charge sharp enough to refract
    ["income", 1_500],           // Upside-Down Citadel — its foundations hang from heaven
    ["misprintCash", 500],       // Meteor Vein — the sky was buried here
    ["income", 15_000],          // Throne of Pressure — only mountains survive the coronation
    ["rarityWeight", 240],       // Deep Constellation — stars with no surface names
    ["setDupValue", 900],        // Mountain Remembering — every quarry mark becomes a face
    ["income", 950_000],         // First Stone Giant — before footsteps, there was this
    ["inscriptionGain", 45, { meta: true }], // The World Below Roots — the deep remembers across Rewrites
    ["income", 2_200_000],       // Heart Before Fire — the planet learned heat from it
  ],
  // Prism Menagerie — spectrum: color, variety, and shine.
  prism: [
    ["rarityWeight", 6],         // Colorless Finch — the branch fades after each song
    ["crossSet", 20],            // Velvet Chameleon — soft enough to hide between hues
    ["rarityWeight", 95],        // Gleam Antler — moonlight chooses a dozen paths
    ["foilChance", 9],           // Silver-Mirror Moth — night watches itself in the wings
    ["godPack", 5.5],            // Comet Koi — the pond could not keep the sky
    ["rarityCash", 5, { minRarity: "mythic" }], // Halo Lion — day circles the patient king
    ["pity", 6],                 // Zodiac Serpent — its scales rearrange the calendar
    ["extraCard", 26],           // Forever Peacock — every eye opens onto another card
    ["rarityWeight", 320],       // First-Spectrum Beast — color remembers being wild
    ["godExtraCard", 1],         // Creature Beyond Frame — containment was only a suggestion
    ["crossSetHunt", 34],        // The Impossible Habitat — every climate sends what you lack
    ["foilChance", 14],          // Keeper of All Colors — nothing leaves without a shade
  ],
  // Sunken Signal — guarantees: the message always arrives.
  signal: [
    ["pity", 50],                // Antenna Shrimp — tiny feelers scan an endless band
    ["pity", 9],                 // Beacon Eel — the warning coils around old iron
    ["godPack", 4.6],            // Silver Sonar Ray — one pulse outlines the impossible
    ["pity", 7],                 // Satellite Nautilus — its orbit ended under pressure
    ["freePack", 33],            // Choir of Buoys — the waves carry spare fares
    ["pity", 5],                 // Starcode Whale — the message migrates with it
    ["godPack", 7],              // The Repeating Distress — no sender, no final loop
    ["pity", 4],                 // Oldest Broadcast — the stone dish was already listening
    ["pityPower", 1],            // Message Beyond Water — guarantees descend untranslated, stronger
    ["pity", 3],                 // Sun Beneath the Trench — depth could not extinguish it
    ["keepCoins", 25, { meta: true }], // The Listening Ocean — holds what you had through the Rewrite
    ["godPack", 10],             // Reply From Tomorrow — the answer arrived before the question
  ],
  // Pale Observatory — precision: certainty at the edge of space.
  observatory: [
    ["offline", 28],             // Dustcap Rover — small wheels roll on while you're gone
    ["rarityWeight", 140],       // Mercury Telescope — the lens chooses its own shape
    ["crossSetHunt", 22],        // Comet Cartographer — a burning route to missing cards
    ["interest", 5],             // Halo Orrery — every orbit turns without friction
    ["trueSignal", 1],           // Constellation Hound — it points before the stars appear
    ["offline", 550],            // The Unsetting Moon — night can no longer advance
    ["pity", 2],                 // First Observer — the oldest gaze misses nothing
    ["rarityWeight", 520],       // Lens Past Reality — focus continues after truth ends
    ["interest", 6.5],           // Dawn Calibration — the instruments drink first light
    ["dupReroll", 55],           // Zero-Parallax Eye — nothing can hide behind distance
    ["godPack", 12],             // The Perfect Eclipse — alignment admits no witness error
    ["rarityWeight", 700],       // Observatory Outside Space — the universe hangs inside its view
  ],
  // Eventide Foundry — transformation: material enters, value leaves.
  foundry: [
    ["dupReroll", 8],            // Rivet Mite — a tiny fastener for enormous work
    ["setDupValue", 300],        // Star-Iron Ladle — the pour cools into constellations
    ["dupValue", 220],           // Halo Press — each strike stamps a new dawn
    ["extraCard", 30],           // Constellation Welder — the pattern holds one card more
    ["autoOpen", 4],             // Last Shift Bell — no worker remembers clocking in
    ["dupValue", 380],           // Anvil Before Suns — every star inherited its ringing
    ["dupReroll", 65],           // Forge Beyond Form — material enters, meaning leaves
    ["bankInterest", 6],         // Empyrean Crucible — heaven boils without spilling
    ["inscriptionGain", 85, { meta: true }], // Absolute Blueprint — flaws crossed out across Rewrites
    ["godPack", 15],             // Gravity Hammer — the swing begins at the impact
    ["autoOpen", 2],             // Blackstar Assembly Line — production bends toward one point
    ["newCardCash", 400],        // The Final Manufactured Thing — the last new thing pays most
  ],
  // Quiet Apocalypse — after the end: immense, still wealth.
  apocalypse: [
    ["income", 9],               // Tea Cup Survivor — the steam has almost stopped
    ["completionCash", 60],      // Halo in the Weeds — unclaimed miracles pay when claimed
    ["crossSetHunt", 30],        // Empty Sky Map — it charts the lights that are missing
    ["interest", 7.5],           // Clock Still Ticking — the hour compounds without witnesses
    ["income", 3_800_000],       // The First Ruin — beauty learned how to remain
    ["packDiscount", 32],        // Silence Crossing Main Street — even the prices hold still
    ["offline", 800],            // Sunrise After Everyone — morning kept its appointment
    ["keepCoins", 40, { meta: true }], // House Without Outside — every door returns your cash
    ["allDupRefund", 250],       // The Unbroken Window — a refund that refuses the damage
    ["income", 450_000_000],     // City Folding Inward — the blocks arrive before they leave
    ["freePack", 36],            // Last Birdsong — one note carries a spare pack
    ["income", 1_000_000_000],   // A Peaceful End — the sky closes without thunder
  ],
  // Last Light — culmination: everything else burns brighter.
  lastlight: [
    ["amplify", 6],              // Matchstick Moth — one second of warmth for every effect
    ["amplifyEco", 30],          // Night's Final Diagram — it explains where the money went
    ["rampFull", 1],             // Lantern That Outlived Time — ramp effects skip the wait
    ["amplifyChance", 25],       // Original Spark — all fire catches a little easier
    ["amplify", 26],             // Glow Beyond Color — no effect agrees to stay small
    ["amplifyEco", 70],          // The Penultimate Sun — one star's worth of extra income
    ["amplifyChance", 45],       // Crown of Daybreak — a kingdom of better odds, for a minute
    ["amplify", 45],             // Light With No Source — everything answers
    ["pityHalve", 1],            // The White Horizon — guarantees arrive in half the distance
    ["amplifyEco", 160],         // Star Collapsing Slowly — immense gravity, immense yields
    ["amplifyChance", 80],       // Shadow Eating Noon — chance grows from the center outward
    ["amplify", 90],             // The Last Light — darkness finally has an edge
  ],
  // Unwritten — the meta set: everything here shapes the Rewrite.
  unwritten: [
    ["inscriptionIncome", 3, { meta: true }],   // Blank Margin Beetle — lives outside the story
    ["headStart", 150, { meta: true }],         // Story With No Ending — the road continues after the cover
    ["inscriptionGain", 30, { meta: true }],    // The First Word — meaning wakes before language
    ["keepCoins", 60, { meta: true }],          // Page Beyond Paper — turn it and keep what's real
    ["inscriptionIncome", 60, { meta: true }],  // Ink Made of Dawn — every stroke begins a morning
    ["inscriptionGain", 120, { meta: true }],   // Perfect Erasure — even absence becomes immaculate
    ["keepDisplayed", 1, { meta: true }],       // Library Outside Meaning — the shelves keep your case
    ["keepCoins", 85, { meta: true }],          // Punctuation Well — every pause holds your savings
    ["inscriptionGain", 220, { meta: true }],   // The Missing Chapter — its absence changes every ending
    ["inscriptionIncome", 600, { meta: true }], // Authorless Hand — the world appears beneath each gesture
    ["headStart", 1_500, { meta: true }],       // Book Closing Inward — all distance fits between two covers
    ["nameless", 100, { meta: true }],          // What Was Never Named — the door out of the story
  ],
};

export const CARD_EFFECTS = Object.fromEntries(SETS.flatMap((set) => {
  const specs = SET_EFFECT_SPECS[set.id] || [];
  return set.cards.map((card, index) => {
    const [type, value, flags = {}] = specs[index] || ["income", 1];
    return [card.id, {
      type,
      value,
      ramp: !!flags.ramp,
      meta: !!flags.meta,
      minRarity: flags.minRarity || null,
    }];
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
  const minRarityLabel = effect.minRarity ? RARITIES[effect.minRarity].label : "";
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
    crossSetHunt: `Each pull has a ${v}% chance to come from an unlocked set you haven't finished`,
    interest: `Cash earns ${v}% interest per minute`,
    bankInterest: `Your unsold duplicate pile grows ${v}% per minute (up to double)`,
    offline: `Offline earnings +${v}%`,
    offlinePacks: `While away, auto-opens up to ${v} table packs`,
    pity: `Every ${v} packs opened, one pull is guaranteed premium`,
    autoOpen: `Auto-opens a table pack every ${v}s`,
    quickCash: `Packs opened within 8s of the last pay +${formatNumber(v)} cash`,
    firstPackCash: `The first pack after 5+ minutes away pays back ${v}x its price`,
    newCardCash: `Pulling a new card pays ${v}x its sell value in cash`,
    dupCash: `Duplicate pulls pay ${v}% of their value as instant cash`,
    rarityCash: `${minRarityLabel}-or-better pulls pay ${v}x their sell value in cash`,
    foilChance: `Foil odds +${v} percentage points`,
    foilCash: `Foil pulls pay ${v}x their sell value in cash`,
    misprintCash: `Detected misprints pay ${v}x the card's sell value`,
    completionCash: `Finishing any set pays ${v}x that set's base value`,
    allDupRefund: `Packs with no new cards refund ${v}% of the pack price`,
    buyBulkFree: `Every ${v}th pack you buy is free`,
    gradeFloor: `Hand-opened cards never grade below ${v}`,
    trueSignal: "Hover signals never bluff",
    godExtraCard: "GOD PACKS contain an extra card",
    pityPower: "Premium guarantees upgrade to Epic or better",
    rampSpeed: `Other ramp effects grow ${v}% faster`,
    rampFull: "Ramp effects on other cards are always at full power",
    pityHalve: "Premium guarantee intervals are halved",
    amplify: `Other displayed effects are ${v}% stronger`,
    amplifyEco: `Displayed economy effects are ${v}% stronger`,
    amplifyChance: `Displayed chance effects are ${v}% stronger`,
    inscriptionGain: `+${v}% Inscriptions earned on Rewrite`,
    inscriptionIncome: `+${formatNumber(v)}/s cash per Inscription held`,
    headStart: `Rewrites begin with ${v} free Corner Critters packs`,
    keepCoins: `Keep ${v}% of your cash through a Rewrite`,
    keepDisplayed: "Your displayed cards survive the Rewrite",
    nameless: "Unlocks REWRITE, and Inscriptions earned are doubled",
  }[effect.type] || "";
  const suffixes = [];
  if (effect.ramp) suffixes.push(`Grows to full power over ${RAMP_FULL_MINUTES} min on display; resets when unseated`);
  if (effect.meta) suffixes.push("Meta effect: shapes the Rewrite loop");
  return suffixes.length ? `${base}. ${suffixes.join(". ")}.` : `${base}.`;
}

export function getRampScale(displayedAt, now, speedBonus = 0, forceFull = false) {
  if (forceFull) return 1;
  const at = Number.isFinite(displayedAt) ? displayedAt : now;
  const minutes = Math.max(0, (now - at) / 60_000) * (1 + speedBonus / 100);
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

// Economy effects scale with amplifyEco; chance effects with amplifyChance;
// both stack with the all-effect amplifier. Interval effects (pity, autoOpen,
// buyBulkFree) and one-of rule effects are deliberately never amplified.
const ECO_TYPES = new Set([
  "income", "dupValue", "setDupValue", "interest", "bankInterest", "offline",
  "quickCash", "firstPackCash", "newCardCash", "dupCash", "rarityCash",
  "foilCash", "misprintCash", "completionCash", "allDupRefund",
  "inscriptionIncome",
]);
const CHANCE_TYPES = new Set([
  "freePack", "godPack", "extraCard", "dupReroll", "crossSet", "crossSetHunt",
  "foilChance",
]);

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
  crossSetHunt: 0,
  interest: 0,
  bankInterest: 0,
  offline: 0,
  offlinePacks: 0,
  pityEvery: 0,
  pityPower: false,
  autoOpenEvery: 0,
  quickCash: 0,
  firstPackCash: 0,
  newCardCash: 0,
  dupCash: 0,
  rarityCash: [],
  foilChance: 0,
  foilCash: 0,
  misprintCash: 0,
  completionCash: 0,
  allDupRefund: 0,
  buyBulkFree: 0,
  gradeFloor: 0,
  trueSignal: false,
  godExtraCard: false,
  amplify: 0,
  amplifyEco: 0,
  amplifyChance: 0,
  rampSpeed: 0,
  rampFull: false,
  pityHalve: false,
  inscriptionGain: 0,
  inscriptionIncome: 0,
  headStart: 0,
  keepCoins: 0,
  keepDisplayed: false,
  namelessDisplayed: false,
};

export function getDisplayModifiers(state, now = Date.now()) {
  const entries = getDisplayedEntries(state);
  if (!entries.length) {
    return { ...EMPTY_MODIFIERS, setDupValue: {}, setPackDiscount: {}, rarityCash: [] };
  }

  const mods = { ...EMPTY_MODIFIERS, setDupValue: {}, setPackDiscount: {}, rarityCash: [] };
  let amplifyAll = 0;
  let amplifyEco = 0;
  let amplifyChance = 0;
  for (const entry of entries) {
    const effect = getCardEffect(entry.id);
    if (effect.type === "amplify") amplifyAll += effect.value;
    else if (effect.type === "amplifyEco") amplifyEco += effect.value;
    else if (effect.type === "amplifyChance") amplifyChance += effect.value;
    else if (effect.type === "rampSpeed") mods.rampSpeed += effect.value;
    else if (effect.type === "rampFull") mods.rampFull = true;
    else if (effect.type === "pityHalve") mods.pityHalve = true;
  }
  amplifyAll = Math.min(EFFECT_CAPS.amplify, amplifyAll);
  amplifyEco = Math.min(EFFECT_CAPS.amplify, amplifyEco);
  amplifyChance = Math.min(EFFECT_CAPS.amplify, amplifyChance);
  mods.amplify = amplifyAll;
  mods.amplifyEco = amplifyEco;
  mods.amplifyChance = amplifyChance;

  const scaleFor = (type) => {
    let scale = 1 + amplifyAll / 100;
    if (ECO_TYPES.has(type)) scale *= 1 + amplifyEco / 100;
    if (CHANCE_TYPES.has(type)) scale *= 1 + amplifyChance / 100;
    return scale;
  };

  for (const entry of entries) {
    const effect = getCardEffect(entry.id);
    const card = getCard(entry.id);
    if (!effect || !card) continue;
    if (["amplify", "amplifyEco", "amplifyChance", "rampSpeed", "rampFull", "pityHalve"].includes(effect.type)) continue;
    const ramp = effect.ramp ? getRampScale(entry.at, now, mods.rampSpeed, mods.rampFull) : 1;
    const value = effect.value * ramp * scaleFor(effect.type);
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
      case "crossSetHunt": mods.crossSetHunt += value; break;
      case "interest": mods.interest += value; break;
      case "bankInterest": mods.bankInterest += value; break;
      case "offline": mods.offline += value; break;
      case "offlinePacks": mods.offlinePacks += Math.round(effect.value * ramp); break;
      case "pity":
        // Guarantees compound by taking the shortest displayed interval.
        mods.pityEvery = mods.pityEvery ? Math.min(mods.pityEvery, effect.value) : effect.value;
        break;
      case "pityPower": mods.pityPower = true; break;
      case "autoOpen":
        mods.autoOpenEvery = mods.autoOpenEvery
          ? Math.min(mods.autoOpenEvery, effect.value)
          : effect.value;
        break;
      case "quickCash": mods.quickCash += value; break;
      case "firstPackCash": mods.firstPackCash += value; break;
      case "newCardCash": mods.newCardCash += value; break;
      case "dupCash": mods.dupCash += value; break;
      case "rarityCash":
        mods.rarityCash.push({
          minOrder: RARITIES[effect.minRarity || "rare"].order,
          mult: value,
        });
        break;
      case "foilChance": mods.foilChance += value; break;
      case "foilCash": mods.foilCash += value; break;
      case "misprintCash": mods.misprintCash += value; break;
      case "completionCash": mods.completionCash += value; break;
      case "allDupRefund": mods.allDupRefund += value; break;
      case "buyBulkFree":
        mods.buyBulkFree = mods.buyBulkFree
          ? Math.min(mods.buyBulkFree, effect.value)
          : effect.value;
        break;
      case "gradeFloor": mods.gradeFloor = Math.max(mods.gradeFloor, effect.value); break;
      case "trueSignal": mods.trueSignal = true; break;
      case "godExtraCard": mods.godExtraCard = true; break;
      case "inscriptionGain": mods.inscriptionGain += value; break;
      case "inscriptionIncome": mods.inscriptionIncome += value; break;
      case "headStart": mods.headStart += Math.round(effect.value * (1 + amplifyAll / 100)); break;
      case "keepCoins": mods.keepCoins = Math.min(95, mods.keepCoins + effect.value); break;
      case "keepDisplayed": mods.keepDisplayed = true; break;
      case "nameless":
        mods.namelessDisplayed = true;
        mods.inscriptionGain += effect.value;
        break;
      default: break;
    }
  }

  if (mods.pityHalve && mods.pityEvery > 0) {
    mods.pityEvery = Math.max(1, Math.ceil(mods.pityEvery / 2));
  }
  mods.packDiscount = Math.min(EFFECT_CAPS.packDiscount, mods.packDiscount);
  mods.rarityWeight = Math.min(EFFECT_CAPS.rarityWeight, mods.rarityWeight);
  mods.freePack = Math.min(EFFECT_CAPS.freePack, mods.freePack);
  mods.godPack = Math.min(EFFECT_CAPS.godPack, mods.godPack);
  mods.extraCard = Math.min(EFFECT_CAPS.extraCard, mods.extraCard);
  mods.dupReroll = Math.min(EFFECT_CAPS.dupReroll, mods.dupReroll);
  const crossTotal = mods.crossSet + mods.crossSetHunt;
  if (crossTotal > EFFECT_CAPS.crossSetAll) {
    const crossScale = EFFECT_CAPS.crossSetAll / crossTotal;
    mods.crossSet *= crossScale;
    mods.crossSetHunt *= crossScale;
  }
  mods.interest = Math.min(EFFECT_CAPS.interest, mods.interest);
  mods.bankInterest = Math.min(EFFECT_CAPS.bankInterest, mods.bankInterest);
  mods.foilChance = Math.min(EFFECT_CAPS.foilChance, mods.foilChance);
  mods.offlinePacks = Math.min(EFFECT_CAPS.offlinePacks, mods.offlinePacks);
  mods.gradeFloor = Math.min(EFFECT_CAPS.gradeFloor, mods.gradeFloor);
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
