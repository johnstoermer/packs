import {
  ALL_CARDS,
  ARCHETYPES,
  LEGACY_CARD_MAP,
  LEGACY_SET_MAP,
  CLEAN_UPGRADES,
  FUSION_THRESHOLDS,
  PACK_PRODUCTS,
  PACK_TYPES,
  RARITIES,
  SETS,
  canonicalRarityId,
  getCard,
  getPackType,
  getSet,
} from "./gameData.js";
import {
  CASE_SIZE,
  DISCOVER_POOL,
  WATERMARK_TRIGGERS,
  getCardDef,
  getCaseSlots,
  getDisplayedEntries,
  getEngine,
  revealTriggerMatches,
  watermarkTotal,
} from "./engineCards.js";

export const SAVE_KEY = "packworks-save-v1";
export const ADMIN_SAVE_KEY = "packworks-admin-save-v1";
export const ADMIN_FLAG_KEY = "herm-admin-mode";
export const SAVE_VERSION = 11;
export const NAMELESS_CARD_ID = LEGACY_CARD_MAP["unwritten-12"] || "lastarchive-48";
export const INSCRIPTION_MULT_STEP = 0.25;
export const PACK_SIZE = 6;
export const MAX_PACK_CARDS = 72;
export const SEALED_ENTRY_PACKS = 6;
export const DECK_SIZE = 12;
export const FORGE_COST = 24;
export const MANUAL_RATE_CAP_MS = 1_450;
export const BASE_PASSIVE_RATE = 1;
// Consecutive all-duplicate packs of one set before the next pack is
// guaranteed to print that set's rarest missing card.
export const DRY_STREAK_PITY = 20;
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
  sealed[SETS[0].id].loose = 3;
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
    activeSet: SETS[0].id,
    unlockedSets: [SETS[0].id],
    displayed: [],
    prestige: { inscriptions: 0, rewrites: 0 },
    packsPurchased: 0,
    counters: {},
    lifetimeStats: { cards: 0, dups: 0, fusions: 0, mysteries: 0 },
    discoverOffer: null,
    discoverStack: {},
    triggerTallies: {},
    forgeMaterial: 0,
    pityLegendary: 0,
    lastManualAt: 0,
    standingOrder: {
      enabled: false,
      product: "loose",
      setId: SETS[0].id,
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
      quickOpen: false,
      haptics: true,
    },
    createdAt: now,
    lastSavedAt: now,
  };
}

// Admin testing sandbox: a separate save with everything unlocked and
// effectively infinite cash. It lives under ADMIN_SAVE_KEY and never touches
// the real save or cloud sync. The guarantees are re-applied on every load,
// so an older stored sandbox heals itself instead of staying stale.
export function applyAdminGuarantees(state) {
  const collection = { ...state.collection };
  const bestRarities = { ...state.bestRarities };
  for (const card of ALL_CARDS) {
    if (!(collection[card.id] > 0)) {
      collection[card.id] = 1;
      bestRarities[card.id] = card.rarity;
    }
  }
  const sealed = cloneStock(state.sealed);
  for (const set of SETS) sealed[set.id].loose = Math.max(sealed[set.id].loose, 50);
  return advanceBeat({
    ...state,
    adminMode: true,
    coins: Math.max(1e15, Math.floor(Math.max(0, finite(state.coins)))),
    lifetimeCoins: Math.max(1e15, Math.floor(Math.max(0, finite(state.lifetimeCoins)))),
    beat: 5,
    packsOpened: Math.max(200, Math.floor(finite(state.packsOpened))),
    cardsPulled: Math.max(ALL_CARDS.length, Math.floor(finite(state.cardsPulled))),
    collection,
    bestRarities,
    sealed,
    unlockedSets: SETS.map((set) => set.id),
  });
}

