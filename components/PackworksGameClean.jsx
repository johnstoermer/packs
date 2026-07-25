"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_CARDS,
  CLEAN_UPGRADES,
  FUSION_THRESHOLDS,
  PACK_PRODUCTS,
  RARITIES,
  SETS,
  formatNumber,
  getCard,
  getSet,
} from "../lib/gameData";
import {
  BINDER_PAYOUT_SCALE,
  SAVE_KEY,
  applyOfflineProgress,
  breakProduct,
  buyProduct,
  buyUpgrade,
  createInitialState,
  getCardIncome,
  getDerived,
  getFusionLevel,
  getPackPrice,
  getProductCount,
  getUpgradeCost,
  hydrateState,
  openPack,
  selectSet,
  serializeState,
  tickEconomy,
} from "../lib/gameLogic";
import { createAudioEngine } from "../lib/audio";

const ASSET_BASE = process.env.NEXT_PUBLIC_PACKWORKS_BASE || "";
const SHOP_PRODUCTS = PACK_PRODUCTS.filter((product) => ["loose", "box", "case"].includes(product.id));
const PLACE_SUBJECTS = new Set(["stand", "screen", "city", "garden", "coronation"]);
const RELIC_SUBJECTS = new Set(["relay", "locket", "star"]);
const MACHINE_SUBJECTS = new Set(["drone", "hopper", "warden", "crawler", "familiar", "ogre", "engine", "colossus"]);

function money(value) {
  if (Math.abs(value) < 10) return Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  if (Math.abs(value) < 1000) return Number(value).toFixed(1).replace(/\.0$/, "");
  return formatNumber(value);
}

function rate(value) {
  if (value <= 0) return "0";
  if (value < 0.01) return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  if (value < 10) return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return formatNumber(value);
}

function getCardPresentation(card, rarityId = card.rarity) {
  let kind = "Creature";
  if (PLACE_SUBJECTS.has(card.subject)) kind = "Landmark";
  else if (RELIC_SUBJECTS.has(card.subject)) kind = "Relic";
  else if (MACHINE_SUBJECTS.has(card.subject)) kind = "Machine";

  let treatment = "specimen";
  if (RARITIES[rarityId].order >= RARITIES.legendary.order) treatment = "signature";
  else if (rarityId === "epic") treatment = "panorama";
  else if (kind === "Landmark") treatment = "landmark";
  else if (kind === "Relic" || kind === "Machine") treatment = "dossier";
  else if (card.number % 3 === 0) treatment = "story";

  return { kind, treatment };
}

function CardArt({ card, compact = false }) {
  const set = getSet(card.setId);
  const artPath = `${ASSET_BASE}/card-art/${card.setId}/${String(card.number).padStart(2, "0")}.webp`;
  return (
    <span
      className={`card-art ${compact ? "compact" : ""}`}
      role="img"
      aria-label={`${card.name}, an original voxel illustration`}
      style={{ "--art-a": set.colors[0], "--art-b": set.colors[1] }}
    >
      <img src={artPath} alt="" aria-hidden="true" loading={compact ? "lazy" : "eager"} decoding="async" />
      <span className="card-art-grade" />
      <span className="card-art-index">{set.short} / {String(card.number).padStart(2, "0")}</span>
    </span>
  );
}

function PackFace({ set, small = false }) {
  return (
    <span
      className={`${small ? "pack-face small" : "pack-face"}`}
      style={{
        "--pack-a": set.colors[0],
        "--pack-b": set.colors[1],
        "--pack-c": set.colors[2],
      }}
    >
      <span className="pack-crimp top" />
      <span className="pack-series">PACKWORKS / {set.short}</span>
      <strong>{set.name}</strong>
      <span className="pack-glyph"><i /><i /><i /></span>
      <span className="pack-count">6 CARDS</span>
      <span className="pack-crimp bottom" />
    </span>
  );
}

