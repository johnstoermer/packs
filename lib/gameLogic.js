import {
  ALL_CARDS,
  ARCHETYPES,
  CLEAN_UPGRADES,
  FUSION_THRESHOLDS,
  PACK_PRODUCTS,
  RARITIES,
  SETS,
  getCard,
  getSet,
} from "./gameData.js";
import {
  CASE_SIZE,
  DISCOVER_POOL,
  getCardDef,
  getCaseSlots,
  getDisplayedEntries,
  getEngine,
  revealTriggerMatches,
} from "./engineCards.js";

export const SAVE_KEY = "packworks-save-v1";
export const SAVE_VERSION = 8;
export const NAMELESS_CARD_ID = "unwritten-12";
export const INSCRIPTION_MULT_STEP = 0.25;
export const PACK_SIZE = 6;
export const SEALED_ENTRY_PACKS = 6;
export const DECK_SIZE = 12;
export const FORGE_COST = 24;
export const MANUAL_RATE_CAP_MS = 1_450;
export const BASE_PASSIVE_RATE = 1;
export const BINDER_PAYOUT_SCALE = 0;

export const BEAT_PACK_THRESHOLDS = [
  0,
  10,
  30,
  75,
  150,
];

const RARITY_IDS = Object.keys(RARITIES).sort((a, b) => RARITIES[a].order - RARITIES[b].order);
const STARTER_UPGRADES = {
  fingers: 0,
  sorter: 0,
  scanner: 0,
  sleeves: 0,
  lights: 0,
  case: 0,
  crew: 0,
  press: 0,
  shelf: 0,
  lamp: 0,
  supplier: 0,
};

const emptyProductStock = () => Object.fromEntries(PACK_PRODUCTS.map((product) => [product.id, 0]));
const emptySetStock = () => Object.fromEntries(SETS.map((set) => [set.id, emptyProductStock()]));
const emptyForgeStock = () => Object.fromEntries(
  SETS.map((set) => [set.id, Object.fromEntries(ARCHETYPES.map((tag) => [tag.id, 0]))]),
);
const emptyRarityCount = () => Object.fromEntries(RARITY_IDS.map((id) => [id, 0]));

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function cloneStock(stock) {
  return Object.fromEntries(
    SETS.map((set) => {
      const productStock = Object.fromEntries(PACK_PRODUCTS.map((product) => [
        product.id,
        Math.max(0, Math.floor(finite(stock?.[set.id]?.[product.id]))),
      ]));
      const legacyBoxes = Math.max(0, Math.floor(finite(stock?.[set.id]?.box)));
      productStock.loose += legacyBoxes * 24;
      return [set.id, productStock];
    }),
  );
}

function cloneForgeStock(stock) {
  return Object.fromEntries(
    SETS.map((set) => [
      set.id,
      Object.fromEntries(ARCHETYPES.map((tag) => [
        tag.id,
        Math.max(0, Math.floor(finite(stock?.[set.id]?.[tag.id]))),
      ])),
    ]),
  );
}

export function createInitialState(now = Date.now()) {
  const sealed = emptySetStock();
  sealed.corner.loose = 3;
  return {
    version: SAVE_VERSION,
    beat: 1,
    coins: 0,
    lifetimeCoins: 0,
    passiveCarry: 0,
    packsOpened: 0,
    manualPacks: 0,
    cardsPulled: 0,
    rarityPulls: emptyRarityCount(),
    collection: {},
    bestRarities: {},
    duplicateBank: 0,
    foils: {},
    bestGrades: {},
    misprints: {},
    dormantMisprints: {},
    sealed,
    forged: emptyForgeStock(),
    activeSet: "corner",
    unlockedSets: ["corner"],
    displayed: [],
    prestige: { inscriptions: 0, rewrites: 0 },
    packsPurchased: 0,
    counters: {},
    discoverOffer: null,
    discoverStack: {},
    triggerTallies: {},
    forgeMaterial: 0,
    pityLegendary: 0,
    lastManualAt: 0,
    standingOrder: {
      enabled: false,
      product: "loose",
      setId: "corner",
      reserve: 0,
      purchased: 0,
    },
    filingRules: [],
    nextRuleId: 1,
    duelDeck: [],
    duelsPlayed: 0,
    duelsWon: 0,
    sealedRuns: 0,
    sealedWins: 0,
    sealedRun: null,
    upgrades: { ...STARTER_UPGRADES },
    settings: {
      sound: true,
      reducedEffects: false,
      quickOpen: false,
    },
    createdAt: now,
    lastSavedAt: now,
  };
}

function sanitizeCollection(raw) {
  const validIds = new Set(ALL_CARDS.map((card) => card.id));
  return Object.fromEntries(
    Object.entries(raw || {})
      .filter(([id, count]) => validIds.has(id) && finite(count) > 0)
      .map(([id, count]) => [id, Math.max(0, Math.floor(finite(count)))]),
  );
}

function sanitizeBestRarities(raw, collection) {
  const result = {};
  for (const [id, count] of Object.entries(collection)) {
    if (count <= 0) continue;
    const card = getCard(id);
    result[id] = card.rarity;
  }
  return result;
}

function estimateLegacyDuplicateBank(collection) {
  return Object.entries(collection).reduce((total, [id, count]) => {
    const extras = Math.max(0, count - 1);
    if (!extras) return total;
    const card = getCard(id);
    return total + extras * RARITIES[card?.rarity || "common"].sellValue;
  }, 0);
}

function sanitizeDeck(raw, availability, copyCap = 3) {
  if (!Array.isArray(raw)) return [];
  const counts = {};
  const result = [];
  for (const id of raw) {
    if (!getCard(id) || result.length >= DECK_SIZE) continue;
    const owned = Math.max(0, Math.floor(finite(availability?.[id])));
    const allowed = Math.min(owned, copyCap);
    if ((counts[id] || 0) >= allowed) continue;
    counts[id] = (counts[id] || 0) + 1;
    result.push(id);
  }
  return result;
}

function sanitizeSealedRun(raw) {
  if (!raw || typeof raw !== "object") return null;
  const pool = sanitizeCollection(raw.pool);
  const remainingPacks = Math.max(0, Math.min(SEALED_ENTRY_PACKS, Math.floor(finite(raw.remainingPacks))));
  const phase = remainingPacks > 0 ? "opening" : "deck";
  return {
    id: String(raw.id || `sealed-${Date.now()}`),
    setId: SETS.some((set) => set.id === raw.setId) ? raw.setId : "corner",
    remainingPacks,
    pool,
    deck: sanitizeDeck(raw.deck, pool, Number.POSITIVE_INFINITY),
    phase,
    opened: Math.max(0, SEALED_ENTRY_PACKS - remainingPacks),
  };
}

