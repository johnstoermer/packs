import {
  ACHIEVEMENTS,
  ALL_CARDS,
  RARITIES,
  SETS,
  UPGRADE_DEFS,
  completedSets,
  getSet,
} from "./gameData.js";

export const SAVE_KEY = "packworks-save-v1";
export const SAVE_VERSION = 1;

const defaultRanks = () => Object.fromEntries(UPGRADE_DEFS.map((upgrade) => [upgrade.id, 0]));

export function createInitialState(now = Date.now()) {
  const base = {
    version: SAVE_VERSION,
    coins: 0,
    lifetimeCoins: 0,
    runCoins: 0,
    dust: 0,
    packsOpened: 0,
    runPacks: 0,
    manualPacks: 0,
    cardsPulled: 0,
    rarityPulls: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 },
    collection: {},
    foils: {},
    masteredSets: {},
    upgrades: defaultRanks(),
    unlockedSets: ["corner"],
    activeSet: "corner",
    pityRare: 0,
    pityLegendary: 0,
    streak: 0,
    bestStreak: 0,
    lastManualAt: 0,
    plates: 0,
    reprints: 0,
    achievements: [],
    contractSerial: 3,
    contracts: [],
    settings: {
      sound: true,
      reducedEffects: false,
      quickOpen: false,
    },
    createdAt: now,
    lastSavedAt: now,
  };
  base.contracts = createStarterContracts(base);
  return base;
}

function createStarterContracts(state) {
  return [
    makeContract("packs", state, 1),
    makeContract("earn", state, 2),
    makeContract("rarity", state, 3),
  ];
}

export function hydrateState(raw, now = Date.now()) {
  const initial = createInitialState(now);
  if (!raw || typeof raw !== "object") return initial;
  const collection = typeof raw.collection === "object" && raw.collection ? raw.collection : {};
  const foils = typeof raw.foils === "object" && raw.foils ? raw.foils : {};
  const unlocked = Array.isArray(raw.unlockedSets)
    ? raw.unlockedSets.filter((id) => SETS.some((set) => set.id === id))
    : ["corner"];
  if (!unlocked.includes("corner")) unlocked.unshift("corner");

  return {
    ...initial,
    ...raw,
    version: SAVE_VERSION,
    collection,
    foils,
    upgrades: { ...initial.upgrades, ...(raw.upgrades || {}) },
    rarityPulls: { ...initial.rarityPulls, ...(raw.rarityPulls || {}) },
    masteredSets: { ...(raw.masteredSets || {}) },
    settings: { ...initial.settings, ...(raw.settings || {}) },
    achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
    unlockedSets: unlocked,
    activeSet: unlocked.includes(raw.activeSet) ? raw.activeSet : "corner",
    contracts: Array.isArray(raw.contracts) && raw.contracts.length
      ? raw.contracts.slice(0, 3)
      : initial.contracts,
    lastSavedAt: Number(raw.lastSavedAt) || now,
  };
}

export function upgradeCost(state, upgradeId, quantity = 1) {
  const definition = UPGRADE_DEFS.find((upgrade) => upgrade.id === upgradeId);
  if (!definition) return Infinity;
  const rank = state.upgrades[upgradeId] || 0;
  const count = Math.max(0, Math.min(quantity, definition.max - rank));
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    total += Math.floor(definition.baseCost * definition.growth ** (rank + i));
  }
  return total;
}

export function maxAffordableUpgrade(state, upgradeId) {
  const definition = UPGRADE_DEFS.find((upgrade) => upgrade.id === upgradeId);
  if (!definition) return 0;
  const rank = state.upgrades[upgradeId] || 0;
  let total = 0;
  let count = 0;
  for (let i = rank; i < definition.max; i += 1) {
    const nextCost = Math.floor(definition.baseCost * definition.growth ** i);
    if (total + nextCost > state.coins) break;
    total += nextCost;
    count += 1;
  }
  return count;
}

export function buyUpgrade(state, upgradeId, quantity = 1) {
  const definition = UPGRADE_DEFS.find((upgrade) => upgrade.id === upgradeId);
  if (!definition || state.packsOpened < definition.unlockAt) return state;
  const rank = state.upgrades[upgradeId] || 0;
  const count = Math.max(0, Math.min(quantity, definition.max - rank));
  if (!count) return state;
  const cost = upgradeCost(state, upgradeId, count);
  if (state.coins < cost) return state;
  return {
    ...state,
    coins: state.coins - cost,
    upgrades: { ...state.upgrades, [upgradeId]: rank + count },
  };
}