function RevealCard({
  pull,
  index,
  count,
  revealed,
  latest,
  phase,
  onReveal,
  onSelect,
  onSignal,
}) {
  const rarity = RARITIES[pull.rarity];
  const signal = RARITIES[pull.signalRarity || pull.rarity];
  const set = getSet(pull.card.setId);
  const presentation = getCardPresentation(pull.card, pull.rarity);
  const dealt = ["ready", "complete", "summary"].includes(phase);
  const canReveal = phase === "ready" && !revealed;
  const spread = index - (count - 1) / 2;
  const copyLabel = pull.isNew
    ? "NEW"
    : pull.fusionAfter > pull.fusionBefore
      ? `STAR ${pull.fusionAfter}`
      : "DUPLICATE";

  return (
    <button
      type="button"
      className={`reveal-card count-${count} rarity-${pull.rarity} ${dealt ? "is-dealt" : ""} ${revealed ? "is-revealed" : ""} ${latest ? "is-impacting" : ""} ${canReveal ? "is-hoverable" : ""} ${pull.foil ? "is-foil" : ""} ${phase === "summary" ? "is-settled" : ""}`}
      style={{
        "--index": index,
        "--spread": spread,
        "--rarity": rarity.color,
        "--rarity-deep": rarity.deep,
        "--signal": signal.color,
        "--set-a": set.colors[0],
        "--set-b": set.colors[1],
        "--set-c": set.colors[2],
        "--deal-delay": `${index * 95}ms`,
      }}
      onPointerEnter={() => canReveal && onSignal(signal.order)}
      onFocus={() => canReveal && onSignal(signal.order)}
      onClick={(event) => {
        event.stopPropagation();
        if (canReveal) onReveal(index);
        else if (revealed && phase === "summary") onSelect(pull.card.id);
      }}
      tabIndex={canReveal || phase === "summary" ? 0 : -1}
      aria-label={revealed
        ? `${rarity.label} ${pull.card.name}${pull.foil ? ", foil" : ""}`
        : `Face-down card. Hover for a rarity signal, then click to reveal.`}
    >
      <span className="reveal-card-inner">
        <span className="card-back">
          <span className="back-set">{set.short}</span>
          <span className="back-orbit"><i /><i /><i /></span>
          <span className="back-mark">PW</span>
          <span className="back-rule" />
          <span className="rarity-signal" style={{ "--rarity": signal.color }}>
            <i />
            <b>{signal.label}</b>
            <small>CLICK TO REVEAL</small>
          </span>
        </span>
        <span className={`card-front treatment-${presentation.treatment} set-${pull.card.setId}`}>
          <span className="card-head">
            <span>{set.short}-{String(pull.card.number).padStart(2, "0")}</span>
            <b>{rarity.short}</b>
          </span>
          <CardArt card={pull.card} />
          <span className="card-copy">
            <span className="card-type-line">{rarity.label} / {presentation.kind}</span>
            <strong>{pull.card.name}</strong>
            <small>{pull.card.flavor}</small>
          </span>
          <span className="card-foot">
            <span>{copyLabel}</span>
            <b>{rarity.label}</b>
          </span>
          {pull.misprintDetected && <span className="pw-misprint-stamp">MISPRINT</span>}
          {pull.foil && <span className="foil-stamp">FOIL</span>}
          <span className="foil-sheen" />
          <span className="card-print-mark">{set.short}</span>
        </span>
      </span>
    </button>
  );
}

function OpeningImpact({ impact }) {
  if (!impact) return null;
  const rarity = RARITIES[impact.rarity];
  return (
    <div
      key={impact.serial}
      className={`opening-impact impact-${impact.rarity}`}
      style={{ "--impact-color": rarity.color }}
      aria-live="polite"
    >
      <span className="impact-flash" />
      <span className="impact-ring ring-one" />
      <span className="impact-ring ring-two" />
      <span className="impact-rays">
        {Array.from({ length: 20 }, (_, ray) => (
          <i key={ray} style={{ "--angle": `${ray * 18}deg`, "--ray-delay": `${(ray % 5) * 16}ms` }} />
        ))}
      </span>
      <span className="impact-shards">
        {Array.from({ length: 28 }, (_, shard) => (
          <i
            key={shard}
            style={{
              "--angle": `${shard * 12.857}deg`,
              "--distance": `-${90 + (shard % 7) * 26}px`,
              "--shard-delay": `${(shard % 6) * 14}ms`,
            }}
          />
        ))}
      </span>
      <span className="impact-name">
        <strong>{rarity.label}</strong>
        <small>{impact.foil ? "FOIL PULL" : "CARD REVEALED"}</small>
      </span>
    </div>
  );
}

function PackDebris() {
  return (
    <span className="pack-debris" aria-hidden="true">
      {Array.from({ length: 18 }, (_, piece) => {
        const direction = piece % 2 ? 1 : -1;
        return (
          <i
            key={piece}
            style={{
              "--debris-x": `${direction * (80 + (piece % 6) * 44)}px`,
              "--debris-y": `${-150 + (piece % 7) * 48}px`,
              "--debris-r": `${direction * (80 + piece * 19)}deg`,
              "--debris-delay": `${(piece % 4) * 16}ms`,
            }}
          />
        );
      })}
    </span>
  );
}