export function hydrateState(raw, now = Date.now()) {
  const initial = createInitialState(now);
  if (!raw || typeof raw !== "object") return initial;

  const collection = sanitizeCollection(raw.collection);
  const bestRarities = sanitizeBestRarities(raw.bestRarities, collection);
  const sealed = cloneStock(raw.sealed || initial.sealed);
  if (!raw.sealed && finite(raw.packsOpened) > 0) sealed.corner.loose = Math.max(sealed.corner.loose, 3);
  const legacySealedRun = sanitizeSealedRun(raw.sealedRun);
  if (legacySealedRun) {
    sealed[legacySealedRun.setId].loose += legacySealedRun.remainingPacks;
  }
  const legacyForged = cloneForgeStock(raw.forged);
  for (const set of SETS) {
    for (const tag of ARCHETYPES) sealed[set.id].loose += legacyForged[set.id][tag.id];
  }
  const forged = emptyForgeStock();
  const settings = { ...initial.settings, ...(raw.settings || {}) };
  const activeSet = SETS.some((set) => set.id === raw.activeSet) ? raw.activeSet : "corner";
  const legacyCoins = Math.max(0, finite(raw.coins));
  const legacyProgress = (
    Math.max(0, finite(raw.passiveCarry))
    + legacyCoins
    - Math.floor(legacyCoins)
  );
  const normalizedCoins = Math.floor(legacyCoins) + Math.floor(legacyProgress);
  const passiveCarry = legacyProgress % 1;
  const state = {
    ...initial,
    ...raw,
    version: SAVE_VERSION,
    beat: Math.max(1, Math.min(5, Math.floor(finite(raw.beat, 1)))),
    coins: normalizedCoins,
    lifetimeCoins: Math.max(normalizedCoins, Math.floor(Math.max(0, finite(raw.lifetimeCoins)))),
    passiveCarry,
    packsOpened: Math.max(0, Math.floor(finite(raw.packsOpened))),
    manualPacks: Math.max(0, Math.floor(finite(raw.manualPacks))),
    cardsPulled: Math.max(0, Math.floor(finite(raw.cardsPulled))),
    collection,
    bestRarities,
    duplicateBank: raw.duplicateBank === undefined
      ? estimateLegacyDuplicateBank(collection)
      : Math.max(0, finite(raw.duplicateBank)),
    foils: sanitizeCollection(raw.foils),
    bestGrades: { ...(raw.bestGrades || {}) },
    misprints: sanitizeCollection(raw.misprints),
    dormantMisprints: sanitizeCollection(raw.dormantMisprints),
    rarityPulls: { ...initial.rarityPulls, ...(raw.rarityPulls || {}) },
    sealed,
    forged,
    activeSet,
    unlockedSets: Array.isArray(raw.unlockedSets) ? raw.unlockedSets.filter((id) => getSet(id)) : ["corner"],
    forgeMaterial: Math.max(0, Math.floor(finite(raw.forgeMaterial, finite(raw.dust)))),
    pityLegendary: Math.max(0, Math.floor(finite(raw.pityLegendary))),
    standingOrder: { ...initial.standingOrder, ...(raw.standingOrder || {}), enabled: false },
    filingRules: [],
    nextRuleId: Math.max(1, Math.floor(finite(raw.nextRuleId, 1))),
    duelDeck: sanitizeDeck(raw.duelDeck, collection),
    duelsPlayed: Math.max(0, Math.floor(finite(raw.duelsPlayed))),
    duelsWon: Math.max(0, Math.floor(finite(raw.duelsWon))),
    sealedRuns: Math.max(0, Math.floor(finite(raw.sealedRuns))),
    sealedWins: Math.max(0, Math.floor(finite(raw.sealedWins))),
    sealedRun: null,
    upgrades: { ...STARTER_UPGRADES, ...(raw.upgrades || {}) },
    settings,
    lastSavedAt: finite(raw.lastSavedAt, now),
  };
  const displayedSeen = new Set();
  state.displayed = (Array.isArray(raw.displayed) ? raw.displayed : [])
    .filter((entry) => {
      if (!entry || typeof entry.id !== "string" || displayedSeen.has(entry.id)) return false;
      if (!getCardDef(entry.id) || (collection[entry.id] || 0) <= 0) return false;
      displayedSeen.add(entry.id);
      return true;
    })
    .slice(0, CASE_SIZE)
    .map((entry) => ({ id: entry.id, at: finite(entry.at, now) }));
  state.prestige = {
    inscriptions: Math.max(0, Math.floor(finite(raw.prestige?.inscriptions))),
    rewrites: Math.max(0, Math.floor(finite(raw.prestige?.rewrites))),
  };
  state.packsPurchased = Math.max(0, Math.floor(finite(raw.packsPurchased)));
  state.counters = Object.fromEntries(
    Object.entries(raw.counters || {}).filter(([, value]) => Number.isFinite(value)),
  );
  state.discoverOffer = null;
  state.discoverStack = Object.fromEntries(
    Object.entries(raw.discoverStack || {})
      .filter(([id, value]) => DISCOVER_POOL.some((option) => option.id === id) && finite(value) > 0)
      .map(([id, value]) => [id, Math.min(99, Math.floor(finite(value)))]),
  );
  state.triggerTallies = {};
  return advanceBeat(state);
}

export function getFusionLevel(count) {
  return FUSION_THRESHOLDS.filter((threshold) => count >= threshold).length;
}

export function getFusionMultiplier(count) {
  return 1 + getFusionLevel(count) * 0.4;
}

export function getCardIncome(state, cardId) {
  return 0;
}

export function getBinderIncome() {
  return 0;
}

export function getPrestigeMultiplier(state) {
  return 1 + Math.max(0, finite(state?.prestige?.inscriptions)) * INSCRIPTION_MULT_STEP;
}

export function getPassiveIncomeRate(state) {
  if (!state) return BASE_PASSIVE_RATE;
  return BASE_PASSIVE_RATE * getPrestigeMultiplier(state);
}

export function getCardSaleValue(state, cardId) {
  const card = getCard(cardId);
  if (!card) return 0;
  return RARITIES[card.rarity].sellValue;
}

export function getDuplicateCount(state) {
  return Object.values(state.collection || {}).reduce(
    (total, count) => total + Math.max(0, Math.floor(finite(count)) - 1),
    0,
  );
}

function getRawDuplicateValue(state) {
  const saved = Math.max(0, finite(state.duplicateBank));
  if (saved > 0 || getDuplicateCount(state) === 0) return saved;
  return estimateLegacyDuplicateBank(state.collection || {});
}

export function getDuplicateSaleValue(state) {
  const dealerMultiplier = 1 + Math.max(0, finite(state.upgrades?.shelf)) * 0.2;
  const rawValue = getRawDuplicateValue(state) * dealerMultiplier * getPrestigeMultiplier(state);
  return getDuplicateCount(state) > 0 ? Math.max(1, Math.ceil(rawValue - 1e-9)) : 0;
}

export function sellDuplicates(state, now = Date.now()) {
  return sellDuplicatesDetailed(state, { now }).state;
}

// Selling duplicates is an engine moment: every duplicate sold can Salvage.
export function sellDuplicatesDetailed(state, options = {}) {
  const duplicateCount = getDuplicateCount(state);
  if (!duplicateCount) return { state, events: [], mysteryCards: [], saleValue: 0, salvages: 0 };
  const rng = options.rng || Math.random;
  const engine = getEngine(state);
  const saleValue = getDuplicateSaleValue(state);
  const collection = Object.fromEntries(
    Object.entries(state.collection || {})
      .filter(([, count]) => finite(count) > 0)
      .map(([id]) => [id, 1]),
  );
  const ctx = makeEngineContext({
    ...state,
    collection,
    duplicateBank: 0,
  }, engine, rng);
  addEngineCoins(ctx, saleValue, null, 0);

  let salvages = 0;
  if (engine.kings.has("salvage")) {
    let chance = 0;
    let flatPerDup = 0;
    for (const record of engine.onDupSold) {
      if (record.def.salvageChance) chance += record.def.salvageChance;
      if (record.def.coinsFlat) flatPerDup += record.def.coinsFlat;
      tallyTrigger(ctx, record.id);
    }
    if (flatPerDup > 0) addEngineCoins(ctx, Math.min(1e15, flatPerDup * duplicateCount), null, 0);
    if (chance > 0) {
      const expected = (duplicateCount * chance) / 100;
      salvages = Math.min(6, Math.floor(expected) + (rng() < expected - Math.floor(expected) ? 1 : 0));
      if (salvages > 0) performSalvage(ctx, salvages, null, 0);
    }
  }
  ctx.events.push({ t: "sold", count: duplicateCount, value: saleValue });
  return {
    state: finishEngineContext(ctx),
    events: ctx.events,
    mysteryCards: ctx.mysteryDirect,
    saleValue,
    salvages,
  };
}

// Editing the display case commits your build: the duplicate stack is sold
// first, so builds cannot be swapped around a pending cash-out.
export function displayCard(state, cardId, now = Date.now()) {
  if (!getCardDef(cardId) || (state.collection?.[cardId] || 0) <= 0) return state;
  let working = getDuplicateCount(state) > 0 ? sellDuplicates(state, now) : state;
  const entries = getDisplayedEntries(working);
  if (entries.some((entry) => entry.id === cardId)) return working === state ? state : working;
  if (entries.length >= getCaseSlots(working).slots) return working === state ? state : working;
  const counters = { ...working.counters };
  counters[`c:${cardId}`] = Math.floor(Math.max(0, finite(working.lifetimeCoins)));
  counters[`p:${cardId}`] = Math.max(0, Math.floor(finite(working.packsOpened)));
  return { ...working, displayed: [...entries, { id: cardId, at: now }], counters };
}

export function undisplayCard(state, cardId, now = Date.now()) {
  const entries = getDisplayedEntries(state);
  if (!entries.some((entry) => entry.id === cardId)) return state;
  const working = getDuplicateCount(state) > 0 ? sellDuplicates(state, now) : state;
  const current = getDisplayedEntries(working);
  return { ...working, displayed: current.filter((entry) => entry.id !== cardId) };
}

