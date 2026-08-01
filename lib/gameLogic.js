// PACKWORKS game logic — state lifecycle, the display case, and the
// pack-opening action queue.
//
// The engine's one structural rule: nothing resolves simultaneously. Every
// player input and every card effect becomes an action on the opening's
// queue, and the queue is processed strictly one action at a time, in the
// order the actions were added. Card effects only run while a pack is open;
// when the player leaves an opening, the remaining queue is simply cleared.
// There is no passive income, no offline progress, and no timer-driven
// gameplay of any kind.

import {
  ALL_CARDS,
  CORE_SET,
  RARITIES,
  RARITY_IDS,
  canonicalRarityId,
  getCard,
  rarityIdAtOrder,
} from "./gameData.js";
import {
  CASE_SIZE,
  getCaseSlots,
  getDisplayedEntries,
  getEngine,
} from "./engineCards.js";

export const SAVE_KEY = "packworks-save-v2";
export const ADMIN_SAVE_KEY = "packworks-admin-save-v2";
export const ADMIN_FLAG_KEY = "herm-admin-mode";
export const SAVE_VERSION = 12;
export const PACK_SIZE = 6;
export const PACK_COST = CORE_SET.packCost;
export const STARTING_PACKS = 3;
// Hard ceiling on how large one opening can grow through effects.
export const MAX_PACK_CARDS = 72;
// Hard ceiling on queued actions; effects that would push past it are dropped.
export const MAX_QUEUE_LENGTH = 200;

const emptyRarityCount = () => Object.fromEntries(RARITY_IDS.map((id) => [id, 0]));

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function wholeAtLeast(value, floor = 0) {
  return Math.max(floor, Math.floor(finite(value, floor)));
}

// ---------------------------------------------------------------------------
// State lifecycle

export function createInitialState(now = Date.now()) {
  return {
    version: SAVE_VERSION,
    cash: 0,
    scrap: 0,
    packs: STARTING_PACKS,
    packsOpened: 0,
    cardsPulled: 0,
    lifetimeCash: 0,
    lifetimeScrap: 0,
    collection: {},
    foils: {},
    rarityPulls: emptyRarityCount(),
    displayed: [],
    stats: { salvages: 0, fusions: 0, rerolls: 0 },
    triggerTallies: {},
    settings: { sound: true, haptics: true },
    createdAt: now,
    lastSavedAt: now,
  };
}

export function applyAdminGuarantees(state) {
  const collection = { ...state.collection };
  for (const card of ALL_CARDS) {
    if (!(collection[card.id] > 0)) collection[card.id] = 1;
  }
  return {
    ...state,
    adminMode: true,
    cash: Math.max(1_000_000, wholeAtLeast(state.cash)),
    scrap: Math.max(500, wholeAtLeast(state.scrap)),
    packs: Math.max(100, wholeAtLeast(state.packs)),
    packsOpened: Math.max(30, wholeAtLeast(state.packsOpened)),
    collection,
  };
}

export function createAdminState(now = Date.now()) {
  return applyAdminGuarantees(createInitialState(now));
}

function sanitizeCardCounts(raw) {
  const result = {};
  for (const [id, count] of Object.entries(raw || {})) {
    if (!getCard(id)) continue;
    const whole = wholeAtLeast(count);
    if (whole > 0) result[id] = whole;
  }
  return result;
}