export function unlockSet(state, setId) {
  const set = getSet(setId);
  const priorSet = SETS[SETS.findIndex((candidate) => candidate.id === set.id) - 1];
  if (
    state.unlockedSets.includes(set.id)
    || state.coins < set.unlockCost
    || (priorSet && !state.masteredSets[priorSet.id] && !state.unlockedSets.includes(priorSet.id))
  ) {
    return state;
  }
  return {
    ...state,
    coins: state.coins - set.unlockCost,
    unlockedSets: [...state.unlockedSets, set.id],
    activeSet: set.id,
  };
}

export function selectSet(state, setId) {
  if (!state.unlockedSets.includes(setId)) return state;
  return { ...state, activeSet: setId };
}

export function getDerived(state) {
  const ranks = state.upgrades;
  const masteryCount = completedSets(state);
  const plateMultiplier = 1 + state.plates * 0.15;
  const masteryMultiplier = 1 + masteryCount * 0.25;
  const valueMultiplier = (1 + ranks.scanner * 0.22) * plateMultiplier * masteryMultiplier;
  const autoRate = ((ranks.sorter || 0) * 0.1 + (ranks.crew || 0) * 0.55) * (1 + state.plates * 0.035);
  const discoveredPower = ALL_CARDS.reduce((sum, card) => {
    if (!state.collection[card.id]) return sum;
    const set = getSet(card.setId);
    return sum + set.baseValue * RARITIES[card.rarity].value;
  }, 0);
  const passiveRate = discoveredPower * (ranks.case || 0) * 0.0025 * plateMultiplier;
  const activeStreak = Date.now() - state.lastManualAt <= 7000 ? state.streak : 0;
  const streakMultiplier = 1 + Math.min(activeStreak, 25) * 0.045;
  const manualMultiplier = (1 + ranks.fingers * 0.38) * streakMultiplier;
  const luck = Math.min(2.2, (ranks.lights || 0) * 0.07 + state.plates * 0.01);
  const duplicateMultiplier = 1 + (ranks.sleeves || 0) * 0.4;
  const bonusCardChance = Math.min(0.65, (ranks.press || 0) * 0.04);
  return {
    autoRate,
    passiveRate,
    valueMultiplier,
    manualMultiplier,
    luck,
    duplicateMultiplier,
    bonusCardChance,
    streakMultiplier,
    masteryCount,
    discoveredCount: Object.keys(state.collection).filter((id) => state.collection[id] > 0).length,
  };
}

function chooseRarity(rng, luck = 0, minimum = "common") {
  const minimumOrder = RARITIES[minimum].order;
  const weights = [
    ["legendary", 0.0035 * (1 + luck * 0.65)],
    ["epic", 0.017 * (1 + luck * 0.8)],
    ["rare", 0.082 * (1 + luck)],
    ["uncommon", 0.245 * (1 + luck * 0.35)],
  ];
  const allowed = weights.filter(([id]) => RARITIES[id].order >= minimumOrder);
  let roll = rng();
  for (const [id, weight] of allowed) {
    if (roll < weight) return id;
    roll -= weight;
  }
  return minimumOrder > 0 ? minimum : "common";
}

function selectCard(set, rarity, rng, usedIds) {
  const pool = set.cards.filter((card) => card.rarity === rarity);
  const unused = pool.filter((card) => !usedIds.has(card.id));
  const candidates = unused.length ? unused : pool;
  return candidates[Math.floor(rng() * candidates.length) % candidates.length];
}