export function canRewrite(state) {
  return (state.collection?.[NAMELESS_CARD_ID] || 0) > 0;
}

export function getInscriptionsEarned(state) {
  if (!canRewrite(state)) return 0;
  const completed = getCompletedSetIds(state).length;
  const base = completed + 5;
  const namelessDisplayed = getDisplayedEntries(state).some((entry) => entry.id === NAMELESS_CARD_ID);
  return Math.max(1, Math.round(base * (namelessDisplayed ? 2 : 1)));
}

export function rewriteState(state, now = Date.now()) {
  if (!canRewrite(state)) return state;
  const earned = getInscriptionsEarned(state);
  const fresh = createInitialState(now);
  fresh.settings = { ...state.settings };
  fresh.createdAt = finite(state.createdAt, now);
  fresh.prestige = {
    inscriptions: Math.max(0, finite(state.prestige?.inscriptions)) + earned,
    rewrites: Math.max(0, finite(state.prestige?.rewrites)) + 1,
  };
  return advanceBeat(fresh);
}

export function getPackPrice(state, productId = "loose", setId = state.activeSet) {
  const product = PACK_PRODUCTS.find((candidate) => candidate.id === productId);
  if (!product) return Number.POSITIVE_INFINITY;
  const set = getSet(setId);
  const setPriceScale = Math.max(0.01, finite(set.packCost, 10) / 10);
  const supplierDiscount = Math.min(0.3, Math.max(0, finite(state.upgrades?.supplier)) * 0.025);
  return Math.max(1, Math.floor(product.costFactor * setPriceScale * (1 - supplierDiscount)));
}

export function getProductCount(state, setId, productId) {
  return Math.max(0, Math.floor(finite(state.sealed?.[setId]?.[productId])));
}

export function getForgedCount(state, setId, tagId) {
  return Math.max(0, Math.floor(finite(state.forged?.[setId]?.[tagId])));
}

export function getSealedPackCount(state) {
  let total = 0;
  for (const set of SETS) {
    for (const product of PACK_PRODUCTS) {
      total += getProductCount(state, set.id, product.id) * product.packs;
    }
    for (const tag of ARCHETYPES) total += getForgedCount(state, set.id, tag.id);
  }
  return total;
}

export function getCompletedSetIds(state) {
  return SETS
    .filter((set) => set.cards.every((card) => finite(state.collection?.[card.id]) > 0))
    .map((set) => set.id);
}

function countFoundInSet(state, setId) {
  return getSet(setId).cards.filter((card) => finite(state.collection?.[card.id]) > 0).length;
}

function getUnlockRequirementStatus(state, requirement, selfSetId) {
  if (requirement.type === "completeSet") {
    const set = getSet(requirement.setId);
    const current = countFoundInSet(state, set.id);
    const target = set.cards.length;
    return { met: current >= target, current, target, label: `Finish ${set.name}` };
  }
  if (requirement.type === "completeAnySet") {
    const setIds = requirement.setIds || [];
    const target = DECK_SIZE;
    const current = Math.max(0, ...setIds.map((setId) => countFoundInSet(state, setId)));
    const met = setIds.some((setId) => countFoundInSet(state, setId) >= getSet(setId).cards.length);
    const label = `Finish ${setIds.map((setId) => getSet(setId).name).join(" or ")}`;
    return { met, current, target, label };
  }
  if (requirement.type === "completeAllSets") {
    const others = SETS.filter((set) => set.id !== selfSetId);
    const current = others.filter((set) => countFoundInSet(state, set.id) >= set.cards.length).length;
    const target = others.length;
    return { met: current >= target, current, target, label: "Complete every other set" };
  }
  return { met: false, current: 0, target: 1, label: "Unknown requirement" };
}

export function getSetUnlockStatus(state, setId) {
  const set = getSet(setId);
  const requirements = (set.unlockRequirements || []).map((requirement) => (
    getUnlockRequirementStatus(state, requirement, set.id)
  ));
  const qualified = requirements.every((requirement) => requirement.met);
  return {
    unlocked: set.id === "corner" || qualified,
    qualified,
    requirements,
  };
}

export function getCurrentBeat(state) {
  const opened = Math.max(0, Math.floor(finite(state.packsOpened)));
  let beat = 1;
  for (let index = 1; index < BEAT_PACK_THRESHOLDS.length; index += 1) {
    if (opened >= BEAT_PACK_THRESHOLDS[index]) beat = index + 1;
  }
  return beat;
}

export function getBeatProgress(state) {
  const beat = getCurrentBeat(state);
  const currentFloor = BEAT_PACK_THRESHOLDS[beat - 1] || 0;
  const nextTarget = BEAT_PACK_THRESHOLDS[beat];
  if (!nextTarget) return { value: 1, max: 1, label: "All print tiers unlocked" };
  return {
    value: Math.max(0, state.packsOpened - currentFloor),
    max: nextTarget - currentFloor,
    label: `${nextTarget - state.packsOpened} packs until the next stock tier`,
  };
}

export function advanceBeat(state) {
  const beat = getCurrentBeat(state);
  const unlockedSets = new Set(["corner"]);
  for (const set of SETS) {
    if (getSetUnlockStatus(state, set.id).qualified) {
      unlockedSets.add(set.id);
    }
  }
  const unlockedSetIds = SETS.filter((set) => unlockedSets.has(set.id)).map((set) => set.id);
  const activeSet = unlockedSetIds.includes(state.activeSet) ? state.activeSet : "corner";
  return {
    ...state,
    beat,
    activeSet,
    unlockedSets: unlockedSetIds,
    upgrades: {
      ...STARTER_UPGRADES,
      ...(state.upgrades || {}),
    },
  };
}

export function getDerived(state) {
  const passiveRate = getPassiveIncomeRate(state);
  const discoveredCount = Object.keys(state.collection || {}).filter((id) => state.collection[id] > 0).length;
  const fusionStars = Object.values(state.collection || {}).reduce(
    (total, count) => total + getFusionLevel(count),
    0,
  );
  const caseSlots = getCaseSlots(state);
  return {
    passiveRate,
    discoveredCount,
    fusionStars,
    engine: getEngine(state),
    displayedEntries: getDisplayedEntries(state),
    caseSlots: caseSlots.slots,
    caseMilestones: caseSlots.milestones,
    inscriptions: Math.max(0, finite(state.prestige?.inscriptions)),
    rewrites: Math.max(0, finite(state.prestige?.rewrites)),
    prestigeMultiplier: getPrestigeMultiplier(state),
    packStock: getSealedPackCount(state),
    duplicateCount: getDuplicateCount(state),
    duplicateSaleValue: getDuplicateSaleValue(state),
    loosePacks: getProductCount(state, state.activeSet, "loose"),
    autoRate: 0,
    masteryCount: 0,
    valueMultiplier: 1,
    manualMultiplier: 1.25,
    shelfMultiplier: 1 + Math.max(0, finite(state.upgrades?.shelf)) * 0.2,
    premiumMultiplier: 1 + Math.max(0, finite(state.upgrades?.lamp)) * 0.05,
    supplierDiscount: Math.min(0.3, Math.max(0, finite(state.upgrades?.supplier)) * 0.025),
  };
}

export function addPassiveIncome(state, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return state;
  const total = Math.max(0, finite(state.passiveCarry)) + amount;
  const wholeCash = Math.floor(total + 1e-9);
  return {
    ...state,
    coins: Math.floor(Math.max(0, finite(state.coins))) + wholeCash,
    lifetimeCoins: Math.floor(Math.max(0, finite(state.lifetimeCoins))) + wholeCash,
    passiveCarry: Math.max(0, total - wholeCash),
  };
}

export function buyProduct(state, productId, setId = state.activeSet, quantity = 1) {
  const product = PACK_PRODUCTS.find((candidate) => candidate.id === productId);
  const set = SETS.find((candidate) => candidate.id === setId);
  const count = Math.max(1, Math.floor(finite(quantity, 1)));
  if (!product || !set || product.unlockBeat > state.beat || !state.unlockedSets.includes(setId)) return state;
  const unitPrice = getPackPrice(state, productId, setId);
  const priorPurchases = Math.max(0, Math.floor(finite(state.packsPurchased)));
  const cost = unitPrice * count;
  if (state.coins + 1e-8 < cost) return state;
  const sealed = cloneStock(state.sealed);
  sealed[setId][productId] += count;
  return {
    ...state,
    coins: Math.floor(Math.max(0, finite(state.coins))) - cost,
    sealed,
    activeSet: setId,
    packsPurchased: productId === "loose" ? priorPurchases + count : priorPurchases,
  };
}