export function hydrateState(raw, now = Date.now()) {
  const initial = createInitialState(now);
  // Saves from before the queue-engine redesign describe a different game;
  // they restart fresh rather than half-migrating.
  if (!raw || typeof raw !== "object" || wholeAtLeast(raw.version) < SAVE_VERSION) {
    return initial;
  }
  const collection = sanitizeCardCounts(raw.collection);
  const rarityPulls = emptyRarityCount();
  for (const [rarity, count] of Object.entries(raw.rarityPulls || {})) {
    rarityPulls[canonicalRarityId(rarity)] += wholeAtLeast(count);
  }
  const displayed = [];
  const seen = new Set();
  for (const entry of Array.isArray(raw.displayed) ? raw.displayed : []) {
    const id = entry && typeof entry === "object" ? entry.id : entry;
    if (!id || seen.has(id) || !getCard(id) || !(collection[id] > 0)) continue;
    seen.add(id);
    displayed.push({ id });
    if (displayed.length >= CASE_SIZE) break;
  }
  return {
    ...initial,
    version: SAVE_VERSION,
    cash: wholeAtLeast(raw.cash),
    scrap: wholeAtLeast(raw.scrap),
    packs: wholeAtLeast(raw.packs),
    packsOpened: wholeAtLeast(raw.packsOpened),
    cardsPulled: wholeAtLeast(raw.cardsPulled),
    lifetimeCash: Math.max(wholeAtLeast(raw.lifetimeCash), wholeAtLeast(raw.cash)),
    lifetimeScrap: Math.max(wholeAtLeast(raw.lifetimeScrap), wholeAtLeast(raw.scrap)),
    collection,
    foils: sanitizeCardCounts(raw.foils),
    rarityPulls,
    displayed,
    stats: {
      salvages: wholeAtLeast(raw.stats?.salvages),
      fusions: wholeAtLeast(raw.stats?.fusions),
      rerolls: wholeAtLeast(raw.stats?.rerolls),
    },
    triggerTallies: Object.fromEntries(
      Object.entries(raw.triggerTallies || {})
        .filter(([id]) => getCard(id))
        .map(([id, count]) => [id, wholeAtLeast(count)]),
    ),
    settings: { ...initial.settings, ...(raw.settings || {}) },
    createdAt: wholeAtLeast(raw.createdAt, now),
    lastSavedAt: now,
  };
}

export function serializeState(state, now = Date.now()) {
  return JSON.stringify({ ...state, lastSavedAt: now });
}

export function compareSaveProgress(a, b) {
  const metrics = ["packsOpened", "cardsPulled", "lifetimeCash"];
  const metricsA = metrics.map((key) => wholeAtLeast(a?.[key]));
  const metricsB = metrics.map((key) => wholeAtLeast(b?.[key]));
  const aheadA = metricsA.every((value, index) => value >= metricsB[index])
    && metricsA.some((value, index) => value > metricsB[index]);
  if (aheadA) return 1;
  const aheadB = metricsB.every((value, index) => value >= metricsA[index])
    && metricsB.some((value, index) => value > metricsA[index]);
  if (aheadB) return -1;
  return 0;
}

