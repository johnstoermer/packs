"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_CARDS,
  ARCHETYPES,
  BEATS,
  FUSION_THRESHOLDS,
  PACK_PRODUCTS,
  RARITIES,
  SETS,
  formatNumber,
  getCard,
  getSet,
} from "../lib/gameData";
import {
  DECK_SIZE,
  FORGE_COST,
  SAVE_KEY,
  SEALED_ENTRY_PACKS,
  abandonSealedRun,
  addFilingRule,
  applyOfflineProgress,
  breakProduct,
  buyProduct,
  changeDeckCard,
  configureStandingOrder,
  createInitialState,
  forgePack,
  getBeatProgress,
  getCardIncome,
  getDeckAnalysis,
  getDerived,
  getForgedCount,
  getFusionLevel,
  getPackPrice,
  getProductCount,
  hydrateState,
  openPack,
  removeFilingRule,
  resolveDuel,
  resolveSealedDuel,
  selectSet,
  serializeState,
  startSealedRun,
  tickEconomy,
  updateFilingRule,
} from "../lib/gameLogic";
import { createAudioEngine } from "../lib/audio";
import { createPackworksScene } from "../lib/scene";

const ASSET_BASE = process.env.NEXT_PUBLIC_PACKWORKS_BASE || "";
const RARITY_IDS = Object.keys(RARITIES).sort((a, b) => RARITIES[a].order - RARITIES[b].order);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const PLACE_SUBJECTS = new Set(["stand", "screen", "city", "garden", "coronation"]);
const RELIC_SUBJECTS = new Set(["relay", "locket", "star"]);
const MACHINE_SUBJECTS = new Set(["drone", "hopper", "warden", "crawler", "familiar", "ogre", "engine", "colossus"]);
const CHARACTER_SUBJECTS = new Set([
  "courier", "squire", "duelist", "revenant", "gardener", "page", "guard",
  "chancellor", "executioner", "herald", "queen",
]);

function money(value) {
  if (Math.abs(value) < 100) {
    return Number(value).toFixed(value < 10 ? 2 : 1).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  }
  return formatNumber(value);
}