export function getUpgradeCost(state, upgradeId) {
  const upgrade = CLEAN_UPGRADES.find((candidate) => candidate.id === upgradeId);
  if (!upgrade) return Number.POSITIVE_INFINITY;
  const rank = Math.max(0, Math.floor(finite(state.upgrades?.[upgradeId])));
  if (rank >= upgrade.max) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.round(upgrade.baseCost * upgrade.growth ** rank));
}

export function buyUpgrade(state, upgradeId) {
  const upgrade = CLEAN_UPGRADES.find((candidate) => candidate.id === upgradeId);
  if (!upgrade || state.packsOpened < upgrade.unlockPacks) return state;
  const rank = Math.max(0, Math.floor(finite(state.upgrades?.[upgradeId])));
  const cost = getUpgradeCost(state, upgradeId);
  if (rank >= upgrade.max || state.coins + 1e-8 < cost) return state;
  return {
    ...state,
    coins: Math.floor(Math.max(0, finite(state.coins))) - cost,
    upgrades: {
      ...state.upgrades,
      [upgradeId]: rank + 1,
    },
  };
}

export function breakProduct(state, productId, setId = state.activeSet) {
  const product = PACK_PRODUCTS.find((candidate) => candidate.id === productId);
  if (!product || product.id === "loose" || !product.manualBonus) return state;
  if (getProductCount(state, setId, productId) < 1) return state;
  const sealed = cloneStock(state.sealed);
  sealed[setId][productId] -= 1;
  sealed[setId].loose += product.packs;
  return { ...state, sealed };
}

export function selectSet(state, setId) {
  if (!state.unlockedSets.includes(setId)) return state;
  return {
    ...state,
    activeSet: setId,
    standingOrder: { ...state.standingOrder, setId },
  };
}

export function configureStandingOrder(state, patch) {
  if (state.beat < 2) return state;
  const next = { ...state.standingOrder, ...patch };
  if (!PACK_PRODUCTS.some((product) => product.id === next.product && product.unlockBeat <= state.beat)) {
    next.product = "loose";
  }
  if (!state.unlockedSets.includes(next.setId)) next.setId = state.activeSet;
  next.reserve = Math.max(0, finite(next.reserve));
  return { ...state, standingOrder: next };
}

export function tickEconomy(state, seconds) {
  const elapsed = Math.max(0, Math.min(2, finite(seconds)));
  return addPassiveIncome(state, getPassiveIncomeRate(state) * elapsed);
}

function availableRarities(beat) {
  return RARITY_IDS.filter((id) => RARITIES[id].introducedBeat <= beat);
}

function chooseRarity(state, rng) {
  const available = availableRarities(state.beat).sort((a, b) => RARITIES[b].order - RARITIES[a].order);
  const boost = 1 + Math.max(0, finite(state.upgrades?.lamp)) * 0.05;
  const weights = available
    .filter((id) => id !== "common")
    .map((id) => ({ id, weight: RARITIES[id].odds * boost }));
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  const scale = total > 0.9 ? 0.9 / total : 1;
  let roll = rng();
  for (const entry of weights) {
    const weight = entry.weight * scale;
    if (roll < weight) return entry.id;
    roll -= weight;
  }
  return "common";
}

function rarityIdAtOrder(order) {
  return RARITY_IDS.find((id) => RARITIES[id].order === order) || "common";
}

function chooseCard(set, rarity, rng, usedIds, tagBias) {
  let pool = set.cards.filter((card) => card.rarity === rarity);
  if (!pool.length) {
    const targetOrder = RARITIES[rarity].order;
    const closestOrder = Math.max(...set.cards.map((card) => (
      RARITIES[card.rarity].order <= targetOrder ? RARITIES[card.rarity].order : -1
    )));
    pool = set.cards.filter((card) => RARITIES[card.rarity].order === closestOrder);
  }
  if (tagBias && rng() < 0.68) {
    const tagged = pool.filter((card) => card.tag === tagBias);
    if (tagged.length) pool = tagged;
  }
  const unused = pool.filter((card) => !usedIds.has(card.id));
  const candidates = unused.length ? unused : pool;
  return candidates[Math.floor(rng() * candidates.length) % candidates.length];
}

function gradeCard(rng, manual) {
  if (!manual) return 4;
  const roll = rng();
  if (roll > 0.985) return 10;
  if (roll > 0.91) return 9;
  if (roll > 0.70) return 8;
  if (roll > 0.38) return 7;
  if (roll > 0.12) return 6;
  return 5;
}

function signalRarity(rarity, state, rng) {
  const available = availableRarities(state.beat);
  const index = available.indexOf(rarity);
  if (rng() < 0.12 && index >= 0 && index < available.length - 1) {
    return { rarity: available[index + 1], falsePositive: true };
  }
  return { rarity, falsePositive: false };
}

function makePull(state, card, rng, manual, extra = {}) {
  const signal = signalRarity(card.rarity, state, rng);
  return {
    card,
    rarity: card.rarity,
    foil: rng() < 0.018,
    grade: gradeCard(rng, manual),
    misprintDetected: manual && rng() < 0.0075,
    signalRarity: signal.rarity,
    falseSignal: signal.falsePositive,
    marked: false,
    revealed: false,
    isNew: false,
    mimicOf: null,
    transmuted: false,
    fusedFrom: null,
    fromMystery: false,
    ...extra,
  };
}

function rollPackCard(state, set, rng, engine, usedIds, manual) {
  const rolledRarity = chooseRarity(state, rng);
  let card = chooseCard(set, rolledRarity, rng, usedIds, null);
  if (engine && engine.dupBias > 0 && !(state.collection?.[card.id] > 0) && rng() < engine.dupBias / 100) {
    const owned = set.cards.filter((candidate) => (
      state.collection?.[candidate.id] > 0 && candidate.rarity === card.rarity
    ));
    if (owned.length) card = owned[Math.floor(rng() * owned.length) % owned.length];
  }
  usedIds.add(card.id);
  return makePull(state, card, rng, manual);
}

// --- Engine context: a mutable working copy threaded through resolution. ---

function makeEngineContext(state, engine, rng) {
  return {
    working: {
      ...state,
      collection: { ...state.collection },
      bestRarities: { ...state.bestRarities },
      rarityPulls: { ...state.rarityPulls },
      counters: { ...state.counters },
      discoverStack: { ...state.discoverStack },
      triggerTallies: { ...state.triggerTallies },
      foils: { ...state.foils },
      bestGrades: { ...state.bestGrades },
      misprints: { ...state.misprints },
    },
    engine,
    rng,
    events: [],
    injectCards: null,
    mysteryDirect: [],
    salvageBudget: 8,
  };
}

function finishEngineContext(ctx) {
  return ctx.working;
}

function tallyTrigger(ctx, cardId) {
  ctx.working.triggerTallies[cardId] = (ctx.working.triggerTallies[cardId] || 0) + 1;
}

function consumeDiscoverStack(ctx, optionId) {
  const count = Math.max(0, Math.floor(finite(ctx.working.discoverStack?.[optionId])));
  if (count > 0) {
    const next = { ...ctx.working.discoverStack };
    delete next[optionId];
    ctx.working.discoverStack = next;
  }
  return count;
}

function offerDiscover(ctx, sourceId) {
  const pool = DISCOVER_POOL.map((option) => option.id);
  if (ctx.engine.kings.has("autopilot")) {
    const pick = pool[Math.floor(ctx.rng() * pool.length) % pool.length];
    const gain = 2 + (ctx.engine.discoverEnhance ? 1 : 0);
    ctx.working.discoverStack = {
      ...ctx.working.discoverStack,
      [pick]: Math.min(99, (ctx.working.discoverStack[pick] || 0) + gain),
    };
    ctx.events.push({ t: "discoverAuto", option: pick, gain, source: sourceId });
    return;
  }
  if (ctx.working.discoverOffer) return;
  const options = [];
  const bag = [...pool];
  while (options.length < 3 && bag.length) {
    options.push(bag.splice(Math.floor(ctx.rng() * bag.length) % bag.length, 1)[0]);
  }
  ctx.working.discoverOffer = options;
  ctx.events.push({ t: "discoverOffer", options, source: sourceId });
}

