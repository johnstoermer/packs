"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_CARDS,
  CLEAN_UPGRADES,
  PACK_PRODUCTS,
  RARITIES,
  SETS,
  formatNumber,
  getCard,
  getSet,
} from "../lib/gameData";
import {
  ADMIN_FLAG_KEY,
  ADMIN_SAVE_KEY,
  SAVE_KEY,
  applyAdminGuarantees,
  applyOfflineProgress,
  createAdminState,
  breakProduct,
  buyProduct,
  buyUpgrade,
  canRewrite,
  chooseDiscoverOption,
  createInitialState,
  dismissDiscoverOffer,
  displayCard,
  evaluateIdleThresholds,
  getCardSaleValue,
  getCardValue,
  getDerived,
  getDuplicateCount,
  getDuplicateSaleValue,
  getInscriptionsEarned,
  getPackPrice,
  getProductCount,
  getSetUnlockStatus,
  getUpgradeCost,
  hydrateState,
  openPack,
  resolveFusions,
  revealPackCard,
  rewriteState,
  selectSet,
  sellDuplicatesDetailed,
  serializeState,
  storedSaveDominates,
  tickEconomy,
  undisplayCard,
} from "../lib/gameLogic";
import {
  CASE_SIZE,
  DISCOVER_POOL,
  KINGS,
  describeCard,
  getCardDef,
  getCaseSlots,
} from "../lib/engineCards";
import { createAudioEngine } from "../lib/audio";

const ASSET_BASE = process.env.NEXT_PUBLIC_PACKWORKS_BASE || "";
const SHOP_PRODUCTS = PACK_PRODUCTS.filter((product) => ["loose", "case"].includes(product.id));
const CASE_PRODUCT = PACK_PRODUCTS.find((product) => product.id === "case");
const PLACE_SUBJECTS = new Set(["stand", "screen", "city", "garden", "coronation"]);
const RELIC_SUBJECTS = new Set(["relay", "locket", "star"]);
const MACHINE_SUBJECTS = new Set(["drone", "hopper", "warden", "crawler", "familiar", "ogre", "engine", "colossus"]);

function money(value) {
  return formatNumber(Math.round(Number(value) || 0));
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
  // Art is filed under the legacy print a card was reprinted from.
  const artKey = card.legacy || card.id;
  const artAt = artKey.lastIndexOf("-");
  const artPath = `${ASSET_BASE}/card-art/${artKey.slice(0, artAt)}/${artKey.slice(artAt + 1)}.webp`;
  return (
    <span
      className={`card-art ${compact ? "compact" : ""}`}
      role="img"
      aria-label={`${card.name}, an original card illustration`}
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
      <strong>{set.name}</strong>
      <span className="pack-glyph"><i /><i /><i /></span>
      <span className="pack-count">6 CARDS</span>
      <span className="pack-series">PACKWORKS / {set.short}</span>
      <span className="pack-crimp bottom" />
    </span>
  );
}