export function rollPack(state, options = {}) {
  const rng = options.rng || Math.random;
  const manual = options.manual !== false;
  const now = options.now || Date.now();
  const nextStreak = manual
    ? (now - state.lastManualAt <= 7000 ? Math.min(25, state.streak + 1) : 1)
    : state.streak;
  const streakAdjustedState = manual
    ? {
        ...state,
        streak: nextStreak,
        bestStreak: Math.max(state.bestStreak, nextStreak),
        lastManualAt: now,
      }
    : state;
  const derived = getDerived(streakAdjustedState);
  const set = getSet(streakAdjustedState.activeSet);
  const cardCount = 4 + (rng() < derived.bonusCardChance ? 1 : 0);
  const usedIds = new Set();
  const cards = [];
  let hasUncommon = false;
  let hasRare = false;
  let hasLegendary = false;

  for (let index = 0; index < cardCount; index += 1) {
    let rarity;
    if (streakAdjustedState.pityLegendary >= 69 && index === cardCount - 1) {
      rarity = "legendary";
    } else if (streakAdjustedState.pityRare >= 6 && index === cardCount - 1 && !hasRare) {
      rarity = chooseRarity(rng, derived.luck, "rare");
    } else if (index === cardCount - 1 && !hasUncommon) {
      rarity = chooseRarity(rng, derived.luck, "uncommon");
    } else {
      rarity = chooseRarity(rng, derived.luck);
    }
    const card = selectCard(set, rarity, rng, usedIds);
    usedIds.add(card.id);
    hasUncommon ||= RARITIES[rarity].order >= RARITIES.uncommon.order;
    hasRare ||= RARITIES[rarity].order >= RARITIES.rare.order;
    hasLegendary ||= rarity === "legendary";
    const foilChance = Math.min(0.12, 0.018 + derived.luck * 0.012 + streakAdjustedState.plates * 0.001);
    const foil = rng() < foilChance;
    const count = streakAdjustedState.collection[card.id] || 0;
    const isNew = count === 0;
    const manualMultiplier = manual ? derived.manualMultiplier : 1;
    const value = Math.max(
      1,
      Math.floor(set.baseValue * RARITIES[rarity].value * derived.valueMultiplier * manualMultiplier * (foil ? 4 : 1)),
    );
    const dust = isNew
      ? 0
      : Math.max(1, Math.floor(RARITIES[rarity].dust * derived.duplicateMultiplier * (foil ? 2 : 1)));
    cards.push({ card, rarity, foil, isNew, value, dust });
  }

  const collection = { ...streakAdjustedState.collection };
  const foils = { ...streakAdjustedState.foils };
  const rarityPulls = { ...streakAdjustedState.rarityPulls };
  let totalValue = 0;
  let totalDust = 0;
  for (const pull of cards) {
    collection[pull.card.id] = (collection[pull.card.id] || 0) + 1;
    if (pull.foil) foils[pull.card.id] = (foils[pull.card.id] || 0) + 1;
    rarityPulls[pull.rarity] = (rarityPulls[pull.rarity] || 0) + 1;
    totalValue += pull.value;
    totalDust += pull.dust;
  }

  const masteredSets = { ...streakAdjustedState.masteredSets };
  const newlyMastered = !masteredSets[set.id] && set.cards.every((card) => collection[card.id]);
  let masteryAward = 0;
  if (newlyMastered) {
    masteredSets[set.id] = true;
    masteryAward = Math.floor(set.baseValue * 250);
    totalValue += masteryAward;
  }

  let nextState = {
    ...streakAdjustedState,
    coins: streakAdjustedState.coins + totalValue,
    lifetimeCoins: streakAdjustedState.lifetimeCoins + totalValue,
    runCoins: streakAdjustedState.runCoins + totalValue,
    dust: streakAdjustedState.dust + totalDust,
    packsOpened: streakAdjustedState.packsOpened + 1,
    runPacks: streakAdjustedState.runPacks + 1,
    manualPacks: streakAdjustedState.manualPacks + (manual ? 1 : 0),
    cardsPulled: streakAdjustedState.cardsPulled + cards.length,
    rarityPulls,
    collection,
    foils,
    masteredSets,
    pityRare: hasRare ? 0 : streakAdjustedState.pityRare + 1,
    pityLegendary: hasLegendary ? 0 : streakAdjustedState.pityLegendary + 1,
  };
  const achievementResult = evaluateAchievements(nextState);
  nextState = achievementResult.state;

  return {
    state: nextState,
    result: {
      set,
      cards,
      totalValue,
      totalDust,
      manual,
      newlyMastered,
      masteryAward,
      achievements: achievementResult.newAchievements,
    },
  };
}

export function addPassiveIncome(state, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return state;
  return {
    ...state,
    coins: state.coins + amount,
    lifetimeCoins: state.lifetimeCoins + amount,
    runCoins: state.runCoins + amount,
  };
}

function evaluateAchievements(state) {
  const known = new Set(state.achievements);
  const newAchievements = ACHIEVEMENTS.filter((achievement) => !known.has(achievement.id) && achievement.test(state));
  if (!newAchievements.length) return { state, newAchievements: [] };
  const reward = newAchievements.length * 75 * Math.max(1, completedSets(state) + 1);
  return {
    state: {
      ...state,
      coins: state.coins + reward,
      lifetimeCoins: state.lifetimeCoins + reward,
      runCoins: state.runCoins + reward,
      achievements: [...state.achievements, ...newAchievements.map((achievement) => achievement.id)],
    },
    newAchievements,
  };
}

export function getContractProgress(contract, state) {
  if (contract.kind === "packs") return Math.max(0, state.packsOpened - contract.start);
  if (contract.kind === "earn") return Math.max(0, state.lifetimeCoins - contract.start);
  if (contract.kind === "rarity") return Math.max(0, (state.rarityPulls[contract.rarity] || 0) - contract.start);
  return 0;
}