export function chooseDiscoverOption(state, optionId) {
  if (!state.discoverOffer || !state.discoverOffer.includes(optionId)) return state;
  const engine = getEngine(state);
  const gain = (engine.discoverEnhance ? 2 : 1) + Math.max(0, engine.discoverKeep - 1);
  return {
    ...state,
    discoverOffer: null,
    discoverStack: {
      ...state.discoverStack,
      [optionId]: Math.min(99, (state.discoverStack[optionId] || 0) + gain),
    },
  };
}

export function dismissDiscoverOffer(state) {
  if (!state.discoverOffer) return state;
  return { ...state, discoverOffer: null };
}

function rollMysteryCard(ctx) {
  const state = ctx.working;
  const futureChance = 0.005 * ctx.engine.mysteryFuture;
  const locked = SETS.filter((set) => !state.unlockedSets.includes(set.id));
  let set;
  if (locked.length && ctx.rng() < futureChance) {
    set = locked[Math.floor(ctx.rng() * locked.length) % locked.length];
  } else {
    const pool = state.unlockedSets;
    set = getSet(pool[Math.floor(ctx.rng() * pool.length) % pool.length]);
  }
  const rarity = chooseRarity(state, ctx.rng);
  const card = chooseCard(set, rarity, ctx.rng, new Set(), null);
  return makePull(state, card, ctx.rng, true, { fromMystery: true });
}

function applyRevealToCollection(ctx, pull) {
  const state = ctx.working;
  const id = pull.card.id;
  const prior = state.collection[id] || 0;
  pull.isNew = prior === 0;
  pull.revealed = true;
  state.collection[id] = prior + 1;
  state.bestRarities[id] = pull.card.rarity;
  state.rarityPulls[pull.rarity] = (state.rarityPulls[pull.rarity] || 0) + 1;
  state.cardsPulled = (state.cardsPulled || 0) + 1;
  if (pull.foil) state.foils[id] = (state.foils[id] || 0) + 1;
  state.bestGrades[id] = Math.max(finite(state.bestGrades[id]), pull.grade);
  if (pull.misprintDetected) state.misprints[id] = (state.misprints[id] || 0) + 1;
  if (!pull.isNew) {
    const value = RARITIES[pull.card.rarity].sellValue;
    state.duplicateBank = Math.max(0, finite(state.duplicateBank)) + value;
  }
}

function performSalvage(ctx, times, injectCards, depth) {
  if (!ctx.engine.kings.has("salvage")) return;
  const bonus = consumeDiscoverStack(ctx, "acceleration");
  let total = Math.min(ctx.salvageBudget, (times + bonus) * ctx.engine.salvagePacks);
  ctx.salvageBudget -= total;
  while (total > 0) {
    total -= 1;
    const size = Math.min(24, 4 + ctx.engine.mysterySize);
    const cards = [];
    for (let index = 0; index < size; index += 1) cards.push(rollMysteryCard(ctx));
    ctx.events.push({ t: "mystery", count: cards.length });
    if (injectCards) {
      for (const pull of cards) injectCards.push(pull);
    } else {
      for (const pull of cards) applyRevealToCollection(ctx, pull);
      ctx.mysteryDirect.push(...cards);
    }
    for (const record of ctx.engine.onMysteryOpened) {
      tallyTrigger(ctx, record.id);
      fireSupportPayoff(ctx, record, null, injectCards, depth + 1);
    }
  }
}

function addEngineCoins(ctx, amount, sourceId, depth) {
  const gain = Math.floor(Math.max(0, amount));
  if (gain <= 0) return;
  ctx.working.coins = Math.floor(Math.max(0, finite(ctx.working.coins))) + gain;
  ctx.working.lifetimeCoins = Math.floor(Math.max(0, finite(ctx.working.lifetimeCoins))) + gain;
  ctx.events.push({ t: "coins", amount: gain, source: sourceId });
  if (depth <= 2) evaluateCoinThresholds(ctx, depth + 1);
}

function evaluateCoinThresholds(ctx, depth) {
  const lifetime = Math.floor(Math.max(0, finite(ctx.working.lifetimeCoins)));
  for (const record of ctx.engine.thresholds) {
    if (record.def.on !== "coinsEarned") continue;
    const key = `c:${record.id}`;
    let credited = Math.floor(finite(ctx.working.counters[key], lifetime));
    let fires = Math.floor((lifetime - credited) / record.def.every);
    if (fires <= 0) {
      ctx.working.counters[key] = credited;
      continue;
    }
    fires = Math.min(4, fires);
    ctx.working.counters[key] = credited + fires * record.def.every;
    tallyTrigger(ctx, record.id);
    for (let index = 0; index < fires; index += 1) {
      if (record.def.do === "salvage") performSalvage(ctx, 1, ctx.injectCards, depth);
      else if (record.def.do === "discover") offerDiscover(ctx, record.id);
    }
  }
}

function evaluatePackThresholds(ctx, depth) {
  const opened = Math.max(0, Math.floor(finite(ctx.working.packsOpened)));
  for (const record of ctx.engine.thresholds) {
    if (record.def.on !== "packsOpened") continue;
    const key = `p:${record.id}`;
    const credited = Math.floor(finite(ctx.working.counters[key], opened));
    let fires = Math.floor((opened - credited) / record.def.every);
    if (fires <= 0) {
      ctx.working.counters[key] = credited;
      continue;
    }
    fires = Math.min(3, fires);
    ctx.working.counters[key] = credited + fires * record.def.every;
    tallyTrigger(ctx, record.id);
    for (let index = 0; index < fires; index += 1) {
      if (record.def.do === "salvage") performSalvage(ctx, 1, ctx.injectCards, depth);
      else if (record.def.do === "discover") offerDiscover(ctx, record.id);
    }
  }
}

// Executes one trigger support's payoff. `pull` is the revealed card when the
// trigger came from a reveal; null otherwise.
function fireSupportPayoff(ctx, record, pull, injectCards, depth) {
  const def = record.def;
  ctx.events.push({ t: "trigger", cardId: record.id, slot: record.slot });
  if (def.coins && pull) {
    if (!def.coinsChance || ctx.rng() < def.coinsChance / 100) {
      addEngineCoins(ctx, def.coins * RARITIES[pull.card.rarity].sellValue, record.id, depth);
    }
  }
  if (def.coinsFlat) addEngineCoins(ctx, def.coinsFlat, record.id, depth);
  if (def.salvageChance && ctx.rng() < def.salvageChance / 100) {
    performSalvage(ctx, 1, injectCards, depth);
  }
  if (def.do === "salvage" && (!def.chance || ctx.rng() < def.chance / 100)) {
    performSalvage(ctx, 1, injectCards, depth);
  }
  if (def.do === "discover" && (!def.chance || ctx.rng() < def.chance / 100)) {
    offerDiscover(ctx, record.id);
  }
  return def;
}

function relayCascade(ctx, fromSlot, pull, injectCards, depth) {
  if (!ctx.engine.kings.has("relay")) return;
  for (let slot = fromSlot + 1; slot < ctx.engine.slots.length; slot += 1) {
    const record = [...ctx.engine.reveal, ...ctx.engine.onPackOpened, ...ctx.engine.onFusion]
      .find((candidate) => candidate.slot === slot);
    if (!record) continue; // Kings and dials pass the spark along without firing.
    ctx.events.push({ t: "relay", from: slot - 1, to: slot });
    tallyTrigger(ctx, record.id);
    fireSupportPayoff(ctx, record, pull, injectCards, depth);
  }
}

function assignMark(ctx, cards, biasHigh) {
  const unmarked = cards
    .map((pull, index) => ({ pull, index }))
    .filter((entry) => !entry.pull.revealed && !entry.pull.marked);
  if (!unmarked.length) return -1;
  let target;
  if (biasHigh > 0) {
    target = unmarked.reduce((best, entry) => (
      RARITIES[entry.pull.card.rarity].order > RARITIES[best.pull.card.rarity].order ? entry : best
    ), unmarked[0]);
  } else {
    target = unmarked[Math.floor(ctx.rng() * unmarked.length) % unmarked.length];
  }
  target.pull.marked = true;
  ctx.events.push({ t: "mark", index: target.index });
  return target.index;
}