export function createAdminState(now = Date.now()) {
  return applyAdminGuarantees(createInitialState(now));
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

function sanitizeRarityPulls(raw) {
  const result = emptyRarityCount();
  for (const [rarity, count] of Object.entries(raw || {})) {
    const canonical = canonicalRarityId(rarity);
    result[canonical] += Math.max(0, Math.floor(finite(count)));
  }
  return result;
}

function estimateLegacyDuplicateBank(collection) {
  return Object.entries(collection).reduce((total, [id, count]) => {
    const extras = Math.max(0, count - 1);
    if (!extras) return total;
    const card = getCard(id);
    return total + extras * (card ? getCardValue(card) : RARITIES.common.sellValue);
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
    setId: SETS.some((set) => set.id === raw.setId) ? raw.setId : SETS[0].id,
    remainingPacks,
    pool,
    deck: sanitizeDeck(raw.deck, pool, Number.POSITIVE_INFINITY),
    phase,
    opened: Math.max(0, SEALED_ENTRY_PACKS - remainingPacks),
  };
}

// One-way migration of pre-print-line saves (twenty 12-card legacy sets)
// onto the five 48-card print lines. Card counts carry over 1:1 via
// LEGACY_CARD_MAP; set-scoped stock merges via LEGACY_SET_MAP.
function migrateLegacySave(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const touchesLegacy = Object.keys(raw.collection || {}).some((id) => LEGACY_CARD_MAP[id])
    || (Array.isArray(raw.unlockedSets) && raw.unlockedSets.some((id) => LEGACY_SET_MAP[id]))
    || (typeof raw.activeSet === "string" && LEGACY_SET_MAP[raw.activeSet]);
  if (!touchesLegacy) return raw;
  const add = (a, b) => (a || 0) + (Number(b) || 0);
  const top = (a, b) => Math.max(a || 0, Number(b) || 0);
  const mapCounts = (source, combine) => {
    const out = {};
    for (const [key, value] of Object.entries(source || {})) {
      const mapped = LEGACY_CARD_MAP[key] || key;
      out[mapped] = combine(out[mapped], value);
    }
    return out;
  };
  const mergeStock = (stock) => {
    if (!stock || typeof stock !== "object") return stock;
    const out = {};
    for (const [setId, counts] of Object.entries(stock)) {
      const mapped = LEGACY_SET_MAP[setId] || setId;
      const bucket = out[mapped] || (out[mapped] = {});
      for (const [product, count] of Object.entries(counts || {})) {
        bucket[product] = (bucket[product] || 0) + (Number(count) || 0);
      }
    }
    return out;
  };
  const next = { ...raw };
  next.collection = mapCounts(raw.collection, add);
  next.foils = mapCounts(raw.foils, add);
  next.misprints = mapCounts(raw.misprints, add);
  next.bestGrades = mapCounts(raw.bestGrades, top);
  delete next.bestRarities;
  if (Array.isArray(raw.displayed)) {
    next.displayed = raw.displayed.map((entry) => (entry && LEGACY_CARD_MAP[entry.id]
      ? { ...entry, id: LEGACY_CARD_MAP[entry.id] }
      : entry));
  }
  if (raw.counters && typeof raw.counters === "object") {
    const counters = {};
    for (const [key, value] of Object.entries(raw.counters)) {
      const match = key.match(/^(c|p|w:[^:]+):(.+)$/);
      if (match) {
        counters[`${match[1]}:${LEGACY_CARD_MAP[match[2]] || match[2]}`] = value;
      } else if (!key.startsWith("dry:")) {
        counters[key] = value;
      }
    }
    next.counters = counters;
  }
  if (typeof raw.activeSet === "string" && LEGACY_SET_MAP[raw.activeSet]) {
    next.activeSet = LEGACY_SET_MAP[raw.activeSet];
  }
  if (Array.isArray(raw.unlockedSets)) {
    next.unlockedSets = [...new Set(raw.unlockedSets.map((id) => LEGACY_SET_MAP[id] || id))];
  }
  next.sealed = mergeStock(raw.sealed);
  next.forged = mergeStock(raw.forged);
  if (raw.sealedRun && typeof raw.sealedRun === "object" && LEGACY_SET_MAP[raw.sealedRun.setId]) {
    next.sealedRun = { ...raw.sealedRun, setId: LEGACY_SET_MAP[raw.sealedRun.setId] };
  }
  return next;
}

export function hydrateState(raw, now = Date.now()) {
  const initial = createInitialState(now);
  if (!raw || typeof raw !== "object") return initial;
  raw = migrateLegacySave(raw);

  const collection = sanitizeCollection(raw.collection);
  const bestRarities = sanitizeBestRarities(raw.bestRarities, collection);
  const sealed = cloneStock(raw.sealed || initial.sealed);
  if (!raw.sealed && finite(raw.packsOpened) > 0) sealed[SETS[0].id].loose = Math.max(sealed[SETS[0].id].loose, 3);
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
  delete settings.reducedEffects;
  const activeSet = SETS.some((set) => set.id === raw.activeSet) ? raw.activeSet : SETS[0].id;
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
    rarityPulls: sanitizeRarityPulls(raw.rarityPulls),
    sealed,
    forged,
    activeSet,
    unlockedSets: Array.isArray(raw.unlockedSets) ? raw.unlockedSets.filter((id) => SETS.some((set) => set.id === id)) : [SETS[0].id],
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
  state.lifetimeStats = {
    cards: Math.max(0, Math.floor(finite(raw.lifetimeStats?.cards, finite(raw.cardsPulled)))),
    dups: Math.max(0, Math.floor(finite(raw.lifetimeStats?.dups))),
    fusions: Math.max(0, Math.floor(finite(raw.lifetimeStats?.fusions))),
    mysteries: Math.max(0, Math.floor(finite(raw.lifetimeStats?.mysteries))),
  };
  state.discoverOffer = null;
  state.discoverStack = Object.fromEntries(
    Object.entries(raw.discoverStack || {})
      .filter(([id, value]) => DISCOVER_POOL.some((option) => option.id === id) && finite(value) > 0)
      .map(([id, value]) => [id, Math.min(99, Math.floor(finite(value)))]),
  );
  state.triggerTallies = {};
  state.adminMode = false;
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

// A set's tier anchors every coin number it produces to its pack price, so
// the buy-open-sell loop keeps the same rhythm from Corner Stories to the
// endgame instead of stalling into idle walls.
function setTier(setId) {
  return Math.max(1, finite(getSet(setId)?.packCost, 10) / 10);
}

// A card's coin value: rarity ladder times its set's tier. Used for the
// duplicate bank and every "Nx that card's sell value" engine payoff.
export function getCardValue(card) {
  if (!card) return 0;
  return RARITIES[card.rarity].sellValue * setTier(card.setId);
}

export function getPassiveIncomeRate(state) {
  if (!state) return BASE_PASSIVE_RATE;
  const newest = Math.max(
    10,
    ...(Array.isArray(state.unlockedSets) ? state.unlockedSets : []).map((id) => finite(getSet(id)?.packCost, 10)),
  );
  const engine = getEngine(state);
  const discovered = Object.values(state.collection || {})
    .filter((count) => finite(count) > 0)
    .length;
  const collectionIncome = discovered * Math.max(0, engine.passivePerDiscovered);
  // The drawer fills a pack of your newest set roughly every minute idle;
  // active selling stays 10-50x faster.
  return (Math.max(BASE_PASSIVE_RATE, newest / 60) + collectionIncome) * getPrestigeMultiplier(state);
}

export function getCardSaleValue(state, cardId) {
  const card = getCard(cardId);
  if (!card) return 0;
  return getCardValue(card);
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
  if (!duplicateCount) return { state, events: [], mysteryCards: [], saleValue: 0, saleItems: [], salvages: 0 };
  const rng = options.rng || Math.random;
  const engine = getEngine(state);
  const saleValue = getDuplicateSaleValue(state);
  const weightedItems = Object.entries(state.collection || {}).flatMap(([cardId, count]) => {
    const card = getCard(cardId);
    return Array.from(
      { length: Math.max(0, Math.floor(finite(count)) - 1) },
      () => ({ cardId, weight: Math.max(1, getCardValue(card)) }),
    );
  });
  const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);
  let assignedValue = 0;
  const saleItems = weightedItems.map((item, index) => {
    const amount = index === weightedItems.length - 1
      ? Math.max(0, saleValue - assignedValue)
      : Math.max(1, Math.floor((saleValue * item.weight) / Math.max(1, totalWeight)));
    assignedValue += amount;
    return { cardId: item.cardId, amount };
  });
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
  let chance = 0;
  for (const record of engine.onDupSold) {
    tallyTrigger(ctx, record.id);
    ctx.events.push({ t: "trigger", cardId: record.id, slot: record.slot });
    if (record.def.salvageChance) chance += record.def.salvageChance;
    if (record.def.coinsFlat) {
      addEngineCoins(ctx, Math.min(1e15, record.def.coinsFlat * duplicateCount), record.id, 0);
    }
  }
  if (chance > 0) {
    const expected = (duplicateCount * chance) / 100;
    salvages = Math.min(6, Math.floor(expected) + (rng() < expected - Math.floor(expected) ? 1 : 0));
    if (salvages > 0) performSalvage(ctx, salvages, null, 0);
  }
  for (const record of engine.onSaleMade) {
    tallyTrigger(ctx, record.id);
    fireSupportPayoff(ctx, record, null, null, 0);
    relayCascade(ctx, record.slot, null, null, 0);
  }
  ctx.events.push({ t: "sold", count: duplicateCount, value: saleValue, items: saleItems });
  return {
    state: finishEngineContext(ctx),
    events: ctx.events,
    mysteryCards: ctx.mysteryDirect,
    saleValue,
    saleItems,
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
  for (const trigger of WATERMARK_TRIGGERS) {
    if (trigger === "coinsEarned" || trigger === "packsOpened") continue;
    counters[`w:${trigger}:${cardId}`] = watermarkTotal(working, trigger);
  }
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
  if (requirement.type === "collectFromSet") {
    const set = getSet(requirement.setId);
    const target = Math.min(set.cards.length, Math.max(1, Math.floor(finite(requirement.count, 1))));
    const current = Math.min(target, countFoundInSet(state, set.id));
    return { met: current >= target, current, target, label: `Find ${target} cards in ${set.name}` };
  }
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
  const qualified = state?.adminMode === true || requirements.every((requirement) => requirement.met);
  return {
    unlocked: set.id === SETS[0].id || qualified,
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
  const unlockedSets = new Set([SETS[0].id]);
  for (const set of SETS) {
    if (getSetUnlockStatus(state, set.id).qualified) {
      unlockedSets.add(set.id);
    }
  }
  const unlockedSetIds = SETS.filter((set) => unlockedSets.has(set.id)).map((set) => set.id);
  const activeSet = unlockedSetIds.includes(state.activeSet) ? state.activeSet : SETS[0].id;
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
    packsPurchased: product.packType ? priorPurchases + count : priorPurchases,
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
  if (!product?.bulk || !product.manualBonus) return state;
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
  return RARITY_IDS.filter((id) => RARITIES[id].introducedBeat <= beat && RARITIES[id].odds > 0);
}

function shiftRarity(rarity, steps = 0) {
  const current = Math.max(0, RARITY_IDS.indexOf(rarity));
  const topNormal = RARITY_IDS.indexOf("divine");
  return RARITY_IDS[Math.min(topNormal, current + Math.max(0, Math.floor(finite(steps))))];
}

function chooseRarity(state, rng, rarityShift = 0) {
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
    if (roll < weight) return shiftRarity(entry.id, rarityShift);
    roll -= weight;
  }
  return shiftRarity("common", rarityShift);
}

function rarityIdAtOrder(order) {
  const topNormal = RARITIES.divine.order;
  return RARITY_IDS.find((id) => RARITIES[id].order === Math.min(topNormal, order)) || "common";
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
    markStacks: 0,
    revealed: false,
    isNew: false,
    mimicOf: null,
    transmuted: false,
    fusedFrom: null,
    fromMystery: false,
    ...extra,
  };
}

function rollPackCard(state, set, rng, engine, usedIds, manual, rarityShift = 0) {
  const rolledRarity = engine?.commonOnlyPacks ? "common" : chooseRarity(state, rng, rarityShift);
  let card = chooseCard(set, rolledRarity, rng, usedIds, null);
  // New-card protection on the big hits: a Rare-or-better roll strongly
  // prefers a card of that rarity you don't own yet, so a set's last chase
  // isn't a lottery inside a lottery.
  if (RARITIES[rolledRarity].order >= RARITIES.rare.order && (state.collection?.[card.id] || 0) > 0 && rng() < 0.75) {
    const missing = set.cards.filter((candidate) => (
      candidate.rarity === card.rarity && !(state.collection?.[candidate.id] > 0) && !usedIds.has(candidate.id)
    ));
    if (missing.length) card = missing[Math.floor(rng() * missing.length) % missing.length];
  }
  if (engine && engine.dupBias > 0 && !(state.collection?.[card.id] > 0) && rng() < engine.dupBias / 100) {
    const owned = set.cards.filter((candidate) => (
      state.collection?.[candidate.id] > 0 && candidate.rarity === card.rarity
    ));
    if (owned.length) card = owned[Math.floor(rng() * owned.length) % owned.length];
  }
  usedIds.add(card.id);
  return makePull(state, card, rng, manual);
}

// Post-roll polish: signal-truth, foil, and grade dials apply to every card
// the engine creates, wherever it is born.
function polishPull(ctx, pull, manual) {
  if (ctx.engine.noFalseSignals > 0 && pull.falseSignal && ctx.rng() < ctx.engine.noFalseSignals / 100) {
    pull.falseSignal = false;
    pull.signalRarity = pull.rarity;
  }
  if (ctx.engine.foilChance > 0 && !pull.foil && ctx.rng() < ctx.engine.foilChance / 100) pull.foil = true;
  if (ctx.engine.gradeBias > 0 && manual && ctx.rng() < ctx.engine.gradeBias / 100) {
    pull.grade = Math.min(10, pull.grade + 1);
  }
  return pull;
}

// Catalyst spread count for one event: base chance, with overflow past 100%
// granting a guaranteed extra spread (capped at two per event).
function catalystSpreads(ctx) {
  if (ctx.engine.catalystChance <= 0) return 0;
  const effective = Math.max(0, ctx.engine.catalystChance);
  let spreads = Math.floor(effective / 100);
  if (ctx.rng() * 100 < effective % 100) spreads += 1;
  return Math.min(2, spreads);
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
      lifetimeStats: { cards: 0, dups: 0, fusions: 0, mysteries: 0, ...state.lifetimeStats },
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
    firing: new Set(),
    revealRestRequested: false,
    echoMarkedRequested: 0,
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
    if (ctx.engine.discoverPersist > 0 && ctx.rng() < ctx.engine.discoverPersist / 100) {
      next[optionId] = 1;
      ctx.events.push({ t: "discoverLinger", option: optionId });
    } else {
      delete next[optionId];
    }
    ctx.working.discoverStack = next;
  }
  return count;
}

// Payoffs on the "discovered" trigger fire whenever a Discover pick lands.
// Resolve them through the same attributed event pipeline as every other
// displayed-card trigger so the case can provide feedback for the activation.
function fireDiscovered(state, engine, rng) {
  const ctx = makeEngineContext(state, engine, rng);
  for (const record of engine.onDiscovered) {
    tallyTrigger(ctx, record.id);
    fireSupportPayoff(ctx, record, null, null, 0);
    relayCascade(ctx, record.slot, null, null, 0);
  }
  return { state: finishEngineContext(ctx), events: ctx.events };
}

function offerDiscover(ctx, sourceId) {
  const pool = DISCOVER_POOL.map((option) => option.id);
  if (ctx.engine.autopilotRule > 0) {
    const pick = pool[Math.floor(ctx.rng() * pool.length) % pool.length];
    const gain = 2 + (ctx.engine.discoverEnhance ? 1 : 0);
    ctx.working.discoverStack = {
      ...ctx.working.discoverStack,
      [pick]: Math.min(99, (ctx.working.discoverStack[pick] || 0) + gain),
    };
    ctx.events.push({ t: "discoverAuto", option: pick, gain, source: sourceId });
    for (const record of ctx.engine.onDiscovered) {
      tallyTrigger(ctx, record.id);
      fireSupportPayoff(ctx, record, null, ctx.injectCards, 2);
      relayCascade(ctx, record.slot, null, ctx.injectCards, 2);
    }
    return;
  }
  if (ctx.working.discoverOffer) return;
  const options = [];
  const bag = [...pool];
  const count = Math.min(pool.length, 3 + Math.max(0, ctx.engine.discoverOptions));
  while (options.length < count && bag.length) {
    options.push(bag.splice(Math.floor(ctx.rng() * bag.length) % bag.length, 1)[0]);
  }
  ctx.working.discoverOffer = options;
  ctx.events.push({ t: "discoverOffer", options, source: sourceId });
}

export function chooseDiscoverOptionDetailed(state, optionId, options = {}) {
  if (!state.discoverOffer || !state.discoverOffer.includes(optionId)) {
    return { state, events: [] };
  }
  const engine = getEngine(state);
  const gain = (engine.discoverEnhance ? 2 : 1) + Math.max(0, engine.discoverKeep - 1);
  const next = {
    ...state,
    discoverOffer: null,
    discoverStack: {
      ...state.discoverStack,
      [optionId]: Math.min(99, (state.discoverStack[optionId] || 0) + gain),
    },
  };
  return fireDiscovered(next, engine, options.rng || Math.random);
}

export function chooseDiscoverOption(state, optionId, options = {}) {
  return chooseDiscoverOptionDetailed(state, optionId, options).state;
}

export function dismissDiscoverOfferDetailed(state, options = {}) {
  if (!state.discoverOffer) return { state, events: [] };
  const engine = getEngine(state);
  const rng = options.rng || Math.random;
  if (engine.discoverConsolation > 0 && rng() < engine.discoverConsolation / 100) {
    const pick = state.discoverOffer[Math.floor(rng() * state.discoverOffer.length) % state.discoverOffer.length];
    const next = {
      ...state,
      discoverOffer: null,
      discoverStack: {
        ...state.discoverStack,
        [pick]: Math.min(99, (state.discoverStack[pick] || 0) + 1),
      },
    };
    return fireDiscovered(next, engine, rng);
  }
  return { state: { ...state, discoverOffer: null }, events: [] };
}

export function dismissDiscoverOffer(state, options = {}) {
  return dismissDiscoverOfferDetailed(state, options).state;
}

function rarestMissingCard(state) {
  let best = null;
  for (const setId of state.unlockedSets) {
    for (const card of getSet(setId).cards) {
      if ((state.collection?.[card.id] || 0) > 0) continue;
      if (!best || RARITIES[card.rarity].order > RARITIES[best.rarity].order) best = card;
    }
  }
  return best;
}

function mysteryExtras(ctx) {
  const marked = ctx.engine.mysteryMarked > 0 && ctx.rng() < ctx.engine.mysteryMarked / 100;
  return marked ? { fromMystery: true, marked: true, markStacks: 1 } : { fromMystery: true };
}

function rollMysteryCard(ctx) {
  const state = ctx.working;
  if (ctx.engine.mysteryPity > 0 && ctx.rng() < ctx.engine.mysteryPity / 100) {
    const missing = rarestMissingCard(state);
    if (missing) return makePull(state, missing, ctx.rng, true, mysteryExtras(ctx));
  }
  const futureChance = 0.005 * ctx.engine.mysteryFuture;
  const locked = SETS.filter((set) => !state.unlockedSets.includes(set.id));
  let set;
  if (locked.length && ctx.rng() < futureChance) {
    set = locked[Math.floor(ctx.rng() * locked.length) % locked.length];
  } else {
    const pool = state.unlockedSets;
    set = getSet(pool[Math.floor(ctx.rng() * pool.length) % pool.length]);
  }
  let rarity = ctx.engine.commonOnlyPacks ? "common" : chooseRarity(state, ctx.rng);
  if (ctx.engine.mysteryFloor > 0 && RARITIES[rarity].order < ctx.engine.mysteryFloor && ctx.rng() < 0.8) {
    rarity = RARITY_IDS.find((id) => RARITIES[id].order === ctx.engine.mysteryFloor) || rarity;
  }
  const card = chooseCard(set, rarity, ctx.rng, new Set(), null);
  return polishPull(ctx, makePull(state, card, ctx.rng, true, mysteryExtras(ctx)), true);
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
  state.lifetimeStats.cards += 1;
  if (!pull.isNew) state.lifetimeStats.dups += 1;
  if (pull.foil) state.foils[id] = (state.foils[id] || 0) + 1;
  state.bestGrades[id] = Math.max(finite(state.bestGrades[id]), pull.grade);
  if (pull.misprintDetected) state.misprints[id] = (state.misprints[id] || 0) + 1;
  if (!pull.isNew) {
    state.duplicateBank = Math.max(0, finite(state.duplicateBank)) + getCardValue(pull.card);
  }
}

function performSalvage(ctx, times, injectCards, depth) {
  const bonus = consumeDiscoverStack(ctx, "acceleration");
  let total = Math.min(ctx.salvageBudget, (times + bonus) * ctx.engine.salvagePacks);
  ctx.salvageBudget -= total;
  while (total > 0) {
    total -= 1;
    const size = Math.min(24, 4 + ctx.engine.mysterySize);
    const cards = [];
    for (let index = 0; index < size; index += 1) cards.push(rollMysteryCard(ctx));
    if (
      ctx.engine.mysteryNewGuarantee
      && !cards.some((pull) => !(ctx.working.collection[pull.card.id] > 0))
      && ctx.rng() < 0.75
    ) {
      const missing = rarestMissingCard(ctx.working);
      if (missing) cards[0] = makePull(ctx.working, missing, ctx.rng, true, mysteryExtras(ctx));
    }

    // A Mystery Pack is still a pack: it can Fracture, advances pack-open
    // counters, and fires every displayed "pack opened" support. Keep the
    // spill in this same reveal so staged dealing and the FINISH failsafe can
    // handle even very large chains without mounting every card at once.
    let fractured = 0;
    let fractureSet = getSet(cards[0]?.card?.setId || ctx.working.activeSet);
    while (
      fractured < ctx.engine.fractureDepth
      && ctx.engine.fractureChance > 0
      && ctx.rng() < ctx.engine.fractureChance / 100
    ) {
      fractured += 1;
      if (ctx.engine.fractureWild && ctx.working.unlockedSets.length > 1) {
        const pool = ctx.working.unlockedSets;
        fractureSet = getSet(pool[Math.floor(ctx.rng() * pool.length) % pool.length]);
      }
      const usedIds = new Set();
      const spillSize = Math.min(MAX_PACK_CARDS, PACK_SIZE + ctx.engine.packSize);
      for (let index = 0; index < spillSize; index += 1) {
        const spill = polishPull(
          ctx,
          rollPackCard(ctx.working, fractureSet, ctx.rng, ctx.engine, usedIds, true),
          true,
        );
        if (ctx.engine.fractureMarked > 0 && ctx.rng() < ctx.engine.fractureMarked / 100) {
          spill.marked = true;
          spill.markStacks = 1;
        }
        cards.push(spill);
      }
      ctx.events.push({
        t: "fracture",
        packs: fractured + 1,
        cardId: ctx.engine.kingSlots.fracture || null,
        source: "salvage",
      });
      for (const record of ctx.engine.onFractured) {
        tallyTrigger(ctx, record.id);
        fireSupportPayoff(ctx, record, null, cards, depth + 1);
        relayCascade(ctx, record.slot, null, cards, depth + 1);
      }
    }

    ctx.working.packsOpened += 1 + fractured;
    evaluatePackThresholds(ctx, depth + 1);
    const packFocus = cards.reduce((best, pull) => (
      !best || RARITIES[pull.rarity].order > RARITIES[best.rarity].order ? pull : best
    ), null);
    for (const record of ctx.engine.onPackOpened) {
      tallyTrigger(ctx, record.id);
      const def = fireSupportPayoff(ctx, record, packFocus, cards, depth + 1);
      if (def.markChance && ctx.rng() < def.markChance / 100) {
        assignMark(ctx, cards, ctx.engine.markBiasHigh);
      }
      relayCascade(ctx, record.slot, packFocus, cards, depth + 1);
    }

    ctx.events.push({ t: "mystery", count: cards.length, cardId: ctx.engine.kingSlots.salvage || null });
    ctx.working.lifetimeStats.mysteries += 1;
    if (injectCards) {
      for (const pull of cards) injectCards.push(pull);
    } else {
      for (const pull of cards) {
        applyRevealToCollection(ctx, pull);
        if (depth <= 2) {
          for (const record of ctx.engine.reveal) {
            if (!revealTriggerMatches(record.def, pull, null)) continue;
            tallyTrigger(ctx, record.id);
            fireSupportPayoff(ctx, record, pull, null, depth + 1);
          }
        }
      }
      ctx.mysteryDirect.push(...cards);
    }
    const rarest = cards.reduce((best, pull) => (
      !best || RARITIES[pull.rarity].order > RARITIES[best.rarity].order ? pull : best
    ), null);
    for (const record of ctx.engine.onMysteryOpened) {
      tallyTrigger(ctx, record.id);
      fireSupportPayoff(ctx, record, rarest, injectCards, depth + 1);
    }
    if (ctx.engine.salvageEcho > 0 && ctx.salvageBudget > 0 && ctx.rng() < ctx.engine.salvageEcho / 100) {
      total = Math.min(ctx.salvageBudget, total + 1);
      ctx.salvageBudget -= 1;
      ctx.events.push({ t: "salvageEcho" });
    }
  }
  if (depth <= 2) evaluateStatThresholds(ctx, depth + 1);
}

function addEngineCoins(ctx, amount, sourceId, depth) {
  const gain = Math.floor(Math.max(0, amount));
  if (gain <= 0) return;
  ctx.working.coins = Math.floor(Math.max(0, finite(ctx.working.coins))) + gain;
  ctx.working.lifetimeCoins = Math.floor(Math.max(0, finite(ctx.working.lifetimeCoins))) + gain;
  ctx.events.push({ t: "coins", amount: gain, source: sourceId });
  if (depth <= 2) evaluateCoinThresholds(ctx, depth + 1);
}

function watermarkKey(trigger, cardId) {
  if (trigger === "coinsEarned") return `c:${cardId}`;
  if (trigger === "packsOpened") return `p:${cardId}`;
  return `w:${trigger}:${cardId}`;
}

function effectiveEvery(ctx, every) {
  const discount = Math.min(60, Math.max(0, ctx.engine.thresholdDiscount));
  return Math.max(1, Math.round(every * (1 - discount / 100)));
}

function evaluateWatermarks(ctx, depth, triggers, maxFires) {
  for (const record of ctx.engine.thresholds) {
    if (!triggers.includes(record.def.on)) continue;
    const total = watermarkTotal(ctx.working, record.def.on);
    const key = watermarkKey(record.def.on, record.id);
    const step = effectiveEvery(ctx, record.def.every);
    const credited = Math.floor(finite(ctx.working.counters[key], total));
    let fires = Math.floor((total - credited) / step);
    if (fires <= 0) {
      ctx.working.counters[key] = credited;
      continue;
    }
    fires = Math.min(maxFires, fires);
    ctx.working.counters[key] = credited + fires * step;
    for (let index = 0; index < fires; index += 1) {
      tallyTrigger(ctx, record.id);
      fireSupportPayoff(ctx, record, null, ctx.injectCards, depth);
    }
  }
}

function evaluateCoinThresholds(ctx, depth) {
  evaluateWatermarks(ctx, depth, ["coinsEarned"], 4);
}

function evaluatePackThresholds(ctx, depth) {
  evaluateWatermarks(ctx, depth, ["packsOpened"], 3);
}

function evaluateStatThresholds(ctx, depth) {
  evaluateWatermarks(ctx, depth, ["dupsRevealed", "cardsRevealed", "fusionsDone", "mysteriesOpened"], 2);
}

function addCardsToOpenedPack(ctx, focusPull, injectCards, count, rarity = null) {
  if (!Array.isArray(injectCards) || !focusPull?.card || injectCards.length >= 48) return 0;
  const set = getSet(focusPull.card.setId);
  if (!set) return 0;
  const usedIds = new Set(injectCards.map((entry) => entry.card.id));
  let added = 0;
  for (let index = 0; index < Math.max(1, Math.floor(count)); index += 1) {
    if (injectCards.length >= 48) break;
    const next = rarity
      ? makePull(ctx.working, chooseCard(set, rarity, ctx.rng, usedIds, null), ctx.rng, true)
      : rollPackCard(ctx.working, set, ctx.rng, ctx.engine, usedIds, true);
    injectCards.push(polishPull(ctx, next, true));
    added += 1;
  }
  return added;
}

function revealRandomDuplicate(ctx, sourceId, injectCards, depth) {
  const owned = ALL_CARDS.filter((card) => finite(ctx.working.collection?.[card.id]) > 0);
  if (!owned.length) return;
  const card = owned[Math.floor(ctx.rng() * owned.length) % owned.length];
  const pull = polishPull(ctx, makePull(ctx.working, card, ctx.rng, true), true);
  applyRevealToCollection(ctx, pull);
  if (Array.isArray(injectCards) && injectCards.length < 48) injectCards.push(pull);
  else ctx.mysteryDirect.push(pull);
  ctx.events.push({ t: "duplicateReveal", cardId: card.id, source: sourceId });
  if (depth <= 1) {
    for (const candidate of ctx.engine.reveal) {
      if (!revealTriggerMatches(candidate.def, pull, null) || ctx.firing.has(candidate.id)) continue;
      tallyTrigger(ctx, candidate.id);
      fireSupportPayoff(ctx, candidate, pull, injectCards, depth + 1);
    }
  }
}

// Executes one trigger support's payoff. `pull` is the trigger's focus card
// when it has one (the revealed card, the fused result, a Mystery Pack's
// rarest card); null otherwise.
function fireSupportPayoff(ctx, record, pull, injectCards, depth) {
  const def = record.def;
  if (ctx.firing.has(record.id)) return def;
  ctx.firing.add(record.id);
  ctx.events.push({ t: "trigger", cardId: record.id, slot: record.slot });
  if (def.coins && pull) {
    if (!def.coinsChance || ctx.rng() < def.coinsChance / 100) {
      addEngineCoins(ctx, def.coins * getCardValue(pull.card), record.id, depth);
    }
  }
  if (def.coinsFlat) addEngineCoins(ctx, def.coinsFlat, record.id, depth);
  if (def.coinsPack) {
    addEngineCoins(ctx, def.coinsPack * getPackPrice(ctx.working, "loose", ctx.working.activeSet), record.id, depth);
  }
  if (def.coinsPerSet) {
    addEngineCoins(ctx, def.coinsPerSet * getCompletedSetIds(ctx.working).length, record.id, depth);
  }
  if (def.salvageChance && ctx.rng() < def.salvageChance / 100) {
    performSalvage(ctx, 1, injectCards, depth);
  }
  if (def.do === "salvage" && (!def.chance || ctx.rng() < def.chance / 100)) {
    performSalvage(ctx, 1, injectCards, depth);
  }
  if (def.do === "discover" && (!def.chance || ctx.rng() < def.chance / 100)) {
    offerDiscover(ctx, record.id);
  }
  if (def.do === "boon" && (!def.chance || ctx.rng() < def.chance / 100)) {
    ctx.working.discoverStack = {
      ...ctx.working.discoverStack,
      [def.boon]: Math.min(99, (ctx.working.discoverStack[def.boon] || 0) + 1),
    };
    ctx.events.push({ t: "boon", option: def.boon, source: record.id });
  }
  if (def.do === "packs" && (!def.chance || ctx.rng() < def.chance / 100)) {
    const sealed = cloneStock(ctx.working.sealed);
    sealed[ctx.working.activeSet].loose += Math.max(1, Math.floor(def.n || 1));
    ctx.working.sealed = sealed;
    ctx.events.push({ t: "packs", count: Math.max(1, Math.floor(def.n || 1)), source: record.id });
  }
  if (def.do === "randomPack" && (!def.chance || ctx.rng() < def.chance / 100)) {
    const set = SETS[Math.floor(ctx.rng() * SETS.length) % SETS.length];
    const sealed = cloneStock(ctx.working.sealed);
    sealed[set.id].loose += 1;
    ctx.working.sealed = sealed;
    ctx.events.push({ t: "packs", count: 1, setId: set.id, source: record.id });
  }
  if (def.do === "revealDuplicate" && (!def.chance || ctx.rng() < def.chance / 100)) {
    revealRandomDuplicate(ctx, record.id, injectCards, depth);
  }
  if (def.do === "fuseLift" && (!def.chance || ctx.rng() < def.chance / 100)) {
    ctx.working.counters = {
      ...ctx.working.counters,
      fuseLift: Math.min(6, Math.max(0, finite(ctx.working.counters.fuseLift)) + 1),
    };
    ctx.events.push({ t: "fuseLift", source: record.id });
  }
  if (def.do === "salvageScaling") {
    performSalvage(ctx, 1 + Math.floor(getCompletedSetIds(ctx.working).length / 4), injectCards, depth);
  }
  if (def.do === "triggerLeft" && depth < 4) {
    const left = ctx.engine.records.find((candidate) => candidate.slot === record.slot - 1);
    if (left && !ctx.firing.has(left.id)) {
      tallyTrigger(ctx, left.id);
      fireSupportPayoff(ctx, left, pull, injectCards, depth + 1);
      ctx.events.push({ t: "triggerLeft", from: record.slot, to: left.slot, cardId: left.id });
    }
  }
  if (def.do === "echoMarked") ctx.echoMarkedRequested += 1;
  if (def.do === "revealRest") ctx.revealRestRequested = true;
  if (
    def.addCards
    && (!def.chance || ctx.rng() < def.chance / 100)
  ) {
    const added = addCardsToOpenedPack(ctx, pull, injectCards, def.addCards, def.rarity);
    if (added > 0) ctx.events.push({ t: "addCards", count: added, source: record.id });
  }
  if (def.do === "triggerAll" && depth < 2) {
    const others = [
      ...ctx.engine.reveal,
      ...ctx.engine.onPackOpened,
      ...ctx.engine.onFusion,
      ...ctx.engine.onMysteryOpened,
    ].filter((candidate) => candidate.id !== record.id && candidate.def.do !== "triggerAll");
    for (const candidate of others) {
      if (ctx.firing.has(candidate.id)) continue;
      tallyTrigger(ctx, candidate.id);
      fireSupportPayoff(ctx, candidate, pull, injectCards, depth + 2);
    }
  }
  if (depth < 6) {
    const watcher = ctx.engine.onLeftTriggered.find((candidate) => candidate.slot === record.slot + 1);
    if (watcher && !ctx.firing.has(watcher.id)) {
      tallyTrigger(ctx, watcher.id);
      fireSupportPayoff(ctx, watcher, pull, injectCards, depth + 1);
      ctx.events.push({ t: "leftTriggered", from: record.slot, to: watcher.slot, cardId: watcher.id });
    }
  }
  ctx.firing.delete(record.id);
  return def;
}

function relayCascade(ctx, fromSlot, pull, injectCards, depth) {
  if (ctx.engine.relayRule <= 0) return;
  let jumps = Math.max(1, ctx.engine.relayDepth);
  for (let slot = fromSlot + 1; slot < ctx.engine.slots.length && jumps > 0; slot += 1) {
    const record = ctx.engine.records.find((candidate) => candidate.slot === slot);
    if (!record) continue; // Signatures and dials pass the spark along without firing.
    if (ctx.firing.has(record.id)) continue;
    tallyTrigger(ctx, record.id);
    fireSupportPayoff(ctx, record, pull, injectCards, depth);
    ctx.events.push({ t: "relay", from: slot - 1, to: slot, cardId: record.id });
    jumps -= 1;
  }
}

function assignMark(ctx, cards, biasHigh) {
  const candidates = cards
    .map((pull, index) => ({ pull, index }))
    .filter((entry) => (
      !entry.pull.revealed
      && (ctx.engine.markStacking || !entry.pull.marked)
    ));
  if (!candidates.length) return -1;
  let target;
  if (biasHigh > 0) {
    target = candidates.reduce((best, entry) => (
      RARITIES[entry.pull.card.rarity].order > RARITIES[best.pull.card.rarity].order ? entry : best
    ), candidates[0]);
  } else {
    target = candidates[Math.floor(ctx.rng() * candidates.length) % candidates.length];
  }
  target.pull.marked = true;
  target.pull.markStacks = Math.max(0, Math.floor(finite(target.pull.markStacks))) + 1;
  if (ctx.engine.markTruth > 0 && target.pull.falseSignal && ctx.rng() < ctx.engine.markTruth / 100) {
    target.pull.falseSignal = false;
    target.pull.signalRarity = target.pull.rarity;
  }
  ctx.events.push({
    t: "mark",
    index: target.index,
    stacks: target.pull.markStacks,
    cardId: ctx.engine.kingSlots.mark || null,
  });
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
  const packTypeId = PACK_TYPES.some((packType) => packType.id === source) ? source : "loose";
  if (getProductCount(state, setId, packTypeId) < 1) return { state, ok: false };
  const sealed = cloneStock(state.sealed);
  sealed[setId][packTypeId] -= 1;
  return { state: { ...state, sealed }, ok: true, tagBias: null };
}

function namelessIsReady(state, set) {
  return !(state.collection?.[NAMELESS_CARD_ID] > 0) && set.cards.every(
    (card) => card.id === NAMELESS_CARD_ID || state.collection?.[card.id] > 0,
  );
}

// Pack pipeline phase 1: generate the pack and resolve every pre-reveal
// effect (Fracture, Marks, Mimic, Catalyst spread). Cards are NOT added to
// the collection here — that happens per reveal.
export function openPack(state, options = {}) {
  const manual = options.manual !== false;
  const context = options.context === "sealed" ? "sealed" : "binder";
  const source = context === "sealed" ? "sealed" : String(options.source || "loose");
  const setId = context === "sealed" ? state.sealedRun?.setId : (options.setId || state.activeSet);
  const packType = getPackType(source);
  const openedAt = finite(options.now, Date.now());
  if (manual && !options.free && !state.adminMode && openedAt - finite(state.lastManualAt) < MANUAL_RATE_CAP_MS) {
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
  // Sealed runs are a pure pack lottery: swap in an inert engine so no
  // displayed card can touch them.
  if (context === "sealed") ctx.engine = getEngine({ ...consumed.state, displayed: [] });

  let packSize = (context === "sealed" ? PACK_SIZE : packType.cardCount) + (context === "sealed" ? 0 : ctx.engine.packSize);
  if (context !== "sealed") {
    if (ctx.engine.packSizeChance > 0 && rng() * 100 < ctx.engine.packSizeChance) packSize += 1;
    if (ctx.engine.packSizePerSets > 0) {
      packSize += Math.floor(getCompletedSetIds(ctx.working).length / ctx.engine.packSizePerSets);
    }
  }
  const polish = (pull) => (context === "sealed" ? pull : polishPull(ctx, pull, manual));
  const usedIds = new Set();
  const cards = [];
  for (let index = 0; index < Math.min(MAX_PACK_CARDS, packSize); index += 1) {
    cards.push(polish(rollPackCard(
      ctx.working,
      set,
      rng,
      context === "sealed" ? null : ctx.engine,
      usedIds,
      manual,
      context === "sealed" ? 0 : packType.rarityShift,
    )));
  }

  const guaranteeFoil = (start) => {
    if (context === "sealed" || !packType.guaranteedFoil) return;
    const slice = cards.slice(start);
    if (!slice.length || slice.some((pull) => pull.foil)) return;
    const at = start + (Math.floor(rng() * slice.length) % slice.length);
    cards[at].foil = true;
  };

  // Every pack carries at least one Uncommon-or-better from its set: when
  // the rolls come up all Common, one card is re-printed a grade up.
  const guaranteeUncommon = (start, fromSet) => {
    if (ctx.engine.commonOnlyPacks) return;
    if (!availableRarities(ctx.working.beat).includes("uncommon")) return;
    const floor = RARITIES.uncommon.order;
    const slice = cards.slice(start);
    if (!slice.length || slice.some((pull) => RARITIES[pull.rarity].order >= floor)) return;
    const at = start + (Math.floor(rng() * slice.length) % slice.length);
    const used = new Set(slice.map((pull) => pull.card.id));
    const previous = cards[at];
    cards[at] = polish(makePull(ctx.working, chooseCard(fromSet, "uncommon", rng, used, null), rng, manual));
    if (previous.marked) {
      cards[at].marked = true;
      cards[at].markStacks = Math.max(1, Math.floor(finite(previous.markStacks, 1)));
    }
  };
  guaranteeUncommon(0, set);

  // The dry-streak ledger: after DRY_STREAK_PITY consecutive packs of a set
  // with nothing new in them, the next pack prints that set's rarest missing
  // card. Engines beat this clock easily — it bounds a buildless run, it
  // never leads one.
  if (context !== "sealed" && !ctx.engine.commonOnlyPacks) {
    const dryKey = `dry:${set.id}`;
    const streak = Math.max(0, Math.floor(finite(ctx.working.counters?.[dryKey])));
    let hasNew = cards.some((pull) => !(ctx.working.collection?.[pull.card.id] > 0));
    if (!hasNew && streak + 1 >= DRY_STREAK_PITY) {
      const missing = set.cards
        .filter((card) => card.id !== NAMELESS_CARD_ID && !(ctx.working.collection?.[card.id] > 0))
        .sort((a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order)[0];
      if (missing) {
        const at = cards.findIndex((pull) => (ctx.working.collection?.[pull.card.id] || 0) > 0);
        const previous = cards[at >= 0 ? at : 0];
        cards[at >= 0 ? at : 0] = polish(makePull(ctx.working, missing, rng, manual));
        if (previous?.marked) {
          cards[at >= 0 ? at : 0].marked = true;
          cards[at >= 0 ? at : 0].markStacks = Math.max(1, Math.floor(finite(previous.markStacks, 1)));
        }
        hasNew = true;
      }
    }
    ctx.working.counters = { ...ctx.working.counters, [dryKey]: hasNew ? 0 : streak + 1 };
  }
  guaranteeFoil(0);

  let packsInReveal = 1;
  if (ctx.engine.fractureChance > 0) {
    let extra = 0;
    while (extra < ctx.engine.fractureDepth && rng() < ctx.engine.fractureChance / 100) {
      extra += 1;
      let spillSet = set;
      if (ctx.engine.fractureWild && ctx.working.unlockedSets.length > 1) {
        const pool = ctx.working.unlockedSets;
        spillSet = getSet(pool[Math.floor(rng() * pool.length) % pool.length]);
      }
      const moreUsed = new Set();
      const spillStart = cards.length;
      for (let index = 0; index < Math.min(MAX_PACK_CARDS, packSize); index += 1) {
        const spill = polish(rollPackCard(
          ctx.working,
          spillSet,
          rng,
          ctx.engine,
          moreUsed,
          manual,
          packType.rarityShift,
        ));
        if (ctx.engine.fractureMarked > 0 && rng() < ctx.engine.fractureMarked / 100) {
          spill.marked = true;
          spill.markStacks = 1;
          if (ctx.engine.markTruth > 0 && spill.falseSignal && rng() < ctx.engine.markTruth / 100) {
            spill.falseSignal = false;
            spill.signalRarity = spill.rarity;
          }
        }
        cards.push(spill);
      }
      guaranteeUncommon(spillStart, spillSet);
      guaranteeFoil(spillStart);
      ctx.events.push({ t: "fracture", packs: extra + 1, cardId: ctx.engine.kingSlots.fracture || null });
      for (const record of ctx.engine.onFractured) {
        tallyTrigger(ctx, record.id);
        fireSupportPayoff(ctx, record, null, cards, 0);
        relayCascade(ctx, record.slot, null, cards, 0);
      }
    }
    packsInReveal += extra;
  }

  if (ctx.engine.markEveryPack > 0 || ctx.engine.markExtraChance > 0) {
    let marks = ctx.engine.markEveryPack;
    if (ctx.engine.markExtraChance > 0) {
      marks += Math.floor(ctx.engine.markExtraChance / 100);
      if (rng() * 100 < ctx.engine.markExtraChance % 100) marks += 1;
    }
    if (marks > 0) marks += consumeDiscoverStack(ctx, "insight");
    for (let index = 0; index < Math.min(marks, cards.length); index += 1) {
      const marked = assignMark(ctx, cards, ctx.engine.markBiasHigh);
      if (marked >= 0) {
        const spreads = catalystSpreads(ctx);
        for (let spread = 0; spread < spreads; spread += 1) {
          assignMark(ctx, cards, 0);
          ctx.events.push({ t: "catalyst", property: "mark", cardId: ctx.engine.kingSlots.catalyst || null });
        }
      }
    }
  }

  if (ctx.engine.mimicPack > 0 && cards.length >= 2) {
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
        const perfect = ctx.engine.mimicPerfect > 0 && rng() < ctx.engine.mimicPerfect / 100
          ? { foil: sourceEntry.pull.foil, grade: sourceEntry.pull.grade }
          : {};
        cards[entry.index] = makePull(ctx.working, sourceEntry.pull.card, rng, manual, {
          marked: entry.pull.marked,
          markStacks: entry.pull.markStacks,
          mimicOf: sourceEntry.index,
          ...perfect,
        });
        ctx.events.push({ t: "mimic", from: sourceEntry.index, to: entry.index, cardId: ctx.engine.kingSlots.mimic || null });
      };
      applyMimic(pickIndex(targets));
      if (ctx.engine.mimicTwice > 0 && rng() < ctx.engine.mimicTwice / 100) {
        const remaining = targets.filter((entry) => !cards[entry.index].mimicOf);
        if (remaining.length) applyMimic(pickIndex(remaining));
      }
      const copySpreads = catalystSpreads(ctx);
      for (let spread = 0; spread < copySpreads; spread += 1) {
        const remaining = targets.filter((entry) => !cards[entry.index].mimicOf);
        if (!remaining.length) break;
        applyMimic(pickIndex(remaining));
        ctx.events.push({ t: "catalyst", property: "copy", cardId: ctx.engine.kingSlots.catalyst || null });
      }
    }
  }

  for (const record of ctx.engine.onPackOpened) {
    tallyTrigger(ctx, record.id);
    const def = fireSupportPayoff(ctx, record, null, cards, 0);
    if (def.markChance && rng() < def.markChance / 100) {
      assignMark(ctx, cards, ctx.engine.markBiasHigh);
    }
    relayCascade(ctx, record.slot, null, cards, 0);
  }

  // Nameless is not part of the random ladder. Once every other card has
  // been discovered, exactly one slot in the next binder pack becomes the
  // collection-ending card.
  if (context !== "sealed" && namelessIsReady(ctx.working, set) && cards.length) {
    const at = cards.length - 1;
    const previous = cards[at];
    const nameless = getCard(NAMELESS_CARD_ID);
    cards[at] = polish(makePull(ctx.working, nameless, rng, manual, {
      foil: Boolean(previous?.foil),
      marked: Boolean(previous?.marked),
      markStacks: Math.max(0, Math.floor(finite(previous?.markStacks))),
    }));
    ctx.events.push({ t: "namelessUnlocked", index: at, cardId: NAMELESS_CARD_ID });
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
      packType,
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
  const engine = getEngine(options.suppressEffects ? { ...state, displayed: [] } : state);
  const ctx = makeEngineContext(state, engine, rng);
  const nextCards = cards.map((entry) => ({ ...entry }));
  ctx.injectCards = nextCards;
  const revealed = nextCards[index];
  const wasComplete = getSet(revealed.card.setId).cards.every(
    (candidate) => finite(ctx.working.collection[candidate.id]) > 0,
  );
  applyRevealToCollection(ctx, revealed);
  ctx.events.push({ t: "reveal", index, cardId: revealed.card.id, rarity: revealed.rarity, isNew: revealed.isNew });
  ctx.working.counters = {
    ...ctx.working.counters,
    dupStreak: revealed.isNew ? 0 : Math.max(0, Math.floor(finite(ctx.working.counters.dupStreak))) + 1,
  };

  const matchExtra = { cards: nextCards, state: ctx.working };
  const matched = engine.reveal.filter((record) => revealTriggerMatches(record.def, revealed, matchExtra));
  let echoBonus = 0;
  let transmuteBonus = 0;
  const fireEchoSupports = (focusPull, focusIndex) => {
    for (const record of engine.onEcho) {
      tallyTrigger(ctx, record.id);
      fireSupportPayoff(ctx, record, focusPull, nextCards, 0);
      relayCascade(ctx, record.slot, focusPull, nextCards, 0);
    }
    if (engine.onEcho.length) {
      ctx.events.push({ t: "echoSupport", index: focusIndex, count: engine.onEcho.length });
    }
  };
  const fireMatched = () => {
    for (const record of matched) {
      tallyTrigger(ctx, record.id);
      const def = fireSupportPayoff(ctx, record, revealed, nextCards, 0);
      if (def.echoBoost) echoBonus += def.echoBoost;
      if (def.transmuteBoost) transmuteBonus += def.transmuteBoost;
      if (
        def.spreadMark && revealed.marked
        && rng() * 100 < def.spreadMark + ctx.engine.markSpread
      ) {
        assignMark(ctx, nextCards, ctx.engine.markBiasHigh);
        const spreads = catalystSpreads(ctx);
        for (let spread = 0; spread < spreads; spread += 1) {
          assignMark(ctx, nextCards, 0);
          ctx.events.push({ t: "catalyst", property: "mark", cardId: ctx.engine.kingSlots.catalyst || null });
        }
      }
      relayCascade(ctx, record.slot, revealed, nextCards, 0);
    }
  };
  fireMatched();

  // The mark-spread dial works on its own: with no spread support displayed,
  // a revealed Mark still has engine.markSpread% chance to jump onward.
  if (
    revealed.marked && engine.markSpread > 0
    && !matched.some((record) => record.def.spreadMark)
    && rng() * 100 < engine.markSpread
  ) {
    assignMark(ctx, nextCards, engine.markBiasHigh);
  }

  // Echo chance is a real dial: every source adds percentage points from a
  // base of zero, and anything past 100% becomes guaranteed additional
  // Echoes with the remainder rolled as chance.
  const order = RARITIES[revealed.rarity].order;
  let echoes = 0;
  let echoKingId = null;
  if (revealed.rarity === "common") {
    const effective = Math.max(
      0,
      engine.echoCommonChance
        + engine.echoAllBoost
        + echoBonus
        + (revealed.marked ? engine.echoMarkedChance : 0),
    );
    echoes = Math.floor(effective / 100) + (rng() * 100 < effective % 100 ? 1 : 0);
    echoKingId = engine.kingSlots.commonEcho || null;
  } else if (order >= RARITIES.rare.order) {
    const effective = Math.max(
      0,
      engine.echoRareChance
        + engine.echoAllBoost
        + echoBonus
        + (revealed.marked ? engine.echoMarkedChance : 0),
    );
    echoes = Math.floor(effective / 100) + (rng() * 100 < effective % 100 ? 1 : 0);
    echoKingId = engine.kingSlots.rareEcho || null;
  } else if (revealed.marked && engine.echoMarkedChance > 0) {
    const effective = Math.max(0, engine.echoMarkedChance + engine.echoAllBoost);
    echoes = Math.floor(effective / 100) + (rng() * 100 < effective % 100 ? 1 : 0);
  } else if (engine.echoAllBoost > 0) {
    const effective = Math.max(0, engine.echoAllBoost);
    echoes = Math.floor(effective / 100) + (rng() * 100 < effective % 100 ? 1 : 0);
  }
  if (echoes > 0) {
    echoes += consumeDiscoverStack(ctx, "resonance");
    if (engine.echoChain > 0 && rng() < engine.echoChain / 100) echoes += 1;
    for (let repeat = 0; repeat < Math.min(4, echoes); repeat += 1) {
      ctx.events.push({ t: "echo", index, cardId: echoKingId });
      fireMatched();
      fireEchoSupports(revealed, index);
    }
  }
  if (ctx.echoMarkedRequested > 0) {
    ctx.echoMarkedRequested = 0;
    const markedCards = nextCards
      .map((entry, position) => ({ entry, position }))
      .filter(({ entry }) => entry.revealed && entry.marked && !entry.fusedAway);
    for (const { entry, position } of markedCards) {
      ctx.events.push({ t: "echo", index: position, cardId: null, allMarked: true });
      const repeated = engine.reveal.filter((record) => (
        record.def.do !== "echoMarked"
        && revealTriggerMatches(record.def, entry, { cards: nextCards, state: ctx.working })
      ));
      for (const record of repeated) {
        tallyTrigger(ctx, record.id);
        fireSupportPayoff(ctx, record, entry, nextCards, 1);
        relayCascade(ctx, record.slot, entry, nextCards, 1);
      }
      fireEchoSupports(entry, position);
    }
  }
  if (matched.some((record) => record.def.on === "dupStreak")) {
    ctx.working.counters = { ...ctx.working.counters, dupStreak: 0 };
  }

  if (engine.transmuteChance + transmuteBonus > 0) {
    const effective = Math.max(0, engine.transmuteChance + transmuteBonus);
    const guaranteed = Math.floor(effective / 100);
    const fires = guaranteed > 0 || rng() * 100 < effective % 100;
    let targets = Math.max(1, guaranteed) + consumeDiscoverStack(ctx, "reflection");
    if (fires) {
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
          markStacks: target.entry.markStacks,
          transmuted: true,
        });
        ctx.events.push({ t: "transmute", index: target.position, rarity: newCard.rarity, cardId: engine.kingSlots.transmute || null });
        if (count === 0) {
          const spreads = catalystSpreads(ctx);
          if (spreads > 0) {
            targets += spreads;
            ctx.events.push({ t: "catalyst", property: "transmute", cardId: engine.kingSlots.catalyst || null });
          }
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

  // Encore: a finished pack may keep going with bonus cards from its set.
  if (
    engine.packEncore
    && nextCards.every((entry) => entry.fusedAway || entry.revealed)
    && !nextCards.some((entry) => entry.fromEncore)
    && rng() < engine.packEncore.chance / 100
  ) {
    const encoreSet = getSet(revealed.card.setId);
    const usedIds = new Set();
    for (let count = 0; count < engine.packEncore.n; count += 1) {
      const bonus = polishPull(ctx, rollPackCard(ctx.working, encoreSet, rng, engine, usedIds, manual), manual);
      bonus.fromEncore = true;
      nextCards.push(bonus);
    }
    ctx.events.push({ t: "encore", count: engine.packEncore.n });
  }

  evaluateStatThresholds(ctx, 0);
  let resultState = advanceBeat(finishEngineContext(ctx));
  let resultCards = nextCards;
  const resultEvents = [...ctx.events];
  if (ctx.revealRestRequested) {
    let guard = 0;
    while (guard < 48) {
      guard += 1;
      const nextIndex = resultCards.findIndex((entry) => !entry.revealed && !entry.fusedAway);
      if (nextIndex < 0) break;
      const step = revealPackCard(resultState, resultCards, nextIndex, { manual, rng });
      resultState = step.state;
      resultCards = step.cards;
      resultEvents.push(...step.events);
    }
    resultEvents.push({ t: "revealRest", source: matched.find((record) => record.def.do === "revealRest")?.id || null });
  }
  return { state: resultState, cards: resultCards, events: resultEvents };
}

// Pack pipeline phase 3: after every card is revealed, same-rarity pairs fuse
// upward and re-enter the board unrevealed. Call again once they are revealed;
// returns fused=false when the chain is exhausted.
export function resolveFusions(state, cards, options = {}) {
  const rng = options.rng || Math.random;
  const engine = getEngine(state);
  if (!engine.fusionRule && !engine.fusionSolo && !engine.fusionCross) {
    return { state, cards, events: [], fused: false };
  }
  if (cards.some((pull) => !pull.revealed)) return { state, cards, events: [], fused: false };

  const ctx = makeEngineContext(state, engine, rng);
  const nextCards = cards.map((entry) => ({ ...entry }));
  ctx.injectCards = nextCards;
  const catalystStack = consumeDiscoverStack(ctx, "catalyst");
  const liftStack = Math.max(0, Math.floor(finite(ctx.working.counters.fuseLift)));
  const passes = 1 + (engine.fusionTwice ? 1 : 0);
  let fused = false;
  let soloUsed = false;
  let crossUsed = false;

  const fuseInto = (rarity, left, right) => {
    const parentSet = getSet(nextCards[left].card.setId);
    const currentOrder = RARITIES[rarity].order;
    const climb = currentOrder + engine.fusionDepth + catalystStack + liftStack;
    const available = [...new Set(parentSet.cards.map((card) => RARITIES[card.rarity].order))]
      .filter((value) => value > currentOrder && value <= RARITIES.divine.order)
      .sort((a, b) => a - b);
    if (!available.length) return false;
    const targetOrder = available.filter((value) => value <= climb).pop() ?? available[0];
    const fusedCard = chooseCard(parentSet, rarityIdAtOrder(targetOrder), rng, new Set(), null);
    nextCards[left] = { ...nextCards[left], fusedAway: true };
    if (right !== null) nextCards[right] = { ...nextCards[right], fusedAway: true };
    const foiled = engine.fusionFoil > 0 && rng() < engine.fusionFoil / 100;
    const extras = { fusedFrom: rarity, ...(foiled ? { foil: true } : {}) };
    const result = makePull(ctx.working, fusedCard, rng, true, extras);
    nextCards.push(result);
    ctx.events.push({
      t: "fusion", from: rarity, to: fusedCard.rarity, left, right: right ?? left, index: nextCards.length - 1,
    });
    fused = true;
    ctx.working.lifetimeStats.fusions += 1;
    for (const record of engine.onFusion) {
      tallyTrigger(ctx, record.id);
      fireSupportPayoff(ctx, record, result, nextCards, 0);
      relayCascade(ctx, record.slot, result, nextCards, 0);
    }
    return true;
  };

  for (let pass = 0; pass < passes; pass += 1) {
    const byRarity = new Map();
    nextCards.forEach((pull, index) => {
      if (pull.revealed && !pull.fusedAway) {
        const list = byRarity.get(pull.rarity) || [];
        list.push(index);
        byRarity.set(pull.rarity, list);
      }
    });
    const leftovers = [];
    for (const [rarity, indices] of byRarity) {
      if (engine.fusionRule) {
        const pairs = Math.floor(indices.length / 2);
        for (let pair = 0; pair < pairs; pair += 1) {
          fuseInto(rarity, indices[pair * 2], indices[pair * 2 + 1]);
        }
        if (indices.length % 2 === 1) leftovers.push({ rarity, index: indices[indices.length - 1] });
      } else {
        // Without the pairing rule every card is an unpaired single; solo and
        // cross-rarity chance sources still get to work on them.
        for (const index of indices) leftovers.push({ rarity, index });
      }
    }
    // Cross-rarity pairing: two leftover singles one rarity step apart may
    // fuse as if both held the higher rarity.
    if (engine.fusionCross && !crossUsed && leftovers.length >= 2) {
      const sorted = [...leftovers].sort((a, b) => RARITIES[a.rarity].order - RARITIES[b.rarity].order);
      for (let index = 0; index < sorted.length - 1; index += 1) {
        const low = sorted[index];
        const high = sorted[index + 1];
        if (RARITIES[high.rarity].order - RARITIES[low.rarity].order === 1) {
          if (fuseInto(high.rarity, high.index, low.index)) {
            crossUsed = true;
            ctx.events.push({ t: "fusionCross", low: low.rarity, high: high.rarity });
          }
          break;
        }
      }
    }
    // Solo fusion: one unpaired card per resolution may climb alone.
    if (engine.fusionSolo > 0 && !soloUsed && leftovers.length && rng() < engine.fusionSolo / 100) {
      const pick = leftovers[Math.floor(rng() * leftovers.length) % leftovers.length];
      if (!nextCards[pick.index].fusedAway && fuseInto(pick.rarity, pick.index, null)) {
        soloUsed = true;
        ctx.events.push({ t: "fusionSolo", rarity: pick.rarity });
      }
    }
    if (!fused) break;
  }

  if (fused && liftStack > 0) {
    const counters = { ...ctx.working.counters };
    delete counters.fuseLift;
    ctx.working.counters = counters;
  }
  evaluateStatThresholds(ctx, 0);
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