function makeContract(kind, state, serial) {
  const scale = Math.max(1, Math.floor(Math.log10(Math.max(10, state.lifetimeCoins + 10))));
  if (kind === "packs") {
    const target = 8 + scale * 4;
    return {
      id: `packs-${serial}`,
      kind,
      title: "Break the Seal",
      detail: `Open ${target} packs`,
      target,
      start: state.packsOpened,
      reward: Math.max(120, Math.floor(getSet(state.activeSet).baseValue * target * 2.2)),
    };
  }
  if (kind === "earn") {
    const target = Math.max(600, Math.floor((state.coins + 300) * (1.5 + scale * 0.2)));
    return {
      id: `earn-${serial}`,
      kind,
      title: "Daily Ledger",
      detail: `Earn ${target.toLocaleString("en-US")} cash`,
      target,
      start: state.lifetimeCoins,
      reward: Math.max(180, Math.floor(target * 0.24)),
    };
  }
  const rarity = state.packsOpened > 90 ? "epic" : "rare";
  const target = rarity === "epic" ? 2 : 3 + Math.floor(scale / 2);
  return {
    id: `rarity-${serial}`,
    kind: "rarity",
    rarity,
    title: rarity === "epic" ? "Purple Order" : "Blue Order",
    detail: `Pull ${target} ${rarity} cards`,
    target,
    start: state.rarityPulls[rarity] || 0,
    reward: Math.max(300, Math.floor(getSet(state.activeSet).baseValue * target * (rarity === "epic" ? 60 : 16))),
  };
}

export function claimContract(state, contractId) {
  const index = state.contracts.findIndex((contract) => contract.id === contractId);
  if (index < 0) return { state, claimed: null };
  const contract = state.contracts[index];
  if (getContractProgress(contract, state) < contract.target) return { state, claimed: null };
  const serial = state.contractSerial + 1;
  const kinds = ["packs", "earn", "rarity"];
  const nextContract = makeContract(kinds[serial % kinds.length], state, serial);
  const contracts = [...state.contracts];
  contracts[index] = nextContract;
  return {
    state: {
      ...state,
      coins: state.coins + contract.reward,
      lifetimeCoins: state.lifetimeCoins + contract.reward,
      runCoins: state.runCoins + contract.reward,
      contractSerial: serial,
      contracts,
    },
    claimed: contract,
  };
}

export function getReprintGain(state) {
  if (state.runCoins < 250_000) return 0;
  return Math.max(1, Math.floor((state.runCoins / 250_000) ** 0.42));
}

export function performReprint(state, now = Date.now()) {
  const gain = getReprintGain(state);
  if (!gain) return state;
  const base = createInitialState(now);
  const reset = {
    ...state,
    coins: 0,
    runCoins: 0,
    runPacks: 0,
    dust: state.dust,
    upgrades: defaultRanks(),
    unlockedSets: ["corner"],
    activeSet: "corner",
    pityRare: 0,
    pityLegendary: 0,
    streak: 0,
    lastManualAt: 0,
    plates: state.plates + gain,
    reprints: state.reprints + 1,
    contracts: createStarterContracts({ ...base, ...state, coins: 0, runCoins: 0, activeSet: "corner" }),
    contractSerial: state.contractSerial + 3,
    lastSavedAt: now,
  };
  return evaluateAchievements(reset).state;
}

export function applyOfflineProgress(state, now = Date.now()) {
  const elapsedSeconds = Math.max(0, Math.min(8 * 60 * 60, (now - state.lastSavedAt) / 1000));
  if (elapsedSeconds < 30) return { state: { ...state, lastSavedAt: now }, report: null };
  const derived = getDerived(state);
  const set = getSet(state.activeSet);
  const expectedRarityValue =
    0.63 * RARITIES.common.value
    + 0.245 * RARITIES.uncommon.value
    + 0.082 * RARITIES.rare.value
    + 0.017 * RARITIES.epic.value
    + 0.0035 * RARITIES.legendary.value;
  const expectedPack = set.baseValue * expectedRarityValue * 4 * derived.valueMultiplier;
  const autoPacks = Math.floor(derived.autoRate * elapsedSeconds);
  const autoCoins = autoPacks * expectedPack;
  const passiveCoins = derived.passiveRate * elapsedSeconds;
  const earned = Math.floor(autoCoins + passiveCoins);
  if (earned <= 0) return { state: { ...state, lastSavedAt: now }, report: null };
  return {
    state: {
      ...state,
      coins: state.coins + earned,
      lifetimeCoins: state.lifetimeCoins + earned,
      runCoins: state.runCoins + earned,
      packsOpened: state.packsOpened + autoPacks,
      runPacks: state.runPacks + autoPacks,
      cardsPulled: state.cardsPulled + autoPacks * 4,
      lastSavedAt: now,
    },
    report: {
      seconds: elapsedSeconds,
      packs: autoPacks,
      coins: earned,
    },
  };
}

export function serializeState(state, now = Date.now()) {
  return JSON.stringify({ ...state, lastSavedAt: now });
}