function consumePackSource(state, source, setId) {
  if (source === "sealed") {
    if (!state.sealedRun || state.sealedRun.phase !== "opening" || state.sealedRun.remainingPacks <= 0) {
      return { state, ok: false };
    }
    return { state, ok: true, tagBias: null };
  }
  if (source.startsWith("forged:")) {
    const tagId = source.slice("forged:".length);
    if (!ARCHETYPES.some((tag) => tag.id === tagId) || getForgedCount(state, setId, tagId) < 1) {
      return { state, ok: false };
    }
    const forged = cloneForgeStock(state.forged);
    forged[setId][tagId] -= 1;
    return { state: { ...state, forged }, ok: true, tagBias: tagId };
  }
  if (getProductCount(state, setId, "loose") < 1) return { state, ok: false };
  const sealed = cloneStock(state.sealed);
  sealed[setId].loose -= 1;
  return { state: { ...state, sealed }, ok: true, tagBias: null };
}

// Pack pipeline phase 1: generate the pack and resolve every pre-reveal
// effect (Fracture, Marks, Mimic, Catalyst spread). Cards are NOT added to
// the collection here — that happens per reveal.
export function openPack(state, options = {}) {
  const manual = options.manual !== false;
  const context = options.context === "sealed" ? "sealed" : "binder";
  const source = context === "sealed" ? "sealed" : String(options.source || "loose");
  const setId = context === "sealed" ? state.sealedRun?.setId : (options.setId || state.activeSet);
  const openedAt = finite(options.now, Date.now());
  if (manual && !options.free && openedAt - finite(state.lastManualAt) < MANUAL_RATE_CAP_MS) {
    return { state, result: null, error: "MANUAL_RATE_CAP" };
  }
  const consumed = options.free
    ? { state, ok: true, tagBias: options.tagBias || null }
    : consumePackSource(state, source, setId);
  if (!consumed.ok) return { state, result: null, error: "NO_STOCK" };

  const rng = options.rng || Math.random;
  const set = getSet(setId);
  const engine = context === "sealed" ? null : getEngine(state);
  const ctx = makeEngineContext(consumed.state, engine || getEngine(state), rng);
  if (context === "sealed") ctx.engine = { ...ctx.engine, kings: new Set() };

  const packSize = PACK_SIZE + (context === "sealed" ? 0 : ctx.engine.packSize);
  const usedIds = new Set();
  const cards = [];
  for (let index = 0; index < Math.min(24, packSize); index += 1) {
    cards.push(rollPackCard(ctx.working, set, rng, context === "sealed" ? null : ctx.engine, usedIds, manual));
  }

  let packsInReveal = 1;
  if (ctx.engine.kings.has("fracture")) {
    let extra = 0;
    while (extra < ctx.engine.fractureDepth && rng() < ctx.engine.fractureChance / 100) {
      extra += 1;
      const moreUsed = new Set();
      for (let index = 0; index < Math.min(24, packSize); index += 1) {
        cards.push(rollPackCard(ctx.working, set, rng, ctx.engine, moreUsed, manual));
      }
      ctx.events.push({ t: "fracture", packs: extra + 1 });
    }
    packsInReveal += extra;
  }

  if (ctx.engine.kings.has("mark")) {
    let marks = 1 + ctx.engine.markEveryPack + consumeDiscoverStack(ctx, "insight");
    if (ctx.engine.markExtraChance > 0 && rng() < ctx.engine.markExtraChance / 100) marks += 1;
    for (let index = 0; index < Math.min(marks, cards.length); index += 1) {
      const marked = assignMark(ctx, cards, ctx.engine.markBiasHigh);
      if (marked >= 0 && ctx.engine.kings.has("catalyst") && rng() < ctx.engine.catalystChance / 100) {
        assignMark(ctx, cards, 0);
        ctx.events.push({ t: "catalyst", property: "mark" });
      }
    }
  }

  if (ctx.engine.kings.has("mimic") && cards.length >= 2) {
    const pickIndex = (candidates) => candidates[Math.floor(rng() * candidates.length) % candidates.length];
    let sourcePool = cards.map((pull, index) => ({ pull, index }));
    if (ctx.engine.mimicBiasMarked > 0 && sourcePool.some((entry) => entry.pull.marked)) {
      sourcePool = sourcePool.filter((entry) => entry.pull.marked);
    } else if (ctx.engine.mimicBiasHigh > 0) {
      const top = Math.max(...sourcePool.map((entry) => RARITIES[entry.pull.card.rarity].order));
      sourcePool = sourcePool.filter((entry) => RARITIES[entry.pull.card.rarity].order === top);
    }
    const sourceEntry = pickIndex(sourcePool);
    const targets = cards
      .map((pull, index) => ({ pull, index }))
      .filter((entry) => entry.index !== sourceEntry.index);
    if (targets.length) {
      const applyMimic = (entry) => {
        cards[entry.index] = makePull(ctx.working, sourceEntry.pull.card, rng, manual, {
          marked: entry.pull.marked,
          mimicOf: sourceEntry.index,
        });
        ctx.events.push({ t: "mimic", from: sourceEntry.index, to: entry.index });
      };
      applyMimic(pickIndex(targets));
      if (ctx.engine.kings.has("catalyst") && rng() < ctx.engine.catalystChance / 100) {
        const remaining = targets.filter((entry) => !cards[entry.index].mimicOf);
        if (remaining.length) {
          applyMimic(pickIndex(remaining));
          ctx.events.push({ t: "catalyst", property: "copy" });
        }
      }
    }
  }

  for (const record of ctx.engine.onPackOpened) {
    tallyTrigger(ctx, record.id);
    const def = fireSupportPayoff(ctx, record, null, cards, 0);
    if (def.markChance && ctx.engine.kings.has("mark") && rng() < def.markChance / 100) {
      assignMark(ctx, cards, ctx.engine.markBiasHigh);
    }
    relayCascade(ctx, record.slot, null, cards, 0);
  }

  let sealedRun = ctx.working.sealedRun;
  ctx.working.packsOpened = ctx.working.packsOpened + packsInReveal;
  ctx.working.manualPacks = ctx.working.manualPacks + (manual ? 1 : 0);
  ctx.working.lastManualAt = manual ? openedAt : ctx.working.lastManualAt;
  if (context === "sealed" && sealedRun) {
    ctx.working.sealedRun = { ...sealedRun };
  } else {
    evaluatePackThresholds(ctx, 0);
  }

  const finished = advanceBeat(finishEngineContext(ctx));
  return {
    state: finished,
    result: {
      set,
      cards,
      manual,
      source,
      context,
      packsInReveal,
      events: ctx.events,
    },
    error: null,
  };
}

