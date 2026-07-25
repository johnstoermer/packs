"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACHIEVEMENTS,
  ALL_CARDS,
  RARITIES,
  SETS,
  UPGRADE_DEFS,
  formatNumber,
  formatRate,
  getCard,
  getSet,
} from "../lib/gameData";
import {
  SAVE_KEY,
  addPassiveIncome,
  applyOfflineProgress,
  buyUpgrade,
  claimContract,
  createInitialState,
  getContractProgress,
  getDerived,
  getReprintGain,
  hydrateState,
  maxAffordableUpgrade,
  performReprint,
  rollPack,
  selectSet,
  serializeState,
  unlockSet,
  upgradeCost,
} from "../lib/gameLogic";
import { createPackworksScene } from "../lib/scene";
import { createAudioEngine } from "../lib/audio";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ASSET_BASE = process.env.NEXT_PUBLIC_PACKWORKS_BASE || "";

const PLACE_SUBJECTS = new Set(["stand", "screen", "city", "garden", "coronation"]);
const RELIC_SUBJECTS = new Set(["relay", "locket", "star"]);
const MACHINE_SUBJECTS = new Set(["drone", "hopper", "warden", "crawler", "familiar", "ogre", "engine", "colossus"]);
const CHARACTER_SUBJECTS = new Set([
  "courier", "squire", "duelist", "revenant", "gardener", "page", "guard",
  "chancellor", "executioner", "herald", "queen",
]);

function getCardPresentation(card) {
  let kind = "CREATURE";
  if (PLACE_SUBJECTS.has(card.subject)) kind = "LANDMARK";
  else if (RELIC_SUBJECTS.has(card.subject)) kind = "RELIC";
  else if (MACHINE_SUBJECTS.has(card.subject)) kind = "MACHINE";
  else if (CHARACTER_SUBJECTS.has(card.subject)) kind = "CHARACTER";

  let treatment = "specimen";
  if (card.rarity === "legendary") treatment = "signature";
  else if (card.rarity === "epic") treatment = "panorama";
  else if (kind === "LANDMARK") treatment = "landmark";
  else if (kind === "RELIC" || kind === "MACHINE") treatment = "dossier";
  else if (card.number % 3 === 0) treatment = "story";

  return {
    kind,
    treatment,
    mark: String((card.number * 17 + RARITIES[card.rarity].order * 23) % 100).padStart(2, "0"),
  };
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
    <div
      className={small ? "pack-face small" : "pack-face"}
      style={{
        "--pack-a": set.colors[0],
        "--pack-b": set.colors[1],
        "--pack-c": set.colors[2],
      }}
    >
      <span className="pack-crimp top" />
      <span className="pack-series">PACKWORKS / {set.short}</span>
      <strong>{set.name}</strong>
      <span className="pack-glyph">
        <i />
        <i />
        <i />
      </span>
      <span className="pack-count">4 CARDS / FIRST PRINT</span>
      <span className="pack-crimp bottom" />
    </div>
  );
}