function getCardPresentation(card, rarityId = card.rarity) {
  let kind = "CREATURE";
  if (PLACE_SUBJECTS.has(card.subject)) kind = "LANDMARK";
  else if (RELIC_SUBJECTS.has(card.subject)) kind = "RELIC";
  else if (MACHINE_SUBJECTS.has(card.subject)) kind = "MACHINE";
  else if (CHARACTER_SUBJECTS.has(card.subject)) kind = "CHARACTER";

  let treatment = "specimen";
  if (RARITIES[rarityId].order >= RARITIES.legendary.order) treatment = "signature";
  else if (rarityId === "epic") treatment = "panorama";
  else if (kind === "LANDMARK") treatment = "landmark";
  else if (kind === "RELIC" || kind === "MACHINE") treatment = "dossier";
  else if (card.number % 3 === 0) treatment = "story";

  return {
    kind,
    treatment,
    mark: String((card.number * 17 + RARITIES[rarityId].order * 23) % 100).padStart(2, "0"),
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

function PackFace({ set, small = false, forgedTag = null }) {
  const tag = ARCHETYPES.find((candidate) => candidate.id === forgedTag);
  return (
    <span
      className={`${small ? "pack-face small" : "pack-face"} ${tag ? "forged-pack" : ""}`}
      style={{
        "--pack-a": tag?.color || set.colors[0],
        "--pack-b": set.colors[1],
        "--pack-c": set.colors[2],
      }}
    >
      <span className="pack-crimp top" />
      <span className="pack-series">PACKWORKS / {set.short}</span>
      <span className="pack-glyph">
        <i /><i /><i />
      </span>
      <strong>{tag ? `${tag.label} Cut` : set.name}</strong>
      <em>{tag ? "FORGED SOURCE" : set.tagline}</em>
      <span className="pack-count">6 CARDS / MANUAL GRADE</span>
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
  return (
    <button
      type="button"
      className={`reveal-card count-${count} rarity-${pull.rarity} ${dealt ? "is-dealt" : ""} ${revealed ? "is-revealed" : ""} ${latest ? "is-impacting" : ""} ${canReveal ? "is-hoverable" : ""} ${pull.foil ? "is-foil" : ""} ${phase === "summary" ? "is-settled" : ""}`}
      style={{
        "--spread": spread,
        "--deal-delay": `${index * 70}ms`,
        "--rarity": rarity.color,
        "--rarity-deep": rarity.deep,
        "--set-a": set.colors[0],
        "--set-b": set.colors[1],
        "--set-c": set.colors[2],
      }}
      disabled={!canReveal && !revealed}
      onClick={() => {
        if (canReveal) onReveal(index);
        else if (revealed) onSelect(pull.card.id);
      }}
      onPointerEnter={() => canReveal && onSignal?.(signal.order)}
      aria-label={revealed ? `${pull.card.name}, ${rarity.label}` : `Face-down card ${index + 1}. Hover for rarity signal, click to reveal.`}
    >
      <span className="reveal-card-inner">
        <span className="card-back">
          <span className="back-set">{set.short}</span>
          <span className="back-orbit"><i /><i /><i /></span>
          <span className="back-mark">PW</span>
          <span className="back-rule" />
          <span className="rarity-signal" style={{ "--signal": signal.color }}>
            <i />
            <b>{signal.label}</b>
            <small>OPTICAL READ / UNVERIFIED</small>
          </span>
        </span>
        <span className={`card-front treatment-${presentation.treatment} set-${pull.card.setId}`}>
          <span className="card-head">
            <strong>{pull.card.name}</strong>
            <i>{rarity.short}</i>
          </span>
          <CardArt card={pull.card} />
          <span className="card-copy">
            <span className="card-type-line">{presentation.kind} / {ARCHETYPES.find((tag) => tag.id === pull.card.tag)?.label} / MARK {presentation.mark}</span>
            <em>{pull.card.flavor}</em>
          </span>
          <span className="card-foot">
            <b style={{ color: rarity.color }}>{rarity.label}</b>
            <i>GRADE {pull.grade}</i>
          </span>
          {pull.misprintDetected && <span className="pw-misprint-stamp">MISPRINT</span>}
          {pull.foil && <span className="foil-stamp">FOIL</span>}
          {pull.filedAction === "shred" && <span className="pw-file-stamp">RULE: SHRED</span>}
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
    <span
      key={impact.serial}
      className={`opening-impact impact-${impact.rarity}`}
      style={{ "--impact-color": rarity.color, "--impact-deep": rarity.deep }}
      aria-hidden="true"
    >
      <span className="impact-flash" />
      <span className="impact-ring ring-one" />
      <span className="impact-ring ring-two" />
      <span className="impact-rays">
        {Array.from({ length: 16 }, (_, index) => <i key={index} style={{ "--ray": index }} />)}
      </span>
      <span className="impact-shards">
        {Array.from({ length: 24 }, (_, index) => (
          <i
            key={index}
            style={{
              "--shard": index,
              "--angle": `${index * 15}deg`,
              "--distance": `${110 + (index % 5) * 28}px`,
            }}
          />
        ))}
      </span>
      <span className="impact-name">
        <small>{impact.misprint ? "PRINT ANOMALY" : "PULL CONFIRMED"}</small>
        <strong>{impact.misprint ? "MISPRINT" : rarity.label}</strong>
      </span>
    </span>
  );
}

function PackDebris() {
  return (
    <span className="pack-debris" aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => (
        <i
          key={index}
          style={{
            "--debris-x": `${Math.cos(index * 1.91) * (130 + (index % 5) * 28)}px`,
            "--debris-y": `${Math.sin(index * 1.91) * (100 + (index % 4) * 24)}px`,
            "--debris-r": `${index * 73}deg`,
            "--debris-delay": `${(index % 5) * 22}ms`,
          }}
        />
      ))}
    </span>
  );
}

function Meter({ value, max, color = "var(--gold)", label }) {
  const width = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
  return (
    <span className="pw-meter" aria-label={label}>
      <i style={{ width: `${width}%`, "--meter-color": color }} />
    </span>
  );
}

function Resource({ label, value, detail, color }) {
  return (
    <div className="pw-resource" style={{ "--resource-color": color }}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function FusionPips({ count, compact = false }) {
  const level = getFusionLevel(count);
  return (
    <span className={`pw-fusion-pips ${compact ? "compact" : ""}`} aria-label={`${level} fusion stars`}>
      {FUSION_THRESHOLDS.map((threshold, index) => (
        <i key={threshold} className={index < level ? "filled" : ""}>{compact ? "" : threshold}</i>
      ))}
    </span>
  );
}

function LockedPanel({ beat, title, children }) {
  return (
    <div className="pw-locked-panel" data-augmented-ui="tl-clip br-clip border">
      <span>BEAT {String(beat).padStart(2, "0")} / LOCKED</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function SupplyPanel({ game, onBuy, onBreak, onSet, onOrder }) {
  const activeSet = getSet(game.activeSet);
  return (
    <div className="pw-panel-scroll pw-supply-panel">
      <div className="pw-panel-heading">
        <div>
          <span>SEALED INVENTORY / {activeSet.short}</span>
          <h2>Source product</h2>
        </div>
        <strong>IN PRINT · 1.0×</strong>
      </div>

      <div className="pw-set-switcher">
        {SETS.filter((set) => game.unlockedSets.includes(set.id)).map((set) => (
          <button
            key={set.id}
            className={set.id === game.activeSet ? "active" : ""}
            style={{ "--set-color": set.colors[0] }}
            onClick={() => onSet(set.id)}
          >
            <i />
            <span>{set.short}</span>
            <small>{set.name}</small>
          </button>
        ))}
      </div>

      <div className="pw-product-list">
        {PACK_PRODUCTS.slice(0, 3).map((product) => {
          const locked = product.unlockBeat > game.beat;
          const owned = getProductCount(game, game.activeSet, product.id);
          const price = getPackPrice(game, product.id);
          return (
            <article className={`pw-product ${locked ? "locked" : ""}`} key={product.id}>
              <div className="pw-product-code">{product.short}</div>
              <div className="pw-product-copy">
                <span>{product.label}</span>
                <strong>{product.packs.toLocaleString("en-US")} {product.packs === 1 ? "pack" : "packs"}</strong>
                <small>
                  {locked
                    ? `Available at beat ${product.unlockBeat}`
                    : product.discount
                      ? `${product.discount}% volume discount · manual after break`
                      : "Full manual edge · appreciation intact"}
                </small>
              </div>
              <div className="pw-product-owned">
                <small>SEALED</small>
                <strong>{owned}</strong>
              </div>
              <div className="pw-product-actions">
                <button disabled={locked || game.coins < price} onClick={() => onBuy(product.id)}>
                  BUY <b>{money(price)}</b>
                </button>
                {product.id !== "loose" && (
                  <button className="secondary" disabled={!owned} onClick={() => onBreak(product.id)}>
                    BREAK TO {product.packs}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {game.beat < 2 ? (
        <LockedPanel beat={2} title="Standing orders">
          The binder must prove it can pay before purchasing can be delegated.
        </LockedPanel>
      ) : (
        <section className="pw-order-card" data-augmented-ui="br-clip border">
          <header>
            <div>
              <span>STANDING ORDER / PURE BUYING QoL</span>
              <h3>Keep sealed stock arriving</h3>
            </div>
            <button
              className={game.standingOrder.enabled ? "active" : ""}
              onClick={() => onOrder({ enabled: !game.standingOrder.enabled })}
            >
              {game.standingOrder.enabled ? "RUNNING" : "PAUSED"}
            </button>
          </header>
          <div className="pw-order-controls">
            {PACK_PRODUCTS.filter((product) => product.unlockBeat <= game.beat && product.manualBonus).map((product) => (
              <button
                key={product.id}
                className={game.standingOrder.product === product.id ? "active" : ""}
                onClick={() => onOrder({ product: product.id })}
              >
                {product.short}
              </button>
            ))}
          </div>
          <p>Buys one unit whenever the ledger clears its price. It never breaks or opens product.</p>
          <footer>
            <span>UNITS SOURCED <b>{formatNumber(game.standingOrder.purchased)}</b></span>
            <span>CASH RESERVE <b>{money(game.standingOrder.reserve)}</b></span>
          </footer>
        </section>
      )}

      <div className="pw-market-lock">
        <span>SEALED MARKET TICKER</span>
        <strong>BEAT 06 / ROTATION</strong>
        <small>Price history begins the instant a print run closes. Your current stock is already tracked as an asset.</small>
      </div>
    </div>
  );
}

function BinderPanel({ game, setId, onSetId, onCard }) {
  const set = getSet(setId);
  const found = set.cards.filter((card) => game.collection[card.id]).length;
  return (
    <div className="pw-panel-scroll pw-binder-panel">
      <div className="pw-panel-heading">
        <div>
          <span>THE BINDER PAYS / LIVE EFFECTS</span>
          <h2>{set.name}</h2>
        </div>
        <strong>{found}/12 DISCOVERED</strong>
      </div>
      <div className="pw-binder-tabs">
        {SETS.filter((candidate) => game.unlockedSets.includes(candidate.id)).map((candidate) => (
          <button
            key={candidate.id}
            className={candidate.id === set.id ? "active" : ""}
            onClick={() => onSetId(candidate.id)}
          >
            {candidate.short}
          </button>
        ))}
      </div>
      <div className="pw-binder-grid">
        {set.cards.map((card) => {
          const count = game.collection[card.id] || 0;
          const rarity = RARITIES[card.rarity];
          const income = getCardIncome(game, card.id);
          return (
            <button
              key={card.id}
              className={`pw-binder-card ${count ? "found" : "missing"}`}
              style={{ "--rarity": rarity.color }}
              disabled={!count}
              onClick={() => count && onCard(card.id)}
            >
              <span className="pw-binder-art">
                {count ? <CardArt card={card} compact /> : <i>{String(card.number).padStart(2, "0")}</i>}
                {count > 0 && <b>x{count}</b>}
              </span>
              <span className="pw-binder-meta">
                <strong>{count ? card.name : "UNFILED"}</strong>
                <small>{count ? `+${money(income)}/s` : rarity.label}</small>
              </span>
              <FusionPips count={count} compact />
            </button>
          );
        })}
      </div>
      <section className="pw-fusion-note">
        <span>STAR FUSION / PERMANENT DUPE VALUE</span>
        <div className="pw-threshold-line">
          {FUSION_THRESHOLDS.map((threshold, index) => (
            <i key={threshold}><b>{threshold}</b><small>+{(index + 1) * 40}%</small></i>
          ))}
        </div>
        <p>Copies remain in the binder. Crossing 2, 4, 8, 16, and 32 copies raises that card’s effect by another 40%.</p>
      </section>
    </div>
  );
}

function DeckBuilder({ game, format, onChange, onFight }) {
  const sealed = format === "sealed";
  const availability = sealed ? game.sealedRun?.pool || {} : game.collection;
  const deck = sealed ? game.sealedRun?.deck || [] : game.duelDeck;
  const analysis = getDeckAnalysis(game, deck, format);
  const deckCounts = deck.reduce((counts, id) => {
    counts[id] = (counts[id] || 0) + 1;
    return counts;
  }, {});
  const cards = ALL_CARDS
    .filter((card) => availability[card.id])
    .sort((a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order || a.name.localeCompare(b.name));
  return (
    <div className="pw-deck-builder">
      <div className="pw-deck-readout">
        <div>
          <span>{sealed ? "SEALED POOL ONLY" : "CONSTRUCTED LIST"}</span>
          <strong>{deck.length}/{DECK_SIZE} CARDS</strong>
        </div>
        <div>
          <span>PROJECTED POWER</span>
          <strong>{analysis.power.toFixed(1)}</strong>
        </div>
        <Meter value={deck.length} max={DECK_SIZE} color={deck.length === DECK_SIZE ? "var(--green)" : "var(--gold)"} />
      </div>

      {game.beat >= 5 && (
        <div className="pw-archetype-strip">
          {analysis.bonuses.map((tag) => (
            <div key={tag.id} className={tag.tier ? "active" : ""} style={{ "--tag": tag.color }}>
              <span>{tag.mark}</span>
              <b>{tag.count}</b>
              <small>{tag.tier ? `T${tag.tier} +${Math.round(tag.multiplier * 100)}%` : "3 / 6 / 9"}</small>
            </div>
          ))}
        </div>
      )}

      <div className="pw-deck-card-list">
        {cards.map((card) => {
          const owned = availability[card.id] || 0;
          const inDeck = deckCounts[card.id] || 0;
          const cap = sealed ? owned : Math.min(3, owned);
          const rarity = RARITIES[card.rarity];
          return (
            <article key={card.id} style={{ "--rarity": rarity.color }}>
              <CardArt card={card} compact />
              <div>
                <strong>{card.name}</strong>
                <span>{ARCHETYPES.find((tag) => tag.id === card.tag)?.label} · PWR {card.power}</span>
                <small>{inDeck}/{cap} IN LIST · {owned} OWNED</small>
              </div>
              <button disabled={!inDeck} onClick={() => onChange(card.id, -1)}>−</button>
              <b>{inDeck}</b>
              <button disabled={deck.length >= DECK_SIZE || inDeck >= cap} onClick={() => onChange(card.id, 1)}>+</button>
            </article>
          );
        })}
      </div>
      <button className="pw-fight-button" disabled={deck.length !== DECK_SIZE} onClick={onFight}>
        <span>{sealed ? "SUBMIT SEALED LIST" : "ENTER THE LADDER"}</span>
        <strong>RUN 8-SECOND DUEL</strong>
      </button>
    </div>
  );
}

function LeaguePanel({
  game,
  format,
  setFormat,
  onDeckChange,
  onDuel,
  onStartSealed,
  onOpenSealed,
  onAbandonSealed,
}) {
  if (game.beat < 3) {
    return (
      <div className="pw-panel-scroll">
        <div className="pw-panel-heading">
          <div><span>LEAGUE DESK / CLOSED</span><h2>First duel</h2></div>
        </div>
        <LockedPanel beat={3} title="The deck is the only input">
          Open six packs and discover eight different cards. A valid list uses exactly twelve physical copies from your binder.
        </LockedPanel>
      </div>
    );
  }

  const run = game.sealedRun;
  return (
    <div className="pw-panel-scroll pw-league-panel">
      <div className="pw-panel-heading">
        <div><span>LOCAL LEAGUE / PRIZES STAY SEALED</span><h2>Match desk</h2></div>
        <strong>{game.duelsWon + game.sealedWins} WINS</strong>
      </div>
      <div className="pw-format-tabs">
        <button className={format === "constructed" ? "active" : ""} onClick={() => setFormat("constructed")}>
          CONSTRUCTED
          <small>BINDER LEGAL</small>
        </button>
        <button
          className={format === "sealed" ? "active" : ""}
          disabled={game.beat < 4}
          onClick={() => game.beat >= 4 && setFormat("sealed")}
        >
          SEALED
          <small>{game.beat < 4 ? "BEAT 04" : "6 PACK POOL"}</small>
        </button>
      </div>

      {format === "constructed" && (
        <>
          <div className="pw-prize-line">
            <span>WIN PRIZE</span><strong>3 LOOSE PACKS</strong><small>No loose cards. No cash. Product only.</small>
          </div>
          <DeckBuilder game={game} format="constructed" onChange={(id, delta) => onDeckChange(id, delta, "constructed")} onFight={() => onDuel("constructed")} />
        </>
      )}

      {format === "sealed" && game.beat >= 4 && !run && (
        <div className="pw-sealed-entry">
          <div className="pw-sealed-hero">
            <PackFace set={getSet(game.activeSet)} small />
            <span className="pw-sealed-stack">×6</span>
          </div>
          <span>BEAT 04 / THE LOAD-BEARING FORMAT</span>
          <h3>Six packs. No binder.</h3>
          <p>Commit six loose packs, open all thirty-six cards by hand, then build a twelve-card deck from that pool alone. The reveal is the match.</p>
          <dl>
            <div><dt>ENTRY</dt><dd>{SEALED_ENTRY_PACKS} loose packs</dd></div>
            <div><dt>YOUR STOCK</dt><dd>{getProductCount(game, game.activeSet, "loose")}</dd></div>
            <div><dt>WIN PRIZE</dt><dd>4 sealed packs</dd></div>
          </dl>
          <button
            disabled={getProductCount(game, game.activeSet, "loose") < SEALED_ENTRY_PACKS}
            onClick={onStartSealed}
          >
            COMMIT SIX PACKS
          </button>
        </div>
      )}

      {format === "sealed" && run?.phase === "opening" && (
        <div className="pw-sealed-progress">
          <div className="pw-sealed-counter">
            <span>RESTRICTED POOL / {getSet(run.setId).short}</span>
            <strong>{run.opened}<i>/6</i></strong>
            <small>PACKS OPENED</small>
          </div>
          <Meter value={run.opened} max={SEALED_ENTRY_PACKS} color={getSet(run.setId).colors[0]} />
          <p>{Object.values(run.pool).reduce((sum, count) => sum + count, 0)} cards are registered to this pool. Binder cards cannot enter.</p>
          <button className="pw-open-sealed-button" onClick={onOpenSealed}>
            OPEN PACK {run.opened + 1} OF 6
          </button>
          <button className="pw-abandon-button" onClick={onAbandonSealed}>ABANDON RUN / OPENED CARDS STAY FILED</button>
        </div>
      )}

      {format === "sealed" && run?.phase === "deck" && (
        <>
          <div className="pw-prize-line">
            <span>POOL LOCKED</span><strong>36 CARDS REGISTERED</strong><small>Build twelve. No binder access.</small>
          </div>
          <DeckBuilder game={game} format="sealed" onChange={(id, delta) => onDeckChange(id, delta, "sealed")} onFight={() => onDuel("sealed")} />
        </>
      )}
    </div>
  );
}

function SystemsPanel({ game, onAddRule, onUpdateRule, onRemoveRule, onForge }) {
  return (
    <div className="pw-panel-scroll pw-systems-panel">
      <div className="pw-panel-heading">
        <div><span>PROCESS DESIGN / HUMAN CEILING</span><h2>Rules & forge</h2></div>
        <strong>{formatNumber(game.forgeMaterial)} OFFCUTS</strong>
      </div>
      {game.beat < 4 ? (
        <LockedPanel beat={4} title="Filing rules">
          Sorting unlocks only after you prove the deck loop. Rules may process duplicates; they never create a card.
        </LockedPanel>
      ) : (
        <section className="pw-rules">
          <header>
            <div><span>FILING RULES</span><h3>Write the machine’s boundaries</h3></div>
            <button disabled={game.filingRules.length >= 6} onClick={onAddRule}>ADD RULE</button>
          </header>
          <p>Star fusion is automatic. A shred rule only catches copies above its threshold and converts them into forge offcuts.</p>
          <div className="pw-rule-list">
            {game.filingRules.length === 0 && (
              <div className="pw-empty-rule">
                <strong>NO RULES WRITTEN</strong>
                <span>Every pull is filed. Add a rule when a duplicate tier becomes true bulk.</span>
              </div>
            )}
            {game.filingRules.map((rule, index) => (
              <article className={rule.enabled ? "" : "disabled"} key={rule.id}>
                <span className="pw-rule-index">{String(index + 1).padStart(2, "0")}</span>
                <label>
                  <small>IF RARITY</small>
                  <select value={rule.rarity} onChange={(event) => onUpdateRule(rule.id, { rarity: event.target.value })}>
                    <option value="any">ANY</option>
                    {RARITY_IDS.slice(0, 5).map((id) => <option value={id} key={id}>{RARITIES[id].label.toUpperCase()}</option>)}
                  </select>
                </label>
                <span className="pw-rule-and">AND COUNT &gt;</span>
                <label>
                  <small>THRESHOLD</small>
                  <select value={rule.threshold} onChange={(event) => onUpdateRule(rule.id, { threshold: Number(event.target.value) })}>
                    {FUSION_THRESHOLDS.map((threshold) => <option value={threshold} key={threshold}>{threshold}</option>)}
                  </select>
                </label>
                <span className="pw-rule-arrow">→</span>
                <strong>SHRED</strong>
                <button className="pw-rule-toggle" onClick={() => onUpdateRule(rule.id, { enabled: !rule.enabled })}>
                  {rule.enabled ? "ON" : "OFF"}
                </button>
                <button className="pw-rule-remove" onClick={() => onRemoveRule(rule.id)}>×</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {game.beat < 5 ? (
        <LockedPanel beat={5} title="Pack forge">
          Win sealed to unlock targeted product. The forge still outputs a closed pack, never a chosen card.
        </LockedPanel>
      ) : (
        <section className="pw-forge">
          <header>
            <div><span>PACK FORGE / {getSet(game.activeSet).short}</span><h3>Bias a sealed pack toward a tag</h3></div>
            <strong>{FORGE_COST} OFFCUTS / PACK</strong>
          </header>
          <p>A forged pack keeps ordinary rarity odds. It only biases which card appears after rarity is rolled.</p>
          <div className="pw-forge-grid">
            {ARCHETYPES.map((tag) => (
              <article key={tag.id} style={{ "--tag": tag.color }}>
                <span>{tag.mark}</span>
                <div><strong>{tag.label}</strong><small>{tag.detail}</small></div>
                <b>{getForgedCount(game, game.activeSet, tag.id)} SEALED</b>
                <button disabled={game.forgeMaterial < FORGE_COST} onClick={() => onForge(tag.id)}>FORGE</button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BeatRail({ game }) {
  const progress = getBeatProgress(game);
  return (
    <footer className="pw-beat-rail">
      <div className="pw-beat-current">
        <span>ACTIVE BEAT</span>
        <strong>{String(game.beat).padStart(2, "0")} / {BEATS[game.beat - 1].name}</strong>
        <small>OPENING IS {BEATS[game.beat - 1].opening.toUpperCase()}</small>
      </div>
      <div className="pw-beat-track">
        {BEATS.slice(0, 5).map((beat) => (
          <div key={beat.id} className={`${beat.id < game.beat ? "complete" : ""} ${beat.id === game.beat ? "active" : ""}`}>
            <i>{String(beat.id).padStart(2, "0")}</i>
            <span><b>{beat.name}</b><small>{beat.opening}</small></span>
          </div>
        ))}
      </div>
      <div className="pw-beat-objective">
        <span>NEXT PROMOTION</span>
        <strong>{progress.label}</strong>
        <Meter value={progress.value} max={progress.max} color="var(--gold)" />
      </div>
    </footer>
  );
}

function CardDetail({ game, cardId, onClose }) {
  const card = getCard(cardId);
  if (!card) return null;
  const set = getSet(card.setId);
  const rarity = RARITIES[card.rarity];
  const count = game.collection[card.id] || 0;
  const tag = ARCHETYPES.find((candidate) => candidate.id === card.tag);
  return (
    <div className="pw-modal-scrim" onMouseDown={onClose}>
      <article className="pw-card-detail" onMouseDown={(event) => event.stopPropagation()} style={{ "--rarity": rarity.color }}>
        <button className="pw-modal-close" onClick={onClose}>CLOSE</button>
        <div className="pw-detail-art"><CardArt card={card} /></div>
        <div className="pw-detail-copy">
          <span>{set.name} / {set.short}-{String(card.number).padStart(2, "0")}</span>
          <h2>{card.name}</h2>
          <p>{card.flavor}</p>
          <div className="pw-detail-tag" style={{ "--tag": tag.color }}><i>{tag.mark}</i><strong>{tag.label}</strong><small>PWR {card.power} / GUARD {card.guard}</small></div>
          <dl>
            <div><dt>PRINTED RARITY</dt><dd style={{ color: rarity.color }}>{rarity.label}</dd></div>
            <div><dt>COPIES FILED</dt><dd>{count}</dd></div>
            <div><dt>BEST MANUAL GRADE</dt><dd>{game.bestGrades[card.id] || "—"}</dd></div>
            <div><dt>DETECTED MISPRINTS</dt><dd>{game.misprints[card.id] || 0}</dd></div>
            <div><dt>BINDER EFFECT</dt><dd>+{money(getCardIncome(game, card.id))}/s</dd></div>
          </dl>
          <span className="pw-detail-fusion-label">STAR FUSION / +40% EACH</span>
          <FusionPips count={count} />
        </div>
      </article>
    </div>
  );
}

function DuelPlayback({ playback, onClose }) {
  if (!playback) return null;
  const { result, round, complete } = playback;
  return (
    <div className={`pw-duel-layer ${complete ? "complete" : ""} ${result.win ? "won" : "lost"}`}>
      <div className="pw-duel-noise" />
      <header>
        <span>{result.format === "sealed" ? "SEALED TABLE" : "DISTRICT LADDER"} / MATCH {result.format === "sealed" ? "S-04" : "C-12"}</span>
        <strong>{complete ? (result.win ? "MATCH WON" : "MATCH LOST") : `EXCHANGE ${Math.min(round + 1, 4)} / 4`}</strong>
      </header>
      <div className="pw-duel-stage">
        <section className="pw-duel-side player">
          <span>YOUR LIST</span>
          <strong>{result.playerPower.toFixed(1)}</strong>
          <small>PROJECTED POWER</small>
          <div className="pw-duel-cards">
            {Array.from({ length: 6 }, (_, index) => <i key={index} style={{ "--card-index": index }} />)}
          </div>
        </section>
        <div className="pw-duel-clash">
          <i />
          <strong>VS</strong>
          <span className="pw-duel-pulse" />
        </div>
        <section className="pw-duel-side opponent">
          <span>SHOP REGULAR</span>
          <strong>{result.opponentPower.toFixed(1)}</strong>
          <small>FIELD POWER</small>
          <div className="pw-duel-cards">
            {Array.from({ length: 6 }, (_, index) => <i key={index} style={{ "--card-index": index }} />)}
          </div>
        </section>
      </div>
      <div className="pw-duel-log">
        {result.log.map((line, index) => (
          <p key={line} className={index <= round ? "visible" : ""}><i>{String(index + 1).padStart(2, "0")}</i>{line}</p>
        ))}
      </div>
      <div className="pw-duel-timeline"><i /></div>
      {complete && (
        <div className="pw-duel-result">
          <span>{result.win ? "PRIZE TRANSFER AUTHORIZED" : "NO DIRECT CARD AWARD"}</span>
          <strong>{result.win ? `+${result.rewardPacks} SEALED PACKS` : "REBUILD AND RUN IT BACK"}</strong>
          <button onClick={onClose}>RETURN TO THE DESK</button>
        </div>
      )}
    </div>
  );
}

export default function PackworksGameV2() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const audioRef = useRef(null);
  const gameRef = useRef(createInitialState(0));
  const openingTimersRef = useRef([]);
  const duelTimersRef = useRef([]);
  const revealLocksRef = useRef(new Set());
  const impactSerialRef = useRef(0);
  const toastSerialRef = useRef(0);
  const signalAtRef = useRef(0);

  const [game, setGame] = useState(() => createInitialState(0));
  const [ready, setReady] = useState(false);
  const [introOpen, setIntroOpen] = useState(true);
  const [tab, setTab] = useState("supply");
  const [binderSetId, setBinderSetId] = useState("corner");
  const [format, setFormat] = useState("constructed");
  const [source, setSource] = useState("loose");
  const [opening, setOpening] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [offlineReport, setOfflineReport] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [eraseConfirm, setEraseConfirm] = useState(false);
  const [duelPlayback, setDuelPlayback] = useState(null);
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

  const pushToast = useCallback((title, detail, tone = "neutral", duration = 3600) => {
    const id = ++toastSerialRef.current;
    setToasts((current) => [...current.slice(-3), { id, title, detail, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), duration);
  }, []);

  const announceBeat = useCallback((before, after) => {
    if (after <= before) return;
    const beat = BEATS[after - 1];
    getAudio().sound("promotion");
    sceneRef.current?.burst("legendary", 1.4);
    pushToast(`BEAT ${String(after).padStart(2, "0")} UNLOCKED`, `${beat.name} · opening becomes ${beat.opening.toLowerCase()}`, "legendary", 6200);
  }, [getAudio, pushToast]);

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
    if (!ready || introOpen) return undefined;
    let last = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const seconds = Math.min(1, (now - last) / 1000);
      last = now;
      const current = gameRef.current;
      const next = tickEconomy(current, seconds);
      if (next !== current) {
        const ordered = next.standingOrder.purchased - current.standingOrder.purchased;
        commit(next);
        if (ordered > 0) sceneRef.current?.purchase();
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [commit, introOpen, ready]);

  const clearOpeningTimers = useCallback(() => {
    openingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    openingTimersRef.current = [];
  }, []);

  const clearDuelTimers = useCallback(() => {
    duelTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    duelTimersRef.current = [];
  }, []);

  const closeOpening = useCallback(() => {
    clearOpeningTimers();
    revealLocksRef.current.clear();
    setOpening(null);
    sceneRef.current?.setOpening(false);
  }, [clearOpeningTimers]);

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
      misprint: pull.misprintDetected,
      serial: ++impactSerialRef.current,
    };
    setOpening((current) => current?.id === opening.id
      ? { ...current, phase: isLast ? "complete" : "ready", revealed, impact }
      : current);

    sceneRef.current?.burst(pull.rarity, rarity.order >= 3 ? 1.55 : 0.9);
    const audio = getAudio();
    audio.sound("reveal", rarity.order);
    if (pull.misprintDetected) audio.sound("misprint");
    else if (pull.fusionAfter > pull.fusionBefore) audio.sound("fusion", pull.fusionAfter);
    else if (rarity.order >= 4) audio.sound("legendary");

    if (isLast) {
      const settleDelay = gameRef.current.settings.quickOpen
        ? 260
        : rarity.order >= 4 ? 1450 : rarity.order === 3 ? 1020 : 720;
      openingTimersRef.current.push(window.setTimeout(() => {
        audio.sound("packComplete");
        setOpening((current) => current?.id === opening.id ? { ...current, phase: "summary", impact: null } : current);
      }, settleDelay));
    }
  }, [getAudio, opening]);

  const beginManualOpen = useCallback((forcedSource = null) => {
    if (!ready || introOpen || settingsOpen || selectedCard || offlineReport || duelPlayback) return;
    if (opening && opening.phase !== "summary") return;
    const current = gameRef.current;
    const sealedContext = current.sealedRun?.phase === "opening";
    const requestedSource = sealedContext ? "sealed" : (forcedSource || source);
    const beforeBeat = current.beat;
    const rolled = openPack(current, {
      manual: true,
      context: sealedContext ? "sealed" : "binder",
      source: requestedSource,
      now: Date.now(),
    });
    if (!rolled.result) {
      getAudio().sound("deny");
      if (rolled.error === "MANUAL_RATE_CAP") {
        pushToast("THE WRAPPER IS STILL SETTLING", "Manual witness is capped near forty packs per minute.", "warning");
      } else {
        pushToast("NO OPENABLE STOCK", "Buy a loose pack or break sealed bulk first.", "warning");
        setTab("supply");
        setMobilePanelOpen(true);
      }
      return;
    }

    clearOpeningTimers();
    revealLocksRef.current.clear();
    closeOpening();
    commit(rolled.state);
    announceBeat(beforeBeat, rolled.state.beat);
    setBinderSetId(rolled.state.activeSet);
    sceneRef.current?.packPulse();
    sceneRef.current?.setOpening(true);
    const audio = getAudio();
    audio.ensure();
    audio.sound("pack");
    const id = `${Date.now()}-${rolled.state.packsOpened}`;
    setOpening({ id, result: rolled.result, phase: "sealed", revealed: [], impact: null });
    const quick = rolled.state.settings.quickOpen || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tearDelay = quick ? 50 : 300;
    const dealDelay = quick ? 150 : 860;
    openingTimersRef.current.push(window.setTimeout(() => {
      setOpening((value) => value?.id === id ? { ...value, phase: "torn" } : value);
      audio.sound("tear");
    }, tearDelay));
    openingTimersRef.current.push(window.setTimeout(() => {
      setOpening((value) => value?.id === id ? { ...value, phase: "ready" } : value);
      audio.sound("deal");
    }, dealDelay));
  }, [
    announceBeat,
    clearOpeningTimers,
    closeOpening,
    commit,
    duelPlayback,
    getAudio,
    introOpen,
    offlineReport,
    opening,
    pushToast,
    ready,
    selectedCard,
    settingsOpen,
    source,
  ]);

  const handleBuy = useCallback((productId) => {
    const current = gameRef.current;
    const next = buyProduct(current, productId);
    if (next === current) {
      getAudio().sound("deny");
      return;
    }
    commit(next);
    getAudio().sound("purchase");
    sceneRef.current?.purchase();
  }, [commit, getAudio]);

  const handleBreak = useCallback((productId) => {
    const current = gameRef.current;
    const next = breakProduct(current, productId);
    if (next === current) return;
    commit(next);
    getAudio().sound("caseBreak");
    sceneRef.current?.burst("rare", 0.7);
    pushToast("SEAL BROKEN", `${PACK_PRODUCTS.find((product) => product.id === productId).packs} loose packs moved to the opening table`, "success");
  }, [commit, getAudio, pushToast]);

  const handleSet = useCallback((setId) => {
    const next = selectSet(gameRef.current, setId);
    if (next === gameRef.current) return;
    commit(next);
    setBinderSetId(setId);
    setSource("loose");
    getAudio().sound("switch");
    sceneRef.current?.purchase();
  }, [commit, getAudio]);

  const beginDuelPlayback = useCallback((result, nextState, beforeBeat) => {
    clearDuelTimers();
    commit(nextState);
    announceBeat(beforeBeat, nextState.beat);
    const audio = getAudio();
    audio.ensure();
    audio.sound("duelStart");
    setDuelPlayback({ result, round: 0, complete: false });
    const duration = gameRef.current.settings.reducedEffects ? 3200 : 8000;
    const segment = duration / 4;
    for (let index = 1; index < 4; index += 1) {
      duelTimersRef.current.push(window.setTimeout(() => {
        setDuelPlayback((current) => current ? { ...current, round: index } : current);
        audio.sound("duelRound", index);
      }, segment * index));
    }
    duelTimersRef.current.push(window.setTimeout(() => {
      setDuelPlayback((current) => current ? { ...current, round: 3, complete: true } : current);
      audio.sound(result.win ? "duelWin" : "duelLoss");
      if (result.win) sceneRef.current?.burst("legendary", 1.1);
    }, duration));
  }, [announceBeat, clearDuelTimers, commit, getAudio]);

  const handleDuel = useCallback((duelFormat) => {
    const current = gameRef.current;
    const beforeBeat = current.beat;
    const resolved = duelFormat === "sealed" ? resolveSealedDuel(current) : resolveDuel(current);
    if (!resolved.result) {
      getAudio().sound("deny");
      pushToast("LIST INCOMPLETE", `A legal deck contains exactly ${DECK_SIZE} cards.`, "warning");
      return;
    }
    beginDuelPlayback(resolved.result, resolved.state, beforeBeat);
  }, [beginDuelPlayback, getAudio, pushToast]);

  const handleStartSealed = useCallback(() => {
    const current = gameRef.current;
    const next = startSealedRun(current);
    if (next === current) {
      getAudio().sound("deny");
      return;
    }
    commit(next);
    getAudio().sound("sealedEntry");
  }, [commit, getAudio]);

  const handleForge = useCallback((tagId) => {
    const current = gameRef.current;
    const next = forgePack(current, tagId);
    if (next === current) {
      getAudio().sound("deny");
      return;
    }
    commit(next);
    setSource(`forged:${tagId}`);
    getAudio().sound("forge");
    sceneRef.current?.burst("epic", 0.9);
    pushToast("FORGED PACK SEALED", `${ARCHETYPES.find((tag) => tag.id === tagId).label} card selection biased; rarity odds unchanged`, "gold");
  }, [commit, getAudio, pushToast]);

  const toggleSetting = useCallback((key) => {
    commit((current) => ({ ...current, settings: { ...current.settings, [key]: !current.settings[key] } }));
    getAudio().sound("switch");
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
    setTab("supply");
    setFormat("constructed");
    setSource("loose");
    closeOpening();
  }, [closeOpening, commit, eraseConfirm]);

  useEffect(() => () => {
    clearOpeningTimers();
    clearDuelTimers();
  }, [clearDuelTimers, clearOpeningTimers]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat) return;
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        beginManualOpen();
      } else if (event.key.toLowerCase() === "i") {
        setTab("supply");
        setMobilePanelOpen(true);
      } else if (event.key.toLowerCase() === "b") {
        setTab("binder");
        setMobilePanelOpen(true);
      } else if (event.key.toLowerCase() === "l") {
        setTab("league");
        setMobilePanelOpen(true);
      } else if (event.key.toLowerCase() === "r") {
        setTab("systems");
        setMobilePanelOpen(true);
      } else if (event.key.toLowerCase() === "m") {
        commit((current) => ({ ...current, settings: { ...current.settings, sound: !current.settings.sound } }));
      } else if (event.key === "Escape") {
        if (selectedCard) setSelectedCard(null);
        else if (settingsOpen) setSettingsOpen(false);
        else if (opening?.phase === "summary") closeOpening();
        else if (duelPlayback?.complete) setDuelPlayback(null);
        else setMobilePanelOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beginManualOpen, closeOpening, commit, duelPlayback, opening, selectedCard, settingsOpen]);

  useEffect(() => {
    audioRef.current?.setEnabled(game.settings.sound);
  }, [game.settings.sound]);

  useEffect(() => {
    const preventSelection = (event) => event.preventDefault();
    document.addEventListener("selectstart", preventSelection);
    return () => document.removeEventListener("selectstart", preventSelection);
  }, []);

  const derived = useMemo(() => getDerived(game), [game]);
  const activeSet = getSet(game.activeSet);
  const forgedSources = ARCHETYPES
    .map((tag) => ({ ...tag, count: getForgedCount(game, game.activeSet, tag.id) }))
    .filter((tag) => tag.count > 0);
  const sealedOpening = game.sealedRun?.phase === "opening";
  const selectedSourceCount = source === "loose"
    ? getProductCount(game, game.activeSet, "loose")
    : getForgedCount(game, game.activeSet, source.replace("forged:", ""));

  return (
    <main className={`packworks pw2 ${game.settings.reducedEffects ? "reduced-effects" : ""} ${opening ? "opening-active" : ""}`}>
      <header className="pw-topbar">
        <div className="pw-wordmark">
          <span className="wordmark-cube"><i /><i /><i /></span>
          <div><strong>PACKWORKS</strong><small>THE NIGHT DESK / LOCAL LEAGUE 04</small></div>
        </div>
        <div className="pw-resource-row">
          <Resource label="CASH LEDGER" value={money(game.coins)} detail={`+${money(derived.passiveRate)}/s from binder`} color="#f0c667" />
          <Resource label="SEALED ASSETS" value={`${formatNumber(derived.sealedPacks)} packs`} detail={`mark ${money(derived.sealedAssetValue)}`} color="#64c9b7" />
          <Resource label="MANUAL HEAT" value={`+${derived.heatPercent.toFixed(1)}%`} detail={`${game.pityLegendary} packs since gold`} color="#e87551" />
          <Resource label="BINDER" value={`${derived.discoveredCount}/60`} detail={`${derived.fusionStars} fusion stars`} color="#b98ae8" />
        </div>
        <div className="pw-top-actions">
          <button className={game.settings.sound ? "active" : ""} onClick={() => toggleSetting("sound")}>
            SOUND {game.settings.sound ? "ON" : "OFF"}
          </button>
          <button onClick={() => setSettingsOpen(true)}>OPTIONS</button>
        </div>
      </header>

      <div className="pw-workspace">
        <section className="pw-scene-shell" onPointerMove={(event) => sceneRef.current?.setPointer(event.clientX, event.clientY)}>
          <canvas
            ref={canvasRef}
            className="scene-canvas"
            aria-label="Animated isometric card workshop"
            onClick={() => !opening && beginManualOpen()}
          />
          <div className="pw-scene-vignette" />
          <div className="pw-scene-header">
            <span>OPENING TABLE / {activeSet.short}</span>
            <strong>{activeSet.name}</strong>
            <small>{sealedOpening ? "SEALED EVENT STOCK · RESTRICTED POOL" : activeSet.tagline}</small>
          </div>
          <div className="pw-manual-edge" data-augmented-ui="tl-clip br-clip border">
            <span>HAND OPEN / PERMANENT EDGE</span>
            <div>
              <b>+25%</b><small>HIT SLOT</small>
              <b>100%</b><small>MISPRINT READ</small>
              <b>LIVE</b><small>GRADE + HEAT</small>
            </div>
          </div>
          <div className="pw-source-rack">
            {sealedOpening ? (
              <button className="active">
                <span>SEALED RUN</span>
                <strong>{game.sealedRun.remainingPacks}</strong>
              </button>
            ) : (
              <>
                <button className={source === "loose" ? "active" : ""} onClick={(event) => { event.stopPropagation(); setSource("loose"); }}>
                  <span>LOOSE</span>
                  <strong>{getProductCount(game, game.activeSet, "loose")}</strong>
                </button>
                {forgedSources.map((tag) => (
                  <button
                    key={tag.id}
                    className={source === `forged:${tag.id}` ? "active" : ""}
                    style={{ "--source": tag.color }}
                    onClick={(event) => { event.stopPropagation(); setSource(`forged:${tag.id}`); }}
                  >
                    <span>{tag.mark} CUT</span>
                    <strong>{tag.count}</strong>
                  </button>
                ))}
              </>
            )}
          </div>
          <button
            className="pw-open-button"
            data-augmented-ui="tl-clip br-clip both"
            disabled={!sealedOpening && selectedSourceCount < 1}
            onClick={(event) => { event.stopPropagation(); beginManualOpen(); }}
          >
            <span className="pw-open-key">SPACE</span>
            <span><small>{sealedOpening ? `SEALED PACK ${game.sealedRun.opened + 1} / 6` : "MANUAL OPEN / 6 CARDS"}</small><strong>BREAK THE FOIL</strong></span>
            <i>{sealedOpening ? game.sealedRun.remainingPacks : selectedSourceCount}<small>READY</small></i>
          </button>
          <div className="pw-rule-plaque">
            <span>THE PACK IS THE ONLY DOOR</span>
            <small>Nothing on this desk can issue a loose card.</small>
          </div>
          <button className="pw-mobile-panel" onClick={() => setMobilePanelOpen((value) => !value)}>
            {mobilePanelOpen ? "CLOSE DESK" : `${tab.toUpperCase()} DESK`}
          </button>
        </section>

        <aside className={`pw-side-panel ${mobilePanelOpen ? "mobile-open" : ""}`}>
          <nav className="pw-panel-tabs">
            {[
              ["supply", "STOCK", "I"],
              ["binder", "BINDER", "B"],
              ["league", "PLAY", "L"],
              ["systems", "RULES", "R"],
            ].map(([id, label, key]) => (
              <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                <span>{label}</span><kbd>{key}</kbd>
                {id === "league" && game.beat >= 3 && game.duelsWon === 0 && <i />}
                {id === "systems" && game.beat >= 4 && game.filingRules.length === 0 && <i />}
              </button>
            ))}
          </nav>
          <div className="pw-panel-body">
            {tab === "supply" && (
              <SupplyPanel
                game={game}
                onBuy={handleBuy}
                onBreak={handleBreak}
                onSet={handleSet}
                onOrder={(patch) => commit(configureStandingOrder(gameRef.current, patch))}
              />
            )}
            {tab === "binder" && (
              <BinderPanel game={game} setId={binderSetId} onSetId={setBinderSetId} onCard={setSelectedCard} />
            )}
            {tab === "league" && (
              <LeaguePanel
                game={game}
                format={format}
                setFormat={setFormat}
                onDeckChange={(id, delta, deckFormat) => commit(changeDeckCard(gameRef.current, id, delta, deckFormat))}
                onDuel={handleDuel}
                onStartSealed={handleStartSealed}
                onOpenSealed={() => beginManualOpen("sealed")}
                onAbandonSealed={() => commit(abandonSealedRun(gameRef.current))}
              />
            )}
            {tab === "systems" && (
              <SystemsPanel
                game={game}
                onAddRule={() => commit(addFilingRule(gameRef.current))}
                onUpdateRule={(id, patch) => commit(updateFilingRule(gameRef.current, id, patch))}
                onRemoveRule={(id) => commit(removeFilingRule(gameRef.current, id))}
                onForge={handleForge}
              />
            )}
          </div>
        </aside>
      </div>

      <BeatRail game={game} />

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
              {opening.result.context === "sealed" ? "SEALED POOL" : opening.result.set.name}
              <i> / MANUAL WITNESS</i>
            </span>
            <div className="opening-progress" aria-label={`${opening.revealed.length} of ${opening.result.cards.length} cards revealed`}>
              {opening.result.cards.map((pull, index) => (
                <i
                  key={`${pull.card.id}-${index}-progress`}
                  className={opening.revealed.includes(index) ? "revealed" : ""}
                  style={{ "--dot-color": RARITIES[pull.rarity].color }}
                />
              ))}
            </div>
            <small>
              {opening.phase === "summary"
                ? "ALL SIX WITNESSED"
                : opening.phase === "ready"
                  ? `${opening.revealed.length}/6 TURNED / SIGNALS ARE NOT CERTIFICATION`
                  : "BREAKING FACTORY SEAL"}
            </small>
          </div>
          <div className="foil-pack-wrap">
            <div className="foil-half foil-top"><PackFace set={opening.result.set} forgedTag={opening.result.tagBias} /></div>
            <div className="foil-half foil-bottom"><PackFace set={opening.result.set} forgedTag={opening.result.tagBias} /></div>
            <span className="tear-ribbon">PW / MANUAL WITNESS REQUIRED</span>
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
            <div className="opening-instruction">
              <span>RARITY SIGNAL / 12% FALSE-POSITIVE RATE</span>
              <strong>{opening.phase === "complete" ? "FINAL CARD FILED" : "HOVER FOR THE TELL · CLICK EACH CARD TO TURN"}</strong>
            </div>
          )}
          <OpeningImpact impact={opening.impact} />
          {opening.phase === "summary" && (
            <div className="opening-summary pw-opening-summary" data-augmented-ui="tl-clip tr-clip border">
              <div className="summary-total">
                <span>{opening.result.context === "sealed" ? "RESTRICTED POOL" : "BINDER EFFECT CHANGE"}</span>
                <strong>{opening.result.context === "sealed" ? `+6 CARDS` : `+${money(opening.result.incomeDelta)}/s`}</strong>
                <small>
                  {opening.result.detectedMisprints.length
                    ? `${opening.result.detectedMisprints.length} MISPRINT DETECTED BY HAND`
                    : opening.result.fusionEvents.length
                      ? `${opening.result.fusionEvents.length} STAR FUSION ${opening.result.fusionEvents.length === 1 ? "UPGRADE" : "UPGRADES"}`
                      : `+1 FORGE OFFCUT · ${opening.result.falseSignals} FALSE ${opening.result.falseSignals === 1 ? "SIGNAL" : "SIGNALS"}`}
                </small>
              </div>
              <div className="summary-actions">
                <button className="summary-secondary" onClick={() => {
                  closeOpening();
                  if (gameRef.current.sealedRun?.phase === "deck") {
                    setTab("league");
                    setFormat("sealed");
                    setMobilePanelOpen(true);
                  }
                }}>
                  {game.sealedRun?.phase === "deck" ? "BUILD SEALED DECK" : "RETURN TO DESK"} <kbd>ESC</kbd>
                </button>
                {(opening.result.context !== "sealed" || game.sealedRun?.phase === "opening") && (
                  <button className="summary-primary" onClick={(event) => {
                    event.stopPropagation();
                    beginManualOpen(opening.result.context === "sealed" ? "sealed" : opening.result.source);
                  }}>
                    {opening.result.context === "sealed" ? `OPEN PACK ${game.sealedRun.opened + 1} OF 6` : "OPEN ANOTHER"} <kbd>SPACE</kbd>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {introOpen && ready && (
        <div className="pw-intro">
          <div className="pw-intro-grid" />
          <section className="pw-intro-copy">
            <span>NIGHT DESK APPOINTMENT / STARTER STOCK 003</span>
            <h1>EVERYTHING<br />STARTS <i>SEALED.</i></h1>
            <p>Open packs for cards. File cards for income. Decide which appreciating product you can afford to destroy for material now.</p>
            <div className="pw-intro-rules">
              <div><b>01</b><span><strong>THE PACK IS THE ONLY DOOR</strong><small>No match, machine, or milestone issues a loose card.</small></span></div>
              <div><b>02</b><span><strong>SEALED PRODUCT IS AN ASSET</strong><small>Opening creates power and destroys optionality.</small></span></div>
              <div><b>03</b><span><strong>MACHINES CANNOT SEE</strong><small>Heat, grade, and anomalies require your hand.</small></span></div>
            </div>
            <button onClick={() => {
              setIntroOpen(false);
              getAudio().ensure();
              getAudio().sound("start");
            }}>
              TAKE THE NIGHT DESK <span>ENTER</span>
            </button>
          </section>
          <section className="pw-intro-product">
            <div className="pw-intro-pack-stack"><i /><i /><PackFace set={SETS[0]} /></div>
            <div className="pw-intro-manifest">
              <span>STARTER MANIFEST</span>
              <strong>3 LOOSE PACKS</strong>
              <small>18 CARDS · CASH 0 · ALL SIGNALS UNVERIFIED</small>
            </div>
          </section>
          <footer><span>PACKWORKS TRADING CO.</span><span>LOCAL SAVE / NO ACCOUNT / NO DIRECT CARD GRANTS</span></footer>
        </div>
      )}

      {offlineReport && (
        <div className="pw-modal-scrim">
          <article className="pw-offline-card">
            <span>OVERNIGHT LEDGER / MAXIMUM 8 HOURS</span>
            <h2>The binder kept paying.</h2>
            <div>
              <section><strong>+{money(offlineReport.coins)}</strong><small>CASH ACCRUED</small></section>
              <section><strong>{formatNumber(offlineReport.ordered)}</strong><small>SEALED UNITS SOURCED</small></section>
            </div>
            <p>No product was opened while you were away. Standing orders only moved sealed inventory onto the shelf.</p>
            <button onClick={() => setOfflineReport(null)}>STAMP THE LEDGER</button>
          </article>
        </div>
      )}

      {settingsOpen && (
        <div className="pw-modal-scrim" onMouseDown={() => setSettingsOpen(false)}>
          <article className="pw-settings" onMouseDown={(event) => event.stopPropagation()}>
            <button className="pw-modal-close" onClick={() => setSettingsOpen(false)}>CLOSE</button>
            <span>DESK CONTROLS / LOCAL PROFILE</span>
            <h2>Options</h2>
            <div>
              <button onClick={() => toggleSetting("sound")}><span><strong>Sound mix</strong><small>Foil, tells, impact, machines, and duel sequence</small></span><b>{game.settings.sound ? "ON" : "OFF"}</b></button>
              <button onClick={() => toggleSetting("quickOpen")}><span><strong>Quick foil break</strong><small>Shortens packaging only; every card remains manual</small></span><b>{game.settings.quickOpen ? "ON" : "OFF"}</b></button>
              <button onClick={() => toggleSetting("reducedEffects")}><span><strong>Reduced motion</strong><small>Limits flashes and shortens duel playback to 3.2 seconds</small></span><b>{game.settings.reducedEffects ? "ON" : "OFF"}</b></button>
            </div>
            <p><kbd>SPACE</kbd> OPEN · <kbd>I</kbd> STOCK · <kbd>B</kbd> BINDER · <kbd>L</kbd> PLAY · <kbd>R</kbd> RULES · <kbd>M</kbd> SOUND</p>
            <button className={`pw-erase ${eraseConfirm ? "confirm" : ""}`} onClick={eraseSave}>
              {eraseConfirm ? "CONFIRM / ERASE ALL LOCAL PROGRESS" : "ERASE LOCAL SAVE"}
            </button>
          </article>
        </div>
      )}

      {selectedCard && <CardDetail game={game} cardId={selectedCard} onClose={() => setSelectedCard(null)} />}
      <DuelPlayback playback={duelPlayback} onClose={() => { clearDuelTimers(); setDuelPlayback(null); }} />

      <div className="pw-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <article key={toast.id} className={`tone-${toast.tone}`}>
            <i /><div><strong>{toast.title}</strong><small>{toast.detail}</small></div>
          </article>
        ))}
      </div>

      {!ready && <div className="loading-screen"><span>PACKWORKS</span><i /></div>}
    </main>
  );
}