// Pack pipeline phase 2: reveal one card. Applies the card to the collection
// and resolves every reveal-driven engine verb.
export function revealPackCard(state, cards, index, options = {}) {
  const pull = cards[index];
  if (!pull || pull.revealed) return { state, cards, events: [] };
  const rng = options.rng || Math.random;
  const manual = options.manual !== false;
  const engine = getEngine(state);
  const ctx = makeEngineContext(state, engine, rng);
  const nextCards = cards.map((entry) => ({ ...entry }));
  ctx.injectCards = nextCards;
  const revealed = nextCards[index];
  const wasComplete = getSet(revealed.card.setId).cards.every(
    (candidate) => finite(ctx.working.collection[candidate.id]) > 0,
  );
  applyRevealToCollection(ctx, revealed);
  ctx.events.push({ t: "reveal", index, cardId: revealed.card.id, rarity: revealed.rarity, isNew: revealed.isNew });

  const matched = engine.reveal.filter((record) => revealTriggerMatches(record.def, revealed));
  let echoBonus = 0;
  let transmuteBonus = 0;
  const fireMatched = () => {
    for (const record of matched) {
      tallyTrigger(ctx, record.id);
      const def = fireSupportPayoff(ctx, record, revealed, nextCards, 0);
      if (def.echoBoost) echoBonus += def.echoBoost;
      if (def.transmuteBoost) transmuteBonus += def.transmuteBoost;
      if (def.spreadMark && revealed.marked && ctx.engine.kings.has("mark") && rng() < def.spreadMark / 100) {
        assignMark(ctx, nextCards, ctx.engine.markBiasHigh);
        if (ctx.engine.kings.has("catalyst") && rng() < ctx.engine.catalystChance / 100) {
          assignMark(ctx, nextCards, 0);
          ctx.events.push({ t: "catalyst", property: "mark" });
        }
      }
      relayCascade(ctx, record.slot, revealed, nextCards, 0);
    }
  };
  fireMatched();

  const order = RARITIES[revealed.rarity].order;
  const echoAll = 1 + engine.echoAllBoost / 100;
  let echoes = 0;
  if (engine.kings.has("commonEcho") && revealed.rarity === "common") {
    if (rng() < Math.min(1, ((engine.echoCommonChance + echoBonus) / 100) * echoAll)) echoes = 1;
  } else if (engine.kings.has("rareEcho") && order >= RARITIES.rare.order) {
    if (rng() < Math.min(1, ((engine.echoRareChance + echoBonus) / 100) * echoAll)) echoes = 1;
  }
  if (echoes > 0) {
    echoes += consumeDiscoverStack(ctx, "resonance");
    for (let repeat = 0; repeat < Math.min(4, echoes); repeat += 1) {
      ctx.events.push({ t: "echo", index });
      fireMatched();
    }
  }

  if (engine.kings.has("transmute")) {
    const chance = Math.min(95, engine.transmuteChance + transmuteBonus);
    let targets = 1 + consumeDiscoverStack(ctx, "reflection");
    if (rng() < chance / 100) {
      for (let count = 0; count < targets; count += 1) {
        const unrevealed = nextCards
          .map((entry, position) => ({ entry, position }))
          .filter((item) => !item.entry.revealed);
        if (!unrevealed.length) break;
        let pool = unrevealed;
        if (engine.transmuteBiasMarked > 0 && unrevealed.some((item) => item.entry.marked)) {
          pool = unrevealed.filter((item) => item.entry.marked);
        }
        const target = pool[Math.floor(rng() * pool.length) % pool.length];
        const currentOrder = RARITIES[target.entry.card.rarity].order;
        const step = Math.sign(order - currentOrder) || 1;
        const climb = step > 0 ? Math.min(order, currentOrder + step * engine.transmuteUp) : order;
        const targetSet = getSet(target.entry.card.setId);
        const newCard = chooseCard(targetSet, rarityIdAtOrder(Math.max(0, climb)), rng, new Set(), null);
        nextCards[target.position] = makePull(ctx.working, newCard, rng, manual, {
          marked: target.entry.marked,
          transmuted: true,
        });
        ctx.events.push({ t: "transmute", index: target.position, rarity: newCard.rarity });
        if (engine.kings.has("catalyst") && rng() < engine.catalystChance / 100 && count === 0) {
          targets += 1;
          ctx.events.push({ t: "catalyst", property: "transmute" });
        }
      }
    }
  }

  const nowComplete = getSet(revealed.card.setId).cards.every(
    (candidate) => finite(ctx.working.collection[candidate.id]) > 0,
  );
  if (!wasComplete && nowComplete) {
    ctx.events.push({ t: "setComplete", setId: revealed.card.setId });
    for (const record of engine.onSetCompleted) {
      tallyTrigger(ctx, record.id);
      fireSupportPayoff(ctx, record, revealed, nextCards, 0);
      relayCascade(ctx, record.slot, revealed, nextCards, 0);
    }
  }

  return { state: advanceBeat(finishEngineContext(ctx)), cards: nextCards, events: ctx.events };
}

// Pack pipeline phase 3: after every card is revealed, same-rarity pairs fuse
// upward and re-enter the board unrevealed. Call again once they are revealed;
// returns fused=false when the chain is exhausted.
export function resolveFusions(state, cards, options = {}) {
  const rng = options.rng || Math.random;
  const engine = getEngine(state);
  if (!engine.kings.has("fusion")) return { state, cards, events: [], fused: false };
  if (cards.some((pull) => !pull.revealed)) return { state, cards, events: [], fused: false };

  const ctx = makeEngineContext(state, engine, rng);
  const nextCards = cards.map((entry) => ({ ...entry }));
  ctx.injectCards = nextCards;
  const catalystStack = consumeDiscoverStack(ctx, "catalyst");
  const passes = 1 + (engine.fusionTwice ? 1 : 0);
  let fused = false;

  for (let pass = 0; pass < passes; pass += 1) {
    const byRarity = new Map();
    nextCards.forEach((pull, index) => {
      if (pull.revealed && !pull.fusedAway) {
        const list = byRarity.get(pull.rarity) || [];
        list.push(index);
        byRarity.set(pull.rarity, list);
      }
    });
    for (const [rarity, indices] of byRarity) {
      const pairs = Math.floor(indices.length / 2);
      for (let pair = 0; pair < pairs; pair += 1) {
        const left = indices[pair * 2];
        const right = indices[pair * 2 + 1];
        const parent = nextCards[left];
        const parentSet = getSet(parent.card.setId);
        const currentOrder = RARITIES[rarity].order;
        const climb = currentOrder + engine.fusionDepth + catalystStack;
        const available = [...new Set(parentSet.cards.map((card) => RARITIES[card.rarity].order))]
          .filter((value) => value > currentOrder)
          .sort((a, b) => a - b);
        if (!available.length) continue;
        const targetOrder = available.filter((value) => value <= climb).pop() ?? available[0];
        const fusedCard = chooseCard(parentSet, rarityIdAtOrder(targetOrder), rng, new Set(), null);
        nextCards[left] = { ...nextCards[left], fusedAway: true };
        nextCards[right] = { ...nextCards[right], fusedAway: true };
        nextCards.push(makePull(ctx.working, fusedCard, rng, true, { fusedFrom: rarity }));
        ctx.events.push({ t: "fusion", from: rarity, to: fusedCard.rarity, left, right, index: nextCards.length - 1 });
        fused = true;
        for (const record of engine.onFusion) {
          tallyTrigger(ctx, record.id);
          fireSupportPayoff(ctx, record, null, nextCards, 0);
          relayCascade(ctx, record.slot, null, nextCards, 0);
        }
      }
    }
    if (!fused) break;
  }

  return { state: advanceBeat(finishEngineContext(ctx)), cards: nextCards, events: ctx.events, fused };
}

// Idle threshold sweep: passive income feeds the same coin thresholds as
// active play. Call from the economy tick; mystery packs open instantly.
export function evaluateIdleThresholds(state, options = {}) {
  const engine = getEngine(state);
  if (!engine.thresholds.some((record) => record.def.on === "coinsEarned")) {
    return { state, events: [], mysteryCards: [] };
  }
  const ctx = makeEngineContext(state, engine, options.rng || Math.random);
  evaluateCoinThresholds(ctx, 0);
  if (!ctx.events.length) return { state, events: [], mysteryCards: [] };
  return { state: finishEngineContext(ctx), events: ctx.events, mysteryCards: ctx.mysteryDirect };
}

export function rollPack(state, options = {}) {
  return openPack(state, { ...options, free: options.free !== false });
}

export function addFilingRule(state) {
  if (state.beat < 4 || state.filingRules.length >= 6) return state;
  const rule = {
    id: state.nextRuleId,
    rarity: "common",
    threshold: 32,
    action: "shred",
    enabled: true,
  };
  return {
    ...state,
    filingRules: [...state.filingRules, rule],
    nextRuleId: state.nextRuleId + 1,
  };
}

export function updateFilingRule(state, ruleId, patch) {
  if (state.beat < 4) return state;
  return {
    ...state,
    filingRules: state.filingRules.map((rule) => (
      rule.id === ruleId
        ? {
            ...rule,
            ...patch,
            threshold: patch.threshold === undefined
              ? rule.threshold
              : Math.max(1, Math.floor(finite(patch.threshold, rule.threshold))),
          }
        : rule
    )),
  };
}

export function removeFilingRule(state, ruleId) {
  if (state.beat < 4) return state;
  return { ...state, filingRules: state.filingRules.filter((rule) => rule.id !== ruleId) };
}

export function forgePack(state, tagId, setId = state.activeSet) {
  if (
    state.beat < 5
    || state.forgeMaterial < FORGE_COST
    || !ARCHETYPES.some((tag) => tag.id === tagId)
    || !state.unlockedSets.includes(setId)
  ) {
    return state;
  }
  const forged = cloneForgeStock(state.forged);
  forged[setId][tagId] += 1;
  return {
    ...state,
    forgeMaterial: state.forgeMaterial - FORGE_COST,
    forged,
  };
}