function RevealCard({
  pull,
  index,
  count,
  perRow,
  rows,
  shrink,
  initialCount,
  revealed,
  echo,
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
  const row = Math.floor(index / perRow);
  const colsInRow = Math.min(perRow, count - row * perRow);
  const spread = (index - row * perRow) - (colsInRow - 1) / 2;
  const rowOffset = row - (rows - 1) / 2;
  const copyLabel = pull.isNew ? "NEW" : "DUPLICATE";

  return (
    <button
      type="button"
      data-reveal-index={index}
      className={`reveal-card count-${count} rarity-${pull.rarity} ${dealt ? "is-dealt" : ""} ${revealed ? "is-revealed" : ""} ${latest ? "is-impacting" : ""} ${canReveal ? "is-hoverable" : ""} ${pull.foil ? "is-foil" : ""} ${phase === "summary" ? "is-settled" : ""} ${pull.marked && !revealed ? "is-marked" : ""} ${pull.transmuted && !revealed ? "is-transmuted" : ""} ${pull.fusedAway ? "is-fused-away" : ""} ${pull.fromMystery ? "is-mystery" : ""}`}
      style={{
        "--index": index,
        "--spread": spread,
        "--rowoff": rowOffset,
        "--shrink": shrink,
        "--rarity": rarity.color,
        "--rarity-deep": rarity.deep,
        "--signal": signal.color,
        "--set-a": set.colors[0],
        "--set-b": set.colors[1],
        "--set-c": set.colors[2],
        // Cards that join an in-progress reveal (Mystery bursts, Fusion
        // results, encores) deal in immediately with a short stagger instead
        // of waiting out the whole board's delay chain.
        "--deal-delay": initialCount != null && index >= initialCount
          ? `${((index - initialCount) % 6) * 80}ms`
          : `${Math.min(index * 95, 4_000)}ms`,
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
      {echo && (
        <span key={echo.serial} className="reveal-echo" style={{ "--echo-count": Math.min(4, echo.count) }} aria-hidden="true">
          <i className="reveal-echo-flash" />
          <b className="reveal-echo-chip">ECHO{echo.count > 1 ? ` ×${echo.count}` : ""}</b>
        </span>
      )}
      <span className="reveal-card-inner">
        <span className="card-back">
          <span className="back-set">{set.short}</span>
          <span className="back-orbit"><i /><i /><i /></span>
          <span className="back-mark">PW</span>
          <span className="back-rule" />
          <span className="rarity-signal" style={{ "--rarity": signal.color }}>
            <i />
            <b>{signal.label}</b>
            <small>{signal.rateLabel} BASE / CLICK TO REVEAL</small>
          </span>
        </span>
        <span className={`card-front treatment-${presentation.treatment} set-${pull.card.setId}`}>
          <span className="card-head">
            <span>{set.short}-{String(pull.card.number).padStart(2, "0")}</span>
            <b>{rarity.short}</b>
          </span>
          <CardArt card={pull.card} />
          <span className="card-copy">
            <span className="card-type-line">{rarity.label} / {rarity.rateLabel} / {presentation.kind}</span>
            <strong>{pull.card.name}</strong>
            <small>{pull.card.flavor}</small>
          </span>
          <span className="card-foot">
            <span>{copyLabel}</span>
            <b>{rarity.label}</b>
          </span>
          {pull.misprintDetected && <span className="pw-misprint-stamp">MISPRINT</span>}
          {pull.foil && <span className="foil-stamp">FOIL</span>}
          <span className="rarity-border-fx" aria-hidden="true">
            {Array.from({ length: 12 }, (_, point) => <i key={point} />)}
          </span>
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

function RepeatPurchaseButton({ disabled, onPurchase, ariaLabel, children }) {
  const holdTimerRef = useRef(null);
  const repeatTimerRef = useRef(null);
  const startPointRef = useRef(null);
  const repeatedRef = useRef(false);
  const movedRef = useRef(false);
  const [repeating, setRepeating] = useState(false);

  const clearTimers = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (repeatTimerRef.current !== null) {
      window.clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
    setRepeating(false);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const stop = useCallback((event) => {
    clearTimers();
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [clearTimers]);

  return (
    <button
      type="button"
      className={`clean-hold-buy ${repeating ? "is-repeating" : ""}`}
      disabled={disabled}
      aria-label={ariaLabel}
      title="Tap to buy one. Hold to buy rapidly."
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        startPointRef.current = { x: event.clientX, y: event.clientY };
        repeatedRef.current = false;
        movedRef.current = false;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        holdTimerRef.current = window.setTimeout(() => {
          repeatedRef.current = true;
          setRepeating(true);
          if (onPurchase(true) === false) {
            clearTimers();
            return;
          }
          repeatTimerRef.current = window.setInterval(() => {
            if (onPurchase(true) === false) clearTimers();
          }, 110);
        }, 340);
      }}
      onPointerMove={(event) => {
        if (!startPointRef.current || repeatedRef.current) return;
        const distance = Math.hypot(
          event.clientX - startPointRef.current.x,
          event.clientY - startPointRef.current.y,
        );
        if (distance > 12) {
          movedRef.current = true;
          clearTimers();
        }
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={clearTimers}
      onClick={(event) => {
        if (repeatedRef.current || movedRef.current) {
          event.preventDefault();
          repeatedRef.current = false;
          movedRef.current = false;
          return;
        }
        onPurchase(false);
      }}
    >
      {children}
    </button>
  );
}

function ShopDrawer({ game, onClose, onBuy, onBreak, onUpgrade, onSet, onReset }) {
  const unlockedUpgrades = CLEAN_UPGRADES.filter((upgrade) => game.packsOpened >= upgrade.unlockPacks);
  const nextUpgrade = CLEAN_UPGRADES.find((upgrade) => game.packsOpened < upgrade.unlockPacks);
  const caseAvailable = CASE_PRODUCT && CASE_PRODUCT.unlockBeat <= game.beat;
  const caseOwned = caseAvailable ? getProductCount(game, game.activeSet, CASE_PRODUCT.id) : 0;
  const casePrice = caseAvailable ? getPackPrice(game, CASE_PRODUCT.id, game.activeSet) : 0;
  const activeSet = getSet(game.activeSet);

  return (
    <aside className="clean-drawer" aria-label="Shop">
      <header>
        <div><span>SHOP</span><h2>Pack shop</h2></div>
        <button onClick={onClose} aria-label="Close shop">CLOSE</button>
      </header>

      <div className="clean-drawer-scroll">
        <section className="clean-product-list clean-pack-shelf">
          <div className="clean-section-title"><h3>Pack sets</h3><span>HOLD PRICE TO STOCK UP</span></div>
          {SETS.map((set) => {
            const status = getSetUnlockStatus(game, set.id);
            const unlocked = status.unlocked;
            const price = getPackPrice(game, "loose", set.id);
            const owned = getProductCount(game, set.id, "loose");
            const found = set.cards.filter((card) => game.collection[card.id]).length;
            const unmet = status.requirements.filter((requirement) => !requirement.met);
            return (
              <article
                className={`clean-product clean-set-stock ${unlocked ? "is-stocked" : "is-locked"} ${set.id === game.activeSet ? "is-active" : ""}`}
                key={set.id}
                style={{ "--stock-a": set.colors[0], "--stock-b": set.colors[1], "--stock-c": set.colors[2] }}
              >
                <div className="clean-product-icon loose"><i /><i /><i /></div>
                <button
                  className="clean-stock-info"
                  disabled={!unlocked}
                  onClick={() => onSet(set.id)}
                  aria-label={unlocked ? `Select ${set.name}` : undefined}
                >
                  <h3>{set.name}</h3>
                  <p>
                    {unlocked
                      ? `${found}/${set.cards.length} found${set.id === game.activeSet ? " / selected" : ""}`
                      : unmet.map((requirement) => `${requirement.label} ${requirement.current}/${requirement.target}`).join(" / ")}
                  </p>
                </button>
                <span className="clean-owned">{owned ? `${owned} owned` : ""}</span>
                <RepeatPurchaseButton
                  disabled={!unlocked || game.coins < price}
                  onPurchase={() => onBuy("loose", set.id)}
                  ariaLabel={unlocked ? `Buy ${set.name} pack for ${money(price)}. Hold to buy rapidly.` : `${set.name} locked`}
                >
                  {unlocked ? money(price) : "LOCKED"}
                </RepeatPurchaseButton>
              </article>
            );
          })}
        </section>

        {caseAvailable && (
          <section className="clean-product-list clean-case-stock">
            <div className="clean-section-title"><h3>Case</h3><span>{activeSet.short} / 144 PACKS</span></div>
            <article
              className="clean-product"
              style={{ "--stock-a": activeSet.colors[0], "--stock-b": activeSet.colors[1], "--stock-c": activeSet.colors[2] }}
            >
              <div className="clean-product-icon case"><i /><i /><i /></div>
              <div><h3>{activeSet.name} case</h3><p>144 packs</p></div>
              <span className="clean-owned">{caseOwned ? `${caseOwned} owned` : ""}</span>
              <button disabled={game.coins < casePrice} onClick={() => onBuy("case", game.activeSet)}>
                {money(casePrice)}
              </button>
              {caseOwned > 0 && (
                <button className="clean-break" onClick={() => onBreak("case")}>BREAK ONE</button>
              )}
            </article>
          </section>
        )}

        <section className="clean-upgrades">
          <div className="clean-section-title"><h3>Upgrades</h3></div>
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

function BinderDrawer({ game, setId, onSetId, onClose, onCard, displayedIds }) {
  const set = getSet(setId);
  const unlockedSets = SETS.filter((candidate) => game.unlockedSets.includes(candidate.id));
  const found = set.cards.filter((card) => game.collection[card.id]).length;
  const setDuplicates = set.cards.reduce(
    (sum, card) => sum + Math.max(0, (game.collection[card.id] || 0) - 1),
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
        <strong>{found} / {set.cards.length}</strong>
        <span>COLLECTED</span>
        <strong>{formatNumber(setDuplicates)}</strong>
        <span>DUPLICATES</span>
      </div>
      <div className="clean-binder-grid">
        {set.cards.map((card) => {
          const count = game.collection[card.id] || 0;
          const rarityId = card.rarity;
          const rarity = RARITIES[rarityId];
          return (
            <button
              key={card.id}
              className={`${count ? "found" : "missing"} rarity-${rarityId}`}
              onClick={() => onCard(card.id)}
              style={{ "--rarity": rarity.color }}
              aria-label={count ? `${card.name}, ${count} copies` : `Missing card ${card.number}, show rarity`}
            >
              {count ? <CardArt card={card} compact /> : <span className="clean-missing-card">PW</span>}
              <span className="clean-binder-card-copy">
                <b>{count ? card.name : `Card ${String(card.number).padStart(2, "0")}`}</b>
                <small>{count ? `${rarity.label} ${rarity.rateLabel} / ${count} ${count === 1 ? "copy" : "copies"}` : "Not found"}</small>
                {displayedIds?.has(card.id) && <em className="clean-on-display">ON DISPLAY</em>}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function CardDetail({ game, derived, cardId, onClose, onDisplay, onUndisplay }) {
  const card = getCard(cardId);
  if (!card) return null;
  const rarityId = card.rarity;
  const rarity = RARITIES[rarityId];
  const count = game.collection[card.id] || 0;
  const duplicateValue = Math.ceil(getCardSaleValue(game, card.id) * (1 + (game.upgrades?.shelf || 0) * 0.2));
  const def = getCardDef(card.id);
  const isDisplayed = derived.displayedEntries.some((entry) => entry.id === card.id);
  const caseFull = derived.displayedEntries.length >= derived.caseSlots;
  return (
    <div className="clean-modal-scrim" onMouseDown={onClose}>
      <article className={`clean-card-detail rarity-${rarityId}`} onMouseDown={(event) => event.stopPropagation()} style={{ "--rarity": rarity.color }}>
        <button onClick={onClose}>CLOSE</button>
        <div className={`clean-detail-art${count ? "" : " is-missing"}`}>
          {count ? <CardArt card={card} /> : <span aria-hidden="true">PW</span>}
        </div>
        <div className="clean-detail-copy">
          <span style={{ color: rarity.color }}>{rarity.label} / {rarity.rateLabel} BASE PULL</span>
          <h2>{count ? card.name : `Card ${String(card.number).padStart(2, "0")}`}</h2>
          <p>{count ? card.flavor : "Not found yet. Keep opening packs to reveal this card."}</p>
          {def && (
            <div className={`clean-detail-effect${def.sig || def.prestige ? " is-meta" : ""}`}>
              <b>{def.sig ? `${KINGS[def.sig].name.toUpperCase()} SIGNATURE` : def.prestige ? "THE DOOR OUT" : "DISPLAY EFFECT"}</b>
              <span>{describeCard(card.id)}</span>
            </div>
          )}
          {count ? (
            <dl>
              <div><dt>COPIES</dt><dd>{count}</dd></div>
              <div><dt>EACH EXTRA</dt><dd>{money(duplicateValue)}</dd></div>
            </dl>
          ) : (
            <dl>
              <div><dt>RARITY</dt><dd style={{ color: rarity.color }}>{rarity.label}</dd></div>
              <div><dt>BASE PULL</dt><dd>{rarity.rateLabel}</dd></div>
            </dl>
          )}
          {count > 0 && (
            isDisplayed ? (
              <button className="clean-display-toggle is-displayed" onClick={() => onUndisplay(card.id)}>
                UNSEAT FROM CASE
              </button>
            ) : (
              <button
                className="clean-display-toggle"
                disabled={caseFull}
                onClick={() => onDisplay(card.id)}
              >
                {caseFull ? `CASE FULL / ${derived.caseSlots} SLOTS` : "DISPLAY IN CASE"}
              </button>
            )
          )}
          {count ? (
            <small>Selling duplicates always keeps one copy. This card is permanently {rarity.label}.</small>
          ) : (
            <small>This card is permanently {rarity.label}. Its art and name stay hidden until you pull it.</small>
          )}
        </div>
      </article>
    </div>
  );
}

function CaseDrawer({ game, derived, onClose, onUndisplay, onPickCard, onOpenBinder, onRewrite, rewriteArmed }) {
  const rewriteReady = canRewrite(game);
  const inscriptionsPreview = rewriteReady ? getInscriptionsEarned(game) : 0;
  return (
    <aside className="clean-drawer clean-case" aria-label="Display case">
      <header>
        <div><span>DISPLAY CASE</span><h2>On display</h2></div>
        <button onClick={onClose} aria-label="Close display case">CLOSE</button>
      </header>
      <div className="clean-drawer-scroll">
        <p className="clean-case-note">
          Displayed cards work for you while you play — their effects fire live.
          Editing the case sells your duplicate stack first.
          {" "}{derived.displayedEntries.length}/{derived.caseSlots} slots filled.
        </p>
        <div className="clean-case-slots">
          {Array.from({ length: CASE_SIZE }, (_, index) => {
            const entry = derived.displayedEntries[index];
            if (entry) {
              const card = getCard(entry.id);
              const def = getCardDef(entry.id);
              const rarity = RARITIES[card.rarity];
              const tally = game.triggerTallies?.[entry.id] || 0;
              return (
                <article className={`clean-case-slot is-filled rarity-${card.rarity}${def?.sig ? " is-king" : ""}`} key={`slot-${index}`} style={{ "--rarity": rarity.color }}>
                  <button className="clean-case-card" onClick={() => onPickCard(card.id)} aria-label={`${card.name} details`}>
                    <CardArt card={card} compact />
                  </button>
                  <div className="clean-case-slot-copy">
                    <b>{index === 0 ? "SLOT 1 / " : ""}{card.name}{def?.sig ? ` — ${KINGS[def.sig].name}` : ""}</b>
                    <span>{describeCard(card.id)}</span>
                    {tally > 0 && <i className="clean-case-ramp">TRIGGERED {formatNumber(tally)} TIMES</i>}
                  </div>
                  <button className="clean-case-unseat" onClick={() => onUndisplay(card.id)}>UNSEAT</button>
                </article>
              );
            }
            if (index < derived.caseSlots) {
              return (
                <button
                  type="button"
                  className="clean-case-slot is-empty"
                  key={`slot-${index}`}
                  onClick={onOpenBinder}
                  aria-label={`Empty slot ${index + 1} — open binder`}
                >
                  <span className="clean-case-empty-mark">+</span>
                  <div className="clean-case-slot-copy">
                    <b>Empty slot {index + 1}</b>
                    <span>Tap to open the binder and pick a card.</span>
                  </div>
                </button>
              );
            }
            const milestone = derived.caseMilestones[index];
            return (
              <article className="clean-case-slot is-locked" key={`slot-${index}`}>
                <span className="clean-case-empty-mark">×</span>
                <div className="clean-case-slot-copy">
                  <b>Locked slot</b>
                  <span>{milestone ? milestone.label : "Keep collecting"} to unlock.</span>
                </div>
              </article>
            );
          })}
        </div>

        <section className="clean-rewrite">
          <div className="clean-section-title"><h3>Rewrite</h3><span>PRESTIGE LOOP</span></div>
          {derived.inscriptions > 0 && (
            <p className="clean-rewrite-status">
              {formatNumber(derived.inscriptions)} Inscriptions held / all income and duplicate sales ×{derived.prestigeMultiplier.toFixed(2)}.
            </p>
          )}
          {rewriteReady ? (
            <>
              <p>
                What Was Never Named is yours. Rewriting resets your binder, cash,
                and shop — and inscribes permanent power. Display the Nameless
                itself to double what you earn.
              </p>
              <button className={`clean-rewrite-button ${rewriteArmed ? "is-armed" : ""}`} onClick={onRewrite}>
                {rewriteArmed ? "CONFIRM REWRITE" : `REWRITE / +${formatNumber(inscriptionsPreview)} INSCRIPTIONS`}
              </button>
            </>
          ) : (
            <p className="clean-rewrite-hint">
              Something beyond the binder waits in the final set.
            </p>
          )}
        </section>
      </div>
    </aside>
  );
}

function CaseStrip({ game, derived, fx, onOpenCase, onOpenBinder }) {
  return (
    <div className="case-strip">
      {Array.from({ length: CASE_SIZE }, (_, index) => {
        const entry = derived.displayedEntries[index];
        if (!entry) {
          const locked = index >= derived.caseSlots;
          return (
            <button
              type="button"
              key={index}
              className={`case-strip-slot ${locked ? "is-locked" : "is-empty"}`}
              onClick={locked ? onOpenCase : onOpenBinder}
              aria-label={locked ? "Locked slot — open display case" : "Empty slot — open binder"}
            >
              {locked ? "×" : "+"}
            </button>
          );
        }
        const card = getCard(entry.id);
        const def = getCardDef(entry.id);
        const pulse = fx[entry.id];
        return (
          <button
            type="button"
            key={index}
            className={`case-strip-slot is-filled rarity-${card.rarity}${def?.sig ? " is-king" : ""}${pulse ? ` fx-${pulse.kind}` : ""}`}
            style={{ "--rarity": RARITIES[card.rarity].color }}
            data-fx={pulse ? pulse.serial : undefined}
            title={card.name}
            onClick={onOpenCase}
            aria-label={`${card.name} — open display case`}
          >
            <CardArt card={card} compact />
            {def?.sig && <i className="case-strip-crown" aria-hidden="true" />}
          </button>
        );
      })}
      <button type="button" className="case-strip-label" onClick={onOpenCase} aria-label="Open display case">CASE</button>
    </div>
  );
}

// Bottom-left collection meter: one compact progress bar for the active
// set. Click-through to the binder for per-card detail.
function SetTray({ game, set, onOpenBinder }) {
  const found = set.cards.filter((card) => game.collection[card.id]).length;
  const percent = Math.round((found / set.cards.length) * 100);
  return (
    <button
      type="button"
      className="clean-set-progress"
      onClick={onOpenBinder}
      aria-label={`${set.name} collection, ${found} of ${set.cards.length} found. Open binder.`}
    >
      <header>
        <strong>{set.short} COLLECTION</strong>
        <span>{found}/{set.cards.length}</span>
      </header>
      <span className="clean-set-progress-track" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </span>
    </button>
  );
}

export default function PackworksGameClean() {
  const audioRef = useRef(null);
  const gameRef = useRef(createInitialState(0));
  const openingRef = useRef(null);
  const openingTimersRef = useRef([]);
  const holdRevealTimerRef = useRef(null);
  const spaceHeldRef = useRef(false);
  const mobileAutoPointerRef = useRef(null);
  const swipePointerRef = useRef(null);
  const revealLocksRef = useRef(new Set());
  const impactSerialRef = useRef(0);
  const toastSerialRef = useRef(0);
  const signalAtRef = useRef(0);

  const [game, setGame] = useState(() => createInitialState(0));
  const [ready, setReady] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [binderSetId, setBinderSetId] = useState(SETS[0].id);
  const [opening, setOpening] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [resetArmed, setResetArmed] = useState(false);
  const [rewriteArmed, setRewriteArmed] = useState(false);
  const [fx, setFx] = useState({});
  const [revealEchoes, setRevealEchoes] = useState({});
  const [adminActive, setAdminActive] = useState(false);
  const [viewport, setViewport] = useState({ w: 1200, h: 800 });
  const adminActiveRef = useRef(false);
  const fxSerialRef = useRef(0);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [mobileAutoHeld, setMobileAutoHeld] = useState(false);
  const [swipeRevealing, setSwipeRevealing] = useState(false);

  const commit = useCallback((nextOrUpdater) => {
    const next = typeof nextOrUpdater === "function" ? nextOrUpdater(gameRef.current) : nextOrUpdater;
    gameRef.current = next;
    setGame(next);
    return next;
  }, []);

  const commitOpening = useCallback((nextOrUpdater) => {
    const next = typeof nextOrUpdater === "function"
      ? nextOrUpdater(openingRef.current)
      : nextOrUpdater;
    openingRef.current = next;
    setOpening(next);
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

  const pushFx = useCallback((events) => {
    if (!events?.length) return;
    const stamp = {};
    for (const event of events) {
      const kind = event.t === "echo" ? "echo"
        : event.t === "relay" ? "relay"
        : event.t === "mystery" ? "mystery"
        : ["trigger", "mark", "mimic", "transmute", "fracture", "catalyst"].includes(event.t) ? "pulse"
        : null;
      if (kind && event.cardId) stamp[event.cardId] = { kind, serial: ++fxSerialRef.current };
    }
    if (Object.keys(stamp).length) {
      setFx((current) => ({ ...current, ...stamp }));
      window.setTimeout(() => setFx((current) => {
        const next = { ...current };
        for (const key of Object.keys(stamp)) {
          if (next[key]?.serial === stamp[key].serial) delete next[key];
        }
        return next;
      }), 900);
    }
    const mysteries = events.filter((event) => event.t === "mystery").length;
    if (mysteries > 0) {
      getAudio().sound("caseBreak");
      pushToast("SALVAGE", `${mysteries} Mystery Pack${mysteries > 1 ? "s" : ""} burst open!`, "gold");
    }
    const fractures = events.filter((event) => event.t === "fracture").length;
    if (fractures > 0) pushToast("FRACTURE", "The pack split — more cards join this reveal.", "gold");
    const encore = events.find((event) => event.t === "encore");
    if (encore) pushToast("ENCORE", `The pack continues — ${encore.count} bonus cards.`, "gold");
    const freePacks = events.filter((event) => event.t === "packs").reduce((sum, event) => sum + event.count, 0);
    if (freePacks > 0) pushToast("FREE PACKS", `${freePacks} loose pack${freePacks > 1 ? "s" : ""} added to your stock.`, "gold");
    if (events.some((event) => event.t === "fuseLift")) {
      pushToast("FUSE LIFT", "Your next Fusion climbs one extra step.", "success", 2600);
    }
    for (const boon of events.filter((event) => event.t === "boon").slice(0, 2)) {
      const option = DISCOVER_POOL.find((candidate) => candidate.id === boon.option);
      if (option) pushToast("BOON", `${option.name} gained.`, "success", 2200);
    }
    const sets = events.filter((event) => event.t === "setComplete");
    for (const done of sets) pushToast("SET COMPLETE", `${getSet(done.setId).name} is finished.`, "gold", 6000);
  }, [getAudio, pushToast]);

  // Salvage burst: the Mystery Packs a sale or idle sweep rips open, shown
  // as a full-screen card burst so Salvage is never a silent toast.
  const [salvageBurst, setSalvageBurst] = useState(null);
  const salvageBurstTimerRef = useRef(null);
  const showSalvageBurst = useCallback((mysteryCards, packs) => {
    if (!mysteryCards?.length || gameRef.current?.settings?.reducedEffects) return;
    if (salvageBurstTimerRef.current !== null) window.clearTimeout(salvageBurstTimerRef.current);
    setSalvageBurst({
      id: Date.now(),
      packs: Math.max(1, packs || 1),
      cards: mysteryCards.slice(0, 9).map((pull, index) => ({
        key: `${pull.card.id}-${index}`,
        name: pull.card.name,
        rarity: pull.rarity,
        color: RARITIES[pull.rarity].color,
        isNew: !!pull.isNew,
      })),
      more: Math.max(0, mysteryCards.length - 9),
    });
    salvageBurstTimerRef.current = window.setTimeout(() => {
      setSalvageBurst(null);
      salvageBurstTimerRef.current = null;
    }, 2_800);
  }, []);
  useEffect(() => () => {
    if (salvageBurstTimerRef.current !== null) window.clearTimeout(salvageBurstTimerRef.current);
  }, []);

  useEffect(() => {
    let adminFlag = false;
    try {
      adminFlag = window.localStorage.getItem(ADMIN_FLAG_KEY) === "1";
    } catch {
      adminFlag = false;
    }
    if (adminFlag) {
      let sandbox = null;
      try {
        sandbox = JSON.parse(window.localStorage.getItem(ADMIN_SAVE_KEY) || "null");
      } catch {
        sandbox = null;
      }
      const adminState = sandbox
        ? applyAdminGuarantees(hydrateState(sandbox, Date.now()))
        : createAdminState(Date.now());
      adminActiveRef.current = true;
      setAdminActive(true);
      commit(adminState);
      setBinderSetId(adminState.activeSet);
      window.setTimeout(() => pushToast("ADMIN MODE", "Testing sandbox active — everything unlocked. Your real save is untouched.", "warning", 6500), 300);
      setReady(true);
      return;
    }
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
    if (offline.report) {
      const parts = [];
      if (offline.report.coins > 0) parts.push(`earned ${money(offline.report.coins)} cash`);
      if (offline.report.packsOpened > 0) {
        parts.push(`auto-opened ${offline.report.packsOpened} pack${offline.report.packsOpened === 1 ? "" : "s"}${offline.report.newCards ? ` (${offline.report.newCards} new)` : ""}`);
      }
      if (parts.length) {
        window.setTimeout(() => pushToast("WELCOME BACK", `Time away ${parts.join(" and ")}.`, "success", 6000), 300);
      }
    }
    setReady(true);
  }, [commit, pushToast]);

  useEffect(() => {
    if (!ready) return undefined;
    const save = () => {
      try {
        if (adminActiveRef.current) {
          window.localStorage.setItem(ADMIN_SAVE_KEY, serializeState(gameRef.current));
          return;
        }
        const stored = window.localStorage.getItem(SAVE_KEY);
        if (storedSaveDominates(stored, gameRef.current)) return;
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

  useEffect(() => {
    if (!ready) return undefined;
    const interval = window.setInterval(() => {
      const swept = evaluateIdleThresholds(gameRef.current, {});
      if (swept.state !== gameRef.current) {
        commit(swept.state);
        pushFx(swept.events);
        if (swept.mysteryCards?.length) {
          showSalvageBurst(swept.mysteryCards, swept.events.filter((event) => event.t === "mystery").length);
        }
      }
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [commit, pushFx, ready, showSalvageBurst]);

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
    mobileAutoPointerRef.current = null;
    swipePointerRef.current = null;
    revealLocksRef.current.clear();
    setMobileAutoHeld(false);
    setSwipeRevealing(false);
    commitOpening(null);
  }, [clearHoldRevealTimer, clearOpeningTimers, commitOpening]);

  const applyAdminSwitch = useCallback((enabled) => {
    if (enabled === adminActiveRef.current) return;
    try {
      if (enabled) {
        const stored = window.localStorage.getItem(SAVE_KEY);
        if (!storedSaveDominates(stored, gameRef.current)) {
          window.localStorage.setItem(SAVE_KEY, serializeState(gameRef.current));
        }
        let sandbox = null;
        try {
          sandbox = JSON.parse(window.localStorage.getItem(ADMIN_SAVE_KEY) || "null");
        } catch {
          sandbox = null;
        }
        const adminState = sandbox
          ? applyAdminGuarantees(hydrateState(sandbox, Date.now()))
          : createAdminState(Date.now());
        adminActiveRef.current = true;
        setAdminActive(true);
        closeOpening();
        setDrawer(null);
        commit(adminState);
        setBinderSetId(adminState.activeSet);
        pushToast("ADMIN MODE", "Testing sandbox active — everything unlocked. Your real save is untouched.", "warning", 6500);
      } else {
        window.localStorage.setItem(ADMIN_SAVE_KEY, serializeState(gameRef.current));
        let real = null;
        try {
          real = JSON.parse(window.localStorage.getItem(SAVE_KEY) || "null");
        } catch {
          real = null;
        }
        const restored = hydrateState(real, Date.now());
        adminActiveRef.current = false;
        setAdminActive(false);
        closeOpening();
        setDrawer(null);
        commit(restored);
        setBinderSetId(restored.activeSet);
        pushToast("ADMIN MODE OFF", "Back to your real save.", "success", 5000);
      }
    } catch {
      // Local storage can be unavailable in strict privacy modes.
    }
  }, [closeOpening, commit, pushToast]);

  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const onStorage = (event) => {
      if (event.key !== ADMIN_FLAG_KEY) return;
      applyAdminSwitch(event.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [ready, applyAdminSwitch]);


  const signalCard = useCallback((rarityOrder) => {
    const now = performance.now();
    if (now - signalAtRef.current < 120) return;
    signalAtRef.current = now;
    getAudio().sound("signal", rarityOrder);
  }, [getAudio]);

  // Grid solver: pick the columns-by-rows arrangement that keeps every card
  // of the reveal inside the visible board area at the largest possible
  // size. Columns grow with the pack just like rows — never scrolling.
  const boardLayout = useMemo(() => {
    const count = opening?.result?.cards?.length || 0;
    if (!count) return { count: 0, perRow: 1, rows: 1, shrink: 1, gapX: 0, gapY: 0 };
    const { w, h } = viewport;
    const narrow = w <= 1050;
    const cardW = Math.min(Math.max(narrow ? 132 : 148, w * (narrow ? 0.155 : 0.145)), narrow ? 165 : 198);
    const cardH = cardW * 1.42;
    const gapXBase = Math.min(w * (narrow ? 0.17 : 0.155), narrow ? 148 : 205);
    const availW = w * 0.92;
    const availH = h * 0.58;
    let best = { cols: 1, rows: count, s: 0 };
    for (let cols = 1; cols <= Math.min(count, 24); cols += 1) {
      const rows = Math.ceil(count / cols);
      const sW = availW / ((cols - 1) * gapXBase + cardW);
      const sH = availH / (rows * (cardH + 16));
      const s = Math.min(1, sW, sH);
      if (s > best.s + 1e-9 || (Math.abs(s - best.s) < 1e-9 && rows < best.rows)) best = { cols, rows, s };
    }
    const shrink = +Math.max(0.2, Math.min(1, best.s)).toFixed(3);
    return {
      count,
      perRow: best.cols,
      rows: best.rows,
      shrink,
      gapX: Math.round(gapXBase),
      gapY: Math.round(cardH * shrink + Math.max(8, 20 * shrink)),
    };
  }, [opening?.result?.cards?.length, viewport]);

  const revealCard = useCallback((index) => {
    const currentOpening = openingRef.current;
    if (!currentOpening || currentOpening.phase !== "ready") return;
    const pull = currentOpening.result.cards[index];
    if (!pull || pull.revealed || pull.fusedAway) return;
    const key = `${currentOpening.id}-${index}`;
    if (revealLocksRef.current.has(key)) return;
    revealLocksRef.current.add(key);

    const outcome = revealPackCard(gameRef.current, currentOpening.result.cards, index, { manual: true });
    commit(outcome.state);
    pushFx(outcome.events);
    const echoCount = outcome.events.filter((event) => event.t === "echo" && event.index === index).length;
    if (echoCount > 0) {
      const echoSerial = ++fxSerialRef.current;
      setRevealEchoes((current) => ({ ...current, [index]: { count: echoCount, serial: echoSerial } }));
      openingTimersRef.current.push(window.setTimeout(() => {
        setRevealEchoes((current) => {
          if (current[index]?.serial !== echoSerial) return current;
          const next = { ...current };
          delete next[index];
          return next;
        });
      }, 800 + 620 * Math.min(4, echoCount)));
    }
    const cards = outcome.cards;
    const revealedPull = cards[index];
    const rarity = RARITIES[revealedPull.rarity];
    const allRevealed = cards.every((entry) => entry.revealed || entry.fusedAway);
    const impact = {
      index,
      rarity: revealedPull.rarity,
      foil: revealedPull.foil,
      serial: ++impactSerialRef.current,
    };
    commitOpening({
      ...currentOpening,
      result: { ...currentOpening.result, cards },
      phase: allRevealed ? "complete" : "ready",
      revealed: cards.map((entry, position) => (entry.revealed ? position : -1)).filter((position) => position >= 0),
      impact,
    });

    const audio = getAudio();
    audio.sound("reveal", rarity.order);
    if (revealedPull.misprintDetected) audio.sound("misprint");
    else if (rarity.order >= RARITIES.legendary.order) audio.sound("legendary", rarity.order);
    if (outcome.events.some((event) => event.t === "echo")) audio.sound("fusion", 2);

    if (allRevealed) {
      const delay = rarity.order >= 4 ? 1550 : rarity.order === 3 ? 1200 : 900;
      openingTimersRef.current.push(window.setTimeout(() => {
        const fusion = resolveFusions(gameRef.current, openingRef.current?.result.cards || cards, {});
        if (fusion.fused) {
          commit(fusion.state);
          pushFx(fusion.events);
          audio.sound("fusion", 4);
          pushToast("FUSION", "Duplicates fuse upward — reveal them again.", "gold");
          commitOpening((current) => current?.id === currentOpening.id
            ? { ...current, result: { ...current.result, cards: fusion.cards }, phase: "ready", impact: null }
            : current);
          return;
        }
        audio.sound("packComplete");
        commitOpening((current) => current?.id === currentOpening.id
          ? { ...current, phase: "summary", impact: null }
          : current);
      }, delay));
    }
  }, [commit, commitOpening, getAudio, pushFx, pushToast]);

  const beginManualOpen = useCallback(() => {
    if (!ready || drawer || selectedCard || gameRef.current.discoverOffer) return;
    const currentOpening = openingRef.current;
    if (currentOpening && currentOpening.phase !== "summary") return;
    const current = gameRef.current;
    const priorBeat = current.beat;
    const priorSets = new Set(current.unlockedSets);
    setRevealEchoes({});
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
    swipePointerRef.current = null;
    setSwipeRevealing(false);
    commitOpening(null);
    commit(rolled.state);
    setBinderSetId(rolled.state.activeSet);
    const audio = getAudio();
    audio.ensure();
    audio.sound("pack");

    const unlockedProduct = SHOP_PRODUCTS.find((product) => product.unlockBeat > priorBeat && product.unlockBeat <= rolled.state.beat);
    const unlockedSet = SETS.find((set) => rolled.state.unlockedSets.includes(set.id) && !priorSets.has(set.id));
    if (unlockedProduct) pushToast("NEW STOCK", `${unlockedProduct.label}s are now available in the shop.`, "gold", 6000);
    else if (unlockedSet) pushToast("NEW SET", `${unlockedSet.name} is now in print.`, "gold", 6000);
    pushFx(rolled.result.events);

    const id = `${Date.now()}-${rolled.state.packsOpened}`;
    commitOpening({ id, result: rolled.result, phase: "sealed", revealed: [], impact: null, initialCount: rolled.result.cards.length });
    const quick = rolled.state.settings.quickOpen || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tearDelay = quick ? 80 : 440;
    const dealDelay = quick ? 240 : 1250;
    openingTimersRef.current.push(window.setTimeout(() => {
      commitOpening((value) => value?.id === id ? { ...value, phase: "torn" } : value);
      audio.sound("tear");
    }, tearDelay));
    openingTimersRef.current.push(window.setTimeout(() => {
      commitOpening((value) => value?.id === id ? { ...value, phase: "ready" } : value);
      audio.sound("deal");
    }, dealDelay));
  }, [clearOpeningTimers, commit, commitOpening, drawer, getAudio, pushFx, pushToast, ready, selectedCard]);

  const startMobileAuto = useCallback((event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    mobileAutoPointerRef.current = event.pointerId;
    setMobileAutoHeld(true);
    getAudio().ensure();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some embedded mobile browsers do not expose pointer capture.
    }
  }, [getAudio]);

  const stopMobileAuto = useCallback((event) => {
    if (mobileAutoPointerRef.current === null) return;
    if (
      event?.pointerId !== undefined
      && event.pointerId !== mobileAutoPointerRef.current
    ) return;
    mobileAutoPointerRef.current = null;
    setMobileAutoHeld(false);
    clearHoldRevealTimer();
  }, [clearHoldRevealTimer]);

  const finishMobileAuto = useCallback((event) => {
    stopMobileAuto(event);
    if (
      openingRef.current?.phase === "summary"
      && getProductCount(gameRef.current, gameRef.current.activeSet, "loose") > 0
    ) {
      beginManualOpen();
    }
  }, [beginManualOpen, stopMobileAuto]);

  const startSwipeReveal = useCallback((event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const card = event.target.closest?.("[data-reveal-index]");
    const index = Number(card?.dataset.revealIndex);
    const currentOpening = openingRef.current;
    if (
      !card
      || !Number.isInteger(index)
      || currentOpening?.phase !== "ready"
      || currentOpening.revealed.includes(index)
    ) return;
    event.preventDefault();
    swipePointerRef.current = event.pointerId;
    setSwipeRevealing(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Hit testing below still works when pointer capture is unavailable.
    }
    revealCard(index);
  }, [revealCard]);

  const continueSwipeReveal = useCallback((event) => {
    if (swipePointerRef.current === null || event.pointerId !== swipePointerRef.current) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const card = target?.closest?.("[data-reveal-index]");
    const index = Number(card?.dataset.revealIndex);
    if (Number.isInteger(index)) revealCard(index);
  }, [revealCard]);

  const stopSwipeReveal = useCallback((event) => {
    if (
      event?.pointerId !== undefined
      && swipePointerRef.current !== null
      && event.pointerId !== swipePointerRef.current
    ) return;
    swipePointerRef.current = null;
    setSwipeRevealing(false);
  }, []);

  useEffect(() => {
    clearHoldRevealTimer();
    const autoOpeningHeld = spaceHeld || mobileAutoHeld;
    if (!autoOpeningHeld || drawer || selectedCard || !opening || game.discoverOffer) return undefined;

    if (opening.phase === "ready") {
      const nextIndex = opening.result.cards.findIndex((_, index) => !opening.revealed.includes(index));
      if (nextIndex >= 0) {
        const lastIndex = opening.revealed.at(-1);
        const lastPull = Number.isInteger(lastIndex) ? opening.result.cards[lastIndex] : null;
        const lastOrder = lastPull ? RARITIES[lastPull.rarity].order : 0;
        const delay = mobileAutoHeld
          ? lastOrder >= 4 ? 1500 : lastOrder === 3 ? 1180 : lastOrder === 2 ? 920 : 720
          : lastOrder >= 4 ? 1250 : lastOrder === 3 ? 900 : lastOrder === 2 ? 650 : 480;
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
      }, mobileAutoHeld ? 850 : 650);
    }

    return clearHoldRevealTimer;
  }, [
    beginManualOpen,
    clearHoldRevealTimer,
    drawer,
    opening,
    revealCard,
    selectedCard,
    mobileAutoHeld,
    spaceHeld,
    game.discoverOffer,
  ]);

  useEffect(() => {
    const stopPointerActions = (event) => {
      stopMobileAuto(event);
      stopSwipeReveal(event);
    };
    const stopAllPointerActions = () => {
      stopMobileAuto();
      stopSwipeReveal();
    };
    window.addEventListener("pointerup", stopPointerActions);
    window.addEventListener("pointercancel", stopPointerActions);
    window.addEventListener("blur", stopAllPointerActions);
    return () => {
      window.removeEventListener("pointerup", stopPointerActions);
      window.removeEventListener("pointercancel", stopPointerActions);
      window.removeEventListener("blur", stopAllPointerActions);
    };
  }, [stopMobileAuto, stopSwipeReveal]);

  const handleBuy = useCallback((productId, setId = gameRef.current.activeSet) => {
    const next = buyProduct(gameRef.current, productId, setId);
    if (next === gameRef.current) {
      getAudio().sound("deny");
      return false;
    }
    commit(next);
    setBinderSetId(setId);
    getAudio().sound("purchase");
    return true;
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

  const handleSellDuplicates = useCallback((maybeAuto) => {
    const auto = maybeAuto === true;
    const count = getDuplicateCount(gameRef.current);
    const sale = sellDuplicatesDetailed(gameRef.current, {});
    if (sale.state === gameRef.current) {
      if (!auto) getAudio().sound("deny");
      return;
    }
    commit(sale.state);
    pushFx(sale.events);
    getAudio().sound("purchase");
    if (sale.salvages > 0) showSalvageBurst(sale.mysteryCards, sale.salvages);
    const mysteryNote = sale.salvages > 0
      ? ` ${sale.salvages} Salvage${sale.salvages > 1 ? "s" : ""} fired — ${sale.mysteryCards.length} mystery cards joined your binder.`
      : "";
    pushToast(
      auto ? "AUTO-PROCESSED" : "DUPLICATES SOLD",
      `${count} cards sold for ${money(sale.saleValue)} cash.${mysteryNote}`,
      sale.salvages ? "gold" : "success",
      sale.salvages ? 6500 : 4200,
    );
  }, [commit, getAudio, pushFx, pushToast, showSalvageBurst]);

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
    window.localStorage.removeItem(adminActiveRef.current ? ADMIN_SAVE_KEY : SAVE_KEY);
    const fresh = adminActiveRef.current ? createAdminState(Date.now()) : createInitialState(Date.now());
    commit(fresh);
    setBinderSetId(fresh.activeSet);
    setDrawer(null);
    setResetArmed(false);
    closeOpening();
  }, [closeOpening, commit, pushToast, resetArmed]);

  const handleDisplay = useCallback((cardId) => {
    const next = displayCard(gameRef.current, cardId, Date.now());
    if (next === gameRef.current) {
      getAudio().sound("deny");
      return;
    }
    commit(next);
    getAudio().sound("switch");
    pushToast("ON DISPLAY", `${getCard(cardId)?.name} now augments the shop.`, "success");
  }, [commit, getAudio, pushToast]);

  const handleUndisplay = useCallback((cardId) => {
    const next = undisplayCard(gameRef.current, cardId);
    if (next === gameRef.current) return;
    commit(next);
    getAudio().sound("switch");
  }, [commit, getAudio]);

  const handleRewrite = useCallback(() => {
    if (!rewriteArmed) {
      setRewriteArmed(true);
      pushToast("REWRITE?", "This resets your binder and cash for permanent Inscriptions. Press again to confirm.", "warning", 6000);
      return;
    }
    const earned = getInscriptionsEarned(gameRef.current, Date.now());
    const next = rewriteState(gameRef.current, Date.now());
    if (next === gameRef.current) {
      setRewriteArmed(false);
      return;
    }
    commit(next);
    setRewriteArmed(false);
    setBinderSetId(SETS[0].id);
    setDrawer(null);
    setSelectedCard(null);
    closeOpening();
    getAudio().sound("legendary", 17);
    pushToast("THE STORY REWRITES", `+${formatNumber(earned)} Inscriptions. Everything begins again, stronger.`, "gold", 8000);
  }, [closeOpening, commit, getAudio, pushToast, rewriteArmed]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === "Space" && !drawer && !selectedCard) {
        event.preventDefault();
        if (gameRef.current.discoverOffer) return;
        if (event.repeat || spaceHeldRef.current) return;
        spaceHeldRef.current = true;
        setSpaceHeld(true);
        if (!opening || opening.phase === "summary") beginManualOpen();
      } else if (event.key === "Escape") {
        if (gameRef.current.discoverOffer) commit(dismissDiscoverOffer(gameRef.current));
        else if (selectedCard) setSelectedCard(null);
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
  const breakableProduct = SHOP_PRODUCTS.find(
    (product) => product.id !== "loose" && getProductCount(game, game.activeSet, product.id) > 0,
  );
  const mobileAutoDisabled = opening?.phase === "summary" && loosePacks <= 0;
  const mobileAutoTitle = mobileAutoHeld
    ? "AUTO-OPENING"
    : opening?.phase === "summary"
      ? loosePacks > 0 ? "OPEN ANOTHER" : "NO PACKS READY"
      : "HOLD TO AUTO-OPEN";
  const mobileAutoDetail = mobileAutoHeld
    ? "RELEASE TO STOP"
    : opening?.phase === "summary"
      ? loosePacks > 0 ? "TAP ONCE / HOLD TO KEEP OPENING" : "BACK TO TABLE TO BUY MORE"
      : "SLOW REVEAL / CONTINUES INTO NEXT PACK";

  return (
    <main
      className={`packworks pw2 pw-clean ${game.settings.reducedEffects ? "reduced-effects" : ""} ${opening ? "opening-active" : ""} ${spaceHeld ? "space-held" : ""} ${mobileAutoHeld ? "mobile-auto-held" : ""} ${swipeRevealing ? "swipe-revealing" : ""}`}
      style={{ "--set-a": activeSet.colors[0], "--set-b": activeSet.colors[1], "--set-c": activeSet.colors[2] }}
    >
      <header className="clean-topbar">
        <div className="clean-brand">
          <span className="clean-brand-mark"><i /><i /><i /></span>
          <strong>PACKWORKS</strong>
        </div>
        <div className="clean-wallet">
          <strong>{money(game.coins)}</strong>
          <span>
            CASH / +{rate(derived.passiveRate)} PER SECOND
            {derived.inscriptions > 0 ? ` / ${formatNumber(derived.inscriptions)} INSCRIPTIONS` : ""}
          </span>
        </div>
        <nav>
          <button className={drawer === "shop" ? "active" : ""} onClick={() => setDrawer(drawer === "shop" ? null : "shop")}>SHOP</button>
          <button className={drawer === "binder" ? "active" : ""} onClick={() => setDrawer(drawer === "binder" ? null : "binder")}>BINDER</button>
          <button className={drawer === "case" ? "active" : ""} onClick={() => { setRewriteArmed(false); setDrawer(drawer === "case" ? null : "case"); }}>
            CASE{derived.displayedEntries.length ? ` ${derived.displayedEntries.length}/${derived.caseSlots}` : ""}
          </button>
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
        <div className="stage-case-dock">
          <CaseStrip game={game} derived={derived} fx={fx} onOpenCase={() => setDrawer("case")} onOpenBinder={() => setDrawer("binder")} />
          {Object.keys(game.discoverStack || {}).length > 0 && (
            <div className="discover-stack" aria-label="Pending Discover stacks">
              {Object.entries(game.discoverStack).map(([id, count]) => {
                const option = DISCOVER_POOL.find((candidate) => candidate.id === id);
                return <span key={id}>{option?.name || id} ×{count}</span>;
              })}
            </div>
          )}
        </div>
        <div className="clean-set-title">
          <span>{activeSet.short} / CURRENT SET</span>
          <strong>{activeSet.name}</strong>
        </div>

        <button
          className="clean-pack-clicker"
          disabled={!loosePacks}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") return;
            startMobileAuto(event);
            beginManualOpen();
          }}
          onPointerUp={stopMobileAuto}
          onPointerCancel={stopMobileAuto}
          onContextMenu={(event) => event.preventDefault()}
          onClick={beginManualOpen}
          aria-label={loosePacks ? `Open a pack. ${loosePacks} ready.` : "No packs ready"}
        >
          <span className="clean-pack-shadow" />
          <span className="clean-pack-stack"><i /><i /><PackFace set={activeSet} /></span>
          <span className="clean-open-copy">
            <strong>{loosePacks ? "OPEN PACK" : "NO PACKS READY"}</strong>
            <small>
              {loosePacks
                ? `${loosePacks} READY / TAP OR HOLD`
                : breakableProduct
                  ? `${breakableProduct.label.toUpperCase()} WAITING`
                  : "PACKS AVAILABLE IN SHOP"}
            </small>
          </span>
        </button>

        {!loosePacks && breakableProduct && (
          <button
            className="clean-buy-one"
            onClick={() => handleBreak(breakableProduct.id)}
          >
            BREAK {breakableProduct.label.toUpperCase()}
            <span>{breakableProduct.packs} PACKS</span>
          </button>
        )}

        <button
          className="clean-sell-duplicates"
          disabled={!derived.duplicateCount}
          onClick={() => handleSellDuplicates(false)}
        >
          <strong>SELL DUPLICATES</strong>
          <span>
            {derived.duplicateCount
              ? `${formatNumber(derived.duplicateCount)} CARDS / +${money(derived.duplicateSaleValue)} CASH`
              : "NO EXTRA COPIES"}
          </span>
        </button>

        <SetTray
          game={game}
          set={activeSet}
          onOpenBinder={() => {
            setBinderSetId(game.activeSet);
            setDrawer("binder");
          }}
        />

        <div className="clean-simple-stats">
          <div><strong>{formatNumber(game.packsOpened)}</strong><span>PACKS OPENED</span></div>
          <i />
          <div><strong>{formatNumber(derived.packStock)}</strong><span>PACKS READY</span></div>
        </div>
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
      {drawer === "case" && (
        <CaseDrawer
          game={game}
          derived={derived}
          onClose={() => { setRewriteArmed(false); setDrawer(null); }}
          onUndisplay={handleUndisplay}
          onPickCard={setSelectedCard}
          onOpenBinder={() => setDrawer("binder")}
          onRewrite={handleRewrite}
          rewriteArmed={rewriteArmed}
        />
      )}
      {drawer === "binder" && (
        <BinderDrawer
          game={game}
          setId={binderSetId}
          onSetId={setBinderSetId}
          onClose={() => setDrawer(null)}
          onCard={setSelectedCard}
          displayedIds={new Set(derived.displayedEntries.map((entry) => entry.id))}
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
            <CaseStrip game={game} derived={derived} fx={fx} onOpenCase={() => setDrawer("case")} onOpenBinder={() => setDrawer("binder")} />
            <small>
              {opening.result.cards.filter((pull) => pull.revealed).length}
              {" / "}
              {opening.result.cards.filter((pull) => !pull.fusedAway).length}
            </small>
          </div>
          <div className="foil-pack-wrap">
            <div className="foil-half foil-top"><PackFace set={opening.result.set} /></div>
            <div className="foil-half foil-bottom"><PackFace set={opening.result.set} /></div>
            <span className="tear-ribbon">PACKWORKS / FACTORY WRAPPED</span>
            <span className="tear-shockwave" />
            <PackDebris />
          </div>
          <div
            className={`reveal-deck ${swipeRevealing ? "is-swipe-revealing" : ""}`}
            style={boardLayout.count ? { "--board-gap-x": `${boardLayout.gapX}px`, "--board-gap-y": `${boardLayout.gapY}px` } : undefined}
            onPointerDown={startSwipeReveal}
            onPointerMove={continueSwipeReveal}
            onPointerUp={stopSwipeReveal}
            onPointerCancel={stopSwipeReveal}
          >
            {opening.result.cards.map((pull, index) => (
              <RevealCard
                key={`${pull.card.id}-${index}`}
                pull={pull}
                index={index}
                count={boardLayout.count}
                perRow={boardLayout.perRow}
                rows={boardLayout.rows}
                shrink={boardLayout.shrink}
                initialCount={opening.initialCount}
                revealed={!!pull.revealed}
                echo={revealEchoes[index]}
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
              <strong className="opening-instruction-desktop">
                {opening.phase === "complete"
                  ? "PACK COMPLETE"
                  : spaceHeld
                    ? "SPACE HELD / REVEALING ONE BY ONE"
                    : "HOVER FOR RARITY / CLICK EACH CARD OR HOLD SPACE"}
              </strong>
              <strong className="opening-instruction-mobile">
                {opening.phase === "complete"
                  ? "PACK COMPLETE"
                  : mobileAutoHeld
                    ? "AUTO-OPENING / RELEASE BELOW TO STOP"
                    : swipeRevealing
                      ? "KEEP SWIPING ACROSS FACE-DOWN CARDS"
                      : "TAP OR SWIPE ACROSS CARDS TO REVEAL"}
              </strong>
            </div>
          )}
          <OpeningImpact impact={opening.impact} />
          {opening.phase === "summary" && (
            <div className="opening-summary pw-opening-summary clean-opening-summary">
              <div className="summary-total">
                <span>SELL PILE</span>
                <strong>
                  {opening.result.cards.some((pull) => pull.revealed && !pull.isNew)
                    ? `+${money(Math.ceil(opening.result.cards.filter((pull) => pull.revealed && !pull.isNew).reduce((sum, pull) => sum + getCardValue(pull.card), 0) * (1 + (game.upgrades?.shelf || 0) * 0.2)))} CASH VALUE`
                    : "NO DUPLICATES"}
                </strong>
                <small>
                  {opening.result.cards.filter((pull) => pull.revealed && pull.isNew).length} NEW
                  {" / "}
                  {opening.result.cards.filter((pull) => pull.revealed && !pull.isNew).length} DUPLICATES
                  {opening.result.cards.some((pull) => pull.fusedFrom) ? ` / ${opening.result.cards.filter((pull) => pull.fusedFrom).length} FUSED` : ""}
                  {opening.result.cards.some((pull) => pull.fromMystery) ? ` / ${opening.result.cards.filter((pull) => pull.fromMystery).length} FROM MYSTERY PACKS` : ""}
                </small>
              </div>
              <div className="summary-actions">
                <button className="summary-secondary" onClick={closeOpening}>BACK TO TABLE</button>
                {getProductCount(game, game.activeSet, "loose") > 0 && (
                  <button className="summary-primary desktop-open-another" onClick={beginManualOpen}>OPEN ANOTHER</button>
                )}
              </div>
            </div>
          )}
          <button
            type="button"
            className={`mobile-auto-control ${mobileAutoHeld ? "is-held" : ""}`}
            disabled={mobileAutoDisabled}
            aria-label={mobileAutoDisabled
              ? "No packs ready"
              : "Open another pack. Hold to reveal cards and continue opening automatically."}
            aria-pressed={mobileAutoHeld}
            onPointerDown={startMobileAuto}
            onPointerUp={finishMobileAuto}
            onPointerCancel={stopMobileAuto}
            onLostPointerCapture={stopMobileAuto}
            onContextMenu={(event) => event.preventDefault()}
            onClick={() => {
              if (
                openingRef.current?.phase === "summary"
                && getProductCount(gameRef.current, gameRef.current.activeSet, "loose") > 0
              ) beginManualOpen();
            }}
          >
            <span className="mobile-auto-fill" aria-hidden="true" />
            <strong>{mobileAutoTitle}</strong>
            <small>{mobileAutoDetail}</small>
          </button>
        </div>
      )}

      {game.discoverOffer && (
        <div className="clean-modal-scrim discover-scrim">
          <div className="discover-stage" onMouseDown={(event) => event.stopPropagation()}>
            <header className="discover-head">
              <b>DISCOVER</b>
              <p>Pick a card. Picks stack, and the stack spends on the next matching moment.</p>
            </header>
            <div className={`discover-fan count-${game.discoverOffer.length}`}>
              {game.discoverOffer.map((id, index) => {
                const option = DISCOVER_POOL.find((candidate) => candidate.id === id);
                const spread = index - (game.discoverOffer.length - 1) / 2;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`discover-card option-${id}`}
                    style={{ "--spread": spread, "--deal": `${index * 95}ms` }}
                    onClick={() => {
                      commit(chooseDiscoverOption(gameRef.current, id));
                      getAudio().sound("switch");
                    }}
                  >
                    <span className="discover-card-head">
                      <span>DISCOVER</span>
                      <b>{"I".repeat(index + 1)}</b>
                    </span>
                    <span className="discover-card-glyph" aria-hidden="true"><i /><i /><i /></span>
                    <strong>{option?.name}</strong>
                    <span className="discover-card-text">{option?.text}</span>
                    <span className="discover-card-foot">TAKE THIS</span>
                  </button>
                );
              })}
            </div>
            <button className="discover-skip" onClick={() => commit(dismissDiscoverOffer(gameRef.current))}>SKIP</button>
          </div>
        </div>
      )}

      {selectedCard && (
        <CardDetail
          game={game}
          derived={derived}
          cardId={selectedCard}
          onClose={() => setSelectedCard(null)}
          onDisplay={handleDisplay}
          onUndisplay={handleUndisplay}
        />
      )}

      {salvageBurst && (
        <div className="salvage-burst" key={salvageBurst.id} aria-hidden="true">
          <div className="salvage-burst-pack">
            <i className="salvage-burst-half is-left" />
            <i className="salvage-burst-half is-right" />
            <b>SALVAGE ×{salvageBurst.packs}</b>
          </div>
          <div className="salvage-burst-cards">
            {salvageBurst.cards.map((card, index) => (
              <span
                key={card.key}
                className={`salvage-burst-card rarity-${card.rarity}${card.isNew ? " is-new" : ""}`}
                style={{ "--i": index, "--n": salvageBurst.cards.length, "--rarity": card.color }}
              >
                {card.isNew && <em>NEW</em>}
              </span>
            ))}
            {salvageBurst.more > 0 && <small className="salvage-burst-more">+{salvageBurst.more} MORE</small>}
          </div>
        </div>
      )}

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