// True when the save already in storage should be preserved instead of being
// overwritten — e.g. another same-origin tab is further along. Saves from the
// pre-redesign version never dominate.
export function storedSaveDominates(storedValue, state) {
  if (typeof storedValue !== "string" || !storedValue) return false;
  try {
    const stored = JSON.parse(storedValue);
    if (!stored || typeof stored !== "object" || !Number.isInteger(stored.version)) return false;
    if (stored.version < SAVE_VERSION) return false;
    return compareSaveProgress(stored, state) > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Shop and display case

export function getPackPrice() {
  return PACK_COST;
}

export function buyPack(state) {
  if (state.cash < PACK_COST) return state;
  return { ...state, cash: state.cash - PACK_COST, packs: state.packs + 1 };
}

export function displayCard(state, cardId) {
  if (!getCard(cardId)) return state;
  if (!((state.collection || {})[cardId] > 0)) return state;
  const entries = getDisplayedEntries(state);
  if (entries.some((entry) => entry.id === cardId)) return state;
  if (entries.length >= getCaseSlots(state).slots) return state;
  return { ...state, displayed: [...entries, { id: cardId }] };
}

export function undisplayCard(state, cardId) {
  const entries = getDisplayedEntries(state);
  const next = entries.filter((entry) => entry.id !== cardId);
  if (next.length === entries.length) return state;
  return { ...state, displayed: next };
}

export function reorderDisplayed(state, fromIndex, toIndex) {
  const entries = getDisplayedEntries(state);
  if (
    fromIndex === toIndex
    || fromIndex < 0 || fromIndex >= entries.length
    || toIndex < 0 || toIndex >= entries.length
  ) return state;
  const next = [...entries];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return { ...state, displayed: next };
}

export function getDerived(state) {
  const caseInfo = getCaseSlots(state);
  return {
    displayedEntries: getDisplayedEntries(state),
    caseSlots: caseInfo.slots,
    caseMilestones: caseInfo.milestones,
    engine: getEngine(state),
  };
}

// ---------------------------------------------------------------------------
// Card rolling

const RARITY_POOLS = Object.fromEntries(
  RARITY_IDS.map((id) => [id, ALL_CARDS.filter((card) => card.rarity === id)]),
);

function rollRarity(rng, { minOrder = 0 } = {}) {
  const eligible = RARITY_IDS.filter((id) => RARITIES[id].order >= minOrder);
  const total = eligible.reduce((sum, id) => sum + RARITIES[id].odds, 0);
  let roll = rng() * total;
  for (const id of eligible) {
    roll -= RARITIES[id].odds;
    if (roll <= 0) return id;
  }
  return eligible[eligible.length - 1];
}

function rollCardOfRarity(rarity, rng) {
  const pool = RARITY_POOLS[rarity];
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

function makePull(engine, rng, { minOrder = 0, rarity = null, foil = null, extra = null } = {}) {
  const rolledRarity = rarity || rollRarity(rng, { minOrder });
  const card = rollCardOfRarity(rolledRarity, rng);
  return {
    card,
    rarity: rolledRarity,
    foil: foil === null ? rng() < engine.foilChance : foil,
    revealed: false,
    salvaged: false,
    fusedAway: false,
    isNew: false,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// The opening context
//
// Mutations during an opening funnel through a context that clones the hot
// state fields once, collects events, and owns the action queue. The context
// is torn back into { state, session } when the step completes.

function makeContext(state, session, rng) {
  return {
    working: {
      ...state,
      collection: { ...state.collection },
      foils: { ...state.foils },
      rarityPulls: { ...state.rarityPulls },
      stats: { ...state.stats },
      triggerTallies: { ...state.triggerTallies },
    },
    engine: getEngine(state),
    cards: [...session.cards],
    queue: [...session.queue],
    // Actions spawned while resolving the current action. They cut to the
    // FRONT of the queue (keeping their own order), so everything a reveal
    // sets off resolves before the next queued reveal.
    spawned: [],
    revealsDone: session.revealsDone,
    rng,
    events: [],
  };
}

function finishContext(ctx, session) {
  return {
    state: ctx.working,
    session: {
      ...session,
      cards: ctx.cards,
      queue: [...ctx.spawned, ...ctx.queue],
      revealsDone: ctx.revealsDone,
    },
    events: ctx.events,
  };
}

function enqueue(ctx, action) {
  if (ctx.queue.length + ctx.spawned.length >= MAX_QUEUE_LENGTH) return false;
  ctx.spawned.push(action);
  return true;
}

function activePull(ctx, index) {
  const pull = ctx.cards[index];
  if (!pull || pull.salvaged || pull.fusedAway) return null;
  return pull;
}

function grantCash(ctx, amount, source, index) {
  if (amount <= 0) return;
  ctx.working.cash += amount;
  ctx.working.lifetimeCash += amount;
  ctx.events.push({ t: "coins", amount, source: source || null, index });
}

function grantScrap(ctx, amount, source, index) {
  if (amount <= 0) return;
  ctx.working.scrap += amount;
  ctx.working.lifetimeScrap += amount;
  ctx.events.push({ t: "scrap", amount, source: source || null, index });
}

function spendScrap(ctx, amount, source) {
  if (ctx.working.scrap < amount) return false;
  ctx.working.scrap -= amount;
  ctx.events.push({ t: "scrapSpend", amount, source: source || null });
  return true;
}

function basePayout(ctx, pull) {
  if (ctx.engine.noCash) return 0;
  const base = RARITIES[pull.rarity].sellValue;
  return pull.foil ? base * 2 : base;
}

function addCardsToOpening(ctx, { count, rarity = null, fromEffect = true, packBurst = false, source = null, reveal = false }) {
  const indices = [];
  for (let added = 0; added < count; added += 1) {
    if (ctx.cards.length >= MAX_PACK_CARDS) break;
    const pull = makePull(ctx.engine, ctx.rng, {
      rarity,
      extra: { fromEffect, packBurst },
    });
    ctx.cards.push(pull);
    indices.push(ctx.cards.length - 1);
  }
  if (indices.length) {
    ctx.events.push({ t: "addCards", source, count: indices.length, packBurst });
    if (reveal) {
      for (const index of indices) enqueue(ctx, { type: "reveal", index, source });
    }
  }
  return indices;
}

// ---------------------------------------------------------------------------
// Trigger firing

function tallyTrigger(ctx, cardId) {
  ctx.working.triggerTallies[cardId] = (ctx.working.triggerTallies[cardId] || 0) + 1;
}

// Runs one displayed-card effect. Returns true when the effect actually did
// something (spent, queued, or paid); a failed chance roll or unmet condition
// returns false and shows nothing.
function runEffect(ctx, record, context, depth = 0) {
  const { def } = record;
  const source = record.id;
  switch (def.kind) {
    case "salvageChance": {
      if (ctx.rng() >= def.chance) return false;
      // The target may still be face-down here (a fused result whose reveal
      // is queued ahead of this salvage); the salvage action re-validates.
      if (!activePull(ctx, context.index)) return false;
      return enqueue(ctx, { type: "salvage", index: context.index, source });
    }
    case "rerollCommon": {
      const pull = activePull(ctx, context.index);
      if (!pull || pull.rarity !== "common" || pull.rerolled) return false;
      if (!spendScrap(ctx, def.cost, source)) return false;
      return enqueue(ctx, { type: "reroll", index: context.index, source });
    }
    case "extraCommon": {
      if (ctx.rng() >= def.chance) return false;
      if (ctx.working.scrap < def.cost) return false;
      if (ctx.cards.length >= MAX_PACK_CARDS) return false;
      if (!spendScrap(ctx, def.cost, source)) return false;
      return enqueue(ctx, { type: "addCards", count: 1, rarity: "common", reveal: true, source });
    }
    case "commonCashBonus": {
      const pull = ctx.cards[context.index];
      if (!pull || pull.rarity !== "common") return false;
      const bonus = basePayout(ctx, pull);
      if (bonus <= 0) return false;
      grantCash(ctx, bonus, source, context.index);
      return true;
    }
    case "firstRevealAll": {
      if (!context.isFirstReveal) return false;
      let queued = false;
      for (let index = 0; index < ctx.cards.length; index += 1) {
        const pull = ctx.cards[index];
        if (!pull || pull.revealed || pull.salvaged || pull.fusedAway) continue;
        queued = enqueue(ctx, { type: "reveal", index, source }) || queued;
      }
      return queued;
    }
    case "fuseSameRarity": {
      const pull = activePull(ctx, context.index);
      if (!pull || !pull.revealed || pull.fusePending) return false;
      for (let index = 0; index < ctx.cards.length; index += 1) {
        if (index === context.index) continue;
        const partner = ctx.cards[index];
        if (!partner || !partner.revealed || partner.salvaged || partner.fusedAway || partner.fusePending) continue;
        if (partner.rarity !== pull.rarity) continue;
        ctx.cards[index] = { ...partner, fusePending: true };
        ctx.cards[context.index] = { ...pull, fusePending: true };
        return enqueue(ctx, { type: "fuse", a: index, b: context.index, source });
      }
      return false;
    }
    case "packBurst": {
      if (ctx.working.scrap < def.cost) return false;
      if (ctx.cards.length >= MAX_PACK_CARDS) return false;
      if (!spendScrap(ctx, def.cost, source)) return false;
      return enqueue(ctx, { type: "addCards", count: PACK_SIZE, packBurst: true, source });
    }
    case "salvageAddCard": {
      const pull = context.pull;
      if (!pull || RARITIES[pull.rarity].order < RARITIES.rare.order) return false;
      if (ctx.cards.length >= MAX_PACK_CARDS) return false;
      return enqueue(ctx, { type: "addCards", count: 1, source });
    }
    case "fuseSalvage": {
      return enqueue(ctx, { type: "salvage", index: context.index, source });
    }
    case "triggerRight": {
      if (depth >= 3) return false;
      if (ctx.rng() >= def.chance) return false;
      const rightSlot = record.slot + 1;
      const rightDef = ctx.engine.defs[rightSlot];
      const rightEntry = ctx.engine.entries[rightSlot];
      if (!rightDef || !rightEntry || rightDef.passive) return false;
      return fireRecord(ctx, { slot: rightSlot, id: rightEntry.id, def: rightDef }, context, depth + 1);
    }
    default:
      return false;
  }
}

// Fires one record, with the display case's first slot eligible for the
// Encorekeep bonus trigger.
function fireRecord(ctx, record, context, depth = 0) {
  const executed = runEffect(ctx, record, context, depth);
  if (!executed) return false;
  tallyTrigger(ctx, record.id);
  ctx.events.push({ t: "trigger", cardId: record.id });
  if (
    depth === 0
    && record.slot === 0
    && ctx.engine.firstSlotEchoChance > 0
    && ctx.rng() < ctx.engine.firstSlotEchoChance
  ) {
    const again = runEffect(ctx, record, context, depth + 1);
    if (again) {
      tallyTrigger(ctx, record.id);
      ctx.events.push({ t: "encore", cardId: record.id });
    }
  }
  return true;
}

function fireBucket(ctx, bucket, context) {
  const repeats = bucket === "onReveal" ? ctx.engine.revealRepeats : 1;
  for (const record of ctx.engine[bucket]) {
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      fireRecord(ctx, record, context);
    }
  }
}

// ---------------------------------------------------------------------------
// Actions

function applyReveal(ctx, action) {
  const pull = ctx.cards[action.index];
  if (!pull || pull.revealed || pull.salvaged || pull.fusedAway) return false;
  const cardId = pull.card.id;
  const isNew = !(ctx.working.collection[cardId] > 0);
  const revealed = { ...pull, revealed: true, isNew };
  ctx.cards[action.index] = revealed;
  ctx.working.collection[cardId] = (ctx.working.collection[cardId] || 0) + 1;
  if (revealed.foil) ctx.working.foils[cardId] = (ctx.working.foils[cardId] || 0) + 1;
  ctx.working.rarityPulls[revealed.rarity] += 1;
  ctx.working.cardsPulled += 1;
  ctx.revealsDone += 1;
  ctx.events.push({
    t: "reveal",
    index: action.index,
    cardId,
    rarity: revealed.rarity,
    foil: revealed.foil,
    isNew,
  });
  grantCash(ctx, basePayout(ctx, revealed), null, action.index);
  fireBucket(ctx, "onReveal", {
    index: action.index,
    pull: revealed,
    isFirstReveal: ctx.revealsDone === 1,
  });
  return true;
}

function applySalvage(ctx, action) {
  const pull = ctx.cards[action.index];
  if (!pull || !pull.revealed || pull.salvaged || pull.fusedAway) return false;
  ctx.cards[action.index] = { ...pull, salvaged: true, fusedAway: true, fusePending: false };
  let amount = RARITIES[pull.rarity].scrapValue;
  if (ctx.engine.doubleScrap) amount *= 2;
  if (ctx.engine.commonScrapDouble && pull.rarity === "common") amount *= 2;
  ctx.working.stats.salvages += 1;
  ctx.events.push({ t: "salvage", index: action.index, cardId: pull.card.id, foil: Boolean(pull.foil), amount, source: action.source || null });
  grantScrap(ctx, amount, action.source, action.index);
  fireBucket(ctx, "onSalvage", { index: action.index, pull });
  return true;
}

function applyFuse(ctx, action) {
  const first = ctx.cards[action.a];
  const second = ctx.cards[action.b];
  const valid = first && second
    && first.revealed && second.revealed
    && !first.salvaged && !second.salvaged
    && !first.fusedAway && !second.fusedAway
    && first.rarity === second.rarity;
  if (first?.fusePending) ctx.cards[action.a] = { ...first, fusePending: false };
  if (second?.fusePending) ctx.cards[action.b] = { ...second, fusePending: false };
  if (!valid) return false;
  if (ctx.cards.length >= MAX_PACK_CARDS) return false;

  const bothFoil = Boolean(first.foil && second.foil);
  let resultOrder = RARITIES[first.rarity].order;
  let jumped = false;
  if (ctx.engine.foilFuseLegendary && bothFoil) {
    jumped = resultOrder !== RARITIES.legendary.order;
    resultOrder = RARITIES.legendary.order;
  } else if (ctx.engine.fuseJumpChance > 0 && ctx.rng() < ctx.engine.fuseJumpChance) {
    if (resultOrder < RARITIES.legendary.order) {
      resultOrder += 1;
      jumped = true;
    }
  }
  const resultRarity = rarityIdAtOrder(resultOrder);

  ctx.cards[action.a] = { ...ctx.cards[action.a], fusedAway: true };
  ctx.cards[action.b] = { ...ctx.cards[action.b], fusedAway: true };
  const result = makePull(ctx.engine, ctx.rng, {
    rarity: resultRarity,
    foil: bothFoil ? true : null,
    extra: { fromEffect: true, fusedFrom: [first.card.id, second.card.id] },
  });
  ctx.cards.push(result);
  const resultIndex = ctx.cards.length - 1;
  ctx.working.stats.fusions += 1;
  ctx.events.push({
    t: "fusion",
    a: action.a,
    b: action.b,
    index: resultIndex,
    cardId: result.card.id,
    rarity: resultRarity,
    jumped,
    source: action.source || null,
  });
  enqueue(ctx, { type: "reveal", index: resultIndex, source: action.source });
  fireBucket(ctx, "onFuse", { index: resultIndex, pull: result, sources: [first, second] });
  return true;
}

function applyReroll(ctx, action) {
  const pull = ctx.cards[action.index];
  if (!pull || !pull.revealed || pull.salvaged || pull.fusedAway) return false;
  const replacement = makePull(ctx.engine, ctx.rng, { extra: { rerolled: true, fromEffect: true } });
  ctx.cards[action.index] = replacement;
  ctx.working.stats.rerolls += 1;
  ctx.events.push({ t: "reroll", index: action.index, source: action.source || null });
  enqueue(ctx, { type: "reveal", index: action.index, source: action.source });
  return true;
}

function applyAddCards(ctx, action) {
  const indices = addCardsToOpening(ctx, {
    count: action.count,
    rarity: action.rarity || null,
    packBurst: Boolean(action.packBurst),
    source: action.source || null,
    reveal: Boolean(action.reveal),
  });
  return indices.length > 0;
}

function applyAction(ctx, action) {
  switch (action.type) {
    case "reveal": return applyReveal(ctx, action);
    case "salvage": return applySalvage(ctx, action);
    case "fuse": return applyFuse(ctx, action);
    case "reroll": return applyReroll(ctx, action);
    case "addCards": return applyAddCards(ctx, action);
    default: return false;
  }
}

// ---------------------------------------------------------------------------
// The opening lifecycle

let sessionSerial = 0;

// Opens a pack: consumes one sealed pack, rolls the cards, fires On Pack
// Open effects, and returns a fresh session whose queue starts empty.
export function openPack(state, options = {}) {
  if (state.packs <= 0) return { state, session: null, events: [], error: "NO_STOCK" };
  const rng = options.rng || Math.random;
  const opened = {
    ...state,
    packs: state.packs - 1,
    packsOpened: state.packsOpened + 1,
  };
  const session = {
    id: `opening-${++sessionSerial}-${opened.packsOpened}`,
    cards: [],
    queue: [],
    revealsDone: 0,
  };
  const ctx = makeContext(opened, session, rng);
  ctx.events.push({ t: "packOpened" });

  for (let slot = 0; slot < PACK_SIZE; slot += 1) {
    ctx.cards.push(makePull(ctx.engine, rng, { extra: { fromEffect: false, packBurst: false } }));
  }

  // On Pack Open effects resolve immediately, in display order, before the
  // player sees the board — they shape the pack rather than queue actions.
  for (const record of ctx.engine.onPackOpen) {
    if (record.def.kind === "rarePlusPack") {
      const cost = Math.floor(ctx.working.cash / 2);
      if (cost <= 0) continue;
      ctx.working.cash -= cost;
      ctx.events.push({ t: "cashSpend", amount: cost, source: record.id });
      ctx.cards = ctx.cards.map((pull) => (
        RARITIES[pull.rarity].order >= RARITIES.rare.order
          ? pull
          : makePull(ctx.engine, rng, { minOrder: RARITIES.rare.order })
      ));
      tallyTrigger(ctx, record.id);
      ctx.events.push({ t: "trigger", cardId: record.id });
      ctx.events.push({ t: "rareShift", source: record.id });
    } else if (record.def.kind === "addCards") {
      if (!spendScrap(ctx, record.def.cost, record.id)) continue;
      addCardsToOpening(ctx, { count: record.def.count, source: record.id });
      tallyTrigger(ctx, record.id);
      ctx.events.push({ t: "trigger", cardId: record.id });
    }
  }

  const finished = finishContext(ctx, session);
  return { state: finished.state, session: finished.session, events: finished.events, error: null };
}

// Player input: queue the reveal of one face-down card. Duplicate requests
// for the same card are ignored.
export function enqueueReveal(session, index) {
  const pull = session.cards[index];
  if (!pull || pull.revealed || pull.salvaged || pull.fusedAway) return session;
  if (session.queue.some((action) => action.type === "reveal" && action.index === index)) return session;
  if (session.queue.length >= MAX_QUEUE_LENGTH) return session;
  return { ...session, queue: [...session.queue, { type: "reveal", index }] };
}

// Pops the queue until one action does visible work (stale actions — a card
// already fused away, an invalidated pair — are discarded silently), applies
// it, and returns. Anything the action spawns cuts to the front of the
// queue, so a reveal's whole cascade resolves before the next queued
// reveal. This is the only place actions resolve; callers pace the game by
// how often they step.
export function stepOpening(state, session, options = {}) {
  if (!session || session.queue.length === 0) {
    return { state, session, events: [], processed: false, action: null };
  }
  const rng = options.rng || Math.random;
  const ctx = makeContext(state, session, rng);
  let processed = null;
  while (ctx.queue.length > 0) {
    const action = ctx.queue.shift();
    if (applyAction(ctx, action)) {
      processed = action;
      break;
    }
  }
  const finished = finishContext(ctx, session);
  return {
    state: finished.state,
    session: finished.session,
    events: finished.events,
    processed: Boolean(processed),
    action: processed,
  };
}

// Leaving an opening clears the action stack: pending reveals and effects
// are simply gone. Cards already revealed keep everything they paid.
export function clearOpeningQueue(session) {
  if (!session || session.queue.length === 0) return session;
  return { ...session, queue: [] };
}

export function getPendingCardCount(cards = []) {
  let pending = 0;
  for (const pull of cards) {
    if (pull && !pull.revealed && !pull.salvaged && !pull.fusedAway) pending += 1;
  }
  return pending;
}

export function isOpeningSettled(session) {
  if (!session) return true;
  return session.queue.length === 0 && getPendingCardCount(session.cards) === 0;
}