function countDeckCards(deck) {
  return deck.reduce((counts, id) => {
    counts[id] = (counts[id] || 0) + 1;
    return counts;
  }, {});
}

export function changeDeckCard(state, cardId, delta, format = "constructed") {
  if (!getCard(cardId) || ![-1, 1].includes(Math.sign(delta))) return state;
  const sealed = format === "sealed";
  if (sealed && !state.sealedRun) return state;
  const availability = sealed ? state.sealedRun.pool : state.collection;
  const deck = [...(sealed ? state.sealedRun.deck : state.duelDeck)];
  const counts = countDeckCards(deck);
  if (delta > 0) {
    const cap = sealed
      ? Math.max(0, Math.floor(finite(availability[cardId])))
      : Math.min(3, Math.max(0, Math.floor(finite(availability[cardId]))));
    if (deck.length >= DECK_SIZE || (counts[cardId] || 0) >= cap) return state;
    deck.push(cardId);
  } else {
    const index = deck.lastIndexOf(cardId);
    if (index < 0) return state;
    deck.splice(index, 1);
  }
  if (sealed) {
    return { ...state, sealedRun: { ...state.sealedRun, deck } };
  }
  return { ...state, duelDeck: deck };
}

export function getDeckAnalysis(state, deck = state.duelDeck, format = "constructed") {
  const cards = deck.map(getCard).filter(Boolean);
  const tags = Object.fromEntries(ARCHETYPES.map((tag) => [tag.id, 0]));
  let basePower = 0;
  for (const card of cards) {
    tags[card.tag] += 1;
    const grade = format === "sealed" ? 7 : Math.max(4, finite(state.bestGrades?.[card.id], 4));
    basePower += card.power + (grade - 4) * 0.12;
  }
  const bonuses = ARCHETYPES.map((tag) => {
    const count = tags[tag.id];
    const tier = count >= 9 ? 3 : count >= 6 ? 2 : count >= 3 ? 1 : 0;
    const multiplier = state.beat >= 5 ? [0, 0.08, 0.2, 0.45][tier] : 0;
    return { ...tag, count, tier, multiplier };
  });
  const synergy = bonuses.reduce((total, bonus) => total + bonus.multiplier, 0);
  return {
    size: cards.length,
    basePower,
    synergy,
    power: basePower * (1 + synergy),
    tags,
    bonuses,
  };
}

function makeDuelLog(analysis, opponentPower, win, sealed) {
  const leadTag = [...analysis.bonuses].sort((a, b) => b.count - a.count)[0];
  return [
    sealed ? "Restricted pool registered. Binder access denied." : "Twelve-card list locked at the judge desk.",
    `${leadTag.label} line commits ${leadTag.count} cards to the table.`,
    analysis.power >= opponentPower
      ? "Your curve takes control before the final exchange."
      : "The opposing list finds the cleaner final exchange.",
    win ? "MATCH WON. Prize product transferred sealed." : "MATCH LOST. No cards issued.",
  ];
}

export function resolveDuel(state, options = {}) {
  if (state.beat < 3 || state.duelDeck.length !== DECK_SIZE) {
    return { state, result: null, error: "DECK_INCOMPLETE" };
  }
  const rng = options.rng || Math.random;
  const analysis = getDeckAnalysis(state);
  const opponentPower = 51 + state.duelsWon * 3.5 + rng() * 9;
  const playerPower = analysis.power + rng() * 7;
  const win = playerPower >= opponentPower;
  const sealed = cloneStock(state.sealed);
  if (win) sealed[state.activeSet].loose += 3;
  const next = advanceBeat({
    ...state,
    sealed,
    duelsPlayed: state.duelsPlayed + 1,
    duelsWon: state.duelsWon + (win ? 1 : 0),
  });
  return {
    state: next,
    result: {
      format: "constructed",
      win,
      rewardPacks: win ? 3 : 0,
      playerPower,
      opponentPower,
      analysis,
      log: makeDuelLog(analysis, opponentPower, win, false),
    },
    error: null,
  };
}

export function startSealedRun(state, setId = state.activeSet, now = Date.now()) {
  if (state.beat < 4 || state.sealedRun || getProductCount(state, setId, "loose") < SEALED_ENTRY_PACKS) {
    return state;
  }
  const sealed = cloneStock(state.sealed);
  sealed[setId].loose -= SEALED_ENTRY_PACKS;
  return {
    ...state,
    sealed,
    sealedRun: {
      id: `sealed-${now}`,
      setId,
      remainingPacks: SEALED_ENTRY_PACKS,
      opened: 0,
      pool: {},
      deck: [],
      phase: "opening",
    },
  };
}

export function resolveSealedDuel(state, options = {}) {
  if (!state.sealedRun || state.sealedRun.phase !== "deck" || state.sealedRun.deck.length !== DECK_SIZE) {
    return { state, result: null, error: "SEALED_DECK_INCOMPLETE" };
  }
  const rng = options.rng || Math.random;
  const analysis = getDeckAnalysis(state, state.sealedRun.deck, "sealed");
  const opponentPower = 54 + state.sealedWins * 4 + rng() * 9;
  const playerPower = analysis.power + rng() * 8;
  const win = playerPower >= opponentPower;
  const run = state.sealedRun;
  const sealed = cloneStock(state.sealed);
  if (win) sealed[run.setId].loose += 4;
  const next = advanceBeat({
    ...state,
    sealed,
    sealedRuns: state.sealedRuns + 1,
    sealedWins: state.sealedWins + (win ? 1 : 0),
    sealedRun: null,
  });
  return {
    state: next,
    result: {
      format: "sealed",
      win,
      rewardPacks: win ? 4 : 0,
      playerPower,
      opponentPower,
      analysis,
      log: makeDuelLog(analysis, opponentPower, win, true),
    },
    error: null,
  };
}

export function abandonSealedRun(state) {
  if (!state.sealedRun) return state;
  return { ...state, sealedRun: null };
}

export function applyOfflineProgress(state, now = Date.now()) {
  const elapsedSeconds = Math.max(0, Math.min(8 * 60 * 60, (now - finite(state.lastSavedAt, now)) / 1000));
  if (elapsedSeconds < 30) return { state: { ...state, lastSavedAt: now }, report: null };
  const next = {
    ...addPassiveIncome(state, getPassiveIncomeRate(state) * elapsedSeconds),
    lastSavedAt: now,
  };
  const income = next.coins - Math.floor(Math.max(0, finite(state.coins)));
  return {
    state: next,
    report: income > 0 ? { seconds: elapsedSeconds, coins: income, ordered: 0 } : null,
  };
}

export function serializeState(state, now = Date.now()) {
  return JSON.stringify({ ...state, lastSavedAt: now });
}

// Orders two saves by progress: Rewrite count first (a prestige reset is
// always newer than the run it replaced), then the run metrics. Returns
// 1 when `a` is strictly ahead, -1 when strictly behind, 0 otherwise.
export function compareSaveProgress(a, b) {
  const rewritesA = Math.max(0, finite(a?.prestige?.rewrites));
  const rewritesB = Math.max(0, finite(b?.prestige?.rewrites));
  if (rewritesA !== rewritesB) return rewritesA > rewritesB ? 1 : -1;
  const metrics = ["packsOpened", "cardsPulled", "lifetimeCoins"];
  const metricsA = metrics.map((key) => Math.max(0, finite(a?.[key])));
  const metricsB = metrics.map((key) => Math.max(0, finite(b?.[key])));
  const aheadA = metricsA.every((value, index) => value >= metricsB[index])
    && metricsA.some((value, index) => value > metricsB[index]);
  if (aheadA) return 1;
  const aheadB = metricsB.every((value, index) => value >= metricsA[index])
    && metricsB.some((value, index) => value > metricsA[index]);
  if (aheadB) return -1;
  return 0;
}

// True when the save already in storage should be preserved instead of being
// overwritten by this session's state — e.g. the portal's cloud sync applied
// a further-progressed (or freshly Rewritten) save moments before an unload
// handler fired. Corrupt or foreign storage values are never preserved.
export function storedSaveDominates(storedValue, state) {
  if (typeof storedValue !== "string" || !storedValue) return false;
  try {
    const stored = JSON.parse(storedValue);
    if (!stored || typeof stored !== "object" || !Number.isInteger(stored.version)) return false;
    return compareSaveProgress(stored, state) > 0;
  } catch {
    return false;
  }
}