function RevealCard({ pull, index, count, revealed, latest, phase, onReveal, onSelect }) {
  const rarity = RARITIES[pull.rarity];
  const set = getSet(pull.card.setId);
  const presentation = getCardPresentation(pull.card);
  const spread = index - (count - 1) / 2;
  const dealt = !["sealed", "torn"].includes(phase);
  const canReveal = phase === "ready" && !revealed;
  return (
    <button
      type="button"
      className={`reveal-card count-${count} rarity-${pull.rarity} ${dealt ? "is-dealt" : ""} ${revealed ? "is-revealed" : ""} ${latest ? "is-impacting" : ""} ${canReveal ? "is-hoverable" : ""} ${pull.foil ? "is-foil" : ""} ${phase === "summary" ? "is-settled" : ""}`}
      style={{
        "--index": index,
        "--spread": spread,
        "--rarity": rarity.color,
        "--rarity-deep": rarity.deep,
        "--set-a": set.colors[0],
        "--set-b": set.colors[1],
        "--set-c": set.colors[2],
        "--deal-delay": `${index * 75}ms`,
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (canReveal) onReveal(index);
        else if (revealed && phase === "summary") onSelect(pull.card.id);
      }}
      tabIndex={canReveal || phase === "summary" ? 0 : -1}
      aria-label={revealed
        ? `${rarity.label} ${pull.card.name}${pull.foil ? ", foil" : ""}`
        : `Unrevealed card with a ${rarity.label.toLowerCase()} signal. Click to reveal.`}
    >
      <span className="reveal-card-inner">
        <span className="card-back">
          <span className="back-set">{set.short}</span>
          <span className="back-orbit"><i /><i /><i /></span>
          <span className="back-mark">PW</span>
          <span className="back-rule" />
          <span className="rarity-signal">
            <i />
            <b>{rarity.label}</b>
            <small>CLICK TO TURN</small>
          </span>
        </span>
        <span className={`card-front treatment-${presentation.treatment} set-${pull.card.setId}`}>
          <span className="card-head">
            <span>{pull.card.setId.toUpperCase()}-{String(pull.card.number).padStart(2, "0")}</span>
            <b>{rarity.short}</b>
          </span>
          <CardArt card={pull.card} />
          <span className="card-copy">
            <span className="card-type-line">{presentation.kind} / MARK {presentation.mark}</span>
            <strong>{pull.card.name}</strong>
            <small>{pull.card.flavor}</small>
          </span>
          <span className="card-foot">
            <span>{pull.isNew ? "NEW" : `COPY ${pull.dust ? `+${pull.dust}D` : ""}`}</span>
            <b>+{formatNumber(pull.value)}</b>
          </span>
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
          <i
            key={ray}
            style={{
              "--angle": `${ray * 18}deg`,
              "--ray-delay": `${(ray % 5) * 16}ms`,
            }}
          />
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

function Resource({ label, value, sub, accent }) {
  return (
    <div className="resource" style={accent ? { "--resource-accent": accent } : undefined}>
      <span className="resource-label">{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function ProgressBar({ value, max, color, label }) {
  const progress = max > 0 ? clamp(value / max, 0, 1) : 0;
  return (
    <div className="progress-wrap" aria-label={label}>
      <div className="progress-track">
        <span style={{ width: `${progress * 100}%`, background: color }} />
      </div>
      {label && <small>{label}</small>}
    </div>
  );
}

function ShopPanel({ game, buyMode, setBuyMode, onBuy }) {
  return (
    <div className="panel-scroll shop-panel">
      <div className="panel-intro" data-augmented-ui="br-clip border">
        <div>
          <span className="micro-label">WORKSHOP CATALOG</span>
          <h2>Build the line</h2>
        </div>
        <div className="buy-mode" aria-label="Purchase quantity">
          <button className={buyMode === 1 ? "active" : ""} onClick={() => setBuyMode(1)}>ONE</button>
          <button className={buyMode === "max" ? "active" : ""} onClick={() => setBuyMode("max")}>MAX</button>
        </div>
      </div>
      <div className="upgrade-list">
        {UPGRADE_DEFS.map((upgrade, index) => {
          const rank = game.upgrades[upgrade.id] || 0;
          const locked = game.packsOpened < upgrade.unlockAt;
          const maxed = rank >= upgrade.max;
          const quantity = buyMode === "max" ? maxAffordableUpgrade(game, upgrade.id) : 1;
          const cost = maxed ? 0 : upgradeCost(game, upgrade.id, Math.max(1, quantity));
          const affordable = quantity > 0 && game.coins >= cost;
          return (
            <article
              className={`upgrade-row ${locked ? "locked" : ""} ${maxed ? "maxed" : ""}`}
              key={upgrade.id}
              style={{ "--upgrade-index": index }}
            >
              <div className="upgrade-number">{String(index + 1).padStart(2, "0")}</div>
              <div className="upgrade-copy">
                <div className="upgrade-title">
                  <strong>{upgrade.name}</strong>
                  <span>{rank}/{upgrade.max}</span>
                </div>
                <p>{locked ? `Unlocks after ${upgrade.unlockAt} packs` : upgrade.label}</p>
                {!locked && <small>{upgrade.detail}</small>}
                <span className="rank-track">
                  <i style={{ width: `${(rank / upgrade.max) * 100}%` }} />
                </span>
              </div>
              <button
                className="buy-button"
                disabled={locked || maxed || !affordable}
                onClick={() => onBuy(upgrade.id, buyMode)}
              >
                <span>{maxed ? "BUILT" : quantity > 1 ? `BUY ${quantity}` : "BUILD"}</span>
                {!maxed && !locked && <b>{formatNumber(cost)}</b>}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function BinderPanel({ game, binderSetId, setBinderSetId, onCard }) {
  const set = getSet(binderSetId);
  const found = set.cards.filter((card) => game.collection[card.id]).length;
  return (
    <div className="panel-scroll binder-panel">
      <div className="panel-intro binder-heading" data-augmented-ui="br-clip border">
        <div>
          <span className="micro-label">ARCHIVE DRAWER</span>
          <h2>{set.name}</h2>
        </div>
        <div className="binder-count">
          <strong>{found}</strong>
          <span>/ 12</span>
        </div>
      </div>
      <div className="binder-set-tabs">
        {SETS.map((candidate) => (
          <button
            key={candidate.id}
            className={candidate.id === set.id ? "active" : ""}
            onClick={() => setBinderSetId(candidate.id)}
            style={{ "--set-color": candidate.colors[0] }}
          >
            {candidate.short}
          </button>
        ))}
      </div>
      <ProgressBar
        value={found}
        max={12}
        color={set.colors[0]}
        label={game.masteredSets[set.id] ? "MASTERED / +25% ALL VALUE" : `${12 - found} CARDS REMAIN`}
      />
      <div className="binder-grid">
        {set.cards.map((card) => {
          const count = game.collection[card.id] || 0;
          const foilCount = game.foils[card.id] || 0;
          const rarity = RARITIES[card.rarity];
          return (
            <button
              key={card.id}
              className={`binder-card ${count ? "found" : "missing"}`}
              style={{ "--rarity": rarity.color }}
              onClick={() => count && onCard(card.id)}
              disabled={!count}
              aria-label={count ? `${card.name}, ${count} copies` : `Missing card ${card.number}`}
            >
              {count ? <CardArt card={card} compact /> : <span className="card-silhouette">?</span>}
              <span className="binder-card-meta">
                <b>{String(card.number).padStart(2, "0")}</b>
                <small>{count ? card.name : "UNDISCOVERED"}</small>
              </span>
              {count > 1 && <i className="copy-count">x{count}</i>}
              {foilCount > 0 && <i className="mini-foil">F</i>}
            </button>
          );
        })}
      </div>
      <p className="binder-note">Completing a twelve-card print run permanently raises all card value by 25%.</p>
    </div>
  );
}

function GoalsPanel({ game, onClaim, onReprint }) {
  const plateGain = getReprintGain(game);
  return (
    <div className="panel-scroll goals-panel">
      <div className="panel-intro" data-augmented-ui="br-clip border">
        <div>
          <span className="micro-label">SHIFT BOARD</span>
          <h2>Orders & records</h2>
        </div>
      </div>
      <section className="panel-section">
        <div className="section-label">
          <span>OPEN ORDERS</span>
          <small>COMPLETE FOR CASH</small>
        </div>
        <div className="contract-list">
          {game.contracts.map((contract) => {
            const progress = getContractProgress(contract, game);
            const done = progress >= contract.target;
            return (
              <article className={`contract ${done ? "complete" : ""}`} key={contract.id}>
                <div className="contract-top">
                  <div>
                    <strong>{contract.title}</strong>
                    <p>{contract.detail}</p>
                  </div>
                  <b>+{formatNumber(contract.reward)}</b>
                </div>
                <ProgressBar
                  value={progress}
                  max={contract.target}
                  color={done ? "#62d4a2" : "#e7b85e"}
                  label={`${formatNumber(Math.min(progress, contract.target))} / ${formatNumber(contract.target)}`}
                />
                {done && <button onClick={() => onClaim(contract.id)}>STAMP COMPLETE</button>}
              </article>
            );
          })}
        </div>
      </section>
      <section className="panel-section">
        <div className="section-label">
          <span>WORKSHOP RECORDS</span>
          <small>{game.achievements.length} / {ACHIEVEMENTS.length}</small>
        </div>
        <div className="achievement-list">
          {ACHIEVEMENTS.map((achievement) => {
            const earned = game.achievements.includes(achievement.id);
            return (
              <div className={earned ? "earned" : ""} key={achievement.id}>
                <span className="record-stamp">{earned ? "FILED" : "—"}</span>
                <p><strong>{achievement.name}</strong><small>{achievement.detail}</small></p>
              </div>
            );
          })}
        </div>
      </section>
      <section className="reprint-box">
        <span className="micro-label">PERMANENT PRESS PLATES</span>
        <div className="plate-total"><strong>{game.plates}</strong><span>PLATES OWNED</span></div>
        <p>Begin a new edition. Cash, set access, and workshop upgrades reset. Your binder, records, dust, and permanent plates remain.</p>
        <div className="plate-effect">
          <span>Current effect</span>
          <b>+{game.plates * 15}% card value</b>
        </div>
        <button disabled={!plateGain} onClick={onReprint}>
          {plateGain ? `BEGIN REPRINT / +${plateGain} ${plateGain === 1 ? "PLATE" : "PLATES"}` : `EARN ${formatNumber(Math.max(0, 250_000 - game.runCoins))} MORE`}
        </button>
      </section>
    </div>
  );
}

function CardDetail({ cardId, game, onClose }) {
  const card = getCard(cardId);
  if (!card) return null;
  const set = getSet(card.setId);
  const rarity = RARITIES[card.rarity];
  const count = game.collection[card.id] || 0;
  const foils = game.foils[card.id] || 0;
  return (
    <div className="modal-scrim card-detail-scrim" onMouseDown={onClose}>
      <article
        className="card-detail"
        data-augmented-ui="tl-clip br-clip border"
        style={{ "--rarity": rarity.color, "--set-a": set.colors[0], "--set-b": set.colors[1] }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose}>CLOSE</button>
        <div className="detail-card-art">
          <CardArt card={card} />
          {foils > 0 && <span className="detail-foil-sheen" />}
        </div>
        <div className="detail-copy">
          <span className="micro-label">{set.name} / {set.short}-{String(card.number).padStart(2, "0")}</span>
          <h2>{card.name}</h2>
          <p className="detail-flavor">{card.flavor}</p>
          <div className="detail-rule" />
          <dl>
            <div><dt>RARITY</dt><dd style={{ color: rarity.color }}>{rarity.label}</dd></div>
            <div><dt>COPIES</dt><dd>{count}</dd></div>
            <div><dt>FOILS</dt><dd>{foils}</dd></div>
            <div><dt>BASE VALUE</dt><dd>{formatNumber(set.baseValue * rarity.value)}</dd></div>
          </dl>
        </div>
      </article>
    </div>
  );
}

export default function PackworksGame() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const audioRef = useRef(null);
  const gameRef = useRef(createInitialState(0));
  const openingTimersRef = useRef([]);
  const openingRevealLocksRef = useRef(new Set());
  const openingImpactSerialRef = useRef(0);
  const toastSerialRef = useRef(0);
  const [game, setGame] = useState(() => createInitialState(0));
  const [ready, setReady] = useState(false);
  const [introOpen, setIntroOpen] = useState(true);
  const [tab, setTab] = useState("shop");
  const [buyMode, setBuyMode] = useState(1);
  const [binderSetId, setBinderSetId] = useState("corner");
  const [opening, setOpening] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [offlineReport, setOfflineReport] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [reprintConfirm, setReprintConfirm] = useState(false);
  const [eraseConfirm, setEraseConfirm] = useState(false);
  const [toasts, setToasts] = useState([]);

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

  const pushToast = useCallback((title, detail, tone = "neutral", duration = 3300) => {
    const id = ++toastSerialRef.current;
    setToasts((current) => [...current.slice(-3), { id, title, detail, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, duration);
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
    setOfflineReport(offline.report);
    setIntroOpen(offline.state.packsOpened === 0);
    setBinderSetId(offline.state.activeSet);
    setReady(true);
  }, [commit]);

  useEffect(() => {
    if (!ready || !canvasRef.current) return undefined;
    sceneRef.current = createPackworksScene(canvasRef.current, () => gameRef.current);
    return () => {
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return undefined;
    const save = () => {
      try {
        window.localStorage.setItem(SAVE_KEY, serializeState(gameRef.current));
      } catch {
        // Local storage can be unavailable in strict privacy modes.
      }
    };
    const interval = window.setInterval(save, 5000);
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
    if (!ready || introOpen) return undefined;
    let last = performance.now();
    let autoAccumulator = 0;
    let passiveAccumulator = 0;
    const interval = window.setInterval(() => {
      const now = performance.now();
      const deltaSeconds = Math.min(0.5, Math.max(0, now - last) / 1000);
      last = now;
      let current = gameRef.current;
      let changed = false;
      if (current.streak > 0 && Date.now() - current.lastManualAt > 7000) {
        current = { ...current, streak: 0 };
        changed = true;
      }
      const derived = getDerived(current);
      autoAccumulator += derived.autoRate * deltaSeconds;
      passiveAccumulator += derived.passiveRate * deltaSeconds;
      let lastResult = null;
      let safety = 0;
      while (autoAccumulator >= 1 && safety < 20) {
        const rolled = rollPack(current, { manual: false });
        current = rolled.state;
        lastResult = rolled.result;
        autoAccumulator -= 1;
        safety += 1;
        changed = true;
        if (rolled.result.achievements.length) {
          for (const achievement of rolled.result.achievements) {
            pushToast("RECORD FILED", achievement.name, "gold");
          }
        }
        const legend = rolled.result.cards.find((pull) => pull.rarity === "legendary");
        if (legend) pushToast("AUTO LINE: LEGENDARY", legend.card.name, "legendary", 4600);
      }
      if (passiveAccumulator >= 1) {
        const whole = Math.floor(passiveAccumulator);
        current = addPassiveIncome(current, whole);
        passiveAccumulator -= whole;
        changed = true;
      }
      if (changed) commit(current);
      if (lastResult) sceneRef.current?.autoResult(lastResult);
    }, 100);
    return () => window.clearInterval(interval);
  }, [commit, introOpen, pushToast, ready]);

  const clearOpeningTimers = useCallback(() => {
    for (const timer of openingTimersRef.current) window.clearTimeout(timer);
    openingTimersRef.current = [];
  }, []);

  const closeOpening = useCallback(() => {
    clearOpeningTimers();
    openingRevealLocksRef.current.clear();
    setOpening(null);
    sceneRef.current?.setOpening(false);
  }, [clearOpeningTimers]);

  const revealCard = useCallback((index) => {
    if (!opening || opening.phase !== "ready" || opening.revealed.includes(index)) return;
    const revealKey = `${opening.id}-${index}`;
    if (openingRevealLocksRef.current.has(revealKey)) return;
    openingRevealLocksRef.current.add(revealKey);

    const pull = opening.result.cards[index];
    const rarity = RARITIES[pull.rarity];
    const revealed = [...opening.revealed, index];
    const isLast = revealed.length === opening.result.cards.length;
    const impact = {
      index,
      rarity: pull.rarity,
      foil: pull.foil,
      serial: ++openingImpactSerialRef.current,
    };

    setOpening((current) => {
      if (!current || current.id !== opening.id || current.revealed.includes(index)) return current;
      return {
        ...current,
        phase: isLast ? "complete" : "ready",
        revealed,
        impact,
      };
    });

    sceneRef.current?.burst(pull.rarity, rarity.order >= 3 ? 1.55 : 0.9);
    const audio = getAudio();
    audio.sound("reveal", rarity.order);
    if (pull.rarity === "legendary") audio.sound("legendary");

    if (isLast) {
      const settleDelay = gameRef.current.settings.quickOpen
        ? 220
        : pull.rarity === "legendary" ? 1500 : pull.rarity === "epic" ? 1050 : 720;
      openingTimersRef.current.push(window.setTimeout(() => {
        setOpening((current) => current?.id === opening.id
          ? { ...current, phase: "summary", impact: null }
          : current);
      }, settleDelay));
    }
  }, [getAudio, opening]);

  const beginManualOpen = useCallback(() => {
    if (!ready || introOpen || settingsOpen || reprintConfirm || selectedCard || offlineReport) return;
    if (opening && opening.phase !== "summary") return;
    clearOpeningTimers();
    openingRevealLocksRef.current.clear();
    const audio = getAudio();
    audio.ensure();
    audio.sound("pack");
    const rolled = rollPack(gameRef.current, { manual: true, now: Date.now() });
    commit(rolled.state);
    setBinderSetId(rolled.state.activeSet);
    sceneRef.current?.packPulse();
    sceneRef.current?.setOpening(true);
    const openingId = `${Date.now()}-${rolled.state.packsOpened}`;
    setOpening({ id: openingId, result: rolled.result, phase: "sealed", revealed: [], impact: null });

    const quick = rolled.state.settings.quickOpen || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tearDelay = quick ? 40 : 260;
    const dealDelay = quick ? 120 : 760;
    openingTimersRef.current.push(window.setTimeout(() => {
      setOpening((current) => current?.id === openingId ? { ...current, phase: "torn" } : current);
      audio.sound("tear");
    }, tearDelay));

    openingTimersRef.current.push(window.setTimeout(() => {
      setOpening((current) => current?.id === openingId ? { ...current, phase: "ready" } : current);
    }, dealDelay));

    for (const achievement of rolled.result.achievements) {
      pushToast("RECORD FILED", achievement.name, "gold");
    }
    if (rolled.result.newlyMastered) {
      pushToast("PRINT RUN COMPLETE", `${rolled.result.set.name} now grants +25% value`, "legendary", 5200);
    }
  }, [
    clearOpeningTimers,
    commit,
    getAudio,
    introOpen,
    opening,
    offlineReport,
    pushToast,
    ready,
    reprintConfirm,
    selectedCard,
    settingsOpen,
  ]);

  useEffect(() => () => clearOpeningTimers(), [clearOpeningTimers]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        beginManualOpen();
      } else if (event.key.toLowerCase() === "b") {
        setTab("binder");
        setMobilePanelOpen(true);
      } else if (event.key.toLowerCase() === "s") {
        setTab("shop");
        setMobilePanelOpen(true);
      } else if (event.key.toLowerCase() === "g") {
        setTab("goals");
        setMobilePanelOpen(true);
      } else if (event.key.toLowerCase() === "m") {
        commit((current) => ({
          ...current,
          settings: { ...current.settings, sound: !current.settings.sound },
        }));
      } else if (event.key === "Escape") {
        if (selectedCard) setSelectedCard(null);
        else if (settingsOpen) setSettingsOpen(false);
        else if (opening?.phase === "summary") closeOpening();
        else setMobilePanelOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beginManualOpen, closeOpening, commit, opening, selectedCard, settingsOpen]);

  useEffect(() => {
    audioRef.current?.setEnabled(game.settings.sound);
  }, [game.settings.sound]);

  const derived = useMemo(() => getDerived(game), [game]);
  const activeSet = getSet(game.activeSet);
  const discoveredInSet = activeSet.cards.filter((card) => game.collection[card.id]).length;
  const activeStreak = Date.now() - game.lastManualAt <= 7000 ? game.streak : 0;

  const handleBuy = useCallback((upgradeId, mode) => {
    const current = gameRef.current;
    const quantity = mode === "max" ? maxAffordableUpgrade(current, upgradeId) : 1;
    if (!quantity) {
      getAudio().sound("deny");
      return;
    }
    const next = buyUpgrade(current, upgradeId, quantity);
    if (next === current) {
      getAudio().sound("deny");
      return;
    }
    commit(next);
    getAudio().sound("buy");
    sceneRef.current?.purchase();
  }, [commit, getAudio]);

  const handleSet = useCallback((setId) => {
    const current = gameRef.current;
    if (current.unlockedSets.includes(setId)) {
      const next = selectSet(current, setId);
      commit(next);
      setBinderSetId(setId);
      sceneRef.current?.purchase();
      return;
    }
    const set = getSet(setId);
    const next = unlockSet(current, setId);
    if (next === current) {
      getAudio().sound("deny");
      pushToast("PRINT RUN LOCKED", `Requires ${formatNumber(set.unlockCost)} cash`, "warning");
      return;
    }
    commit(next);
    setBinderSetId(setId);
    getAudio().sound("contract");
    sceneRef.current?.burst("epic", 1.3);
    pushToast("NEW PRINT RUN", set.name, "gold", 4300);
  }, [commit, getAudio, pushToast]);

  const handleClaim = useCallback((contractId) => {
    const result = claimContract(gameRef.current, contractId);
    if (!result.claimed) return;
    commit(result.state);
    getAudio().sound("contract");
    sceneRef.current?.purchase();
    pushToast("ORDER STAMPED", `+${formatNumber(result.claimed.reward)} cash`, "success");
  }, [commit, getAudio, pushToast]);

  const executeReprint = useCallback(() => {
    const gain = getReprintGain(gameRef.current);
    if (!gain) return;
    const next = performReprint(gameRef.current);
    commit(next);
    setReprintConfirm(false);
    setTab("shop");
    setBinderSetId("corner");
    closeOpening();
    getAudio().sound("legendary");
    sceneRef.current?.burst("legendary", 2);
    pushToast("NEW EDITION STARTED", `${gain} permanent ${gain === 1 ? "plate" : "plates"} installed`, "legendary", 6000);
  }, [closeOpening, commit, getAudio, pushToast]);

  const toggleSetting = useCallback((key) => {
    commit((current) => ({
      ...current,
      settings: { ...current.settings, [key]: !current.settings[key] },
    }));
    getAudio().sound("buy");
  }, [commit, getAudio]);

  const eraseSave = useCallback(() => {
    if (!eraseConfirm) {
      setEraseConfirm(true);
      return;
    }
    window.localStorage.removeItem(SAVE_KEY);
    const fresh = createInitialState(Date.now());
    commit(fresh);
    setEraseConfirm(false);
    setSettingsOpen(false);
    setIntroOpen(true);
    setTab("shop");
    setBinderSetId("corner");
    closeOpening();
  }, [closeOpening, commit, eraseConfirm]);

  return (
    <main className={`packworks ${game.settings.reducedEffects ? "reduced-effects" : ""} ${opening ? "opening-active" : ""}`}>
      <header className="topbar">
        <div className="wordmark">
          <span className="wordmark-cube"><i /><i /><i /></span>
          <div><strong>PACKWORKS</strong><small>CARD WORKSHOP / DISTRICT 04</small></div>
        </div>
        <div className="resource-row">
          <Resource label="CASH" value={formatNumber(game.coins)} sub={`+${formatNumber(derived.passiveRate)}/s retail`} accent="#f0c667" />
          <Resource label="LINE SPEED" value={`${formatRate(derived.autoRate)}/s`} sub={`${formatNumber(game.packsOpened)} packs opened`} accent="#65d1c0" />
          <Resource label="BINDER" value={`${derived.discoveredCount}/60`} sub={`${derived.masteryCount} print runs mastered`} accent="#e77950" />
          <Resource label="PLATES" value={game.plates} sub={`+${game.plates * 15}% permanent value`} accent="#b984f2" />
        </div>
        <div className="top-actions">
          <button
            className={game.settings.sound ? "active" : ""}
            onClick={() => toggleSetting("sound")}
            aria-label={game.settings.sound ? "Mute audio" : "Enable audio"}
          >
            AUDIO {game.settings.sound ? "ON" : "OFF"}
          </button>
          <button onClick={() => setSettingsOpen(true)}>OPTIONS</button>
        </div>
      </header>

      <div className="workspace">
        <section
          className="scene-shell"
          onPointerMove={(event) => sceneRef.current?.setPointer(event.clientX, event.clientY)}
        >
          <canvas
            ref={canvasRef}
            className="scene-canvas"
            aria-label="Animated isometric card workshop"
            onClick={() => !opening && beginManualOpen()}
          />
          <div className="scene-corner-label">
            <span>ACTIVE PRINT RUN</span>
            <strong>{activeSet.name}</strong>
            <small>{activeSet.tagline}</small>
          </div>
          <div
            className={`streak-panel ${activeStreak > 1 ? "active" : ""}`}
            data-augmented-ui="tl-clip br-clip border"
          >
            <div><span>OPENING STREAK</span><strong>x{(1 + activeStreak * 0.045).toFixed(2)}</strong></div>
            <ProgressBar value={activeStreak} max={25} color={activeSet.colors[0]} />
            <small>{activeStreak ? "Open within seven seconds to keep the counter alive" : "Manual packs build a value streak"}</small>
          </div>
          <div className="scene-status">
            <span className={`status-light ${derived.autoRate > 0 ? "running" : ""}`} />
            <span>{derived.autoRate > 0 ? "SORTING LINE RUNNING" : "SORTING LINE IDLE"}</span>
            <b>{derived.autoRate > 0 ? `${formatRate(derived.autoRate)} PACKS / SEC` : "BUILD A TABLETOP SORTER"}</b>
          </div>
          <button
            className="open-pack-button"
            data-augmented-ui="tl-clip br-clip both"
            onClick={(event) => { event.stopPropagation(); beginManualOpen(); }}
          >
            <span className="open-key">SPACE</span>
            <span className="open-copy"><small>MANUAL BREAK</small><strong>OPEN PACK</strong></span>
            <span className="open-value">x{derived.manualMultiplier.toFixed(2)}<small>VALUE</small></span>
          </button>
          <button
            className="mobile-panel-toggle"
            onClick={() => setMobilePanelOpen((value) => !value)}
          >
            {mobilePanelOpen ? "CLOSE PANEL" : `${tab.toUpperCase()} PANEL`}
          </button>
        </section>

        <aside className={`side-panel ${mobilePanelOpen ? "mobile-open" : ""}`}>
          <nav className="panel-tabs" aria-label="Workshop panels">
            {[
              ["shop", "SHOP", "S"],
              ["binder", "BINDER", "B"],
              ["goals", "ORDERS", "G"],
            ].map(([id, label, key]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                <span>{label}</span><kbd>{key}</kbd>
              </button>
            ))}
          </nav>
          <div className="panel-body">
            {tab === "shop" && <ShopPanel game={game} buyMode={buyMode} setBuyMode={setBuyMode} onBuy={handleBuy} />}
            {tab === "binder" && (
              <BinderPanel
                game={game}
                binderSetId={binderSetId}
                setBinderSetId={setBinderSetId}
                onCard={setSelectedCard}
              />
            )}
            {tab === "goals" && <GoalsPanel game={game} onClaim={handleClaim} onReprint={() => setReprintConfirm(true)} />}
          </div>
        </aside>
      </div>

      <footer className="set-dock">
        <div className="dock-label"><span>PRINT RUNS</span><small>SELECT STOCK FOR MANUAL AND AUTOMATIC OPENING</small></div>
        <div className="set-list">
          {SETS.map((set, index) => {
            const unlocked = game.unlockedSets.includes(set.id);
            const selected = game.activeSet === set.id;
            const found = set.cards.filter((card) => game.collection[card.id]).length;
            const nextLocked = !unlocked;
            return (
              <button
                key={set.id}
                data-augmented-ui="tl-clip br-clip border"
                className={`${selected ? "selected" : ""} ${unlocked ? "unlocked" : "locked"} ${game.masteredSets[set.id] ? "mastered" : ""}`}
                style={{ "--set-a": set.colors[0], "--set-b": set.colors[1], "--set-c": set.colors[2] }}
                onClick={() => handleSet(set.id)}
              >
                <span className="set-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="set-swatch"><i /><i /><i /></span>
                <span className="set-copy">
                  <strong>{set.name}</strong>
                  <small>{unlocked ? `${found}/12 FOUND` : `UNLOCK ${formatNumber(set.unlockCost)}`}</small>
                </span>
                <span className="set-progress"><i style={{ width: `${(found / 12) * 100}%` }} /></span>
                {game.masteredSets[set.id] && <span className="master-stamp">MASTERED</span>}
                {nextLocked && <span className="lock-plate">LOCKED</span>}
              </button>
            );
          })}
        </div>
        <div className="dock-stats">
          <span>RUN CASH <b>{formatNumber(game.runCoins)}</b></span>
          <span>DUPLICATE DUST <b>{formatNumber(game.dust)}</b></span>
        </div>
      </footer>

      {opening && (
        <div
          className={`opening-layer phase-${opening.phase} ${opening.impact ? `screen-impact-${opening.impact.rarity}` : ""}`}
          style={{
            "--set-a": opening.result.set.colors[0],
            "--set-b": opening.result.set.colors[1],
            "--set-c": opening.result.set.colors[2],
          }}
        >
          <div className="opening-haze" />
          <div className="opening-topline">
            <span className="opening-set-name">
              {opening.result.set.name}<i> / FRESH BREAK</i>
            </span>
            <div className="opening-progress" aria-label={`${opening.revealed.length} of ${opening.result.cards.length} cards revealed`}>
              {opening.result.cards.map((pull, index) => (
                <i
                  key={`${pull.card.id}-progress`}
                  className={opening.revealed.includes(index) ? "revealed" : ""}
                  style={{ "--dot-color": RARITIES[pull.rarity].color }}
                />
              ))}
            </div>
            <small>
              {opening.phase === "summary"
                ? "BREAK COMPLETE"
                : opening.phase === "ready"
                  ? `${opening.revealed.length}/${opening.result.cards.length} TURNED / HOVER FOR SIGNAL`
                  : opening.phase === "complete"
                    ? "FINAL PULL FILED"
                    : "BREAKING FACTORY SEAL"}
            </small>
          </div>
          <div className="foil-pack-wrap">
            <div className="foil-half foil-top"><PackFace set={opening.result.set} /></div>
            <div className="foil-half foil-bottom"><PackFace set={opening.result.set} /></div>
            <span className="tear-ribbon">PW / AUTHENTIC PRINT</span>
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
              />
            ))}
          </div>
          {(opening.phase === "ready" || opening.phase === "complete") && (
            <div className="opening-instruction">
              <span>RARITY SIGNAL</span>
              <strong>{opening.phase === "complete" ? "PACK COMPLETE" : "HOVER A CARD, THEN CLICK TO TURN"}</strong>
            </div>
          )}
          <OpeningImpact impact={opening.impact} />
          {opening.phase === "summary" && (
            <div className="opening-summary" data-augmented-ui="tl-clip tr-clip border">
              <div className="summary-total">
                <span>PACK VALUE</span>
                <strong>+{formatNumber(opening.result.totalValue)}</strong>
                <small>{opening.result.totalDust ? `+${formatNumber(opening.result.totalDust)} DUPLICATE DUST` : "ALL PULLS FILED TO BINDER"}</small>
              </div>
              <div className="summary-actions">
                <button className="summary-secondary" onClick={closeOpening}>BACK TO SHOP <kbd>ESC</kbd></button>
                <button className="summary-primary" onClick={(event) => { event.stopPropagation(); beginManualOpen(); }}>
                  OPEN ANOTHER <kbd>SPACE</kbd>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {introOpen && ready && (
        <div className="intro-screen">
          <div className="intro-atmosphere" />
          <div className="intro-layout">
            <section className="intro-copy">
              <span className="intro-kicker">NIGHT SHIFT / FIRST EDITION</span>
              <h1>PACK<br /><i>WORKS</i></h1>
              <p>Crack the foil. Build the binder. Turn one sorting table into the finest card workshop in the district.</p>
              <button
                onClick={() => {
                  setIntroOpen(false);
                  getAudio().ensure();
                  getAudio().sound("start");
                }}
              >
                OPEN THE WORKSHOP <span>ENTER</span>
              </button>
              <div className="intro-notes">
                <span><b>01</b> OPEN PACKS</span>
                <span><b>02</b> BUILD THE LINE</span>
                <span><b>03</b> MASTER THE PRINT RUNS</span>
              </div>
            </section>
            <section className="intro-pack">
              <div className="intro-pack-shadow" />
              <PackFace set={SETS[0]} />
              <div className="intro-ticket">
                <span>STARTER STOCK</span>
                <strong>NO COST</strong>
                <small>4 CARDS / GUARANTEED UNCOMMON</small>
              </div>
            </section>
          </div>
          <div className="intro-footer"><span>PACKWORKS TRADING CO.</span><span>LOCAL SAVE / OFFLINE PRODUCTION</span></div>
        </div>
      )}

      {offlineReport && (
        <div className="modal-scrim">
          <article className="offline-card">
            <span className="micro-label">OVERNIGHT LEDGER</span>
            <h2>The line kept moving.</h2>
            <div className="offline-numbers">
              <div><strong>+{formatNumber(offlineReport.coins)}</strong><span>CASH EARNED</span></div>
              <div><strong>{formatNumber(offlineReport.packs)}</strong><span>PACKS SORTED</span></div>
            </div>
            <p>Offline production is estimated from your active print run and capped at eight hours.</p>
            <button onClick={() => setOfflineReport(null)}>STAMP & CONTINUE</button>
          </article>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-scrim" onMouseDown={() => setSettingsOpen(false)}>
          <article className="settings-card" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSettingsOpen(false)}>CLOSE</button>
            <span className="micro-label">WORKSHOP CONTROLS</span>
            <h2>Options</h2>
            <div className="settings-list">
              <button onClick={() => toggleSetting("sound")}>
                <span><strong>Workshop audio</strong><small>Synthesized foil, cards, and machinery</small></span>
                <b>{game.settings.sound ? "ON" : "OFF"}</b>
              </button>
              <button onClick={() => toggleSetting("quickOpen")}>
                <span><strong>Quick opening</strong><small>Shortens the foil break; cards still turn individually</small></span>
                <b>{game.settings.quickOpen ? "ON" : "OFF"}</b>
              </button>
              <button onClick={() => toggleSetting("reducedEffects")}>
                <span><strong>Reduced effects</strong><small>Limits flashes, particles, and scene motion</small></span>
                <b>{game.settings.reducedEffects ? "ON" : "OFF"}</b>
              </button>
            </div>
            <div className="controls-reference">
              <span><kbd>SPACE</kbd> OPEN PACK</span>
              <span><kbd>S</kbd> SHOP</span>
              <span><kbd>B</kbd> BINDER</span>
              <span><kbd>G</kbd> ORDERS</span>
              <span><kbd>M</kbd> AUDIO</span>
            </div>
            <button className={`erase-button ${eraseConfirm ? "confirm" : ""}`} onClick={eraseSave}>
              {eraseConfirm ? "CONFIRM: ERASE ALL PROGRESS" : "ERASE LOCAL SAVE"}
            </button>
          </article>
        </div>
      )}

      {reprintConfirm && (
        <div className="modal-scrim" onMouseDown={() => setReprintConfirm(false)}>
          <article className="reprint-confirm" onMouseDown={(event) => event.stopPropagation()}>
            <span className="micro-label">PRESS PLATE INSTALLATION</span>
            <h2>Begin a new edition?</h2>
            <p>Your cash, unlocked print runs, and workshop upgrade ranks reset. The binder, dust, records, and permanent plates remain.</p>
            <div className="reprint-exchange">
              <span>{formatNumber(game.runCoins)} RUN CASH</span>
              <i>FOR</i>
              <strong>+{getReprintGain(game)} {getReprintGain(game) === 1 ? "PLATE" : "PLATES"}</strong>
            </div>
            <div className="confirm-actions">
              <button onClick={() => setReprintConfirm(false)}>KEEP THIS EDITION</button>
              <button onClick={executeReprint}>BEGIN REPRINT</button>
            </div>
          </article>
        </div>
      )}

      {selectedCard && <CardDetail cardId={selectedCard} game={game} onClose={() => setSelectedCard(null)} />}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <article className={`toast tone-${toast.tone}`} key={toast.id}>
            <span />
            <div><strong>{toast.title}</strong><small>{toast.detail}</small></div>
          </article>
        ))}
      </div>

      {!ready && <div className="loading-screen"><span>PACKWORKS</span><i /></div>}
    </main>
  );
}
