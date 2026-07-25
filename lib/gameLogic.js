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
  EFFECT_CAPS,
  getCardEffect,
  getCaseSlots,
  getDisplayedEntries,
  getDisplayModifiers,
} from "./displayEffects.js";

export const SAVE_KEY = "packworks-save-v1";
export const SAVE_VERSION = 7;
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
    godPackQueued: false,
    prestige: { inscriptions: 0, rewrites: 0 },
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
      if (!getCardEffect(entry.id) || (collection[entry.id] || 0) <= 0) return false;
      displayedSeen.add(entry.id);
      return true;
    })
    .slice(0, CASE_SIZE)
    .map((entry) => ({ id: entry.id, at: finite(entry.at, now) }));
  state.godPackQueued = !!raw.godPackQueued;
  state.prestige = {
    inscriptions: Math.max(0, Math.floor(finite(raw.prestige?.inscriptions))),
    rewrites: Math.max(0, Math.floor(finite(raw.prestige?.rewrites))),
  };
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

export function getPassiveIncomeRate(state, now = Date.now()) {
  if (!state) return BASE_PASSIVE_RATE;
  const mods = getDisplayModifiers(state, now);
  const inscriptions = Math.max(0, finite(state.prestige?.inscriptions));
  const displayIncome = mods.income + mods.inscriptionIncome * inscriptions;
  return (BASE_PASSIVE_RATE + displayIncome) * getPrestigeMultiplier(state);
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
  const displayMultiplier = 1 + getDisplayModifiers(state).dupValue / 100;
  const rawValue = getRawDuplicateValue(state) * dealerMultiplier * displayMultiplier * getPrestigeMultiplier(state);
  return getDuplicateCount(state) > 0 ? Math.max(1, Math.ceil(rawValue)) : 0;
}

export function sellDuplicates(state) {
  const duplicateCount = getDuplicateCount(state);
  if (!duplicateCount) return state;
  const saleValue = getDuplicateSaleValue(state);
  const collection = Object.fromEntries(
    Object.entries(state.collection || {})
      .filter(([, count]) => finite(count) > 0)
      .map(([id]) => [id, 1]),
  );
  return {
    ...state,
    coins: Math.floor(Math.max(0, finite(state.coins))) + saleValue,
    lifetimeCoins: Math.floor(Math.max(0, finite(state.lifetimeCoins))) + saleValue,
    collection,
    duplicateBank: 0,
  };
}

export function displayCard(state, cardId, now = Date.now()) {
  if (!getCardEffect(cardId) || (state.collection?.[cardId] || 0) <= 0) return state;
  const entries = getDisplayedEntries(state);
  if (entries.some((entry) => entry.id === cardId)) return state;
  if (entries.length >= getCaseSlots(state).slots) return state;
  return { ...state, displayed: [...entries, { id: cardId, at: now }] };
}

export function undisplayCard(state, cardId) {
  const entries = getDisplayedEntries(state);
  if (!entries.some((entry) => entry.id === cardId)) return state;
  return { ...state, displayed: entries.filter((entry) => entry.id !== cardId) };
}

export function canRewrite(state) {
  return (state.collection?.[NAMELESS_CARD_ID] || 0) > 0;
}

export function getInscriptionsEarned(state, now = Date.now()) {
  if (!canRewrite(state)) return 0;
  const completed = getCompletedSetIds(state).length;
  const base = completed + 5;
  const gain = getDisplayModifiers(state, now).inscriptionGain;
  return Math.max(1, Math.round(base * (1 + gain / 100)));
}