function FusionPips({ count }) {
  const level = getFusionLevel(count);
  return (
    <span className="clean-fusion-pips" aria-label={`${level} fusion stars`}>
      {FUSION_THRESHOLDS.map((threshold, index) => <i key={threshold} className={index < level ? "filled" : ""} />)}
    </span>
  );
}

function ShopDrawer({ game, onClose, onBuy, onBreak, onUpgrade, onSet, onReset }) {
  const availableProducts = SHOP_PRODUCTS.filter((product) => product.unlockBeat <= game.beat);
  const nextProduct = SHOP_PRODUCTS.find((product) => product.unlockBeat > game.beat);
  const unlockedUpgrades = CLEAN_UPGRADES.filter((upgrade) => game.packsOpened >= upgrade.unlockPacks);
  const nextUpgrade = CLEAN_UPGRADES.find((upgrade) => game.packsOpened < upgrade.unlockPacks);
  const unlockedSets = SETS.filter((set) => game.unlockedSets.includes(set.id));

  return (
    <aside className="clean-drawer" aria-label="Shop">
      <header>
        <div><span>SHOP</span><h2>Pack shop</h2></div>
        <button onClick={onClose} aria-label="Close shop">CLOSE</button>
      </header>

      {unlockedSets.length > 1 && (
        <div className="clean-set-picker" aria-label="Active card set">
          {unlockedSets.map((set) => (
            <button
              key={set.id}
              className={set.id === game.activeSet ? "active" : ""}
              onClick={() => onSet(set.id)}
            >
              {set.short}
            </button>
          ))}
        </div>
      )}

      <div className="clean-drawer-scroll">
        <section className="clean-product-list">
          {availableProducts.map((product) => {
            const price = getPackPrice(game, product.id);
            const owned = getProductCount(game, game.activeSet, product.id);
            return (
              <article className="clean-product" key={product.id}>
                <div className={`clean-product-icon ${product.id}`}><i /><i /><i /></div>
                <div>
                  <h3>{product.label}</h3>
                  <p>{product.packs} {product.packs === 1 ? "pack" : "packs"}</p>
                </div>
                <span className="clean-owned">{owned ? `${owned} owned` : ""}</span>
                <button disabled={game.coins < price} onClick={() => onBuy(product.id)}>
                  {money(price)}
                </button>
                {product.id !== "loose" && owned > 0 && (
                  <button className="clean-break" onClick={() => onBreak(product.id)}>
                    BREAK ONE
                  </button>
                )}
              </article>
            );
          })}
          {nextProduct && (
            <p className="clean-next-unlock">
              {nextProduct.label} unlocks after {Math.max(0, nextProduct.unlockBeat === 2 ? 10 : 150) - game.packsOpened} more packs.
            </p>
          )}
        </section>

        <section className="clean-upgrades">
          <div className="clean-section-title"><h3>Upgrades</h3><span>THREE SIMPLE TRACKS</span></div>
          {unlockedUpgrades.length === 0 ? (
            <p className="clean-empty">Open {Math.max(0, 5 - game.packsOpened)} more packs to unlock the first upgrade.</p>
          ) : (
            unlockedUpgrades.map((upgrade) => {
              const rank = game.upgrades?.[upgrade.id] || 0;
              const cost = getUpgradeCost(game, upgrade.id);
              const maxed = rank >= upgrade.max;
              return (
                <article className="clean-upgrade" key={upgrade.id}>
                  <div><h3>{upgrade.name}</h3><p>{upgrade.detail}</p></div>
                  <span>LV {rank}</span>
                  <button disabled={maxed || game.coins < cost} onClick={() => onUpgrade(upgrade.id)}>
                    {maxed ? "MAX" : money(cost)}
                  </button>
                </article>
              );
            })
          )}
          {nextUpgrade && unlockedUpgrades.length > 0 && (
            <p className="clean-next-unlock">{nextUpgrade.name} unlocks at {nextUpgrade.unlockPacks} packs.</p>
          )}
        </section>

        <footer className="clean-shop-footer">
          <button onClick={onReset}>RESET SAVE</button>
        </footer>
      </div>
    </aside>
  );
}