export function rewriteState(state, now = Date.now()) {
  if (!canRewrite(state)) return state;
  const mods = getDisplayModifiers(state, now);
  const earned = getInscriptionsEarned(state, now);
  const fresh = createInitialState(now);
  const keptCoins = Math.floor(Math.max(0, finite(state.coins)) * (mods.keepCoins / 100));
  fresh.settings = { ...state.settings };
  fresh.createdAt = finite(state.createdAt, now);
  fresh.prestige = {
    inscriptions: Math.max(0, finite(state.prestige?.inscriptions)) + earned,
    rewrites: Math.max(0, finite(state.prestige?.rewrites)) + 1,
  };
  fresh.sealed.corner.loose += Math.max(0, Math.floor(mods.headStart));
  fresh.coins = keptCoins;
  fresh.lifetimeCoins = keptCoins;
  return advanceBeat(fresh);
}

export function getPackPrice(state, productId = "loose", setId = state.activeSet) {
  const product = PACK_PRODUCTS.find((candidate) => candidate.id === productId);
  if (!product) return Number.POSITIVE_INFINITY;
  const set = getSet(setId);
  const setPriceScale = Math.max(0.01, finite(set.packCost, 10) / 10);
  const supplierDiscount = Math.min(0.3, Math.max(0, finite(state.upgrades?.supplier)) * 0.025);
  const mods = getDisplayModifiers(state);
  const displayDiscount = (mods.packDiscount + (mods.setPackDiscount[setId] || 0)) / 100;
  const totalDiscount = Math.min(0.7, supplierDiscount + displayDiscount);
  return Math.max(1, Math.floor(product.costFactor * setPriceScale * (1 - totalDiscount)));
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
    displayModifiers: getDisplayModifiers(state),
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
  const cost = getPackPrice(state, productId, setId) * count;
  if (state.coins + 1e-8 < cost) return state;
  const sealed = cloneStock(state.sealed);
  sealed[setId][productId] += count;
  return {
    ...state,
    coins: Math.floor(Math.max(0, finite(state.coins))) - cost,
    sealed,
    activeSet: setId,
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
  const interest = getDisplayModifiers(state).interest;
  const interestPerSecond = interest > 0
    ? (Math.max(0, finite(state.coins)) * interest) / 100 / 60
    : 0;
  return addPassiveIncome(state, (getPassiveIncomeRate(state) + interestPerSecond) * elapsed);
}

function availableRarities(beat) {
  return RARITY_IDS.filter((id) => RARITIES[id].introducedBeat <= beat);
}

function chooseRarity(state, rng, premiumBoost = 0) {
  const available = availableRarities(state.beat).sort((a, b) => RARITIES[b].order - RARITIES[a].order);
  const boost = (1 + Math.max(0, finite(state.upgrades?.lamp)) * 0.05) * (1 + premiumBoost / 100);
  const weights = available
    .filter((id) => id !== "common")
    .map((id) => ({ id, weight: RARITIES[id].odds * boost }));
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  const scale = total > EFFECT_CAPS.premiumShare ? EFFECT_CAPS.premiumShare / total : 1;
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

function raiseRarityToOrder(rarityId, minOrder) {
  return RARITIES[rarityId].order >= minOrder ? rarityId : rarityIdAtOrder(minOrder);
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

function rollPulls(state, options) {
  const rng = options.rng || Math.random;
  const manual = options.manual !== false;
  const set = getSet(options.setId || state.activeSet);
  const tagBias = options.tagBias || null;
  const mods = options.mods || getDisplayModifiers(state);
  const godPack = !!options.godPack;
  const usedIds = new Set();
  const cards = [];

  const setOrders = [...new Set(set.cards.map((card) => RARITIES[card.rarity].order))].sort((a, b) => b - a);
  const chaseOrder = setOrders[0];
  const godFloorOrder = setOrders[Math.min(2, setOrders.length - 1)];
  const packSize = PACK_SIZE + (mods.extraCard > 0 && rng() < mods.extraCard / 100 ? 1 : 0);
  const godChaseIndex = godPack ? Math.floor(rng() * packSize) % packSize : -1;
  const pityDue = mods.pityEvery > 0 && ((state.packsOpened + 1) % Math.max(1, Math.round(mods.pityEvery)) === 0);

  for (let index = 0; index < packSize; index += 1) {
    let pullSet = set;
    if (!godPack && mods.crossSet > 0 && state.unlockedSets.length > 1 && rng() < mods.crossSet / 100) {
      const others = state.unlockedSets.filter((id) => id !== set.id);
      pullSet = getSet(others[Math.floor(rng() * others.length) % others.length]);
    }
    let rolledRarity = chooseRarity(state, rng, mods.rarityWeight);
    if (godPack) {
      rolledRarity = index === godChaseIndex
        ? rarityIdAtOrder(chaseOrder)
        : raiseRarityToOrder(rolledRarity, godFloorOrder);
    } else if (pityDue && index === 0) {
      rolledRarity = raiseRarityToOrder(rolledRarity, Math.min(RARITIES.rare.order, chaseOrder));
    }
    let card = chooseCard(pullSet, rolledRarity, rng, usedIds, tagBias);
    if (
      mods.dupReroll > 0
      && (state.collection?.[card.id] || 0) > 0
      && rng() < mods.dupReroll / 100
    ) {
      const unowned = pullSet.cards.filter(
        (candidate) => !(state.collection?.[candidate.id] > 0) && !usedIds.has(candidate.id),
      );
      if (unowned.length) card = unowned[Math.floor(rng() * unowned.length) % unowned.length];
    }
    const rarity = card.rarity;
    usedIds.add(card.id);
    const signal = signalRarity(rarity, state, rng);
    const misprint = rng() < 0.0075;
    const foil = rng() < 0.018;
    cards.push({
      card,
      rarity,
      foil,
      grade: gradeCard(rng, manual),
      misprint,
      misprintDetected: manual && misprint,
      dormantMisprint: !manual && misprint,
      signalRarity: signal.rarity,
      falseSignal: signal.falsePositive,
      isNew: !state.collection?.[card.id],
      filedAction: "binder",
      fusionBefore: getFusionLevel(state.collection?.[card.id] || 0),
      fusionAfter: 0,
    });
  }
  return { set, cards, manual, tagBias };
}

function matchingRule(state, pull, count) {
  if (state.beat < 4) return null;
  return state.filingRules.find((rule) => (
    rule.enabled !== false
    && rule.action === "shred"
    && (rule.rarity === "any" || rule.rarity === pull.rarity)
    && count >= finite(rule.threshold, 32)
  )) || null;
}

function applyPulls(state, pulls, context, mods = null) {
  const collection = { ...state.collection };
  const bestRarities = { ...(state.bestRarities || {}) };
  const foils = { ...state.foils };
  const bestGrades = { ...state.bestGrades };
  const misprints = { ...state.misprints };
  const dormantMisprints = { ...state.dormantMisprints };
  const rarityPulls = { ...state.rarityPulls };
  let forgeMaterial = state.forgeMaterial + 1;
  let duplicateBank = Math.max(0, finite(state.duplicateBank));
  let duplicateValueDelta = 0;
  let duplicatesAdded = 0;

  for (const pull of pulls) {
    const id = pull.card.id;
    const priorCount = collection[id] || 0;
    const priorRarity = pull.card.rarity;
    pull.rarityBefore = priorRarity;
    const rule = context === "sealed" ? null : matchingRule(state, pull, priorCount);
    if (rule) {
      pull.filedAction = "shred";
      forgeMaterial += RARITIES[pull.rarity].forgeYield;
      pull.fusionAfter = getFusionLevel(priorCount);
      pull.rarityAfter = priorRarity;
    } else {
      if (priorCount > 0) {
        const setBonus = 1 + (mods?.setDupValue?.[pull.card.setId] || 0) / 100;
        const saleValue = RARITIES[pull.card.rarity].sellValue * setBonus;
        duplicateBank += saleValue;
        duplicateValueDelta += saleValue;
        duplicatesAdded += 1;
      }
      collection[id] = priorCount + 1;
      bestRarities[id] = pull.card.rarity;
      pull.rarityAfter = pull.card.rarity;
      pull.fusionAfter = getFusionLevel(collection[id]);
      if (pull.foil) foils[id] = (foils[id] || 0) + 1;
      bestGrades[id] = Math.max(finite(bestGrades[id]), pull.grade);
      if (pull.misprintDetected) misprints[id] = (misprints[id] || 0) + 1;
      if (pull.dormantMisprint) dormantMisprints[id] = (dormantMisprints[id] || 0) + 1;
    }
    rarityPulls[pull.rarity] = (rarityPulls[pull.rarity] || 0) + 1;
  }

  return {
    state: {
      ...state,
      collection,
      bestRarities,
      duplicateBank,
      foils,
      bestGrades,
      misprints,
      dormantMisprints,
      rarityPulls,
      forgeMaterial,
    },
    duplicateValueDelta,
    duplicatesAdded,
  };
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

  const mods = getDisplayModifiers(state, openedAt);
  const isGodPack = !!state.godPackQueued && context !== "sealed";
  let working = consumed.state;
  if (isGodPack) working = { ...working, godPackQueued: false };
  const rolled = rollPulls(working, {
    ...options,
    manual,
    setId,
    tagBias: consumed.tagBias,
    mods,
    godPack: isGodPack,
  });
  const applied = applyPulls(working, rolled.cards, context, mods);
  working = applied.state;

  const rng = options.rng || Math.random;
  let freePackGranted = false;
  let godPackQueued = false;
  if (context !== "sealed") {
    if (mods.freePack > 0 && rng() < mods.freePack / 100) {
      const sealed = cloneStock(working.sealed);
      sealed[setId].loose += 1;
      working = { ...working, sealed };
      freePackGranted = true;
    }
    if (!isGodPack && mods.godPack > 0 && rng() < mods.godPack / 100) {
      working = { ...working, godPackQueued: true };
      godPackQueued = true;
    }
  }
  let sealedRun = working.sealedRun;
  if (context === "sealed" && sealedRun) {
    const pool = { ...sealedRun.pool };
    for (const pull of rolled.cards) pool[pull.card.id] = (pool[pull.card.id] || 0) + 1;
    const remainingPacks = Math.max(0, sealedRun.remainingPacks - 1);
    sealedRun = {
      ...sealedRun,
      pool,
      remainingPacks,
      opened: sealedRun.opened + 1,
      phase: remainingPacks > 0 ? "opening" : "deck",
    };
  }

  working = advanceBeat({
    ...working,
    packsOpened: working.packsOpened + 1,
    manualPacks: working.manualPacks + (manual ? 1 : 0),
    cardsPulled: working.cardsPulled + rolled.cards.length,
    lastManualAt: manual ? openedAt : working.lastManualAt,
    sealedRun,
  });

  const fusionEvents = rolled.cards.filter((pull) => pull.fusionAfter > pull.fusionBefore);
  return {
    state: working,
    result: {
      ...rolled,
      source,
      context,
      isGodPack,
      freePackGranted,
      godPackQueued,
      duplicateValueDelta: applied.duplicateValueDelta,
      duplicatesAdded: applied.duplicatesAdded,
      fusionEvents,
      detectedMisprints: rolled.cards.filter((pull) => pull.misprintDetected),
      falseSignals: rolled.cards.filter((pull) => pull.falseSignal).length,
    },
    error: null,
  };
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
  const offlineMultiplier = 1 + getDisplayModifiers(state, now).offline / 100;
  const next = {
    ...addPassiveIncome(state, getPassiveIncomeRate(state, now) * offlineMultiplier * elapsedSeconds),
    lastSavedAt: now,
  };
  const income = next.coins - Math.floor(Math.max(0, finite(state.coins)));
  return {
    state: next,
    report: income > 0
      ? { seconds: elapsedSeconds, coins: income, ordered: 0 }
      : null,
  };
}

export function serializeState(state, now = Date.now()) {
  return JSON.stringify({ ...state, lastSavedAt: now });
}