function BinderDrawer({ game, setId, onSetId, onClose, onCard }) {
  const set = getSet(setId);
  const unlockedSets = SETS.filter((candidate) => game.unlockedSets.includes(candidate.id));
  const found = set.cards.filter((card) => game.collection[card.id]).length;
  const shelfMultiplier = 1 + (game.upgrades?.shelf || 0) * 0.2;
  const setRate = set.cards.reduce(
    (sum, card) => sum + getCardIncome(game, card.id) * BINDER_PAYOUT_SCALE * shelfMultiplier,
    0,
  );

  return (
    <aside className="clean-drawer clean-binder" aria-label="Binder">
      <header>
        <div><span>BINDER</span><h2>{set.name}</h2></div>
        <button onClick={onClose} aria-label="Close binder">CLOSE</button>
      </header>
      {unlockedSets.length > 1 && (
        <div className="clean-set-picker" aria-label="Binder set">
          {unlockedSets.map((candidate) => (
            <button
              key={candidate.id}
              className={candidate.id === set.id ? "active" : ""}
              onClick={() => onSetId(candidate.id)}
            >
              {candidate.short}
            </button>
          ))}
        </div>
      )}
      <div className="clean-binder-summary">
        <strong>{found} / 12</strong>
        <span>COLLECTED</span>
        <strong>+{rate(setRate)}/s</strong>
        <span>FROM THIS SET</span>
      </div>
      <div className="clean-binder-grid">
        {set.cards.map((card) => {
          const count = game.collection[card.id] || 0;
          const rarity = RARITIES[card.rarity];
          return (
            <button
              key={card.id}
              className={count ? "found" : "missing"}
              disabled={!count}
              onClick={() => count && onCard(card.id)}
              style={{ "--rarity": rarity.color }}
              aria-label={count ? `${card.name}, ${count} copies` : `Missing card ${card.number}`}
            >
              {count ? <CardArt card={card} compact /> : <span className="clean-missing-card">PW</span>}
              <span className="clean-binder-card-copy">
                <b>{count ? card.name : `Card ${String(card.number).padStart(2, "0")}`}</b>
                <small>{count ? `${rarity.label} / ${count} ${count === 1 ? "copy" : "copies"}` : "Not found"}</small>
                {count > 0 && <FusionPips count={count} />}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function CardDetail({ game, cardId, onClose }) {
  const card = getCard(cardId);
  if (!card) return null;
  const rarity = RARITIES[card.rarity];
  const count = game.collection[card.id] || 0;
  const shelfMultiplier = 1 + (game.upgrades?.shelf || 0) * 0.2;
  const cardRate = getCardIncome(game, card.id) * BINDER_PAYOUT_SCALE * shelfMultiplier;
  return (
    <div className="clean-modal-scrim" onMouseDown={onClose}>
      <article className="clean-card-detail" onMouseDown={(event) => event.stopPropagation()} style={{ "--rarity": rarity.color }}>
        <button onClick={onClose}>CLOSE</button>
        <div className="clean-detail-art"><CardArt card={card} /></div>
        <div className="clean-detail-copy">
          <span style={{ color: rarity.color }}>{rarity.label}</span>
          <h2>{card.name}</h2>
          <p>{card.flavor}</p>
          <dl>
            <div><dt>COPIES</dt><dd>{count}</dd></div>
            <div><dt>BINDER</dt><dd>+{rate(cardRate)}/s</dd></div>
          </dl>
          <FusionPips count={count} />
          <small>Duplicate milestones at 2, 4, 8, 16, and 32 copies increase this card by 40%.</small>
        </div>
      </article>
    </div>
  );
}

export default function PackworksGameClean() {
  const audioRef = useRef(null);
  const gameRef = useRef(createInitialState(0));
  const openingTimersRef = useRef([]);
  const holdRevealTimerRef = useRef(null);
  const spaceHeldRef = useRef(false);
  const revealLocksRef = useRef(new Set());
  const impactSerialRef = useRef(0);
  const toastSerialRef = useRef(0);
  const signalAtRef = useRef(0);

  const [game, setGame] = useState(() => createInitialState(0));
  const [ready, setReady] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [binderSetId, setBinderSetId] = useState("corner");
  const [opening, setOpening] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [resetArmed, setResetArmed] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const commit = useCallback((nextOrUpdater) => {
    const next = typeof nextOrUpdater === "function" ? nextOrUpdater(gameRef.current) : nextOrUpdater;
    gameRef.current = next;
    setGame(next);
    return next;
  }, []);

  const getAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createAudioEngine();
    audioRef.current.setEnabled(gameRef.current.settings.sound);
    return audioRef.current;
  }, []);

  const pushToast = useCallback((title, detail, tone = "neutral", duration = 4200) => {
    const id = ++toastSerialRef.current;
    setToasts((current) => [...current.slice(-2), { id, title, detail, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), duration);
  }, []);

  useEffect(() => {
    let loaded = null;
    try {
      loaded = JSON.parse(window.localStorage.getItem(SAVE_KEY) || "null");
    } catch {
      loaded = null;
    }
    const hydrated = hydrateState(loaded, Date.now());
    const offline = applyOfflineProgress(hydrated, Date.now());
    commit(offline.state);
    setBinderSetId(offline.state.activeSet);
    if (offline.report?.coins > 0) {
      window.setTimeout(() => pushToast("WELCOME BACK", `Your binder earned ${money(offline.report.coins)} cash.`, "success", 6000), 300);
    }
    setReady(true);
  }, [commit, pushToast]);

  useEffect(() => {
    if (!ready) return undefined;
    const save = () => {
      try {
        window.localStorage.setItem(SAVE_KEY, serializeState(gameRef.current));
      } catch {
        // Local storage can be unavailable in strict privacy modes.
      }
    };
    const interval = window.setInterval(save, 4000);
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", save);
      save();
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return undefined;
    let last = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const seconds = Math.min(1, (now - last) / 1000);
      last = now;
      commit((current) => tickEconomy(current, seconds));
    }, 250);
    return () => window.clearInterval(interval);
  }, [commit, ready]);

  const clearOpeningTimers = useCallback(() => {
    openingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    openingTimersRef.current = [];
  }, []);

  const clearHoldRevealTimer = useCallback(() => {
    if (holdRevealTimerRef.current !== null) {
      window.clearTimeout(holdRevealTimerRef.current);
      holdRevealTimerRef.current = null;
    }
  }, []);

  const closeOpening = useCallback(() => {
    clearOpeningTimers();
    clearHoldRevealTimer();
    revealLocksRef.current.clear();
    setOpening(null);
  }, [clearHoldRevealTimer, clearOpeningTimers]);

  const signalCard = useCallback((rarityOrder) => {
    const now = performance.now();
    if (now - signalAtRef.current < 120) return;
    signalAtRef.current = now;
    getAudio().sound("signal", rarityOrder);
  }, [getAudio]);

  const revealCard = useCallback((index) => {
    if (!opening || opening.phase !== "ready" || opening.revealed.includes(index)) return;
    const key = `${opening.id}-${index}`;
    if (revealLocksRef.current.has(key)) return;
    revealLocksRef.current.add(key);
    const pull = opening.result.cards[index];
    const rarity = RARITIES[pull.rarity];
    const revealed = [...opening.revealed, index];
    const isLast = revealed.length === opening.result.cards.length;
    const impact = {
      index,
      rarity: pull.rarity,
      foil: pull.foil,
      serial: ++impactSerialRef.current,
    };
    setOpening((current) => current?.id === opening.id
      ? { ...current, phase: isLast ? "complete" : "ready", revealed, impact }
      : current);

    const audio = getAudio();
    audio.sound("reveal", rarity.order);
    if (pull.misprintDetected) audio.sound("misprint");
    else if (pull.fusionAfter > pull.fusionBefore) audio.sound("fusion", pull.fusionAfter);
    else if (rarity.order >= RARITIES.legendary.order) audio.sound("legendary");

    if (isLast) {
      const delay = rarity.order >= 4 ? 1550 : rarity.order === 3 ? 1200 : 900;
      openingTimersRef.current.push(window.setTimeout(() => {
        audio.sound("packComplete");
        setOpening((current) => current?.id === opening.id ? { ...current, phase: "summary", impact: null } : current);
      }, delay));
    }
  }, [getAudio, opening]);

  const beginManualOpen = useCallback(() => {
    if (!ready || drawer || selectedCard) return;
    if (opening && opening.phase !== "summary") return;
    const current = gameRef.current;
    const priorBeat = current.beat;
    const priorSets = new Set(current.unlockedSets);
    const rolled = openPack(current, { manual: true, source: "loose", now: Date.now() });
    if (!rolled.result) {
      getAudio().sound("deny");
      pushToast(
        rolled.error === "MANUAL_RATE_CAP" ? "ONE MOMENT" : "NO PACKS READY",
        rolled.error === "MANUAL_RATE_CAP" ? "Let the foil settle before opening another." : "Buy a pack from the shop.",
        "warning",
      );
      if (rolled.error === "NO_STOCK") setDrawer("shop");
      return;
    }

    clearOpeningTimers();
    revealLocksRef.current.clear();
    setOpening(null);
    commit(rolled.state);
    setBinderSetId(rolled.state.activeSet);
    const audio = getAudio();
    audio.ensure();
    audio.sound("pack");

    const unlockedProduct = SHOP_PRODUCTS.find((product) => product.unlockBeat > priorBeat && product.unlockBeat <= rolled.state.beat);
    const unlockedSet = SETS.find((set) => rolled.state.unlockedSets.includes(set.id) && !priorSets.has(set.id));
    if (unlockedProduct) pushToast("NEW STOCK", `${unlockedProduct.label}s are now available in the shop.`, "gold", 6000);
    else if (unlockedSet) pushToast("NEW SET", `${unlockedSet.name} is now in print.`, "gold", 6000);

    const id = `${Date.now()}-${rolled.state.packsOpened}`;
    setOpening({ id, result: rolled.result, phase: "sealed", revealed: [], impact: null });
    const quick = rolled.state.settings.quickOpen || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tearDelay = quick ? 80 : 440;
    const dealDelay = quick ? 240 : 1250;
    openingTimersRef.current.push(window.setTimeout(() => {
      setOpening((value) => value?.id === id ? { ...value, phase: "torn" } : value);
      audio.sound("tear");
    }, tearDelay));
    openingTimersRef.current.push(window.setTimeout(() => {
      setOpening((value) => value?.id === id ? { ...value, phase: "ready" } : value);
      audio.sound("deal");
    }, dealDelay));
  }, [clearOpeningTimers, commit, drawer, getAudio, opening, pushToast, ready, selectedCard]);

  useEffect(() => {
    clearHoldRevealTimer();
    if (!spaceHeld || drawer || selectedCard || !opening) return undefined;

    if (opening.phase === "ready") {
      const nextIndex = opening.result.cards.findIndex((_, index) => !opening.revealed.includes(index));
      if (nextIndex >= 0) {
        const lastIndex = opening.revealed.at(-1);
        const lastPull = Number.isInteger(lastIndex) ? opening.result.cards[lastIndex] : null;
        const lastOrder = lastPull ? RARITIES[lastPull.rarity].order : 0;
        const delay = lastOrder >= 4 ? 1250 : lastOrder === 3 ? 900 : lastOrder === 2 ? 650 : 480;
        holdRevealTimerRef.current = window.setTimeout(() => {
          holdRevealTimerRef.current = null;
          revealCard(nextIndex);
        }, delay);
      }
    } else if (
      opening.phase === "summary"
      && getProductCount(gameRef.current, gameRef.current.activeSet, "loose") > 0
    ) {
      holdRevealTimerRef.current = window.setTimeout(() => {
        holdRevealTimerRef.current = null;
        beginManualOpen();
      }, 650);
    }

    return clearHoldRevealTimer;
  }, [
    beginManualOpen,
    clearHoldRevealTimer,
    drawer,
    opening,
    revealCard,
    selectedCard,
    spaceHeld,
  ]);

  const handleBuy = useCallback((productId) => {
    const next = buyProduct(gameRef.current, productId);
    if (next === gameRef.current) {
      getAudio().sound("deny");
      return;
    }
    commit(next);
    getAudio().sound("purchase");
  }, [commit, getAudio]);

  const handleBreak = useCallback((productId) => {
    const next = breakProduct(gameRef.current, productId);
    if (next === gameRef.current) return;
    commit(next);
    getAudio().sound("caseBreak");
    pushToast("READY TO OPEN", `${PACK_PRODUCTS.find((product) => product.id === productId)?.packs || 0} packs moved to the table.`, "success");
  }, [commit, getAudio, pushToast]);

  const handleUpgrade = useCallback((upgradeId) => {
    const next = buyUpgrade(gameRef.current, upgradeId);
    if (next === gameRef.current) {
      getAudio().sound("deny");
      return;
    }
    commit(next);
    getAudio().sound("purchase");
  }, [commit, getAudio]);

  const handleSet = useCallback((setId) => {
    const next = selectSet(gameRef.current, setId);
    if (next === gameRef.current) return;
    commit(next);
    setBinderSetId(setId);
    getAudio().sound("switch");
  }, [commit, getAudio]);

  const handleReset = useCallback(() => {
    if (!resetArmed) {
      setResetArmed(true);
      pushToast("RESET SAVE?", "Press reset once more to erase local progress.", "warning");
      return;
    }
    window.localStorage.removeItem(SAVE_KEY);
    const fresh = createInitialState(Date.now());
    commit(fresh);
    setBinderSetId("corner");
    setDrawer(null);
    setResetArmed(false);
    closeOpening();
  }, [closeOpening, commit, pushToast, resetArmed]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === "Space" && !drawer && !selectedCard) {
        event.preventDefault();
        if (event.repeat || spaceHeldRef.current) return;
        spaceHeldRef.current = true;
        setSpaceHeld(true);
        if (!opening || opening.phase === "summary") beginManualOpen();
      } else if (event.key === "Escape") {
        if (selectedCard) setSelectedCard(null);
        else if (opening?.phase === "summary") closeOpening();
        else setDrawer(null);
      }
    };
    const stopHoldingSpace = (event) => {
      if (event?.type === "keyup" && event.code !== "Space") return;
      if (event?.code === "Space") event.preventDefault();
      spaceHeldRef.current = false;
      setSpaceHeld(false);
      clearHoldRevealTimer();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", stopHoldingSpace);
    window.addEventListener("blur", stopHoldingSpace);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", stopHoldingSpace);
      window.removeEventListener("blur", stopHoldingSpace);
    };
  }, [beginManualOpen, clearHoldRevealTimer, closeOpening, drawer, opening, selectedCard]);

  useEffect(() => {
    const preventSelection = (event) => event.preventDefault();
    document.addEventListener("selectstart", preventSelection);
    return () => document.removeEventListener("selectstart", preventSelection);
  }, []);

  useEffect(() => () => {
    clearOpeningTimers();
    clearHoldRevealTimer();
  }, [clearHoldRevealTimer, clearOpeningTimers]);

  const derived = useMemo(() => getDerived(game), [game]);
  const activeSet = getSet(game.activeSet);
  const loosePacks = getProductCount(game, game.activeSet, "loose");
  const packPrice = getPackPrice(game, "loose");
  const activeSetFound = activeSet.cards.filter((card) => game.collection[card.id]).length;
  const breakableProduct = SHOP_PRODUCTS.find(
    (product) => product.id !== "loose" && getProductCount(game, game.activeSet, product.id) > 0,
  );

  return (
    <main
      className={`packworks pw2 pw-clean ${game.settings.reducedEffects ? "reduced-effects" : ""} ${opening ? "opening-active" : ""} ${spaceHeld ? "space-held" : ""}`}
      style={{ "--set-a": activeSet.colors[0], "--set-b": activeSet.colors[1], "--set-c": activeSet.colors[2] }}
    >
      <header className="clean-topbar">
        <div className="clean-brand">
          <span className="clean-brand-mark"><i /><i /><i /></span>
          <strong>PACKWORKS</strong>
        </div>
        <div className="clean-wallet">
          <strong>{money(game.coins)}</strong>
          <span>CASH / +{rate(derived.passiveRate)} PER SECOND</span>
        </div>
        <nav>
          <button className={drawer === "shop" ? "active" : ""} onClick={() => setDrawer(drawer === "shop" ? null : "shop")}>SHOP</button>
          <button className={drawer === "binder" ? "active" : ""} onClick={() => setDrawer(drawer === "binder" ? null : "binder")}>BINDER</button>
          <button
            className={game.settings.sound ? "active" : ""}
            onClick={() => {
              commit((current) => ({ ...current, settings: { ...current.settings, sound: !current.settings.sound } }));
              getAudio().ensure();
              getAudio().sound("switch");
            }}
          >
            SOUND {game.settings.sound ? "ON" : "OFF"}
          </button>
        </nav>
      </header>

      <section className="clean-stage">
        <div className="clean-stage-light" />
        <div className="clean-floor"><i /><i /><i /><i /><i /></div>
        <div className="clean-set-title">
          <span>{activeSet.short} / CURRENT SET</span>
          <strong>{activeSet.name}</strong>
        </div>

        <button
          className="clean-pack-clicker"
          disabled={!loosePacks}
          onClick={beginManualOpen}
          aria-label={loosePacks ? `Open a pack. ${loosePacks} ready.` : "No packs ready"}
        >
          <span className="clean-pack-shadow" />
          <span className="clean-pack-stack"><i /><i /><PackFace set={activeSet} /></span>
          <span className="clean-open-copy">
            <strong>{loosePacks ? "OPEN PACK" : "NO PACKS READY"}</strong>
            <small>
              {loosePacks
                ? `${loosePacks} READY / HOLD SPACE`
                : breakableProduct
                  ? `${breakableProduct.label.toUpperCase()} WAITING`
                  : "BUY ONE TO KEEP OPENING"}
            </small>
          </span>
        </button>

        {!loosePacks && (
          <button
            className="clean-buy-one"
            disabled={!breakableProduct && game.coins < packPrice}
            onClick={() => breakableProduct ? handleBreak(breakableProduct.id) : handleBuy("loose")}
          >
            {breakableProduct ? `BREAK ${breakableProduct.label.toUpperCase()}` : "BUY A PACK"}
            <span>{breakableProduct ? `${breakableProduct.packs} PACKS` : `${money(packPrice)} CASH`}</span>
          </button>
        )}

        <div className="clean-simple-stats">
          <div><strong>{activeSetFound}/12</strong><span>THIS SET</span></div>
          <i />
          <div><strong>{formatNumber(game.packsOpened)}</strong><span>PACKS OPENED</span></div>
          <i />
          <div><strong>{formatNumber(derived.packStock)}</strong><span>PACKS READY</span></div>
        </div>
        <p className="clean-loop">Open cards. The binder earns cash. Cash buys more packs.</p>
      </section>

      {drawer && <button className="clean-drawer-scrim" aria-label="Close panel" onClick={() => setDrawer(null)} />}
      {drawer === "shop" && (
        <ShopDrawer
          game={game}
          onClose={() => setDrawer(null)}
          onBuy={handleBuy}
          onBreak={handleBreak}
          onUpgrade={handleUpgrade}
          onSet={handleSet}
          onReset={handleReset}
        />
      )}
      {drawer === "binder" && (
        <BinderDrawer
          game={game}
          setId={binderSetId}
          onSetId={setBinderSetId}
          onClose={() => setDrawer(null)}
          onCard={setSelectedCard}
        />
      )}

      {opening && (
        <div
          className={`opening-layer phase-${opening.phase} clean-opening ${opening.impact ? `screen-impact-${opening.impact.rarity}` : ""}`}
          style={{
            "--set-a": opening.result.set.colors[0],
            "--set-b": opening.result.set.colors[1],
            "--set-c": opening.result.set.colors[2],
          }}
        >
          <div className="opening-haze" />
          <div className="opening-topline">
            <span className="opening-set-name">{opening.result.set.name}</span>
            <div className="opening-progress" aria-label={`${opening.revealed.length} of 6 cards revealed`}>
              {opening.result.cards.map((pull, index) => (
                <i
                  key={`${pull.card.id}-${index}-progress`}
                  className={opening.revealed.includes(index) ? "revealed" : ""}
                  style={{ "--dot-color": RARITIES[pull.rarity].color }}
                />
              ))}
            </div>
            <small>{opening.revealed.length} / 6</small>
          </div>
          <div className="foil-pack-wrap">
            <div className="foil-half foil-top"><PackFace set={opening.result.set} /></div>
            <div className="foil-half foil-bottom"><PackFace set={opening.result.set} /></div>
            <span className="tear-ribbon">PACKWORKS / FACTORY WRAPPED</span>
            <span className="tear-shockwave" />
            <PackDebris />
          </div>
          <div className="reveal-deck">
            {opening.result.cards.map((pull, index) => (
              <RevealCard
                key={`${pull.card.id}-${index}`}
                pull={pull}
                index={index}
                count={opening.result.cards.length}
                revealed={opening.revealed.includes(index)}
                latest={opening.impact?.index === index}
                phase={opening.phase}
                onReveal={revealCard}
                onSelect={setSelectedCard}
                onSignal={signalCard}
              />
            ))}
          </div>
          {(opening.phase === "ready" || opening.phase === "complete") && (
            <div className="opening-instruction clean-opening-instruction">
              <strong>
                {opening.phase === "complete"
                  ? "PACK COMPLETE"
                  : spaceHeld
                    ? "SPACE HELD / REVEALING ONE BY ONE"
                    : "HOVER FOR RARITY / CLICK EACH CARD OR HOLD SPACE"}
              </strong>
            </div>
          )}
          <OpeningImpact impact={opening.impact} />
          {opening.phase === "summary" && (
            <div className="opening-summary pw-opening-summary clean-opening-summary">
              <div className="summary-total">
                <span>BINDER INCOME</span>
                <strong>+{rate(opening.result.incomeDelta)}/s</strong>
                <small>
                  {opening.result.cards.filter((pull) => pull.isNew).length} NEW / {opening.result.fusionEvents.length} STAR UPGRADES
                </small>
              </div>
              <div className="summary-actions">
                <button className="summary-secondary" onClick={closeOpening}>BACK TO TABLE</button>
                {getProductCount(game, game.activeSet, "loose") > 0 && (
                  <button className="summary-primary" onClick={beginManualOpen}>OPEN ANOTHER</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedCard && <CardDetail game={game} cardId={selectedCard} onClose={() => setSelectedCard(null)} />}

      <div className="clean-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <article key={toast.id} className={`tone-${toast.tone}`}>
            <strong>{toast.title}</strong><span>{toast.detail}</span>
          </article>
        ))}
      </div>

      {!ready && <div className="loading-screen"><span>PACKWORKS</span><i /></div>}
    </main>
  );
}
