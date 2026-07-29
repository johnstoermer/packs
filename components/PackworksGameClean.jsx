"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ALL_CARDS,
  PACK_TYPES,
  RARITIES,
  SETS,
  formatNumber,
  getCard,
  getCardArtId,
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
  canRewrite,
  chooseDiscoverOptionDetailed,
  createInitialState,
  dismissDiscoverOfferDetailed,
  displayCard,
  evaluateIdleThresholds,
  getCardSaleValue,
  getDerived,
  getInscriptionsEarned,
  getPackPrice,
  getProductCount,
  hydrateState,
  openPack,
  resolveImmediateFusion,
  revealPackCard,
  rewriteState,
  sellDuplicatesDetailed,
  serializeState,
  storedSaveDominates,
  tickEconomy,
  undisplayCard,
} from "../lib/gameLogic";
import {
  CASE_SIZE,
  DISCOVER_POOL,
  getCardDef,
  getCardRules,
  getCaseSlots,
} from "../lib/engineCards";
import { createAudioEngine } from "../lib/audio";
import { createHapticsEngine } from "../lib/haptics";
import { solveOverflowLayout } from "../lib/overflowLayout";
import GlobalBurstLayer from "./GlobalBurstLayer";

const ASSET_BASE = process.env.NEXT_PUBLIC_PACKWORKS_BASE || "";
const PIXEL_ART_VERSION = "20260726-2";
const PLACE_SUBJECTS = new Set(["stand", "screen", "city", "garden", "coronation"]);
const RELIC_SUBJECTS = new Set(["relay", "locket", "star"]);
const MACHINE_SUBJECTS = new Set(["drone", "hopper", "warden", "crawler", "familiar", "ogre", "engine", "colossus"]);
const MOBILE_REVEAL_COLUMNS = 6;
const COLLECTION_ANIMATION_MS = 950;
// FINISH appears on any reveal larger than two standard packs.
const FORCE_FINISH_MIN_CARDS = 12;
// Overflow flight ghosts beyond this land instantly instead of animating.
const MAX_CONCURRENT_FLIGHTS = 10;
const FLIGHT_DURATION_MS = 460;
// Pile cards render at this width and scale down to the solved pile size so
// their typography shrinks proportionally, like shrunken reveal cards.
const PILE_BASE_WIDTH = 148;

function countActiveCards(cards = []) {
  let active = 0;
  for (const pull of cards) {
    if (!pull?.fusedAway) active += 1;
  }
  return active;
}

function getActiveIndices(cards = []) {
  const indices = [];
  for (let index = 0; index < cards.length; index += 1) {
    if (!cards[index]?.fusedAway) indices.push(index);
  }
  return indices;
}

function findNextRevealIndex(cards = []) {
  for (let index = 0; index < cards.length; index += 1) {
    const pull = cards[index];
    if (pull && !pull.revealed && !pull.fusedAway) return index;
  }
  return -1;
}

// The board holds at most one loose card per card in the set. Past that the
// opening tips into Overflow mode — one face-down stack up top, one counted
// pile per distinct card below — and stays there for the rest of the reveal.
function getOverflowFlags(openingValue, cards) {
  const setSize = openingValue.result.set.cards.length;
  const active = countActiveCards(cards);
  const overflow = Boolean(openingValue.overflow) || active > setSize;
  return {
    overflow,
    canForceFinish: Boolean(openingValue.canForceFinish)
      || overflow
      || active > FORCE_FINISH_MIN_CARDS,
  };
}

function money(value) {
  return formatNumber(Math.round(Number(value) || 0));
}

function exactMoney(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

function rate(value) {
  if (value <= 0) return "0";
  if (value < 0.01) return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  if (value < 10) return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return formatNumber(value);
}

function getCardKind(card) {
  let kind = "Creature";
  if (PLACE_SUBJECTS.has(card.subject)) kind = "Landmark";
  else if (RELIC_SUBJECTS.has(card.subject)) kind = "Relic";
  else if (MACHINE_SUBJECTS.has(card.subject)) kind = "Machine";
  return kind;
}

function CardArt({ card, compact = false, animated = false }) {
  const pixelRef = useRef(null);
  const [pixelReady, setPixelReady] = useState(false);
  const set = getSet(card.setId);
  // Art is filed under the legacy print a card was reprinted from.
  const artKey = getCardArtId(card);
  const artAt = artKey.lastIndexOf("-");
  const artSetId = artKey.slice(0, artAt);
  const artNumber = artKey.slice(artAt + 1);
  const pixelPath = `${ASSET_BASE}/card-art-pixel/${artSetId}/${artNumber}/frame-0.png?v=${PIXEL_ART_VERSION}`;
  const holoPath = `${ASSET_BASE}/card-art-pixel/${artSetId}/${artNumber}/holo-strip.png?v=${PIXEL_ART_VERSION}`;
  useEffect(() => {
    setPixelReady(Boolean(pixelRef.current?.complete && pixelRef.current?.naturalWidth));
  }, [pixelPath]);
  return (
    <span
      className={`card-art card-art-${card.id} ${compact ? "compact" : ""} ${animated ? "is-pixel-animated" : ""} ${pixelReady ? "has-pixel-art" : ""}`.trim()}
      role="img"
      aria-label={`${card.name}, an original card illustration`}
      style={{ "--art-a": set.colors[0], "--art-b": set.colors[1] }}
    >
      <img
        ref={pixelRef}
        className="card-art-pixel"
        src={pixelPath}
        alt=""
        aria-hidden="true"
        loading={compact ? "lazy" : "eager"}
        decoding="async"
        onLoad={() => setPixelReady(true)}
        onError={() => setPixelReady(false)}
      />
      {animated && (
        <span
          className="card-art-holo-strip"
          aria-hidden="true"
          style={{ backgroundImage: `url("${holoPath}")` }}
        />
      )}
    </span>
  );
}

function CardRules({ cardId, heading = false, reminders = false, className = "" }) {
  const rules = getCardRules(cardId);
  if (!rules) return null;
  return (
    <span className={`card-rules ${heading ? "has-heading" : ""} ${className}`.trim()}>
      {heading && (
        <span className="card-rules-heading">
          <small>{rules.eyebrow}</small>
          <b>{rules.title}</b>
        </span>
      )}
      <span className="card-rules-copy">
        {rules.tokens.map((token, index) => {
          if (token.type === "text") return token.value;
          return (
            <mark
              className={`rules-token is-${token.type} ${token.tone ? `tone-${token.tone}` : ""}`}
              key={`${cardId}-${index}`}
              title={token.keyword || undefined}
            >
              {token.value}
            </mark>
          );
        })}
      </span>
      {reminders && rules.reminders.length > 0 && (
        <span className="card-rules-reminders">
          {rules.reminders.map((entry) => (
            <small key={entry.keyword}>
              <b>{entry.keyword}</b> — {entry.reminder}
            </small>
          ))}
        </span>
      )}
    </span>
  );
}

function PackCreatureArt({ card }) {
  const artKey = getCardArtId(card);
  const artAt = artKey.lastIndexOf("-");
  const artSetId = artKey.slice(0, artAt);
  const artNumber = artKey.slice(artAt + 1);
  const pixelPath = `${ASSET_BASE}/card-art-pixel/${artSetId}/${artNumber}/frame-0.png?v=${PIXEL_ART_VERSION}`;
  return (
    <img
      src={pixelPath}
      alt=""
      aria-hidden="true"
      decoding="async"
      onError={(event) => {
        event.currentTarget.hidden = true;
      }}
    />
  );
}

export function PackFace({ set, packType = PACK_TYPES[0], small = false }) {
  const fallbackFeatured = [...set.cards]
    .sort((left, right) => (
      RARITIES[right.rarity].order - RARITIES[left.rarity].order
      || right.number - left.number
    ));
  const requestedFeatured = (packType.featuredNames || [])
    .map((name) => set.cards.find((card) => card.name === name))
    .filter(Boolean);
  const featured = [
    ...requestedFeatured,
    ...fallbackFeatured.filter((card) => !requestedFeatured.includes(card)),
  ].slice(0, 3);
  const [chase, leftFeature, rightFeature] = featured;
  const packColors = packType.colors || set.colors;
  return (
    <span
      className={`${small ? "pack-face small" : "pack-face"} pack-type-${packType.id}`}
      style={{
        "--pack-a": packColors[0],
        "--pack-b": packColors[1],
        "--pack-c": packColors[2],
      }}
    >
      <span className="pack-crimp top" />
      <span className="pack-title">
        <strong>{packType.name}</strong>
      </span>
      <span
        className="pack-creature-scene"
        aria-label={`${chase.name}, ${leftFeature.name}, and ${rightFeature.name}`}
      >
        <span className="pack-creature is-left"><PackCreatureArt card={leftFeature} /></span>
        <span className="pack-creature is-right"><PackCreatureArt card={rightFeature} /></span>
        <span className="pack-creature is-chase"><PackCreatureArt card={chase} /></span>
        <span className="pack-info"><b>{packType.cardCount} CARDS</b><small>PACKWORKS</small></span>
      </span>
      <span className="pack-crimp bottom" />
    </span>
  );
}

export function PrintedCard({
  card,
  rarityId = card.rarity,
  copyLabel = "COLLECTED",
  foil = false,
  compact = false,
  className = "",
}) {
  const rarity = RARITIES[rarityId];
  const set = getSet(card.setId);
  const kind = getCardKind(card);
  const rulesLength = getCardRules(card.id)?.text?.length || 0;
  const copyFitClass = rulesLength > 155 ? "copy-very-long" : rulesLength > 105 ? "copy-long" : "";
  return (
    <span
      className={`card-front rarity-${rarityId} set-${card.setId} ${foil ? "is-foil" : ""} ${compact ? "is-compact" : ""} ${copyFitClass} ${className}`.trim()}
      style={{
        "--rarity": rarity.color,
        "--rarity-deep": rarity.deep,
        "--set-a": set.colors[0],
        "--set-b": set.colors[1],
        "--set-c": set.colors[2],
      }}
    >
      <span className="card-head">
        <span className="card-identity">
          <strong>{card.name}</strong>
        </span>
        <b>{rarity.short}</b>
      </span>
      <CardArt card={card} compact={compact} animated={foil} />
      <span className="card-copy">
        <span className="card-type-line">{rarity.label} / {kind}</span>
        <CardRules cardId={card.id} />
        <small className="card-flavor">“{card.flavor}”</small>
      </span>
      <span className="card-foot">
        <span>{copyLabel}</span>
        <b>{rarity.label}</b>
      </span>
      <span className="rarity-border-fx" aria-hidden="true">
        {Array.from({ length: 12 }, (_, point) => <i key={point} />)}
      </span>
      <span className="foil-sheen" />
    </span>
  );
}

function RevealCard({
  pull,
  index,
  position,
  count,
  perRow,
  rows,
  shrink,
  revealed,
  echo,
  latest,
  phase,
  onReveal,
}) {
  const rarity = RARITIES[pull.rarity];
  const set = getSet(pull.card.setId);
  const dealt = ["ready", "complete", "filing", "collecting"].includes(phase);
  const canReveal = phase === "ready" && !revealed;
  const row = Math.floor(position / perRow);
  const colsInRow = Math.min(perRow, count - row * perRow);
  const spread = (position - row * perRow) - (colsInRow - 1) / 2;
  const rowOffset = row - (rows - 1) / 2;
  const copyLabel = pull.isNew ? "NEW" : "DUPLICATE";

  return (
    <button
      type="button"
      data-reveal-index={index}
      data-mark-stacks={pull.marked && (pull.markStacks || 1) > 1 ? pull.markStacks : undefined}
      className={`reveal-card count-${count} rarity-${pull.rarity} ${dealt ? "is-dealt" : ""} ${revealed ? "is-revealed" : ""} ${latest ? "is-impacting" : ""} ${canReveal ? "is-revealable" : ""} ${pull.foil ? "is-foil" : ""} ${pull.marked && !revealed ? "is-marked" : ""} ${pull.transmuted && !revealed ? "is-transmuted" : ""} ${pull.fusedAway ? "is-fused-away" : ""} ${pull.fromMystery ? "is-mystery" : ""}`}
      style={{
        "--index": index,
        "--spread": spread,
        "--rowoff": rowOffset,
        "--shrink": shrink,
        "--position": position,
        "--rarity": rarity.color,
        "--rarity-deep": rarity.deep,
        "--set-a": set.colors[0],
        "--set-b": set.colors[1],
        "--set-c": set.colors[2],
        "--deal-delay": `${Math.min(position * 75, 1_100)}ms`,
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (canReveal) onReveal(index);
      }}
      tabIndex={canReveal ? 0 : -1}
      aria-label={revealed
        ? `${rarity.label} ${pull.card.name}${pull.foil ? ", foil" : ""}`
        : "Face-down card"}
    >
      {echo && (
        <span key={echo.serial} className="reveal-echo" style={{ "--echo-count": Math.min(4, echo.count) }} aria-hidden="true">
          <i className="reveal-echo-flash" />
          <b className="reveal-echo-chip">ECHO{echo.count > 1 ? ` ×${echo.count}` : ""}</b>
        </span>
      )}
      <span className="reveal-card-inner">
        <span className="card-back back-style-crest">
          <span className="back-set">{set.short}</span>
          <span className="back-orbit"><i /><i /><i /></span>
          <span className="back-mark"><span><b>PW</b><small>PACKWORKS</small></span></span>
          <span className="back-rule" />
        </span>
        <PrintedCard
          card={pull.card}
          rarityId={pull.rarity}
          copyLabel={copyLabel}
          foil={pull.foil}
        />
      </span>
    </button>
  );
}

function CrestBack({ label }) {
  return (
    <span className="card-back back-style-crest">
      {label && <span className="back-set">{label}</span>}
      <span className="back-orbit"><i /><i /><i /></span>
      <span className="back-mark"><span><b>PW</b><small>PACKWORKS</small></span></span>
      <span className="back-rule" />
    </span>
  );
}

// One counted pile per distinct revealed card while the opening is in
// Overflow mode. The wrapper is the FLIP target; the inner card carries the
// landing kick so the two transforms never fight.
const OverflowPile = memo(function OverflowPile({
  card,
  count,
  foil,
  incoming,
  pulse,
  enterDelay,
  onRef,
}) {
  const rarity = RARITIES[card.rarity];
  const set = getSet(card.setId);
  return (
    <div
      ref={onRef}
      data-card-id={card.id}
      className={`overflow-pile rarity-${card.rarity} ${incoming ? "is-incoming" : ""} ${count > 1 ? "is-stacked" : ""}`.trim()}
      style={{
        "--rarity": rarity.color,
        "--rarity-deep": rarity.deep,
        "--set-a": set.colors[0],
        "--set-b": set.colors[1],
        "--set-c": set.colors[2],
        "--enter-delay": `${enterDelay}ms`,
      }}
      aria-label={`${card.name}, ${count} ${count === 1 ? "copy" : "copies"} on the table`}
    >
      <span className="overflow-pile-under" aria-hidden="true"><i /><i /></span>
      <span className={`overflow-pile-card ${pulse ? "is-landing" : ""}`.trim()}>
        <PrintedCard
          card={card}
          rarityId={card.rarity}
          copyLabel="REVEALED"
          foil={foil}
          compact
        />
        {pulse && (
          <span key={pulse.serial} className="overflow-land-burst" aria-hidden="true">
            <i /><i /><i /><i /><i /><i /><i /><i />
          </span>
        )}
      </span>
      <b className="overflow-pile-count" key={`count-${count}`}>
        <span aria-hidden="true">×</span>{count}
      </b>
    </div>
  );
});

function OverflowFlightLayer({ flights, onLand }) {
  if (!flights.length) return null;
  return (
    <div className="overflow-flight-layer" aria-hidden="true">
      {flights.map((flight) => {
        const rarity = RARITIES[flight.rarity];
        const set = getSet(flight.card.setId);
        return (
          <div
            key={flight.serial}
            className={`overflow-flight rarity-${flight.rarity} ${flight.foil ? "is-foil" : ""}`.trim()}
            style={{
              left: `${flight.x}px`,
              top: `${flight.y}px`,
              "--fdx": `${flight.dx}px`,
              "--fdy": `${flight.dy}px`,
              "--flight-scale": flight.scale,
              "--rarity": rarity.color,
              "--rarity-deep": rarity.deep,
              "--set-a": set.colors[0],
              "--set-b": set.colors[1],
              "--set-c": set.colors[2],
            }}
            onAnimationEnd={(event) => {
              if (event.animationName === "overflow-flight-move") onLand(flight.serial);
            }}
          >
            <span className="overflow-flight-inner">
              <CrestBack />
              <PrintedCard
                card={flight.card}
                rarityId={flight.rarity}
                copyLabel="REVEALED"
                foil={flight.foil}
                compact
              />
            </span>
            <span className="overflow-flight-trail" />
          </div>
        );
      })}
    </div>
  );
}

export function OpeningImpact({ impact }) {
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

function CashStreamLayer({ streams }) {
  if (!streams.length) return null;
  return (
    <div className="cash-stream-layer" aria-live="polite">
      {streams.map((stream) => (
        <span
          className="cash-stream-value"
          key={stream.id}
          style={{
            "--cash-x": `${stream.x}px`,
            "--cash-delay": `${stream.delay}ms`,
          }}
        >
          +{money(stream.amount)}
        </span>
      ))}
    </div>
  );
}

function GameplayCueLayer({ cues }) {
  if (!cues.length) return null;
  return (
    <div className="gameplay-cue-layer" aria-live="polite">
      {cues.map((cue) => (
        <span
          className={`gameplay-cue cue-${cue.type}`}
          key={cue.id}
          style={{ "--cue-slot": cue.id % 3 }}
        >
          <span className="gameplay-cue-symbol" aria-hidden="true"><i /><i /><i /></span>
          <b>{cue.label}</b>
          {cue.detail && <small>{cue.detail}</small>}
        </span>
      ))}
    </div>
  );
}

function BinderDrawer({ game, setId, onSetId, onClose, onCard, displayedIds }) {
  const set = getSet(setId);
  const unlockedSets = SETS.filter((candidate) => game.unlockedSets.includes(candidate.id));
  const [query, setQuery] = useState("");
  const [ownership, setOwnership] = useState("owned");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [sort, setSort] = useState("rarity-low");
  const found = set.cards.filter((card) => game.collection[card.id]).length;
  const visibleCards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return set.cards
      .filter((card) => {
        const owned = (game.collection[card.id] || 0) > 0;
        if (ownership === "owned" && !owned) return false;
        if (ownership === "missing" && owned) return false;
        if (rarityFilter !== "all" && card.rarity !== rarityFilter) return false;
        if (!needle) return true;
        const rules = getCardRules(card.id);
        return [
          card.name,
          card.id,
          card.flavor,
          rules?.title,
          rules?.text,
          ...(rules?.keywords || []),
        ].join(" ").toLowerCase().includes(needle);
      })
      .sort((left, right) => {
        if (sort === "name") return left.name.localeCompare(right.name);
        if (sort === "number") return left.number - right.number;
        if (sort === "rarity-low") {
          return RARITIES[left.rarity].order - RARITIES[right.rarity].order || left.number - right.number;
        }
        return RARITIES[right.rarity].order - RARITIES[left.rarity].order || left.number - right.number;
      });
  }, [game.collection, ownership, query, rarityFilter, set.cards, sort]);

  return (
    <aside className={`clean-drawer clean-binder ${unlockedSets.length > 1 ? "has-set-picker" : ""}`} aria-label="Binder">
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
      <div className="clean-binder-tools">
        <label className="clean-binder-search">
          <span>SEARCH CARDS</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, effect, or keyword…"
          />
        </label>
        <label>
          <span>COLLECTION</span>
          <select value={ownership} onChange={(event) => setOwnership(event.target.value)}>
            <option value="all">All cards</option>
            <option value="owned">Unlocked</option>
            <option value="missing">Not unlocked</option>
          </select>
        </label>
        <label>
          <span>RARITY</span>
          <select value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value)}>
            <option value="all">All rarities</option>
            {Object.values(RARITIES).map((rarity) => (
              <option key={rarity.id} value={rarity.id}>{rarity.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>SORT</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="rarity">Rarity / high first</option>
            <option value="rarity-low">Rarity / low first</option>
            <option value="number">Card number</option>
            <option value="name">Card name</option>
          </select>
        </label>
        <div className="clean-binder-count">
          <strong>{found}/{set.cards.length}</strong>
          <span>UNLOCKED</span>
          <small>{visibleCards.length} SHOWN</small>
        </div>
      </div>
      <div className="clean-binder-grid" aria-label={`${visibleCards.length} cards shown`}>
        {visibleCards.map((card) => {
          const count = game.collection[card.id] || 0;
          const rarityId = card.rarity;
          const rarity = RARITIES[rarityId];
          return (
            <button
              key={card.id}
              className={`${count ? "found" : "missing"} rarity-${rarityId}`}
              onClick={() => onCard(card.id)}
              style={{
                "--rarity": rarity.color,
                borderColor: count ? undefined : rarity.color,
              }}
              aria-label={count ? `${card.name}, ${count} copies` : `Missing card ${card.number}, show rarity`}
            >
              {count ? (
                <PrintedCard
                  card={card}
                  compact
                  foil={(game.foils?.[card.id] || 0) > 0}
                  copyLabel={displayedIds?.has(card.id) ? "ON DISPLAY" : "UNLOCKED"}
                />
              ) : (
                <span className="card-back back-style-crest">
                  <span className="back-orbit"><i /><i /><i /></span>
                  <span className="back-mark"><span><b>PW</b><small>PACKWORKS</small></span></span>
                  <span className="back-rule" />
                </span>
              )}
              <span className="clean-binder-card-state">
                {count ? rarity.label : `${rarity.label} / NOT UNLOCKED`}
              </span>
            </button>
          );
        })}
        {visibleCards.length === 0 && (
          <p className="clean-binder-empty">No cards match those filters.</p>
        )}
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
  const isDisplayed = derived.displayedEntries.some((entry) => entry.id === card.id);
  const caseFull = derived.displayedEntries.length >= derived.caseSlots;
  return (
    <div className="clean-modal-scrim" onMouseDown={onClose}>
      <article
        className={`clean-card-detail card-zoom-detail rarity-${rarityId}`}
        onMouseDown={(event) => event.stopPropagation()}
        style={{ "--rarity": rarity.color, "--rarity-deep": rarity.deep }}
      >
        <div className={`clean-detail-art card-zoom-card${count ? "" : " is-missing"}`}>
          {count ? (
            <PrintedCard
              card={card}
              rarityId={rarityId}
              foil={(game.foils?.[card.id] || 0) > 0}
              copyLabel={`${count} ${count === 1 ? "COPY" : "COPIES"}`}
            />
          ) : (
            <span className="card-back card-zoom-back back-style-crest" aria-label={`Card ${String(card.number).padStart(2, "0")}, not found`}>
              <span className="back-set">{getSet(card.setId).short}</span>
              <span className="back-orbit"><i /><i /><i /></span>
              <span className="back-mark"><span><b>PW</b><small>PACKWORKS</small></span></span>
              <span className="back-rule" />
            </span>
          )}
        </div>
        <div className="card-zoom-hud">
          <div className="card-zoom-status">
            <span>{count ? `${rarity.label} / ${rarity.rateLabel} BASE PULL` : "UNDISCOVERED"}</span>
            <strong>{count ? card.name : `Card ${String(card.number).padStart(2, "0")}`}</strong>
            <small>
              {count
                ? `${count} ${count === 1 ? "copy" : "copies"} / future duplicates auto-sell for ${money(duplicateValue)} cash`
                : `${rarity.label} / ${rarity.rateLabel} base pull`}
            </small>
          </div>
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
        </div>
        {count > 0 && (
          <span className="card-detail-accessible-copy">
            {getCardRules(card.id)?.text}
          </span>
        )}
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
          Displayed cards fire their printed effects while you play.
          {" "}{derived.displayedEntries.length}/{derived.caseSlots} available slots filled.
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
                  <button className="clean-case-card" onClick={() => onPickCard(card.id)} aria-label={`Zoom ${card.name}`}>
                    <PrintedCard
                      card={card}
                      compact
                      foil={(game.foils?.[card.id] || 0) > 0}
                      copyLabel={`CASE SLOT ${index + 1}`}
                    />
                  </button>
                  {tally > 0 && <i className="clean-case-ramp">TRIGGERED {formatNumber(tally)}×</i>}
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
                  <span className="card-back back-style-crest">
                    <span className="back-set">SLOT {index + 1}</span>
                    <span className="back-orbit"><i /><i /><i /></span>
                    <span className="back-mark"><span><b>+</b><small>ADD CARD</small></span></span>
                    <span className="back-rule" />
                  </span>
                </button>
              );
            }
            const milestone = derived.caseMilestones[index];
            return (
              <article className="clean-case-slot is-locked" key={`slot-${index}`}>
                <span className="card-back back-style-crest">
                  <span className="back-set">SLOT {index + 1}</span>
                  <span className="back-orbit"><i /><i /><i /></span>
                  <span className="back-mark"><span><b>×</b><small>LOCKED</small></span></span>
                  <span className="back-rule" />
                </span>
                <small className="clean-case-lock-copy">{milestone ? milestone.label : "Keep collecting"}</small>
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
                and packs — and inscribes permanent power. Display the Nameless
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

function CaseStrip({ game, derived, fx, onOpenCase }) {
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
              onClick={onOpenCase}
              aria-label={locked ? "Locked slot — open display case" : "Empty slot — open display case"}
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
            key={`${entry.id}-${pulse?.serial || "idle"}`}
            className={`case-strip-slot is-filled rarity-${card.rarity}${def?.sig ? " is-king" : ""}${pulse ? ` is-triggered fx-${pulse.kind}` : ""}`}
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

function SettingsPanel({
  game,
  hapticsAvailable,
  resetArmed,
  onClose,
  onToggleSound,
  onToggleHaptics,
  onReset,
}) {
  return (
    <aside className="clean-settings" aria-label="Settings">
      <header>
        <div><span>SETTINGS</span><h2>Game options</h2></div>
        <button onClick={onClose} aria-label="Close settings">CLOSE</button>
      </header>
      <div className="clean-settings-options">
        <button className={game.settings.sound ? "is-on" : ""} onClick={onToggleSound}>
          <span><b>Sound</b><small>Music and game effects</small></span>
          <strong>{game.settings.sound ? "ON" : "OFF"}</strong>
        </button>
        <button
          className={game.settings.haptics !== false ? "is-on" : ""}
          onClick={onToggleHaptics}
          disabled={!hapticsAvailable}
        >
          <span><b>Haptics</b><small>{hapticsAvailable ? "Touch feedback" : "Not available on this device"}</small></span>
          <strong>{game.settings.haptics !== false && hapticsAvailable ? "ON" : "OFF"}</strong>
        </button>
        <button className={`clean-settings-reset ${resetArmed ? "is-armed" : ""}`} onClick={onReset}>
          <span><b>{resetArmed ? "Confirm reset" : "Reset save"}</b><small>{resetArmed ? "This cannot be undone" : "Erase all local progress"}</small></span>
          <strong>{resetArmed ? "RESET" : "ARM"}</strong>
        </button>
      </div>
    </aside>
  );
}

// Bottom-center collection meter: one compact progress bar for the active
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
        <strong>COLLECTION</strong>
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
  const hapticsRef = useRef(null);
  const gameRef = useRef(createInitialState(0));
  const openingRef = useRef(null);
  const openingTimersRef = useRef([]);
  const holdRevealTimerRef = useRef(null);
  const spaceHeldRef = useRef(false);
  const mobileAutoPointerRef = useRef(null);
  const swipePointerRef = useRef(null);
  const revealLocksRef = useRef(new Set());
  const impactSerialRef = useRef(0);
  const gameplayCueSerialRef = useRef(0);
  const globalBurstSerialRef = useRef(0);
  const cashStreamSerialRef = useRef(0);
  const purchaseDenyAtRef = useRef(0);
  const legacyAutoSoldRef = useRef(false);

  const [game, setGame] = useState(() => createInitialState(0));
  const [ready, setReady] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [binderSetId, setBinderSetId] = useState(SETS[0].id);
  const [opening, setOpening] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [packTypeIndex, setPackTypeIndex] = useState(0);
  const [packRotation, setPackRotation] = useState("right");
  const selectedPackType = PACK_TYPES[packTypeIndex] || PACK_TYPES[0];
  const [gameplayCues, setGameplayCues] = useState([]);
  const [globalBursts, setGlobalBursts] = useState([]);
  const [cashStreams, setCashStreams] = useState([]);
  const [resetArmed, setResetArmed] = useState(false);
  const [rewriteArmed, setRewriteArmed] = useState(false);
  const [fx, setFx] = useState({});
  const [revealEchoes, setRevealEchoes] = useState({});
  const [viewport, setViewport] = useState({ w: 1200, h: 800, coarse: false });
  const [hapticsAvailable, setHapticsAvailable] = useState(false);
  const adminActiveRef = useRef(false);
  const fxSerialRef = useRef(0);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [mobileAutoHeld, setMobileAutoHeld] = useState(false);
  const [swipeRevealing, setSwipeRevealing] = useState(false);

  // Overflow mode: flight ghosts travelling from the face-down stack to their
  // pile, plus the per-pile landing bookkeeping that keeps counters in sync
  // with the moment a ghost actually arrives.
  const [flights, setFlights] = useState([]);
  const [pendingLand, setPendingLand] = useState({});
  const [landPulse, setLandPulse] = useState(null);
  const [stackPulse, setStackPulse] = useState(null);
  const [overflowBanner, setOverflowBanner] = useState(null);
  const flightsRef = useRef([]);
  const pendingLandRef = useRef({});
  const flightQueueRef = useRef([]);
  const flightTimersRef = useRef(new Map());
  const flightSerialRef = useRef(0);
  const overflowStackRef = useRef(null);
  const overflowBoardRef = useRef(null);
  const pileRefs = useRef(new Map());
  const pileRefCallbacksRef = useRef(new Map());
  const prevPileRectsRef = useRef(new Map());
  const prevUnrevealedRef = useRef(0);

  // Stable per-card ref callbacks so memoized piles skip re-renders.
  const getPileRefCallback = useCallback((cardId) => {
    let callback = pileRefCallbacksRef.current.get(cardId);
    if (!callback) {
      callback = (el) => {
        if (el) pileRefs.current.set(cardId, el);
        else pileRefs.current.delete(cardId);
      };
      pileRefCallbacksRef.current.set(cardId, callback);
    }
    return callback;
  }, []);

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

  const clearFlights = useCallback(() => {
    flightQueueRef.current = [];
    for (const timer of flightTimersRef.current.values()) window.clearTimeout(timer);
    flightTimersRef.current.clear();
    flightsRef.current = [];
    pendingLandRef.current = {};
    prevPileRectsRef.current = new Map();
    prevUnrevealedRef.current = 0;
    setFlights([]);
    setPendingLand({});
    setLandPulse(null);
    setStackPulse(null);
    setOverflowBanner(null);
  }, []);

  const settlePendingLand = useCallback((cardId) => {
    const pending = { ...pendingLandRef.current };
    const left = (pending[cardId] || 0) - 1;
    if (left > 0) pending[cardId] = left;
    else delete pending[cardId];
    pendingLandRef.current = pending;
    setPendingLand(pending);
  }, []);

  const landFlight = useCallback((serial, options = {}) => {
    const flight = flightsRef.current.find((entry) => entry.serial === serial);
    if (!flight) return;
    const timer = flightTimersRef.current.get(serial);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      flightTimersRef.current.delete(serial);
    }
    flightsRef.current = flightsRef.current.filter((entry) => entry.serial !== serial);
    setFlights(flightsRef.current);
    settlePendingLand(flight.cardId);
    setLandPulse({ cardId: flight.cardId, serial, rarity: flight.rarity });
    if (!options.silent) getAudio().sound("deal");
  }, [getAudio, settlePendingLand]);

  const getHaptics = useCallback(() => {
    if (!hapticsRef.current) hapticsRef.current = createHapticsEngine();
    hapticsRef.current.setEnabled(gameRef.current.settings.haptics !== false);
    return hapticsRef.current;
  }, []);
  useEffect(() => {
    setHapticsAvailable(getHaptics().supported());
  }, [getHaptics]);

  const playGameplayCue = useCallback((type, label, detail = "", duration = 1_650) => {
    const id = ++gameplayCueSerialRef.current;
    setGameplayCues((current) => [...current.slice(-4), { id, type, label, detail }]);
    window.setTimeout(() => {
      setGameplayCues((current) => current.filter((cue) => cue.id !== id));
    }, duration);
  }, []);

  const playCashGains = useCallback((items) => {
    const queued = items
      .filter((item) => item.amount > 0)
      .slice(0, 18)
      .map((item, index) => ({
        id: ++cashStreamSerialRef.current,
        amount: item.amount,
        cardId: item.cardId || null,
        x: ((index % 7) - 3) * 58,
        delay: index * 55,
      }));
    if (!queued.length) return;
    setCashStreams((current) => [...current.slice(-18), ...queued]);
    const queuedIds = new Set(queued.map((stream) => stream.id));
    window.setTimeout(() => {
      setCashStreams((current) => current.filter((stream) => !queuedIds.has(stream.id)));
    }, 1_750 + queued.length * 55);
  }, []);

  const queueGlobalBurst = useCallback((type, count = 1) => {
    const burst = {
      id: ++globalBurstSerialRef.current,
      type,
      count: Math.max(1, count),
    };
    setGlobalBursts((current) => [...current.slice(-4), burst]);
  }, []);

  const pushFx = useCallback((events) => {
    if (!events?.length) return;
    const soldItems = events
      .filter((event) => event.t === "sold")
      .flatMap((event) => event.items?.length
        ? event.items
        : [{ cardId: null, amount: event.value }]);
    const triggeredCoins = events
      .filter((event) => event.t === "coins" && (event.source || soldItems.length === 0))
      .map((event) => ({ cardId: event.source || null, amount: event.amount }));
    const cashGains = [...soldItems, ...triggeredCoins].filter((item) => item.amount > 0);
    playCashGains(cashGains);
    const stamp = {};
    for (const event of events) {
      const kind = event.t === "trigger" || event.t === "addCards" ? "trigger"
        : event.t === "echo" ? "echo"
        : event.t === "relay" ? "relay"
        : event.t === "mystery" ? "mystery"
        : ["mark", "mimic", "transmute", "fracture", "fusion", "catalyst"].includes(event.t) ? "pulse"
        : null;
      const displayCardId = event.t === "addCards" ? event.source : event.cardId;
      if (kind && displayCardId) {
        stamp[displayCardId] = { kind, serial: ++fxSerialRef.current };
      }
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
      queueGlobalBurst("salvage", mysteries);
      getAudio().sound("caseBreak");
      getHaptics().pulse("burst");
    }
    const fractures = events.filter((event) => event.t === "fracture").length;
    if (fractures > 0) {
      queueGlobalBurst("fracture", fractures);
      getHaptics().pulse("burst");
    }
    const encore = events.find((event) => event.t === "encore");
    if (encore) playGameplayCue("encore", `ENCORE +${encore.count}`, "BONUS CARDS JOIN THE PACK");
    const freePacks = events.filter((event) => event.t === "packs").reduce((sum, event) => sum + event.count, 0);
    if (freePacks > 0) playGameplayCue("packs", `+${freePacks} PACK${freePacks === 1 ? "" : "S"}`, "ADDED TO THE PACK STACK");
    if (events.some((event) => event.t === "fuseLift")) {
      playGameplayCue("fusion", "FUSION ↑", "NEXT FUSION CLIMBS");
    }
    for (const boon of events.filter((event) => event.t === "boon").slice(0, 2)) {
      const option = DISCOVER_POOL.find((candidate) => candidate.id === boon.option);
      if (option) playGameplayCue("boon", option.name.toUpperCase(), "BOON LOADED");
    }
    const sets = events.filter((event) => event.t === "setComplete");
    for (const done of sets) playGameplayCue("set", "SET COMPLETE", getSet(done.setId).name.toUpperCase(), 2_600);
  }, [getAudio, getHaptics, playCashGains, playGameplayCue, queueGlobalBurst]);

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
      commit(adminState);
      setBinderSetId(adminState.activeSet);
      window.setTimeout(() => playGameplayCue("mode", "SANDBOX", "ALL CARDS UNLOCKED", 2_600), 300);
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
      if (offline.report.coins > 0) {
        parts.push(`+${money(offline.report.coins)} CASH`);
        window.setTimeout(() => playCashGains([{ amount: offline.report.coins }]), 300);
      }
      if (offline.report.packsOpened > 0) {
        parts.push(`${offline.report.packsOpened} PACK${offline.report.packsOpened === 1 ? "" : "S"} OPENED${offline.report.newCards ? ` / ${offline.report.newCards} NEW` : ""}`);
      }
      if (parts.length) {
        window.setTimeout(() => playGameplayCue("offline", "TIME AWAY", parts.join(" • "), 3_200), 300);
      }
    }
    setReady(true);
  }, [commit, playCashGains, playGameplayCue]);

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
    if (!ready || legacyAutoSoldRef.current) return;
    legacyAutoSoldRef.current = true;
    const sale = sellDuplicatesDetailed(gameRef.current, {});
    if (sale.state === gameRef.current) return;
    commit(sale.state);
    pushFx(sale.events);
  }, [commit, pushFx, ready]);

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
      const currentOpening = openingRef.current;
      const canSpillIntoOpening = currentOpening
        && !["filing", "collecting"].includes(currentOpening.phase);
      const openingCards = canSpillIntoOpening ? currentOpening.result.cards : null;
      const swept = evaluateIdleThresholds(gameRef.current, {
        injectCards: openingCards,
      });
      if (swept.state !== gameRef.current) {
        commit(swept.state);
        pushFx(swept.events);
      }
      if (openingCards && swept.cards?.length > openingCards.length) {
        if (currentOpening.phase === "complete") {
          openingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
          openingTimersRef.current = [];
        }
        commitOpening((current) => {
          if (current?.id !== currentOpening.id) return current;
          return {
            ...current,
            result: { ...current.result, cards: swept.cards },
            phase: current.phase === "complete" ? "ready" : current.phase,
            ...getOverflowFlags(current, swept.cards),
            revealed: swept.cards
              .map((entry, index) => (entry.revealed ? index : -1))
              .filter((index) => index >= 0),
            impact: current.phase === "complete" ? null : current.impact,
          };
        });
      }
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [commit, commitOpening, pushFx, ready]);

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
    clearFlights();
    mobileAutoPointerRef.current = null;
    swipePointerRef.current = null;
    revealLocksRef.current.clear();
    setMobileAutoHeld(false);
    setSwipeRevealing(false);
    commitOpening(null);
  }, [clearFlights, clearHoldRevealTimer, clearOpeningTimers, commitOpening]);

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
        closeOpening();
        setDrawer(null);
        commit(adminState);
        setBinderSetId(adminState.activeSet);
        playGameplayCue("mode", "SANDBOX", "ALL CARDS UNLOCKED", 2_600);
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
        closeOpening();
        setDrawer(null);
        commit(restored);
        setBinderSetId(restored.activeSet);
        playGameplayCue("mode", "LIVE SAVE", "SANDBOX CLOSED", 2_200);
      }
    } catch {
      // Local storage can be unavailable in strict privacy modes.
    }
  }, [closeOpening, commit, playGameplayCue]);

  useEffect(() => {
    const update = () => setViewport({
      w: window.innerWidth,
      h: window.innerHeight,
      coarse: window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches === true,
    });
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


  const openingCards = opening?.result?.cards;
  const openingActiveIndices = useMemo(() => getActiveIndices(openingCards), [openingCards]);
  const overflowActive = Boolean(opening?.overflow);

  // Overflow piles: one entry per distinct revealed card, in default binder
  // order — rarity low first, then card number.
  const overflowPiles = useMemo(() => {
    if (!overflowActive || !openingCards) return [];
    const map = new Map();
    for (const pull of openingCards) {
      if (!pull.revealed || pull.fusedAway) continue;
      const entry = map.get(pull.card.id);
      if (entry) {
        entry.count += 1;
        entry.foil = entry.foil || Boolean(pull.foil);
      } else {
        map.set(pull.card.id, { card: pull.card, count: 1, foil: Boolean(pull.foil) });
      }
    }
    return [...map.values()].sort((left, right) => (
      RARITIES[left.card.rarity].order - RARITIES[right.card.rarity].order
      || left.card.number - right.card.number
    ));
  }, [overflowActive, openingCards]);

  const overflowUnrevealed = useMemo(() => {
    if (!overflowActive || !openingCards) return { count: 0, marked: 0, mystery: 0 };
    let count = 0;
    let marked = 0;
    let mystery = 0;
    for (const pull of openingCards) {
      if (pull.revealed || pull.fusedAway) continue;
      count += 1;
      if (pull.marked) marked += 1;
      if (pull.fromMystery) mystery += 1;
    }
    return { count, marked, mystery };
  }, [overflowActive, openingCards]);

  // Grid solver: pick the columns-by-rows arrangement that keeps every card
  // of the reveal inside the visible board area at the largest possible
  // size. Columns grow with the pack just like rows — never scrolling.
  const boardLayout = useMemo(() => {
    const mobileOpening = viewport.coarse || viewport.w <= 700;
    const count = overflowActive ? 0 : openingActiveIndices.length;
    if (!count) return { count: 0, perRow: 1, rows: 1, shrink: 1, gapX: 0, gapY: 0 };
    const { w, h } = viewport;
    if (mobileOpening) {
      const cardW = Math.min(w * 0.22, 112);
      const cardH = cardW * 1.42;
      const gapX = Math.min(w * 0.135, 74);
      const availW = w * 0.92;
      const availH = h * 0.58;
      // Fixed six-wide rows read best on a phone until the board gets deep;
      // past that the packed solver keeps every card inside the viewport.
      if (count <= MOBILE_REVEAL_COLUMNS * 7) {
        const rows = Math.ceil(count / MOBILE_REVEAL_COLUMNS);
        const sW = availW / ((MOBILE_REVEAL_COLUMNS - 1) * gapX + cardW);
        const sH = availH / (Math.max(3, rows) * (cardH + 16));
        const shrink = +Math.max(0.3, Math.min(1, sW, sH)).toFixed(3);
        return {
          count,
          perRow: MOBILE_REVEAL_COLUMNS,
          rows,
          shrink,
          gapX: Math.round(gapX),
          gapY: Math.round(cardH * shrink + Math.max(8, 16 * shrink)),
        };
      }
      let best = { cols: MOBILE_REVEAL_COLUMNS, rows: Math.ceil(count / MOBILE_REVEAL_COLUMNS), s: 0 };
      for (let cols = MOBILE_REVEAL_COLUMNS; cols <= 12; cols += 1) {
        const rows = Math.ceil(count / cols);
        const sW = availW / ((cols - 1) * gapX + cardW);
        const sH = availH / (rows * (cardH + 16));
        const s = Math.min(1, sW, sH);
        if (s > best.s + 1e-9) best = { cols, rows, s };
      }
      const shrink = +Math.max(0.2, Math.min(1, best.s)).toFixed(3);
      return {
        count,
        perRow: best.cols,
        rows: best.rows,
        shrink,
        gapX: Math.round(gapX),
        gapY: Math.round(cardH * shrink + Math.max(8, 16 * shrink)),
      };
    }
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
  }, [
    openingActiveIndices.length,
    overflowActive,
    viewport,
  ]);

  // Overflow board solver: size the piles so every distinct card in the set
  // could sit on screen at once; on surfaces too small for that, the pile
  // area scrolls instead of shrinking cards into specks.
  const overflowLayout = useMemo(() => {
    if (!overflowActive) return null;
    return solveOverflowLayout({
      width: viewport.w,
      height: viewport.h,
      coarse: viewport.coarse,
      uniqueCount: overflowPiles.length,
      setSize: opening?.result?.set?.cards?.length || 98,
    });
  }, [overflowActive, overflowPiles.length, opening?.result?.set, viewport]);

  const revealCard = useCallback((index) => {
    const currentOpening = openingRef.current;
    if (!currentOpening || currentOpening.phase !== "ready") return;
    const pull = currentOpening.result.cards[index];
    if (!pull || pull.revealed || pull.fusedAway) return;
    const key = `${currentOpening.id}-${index}`;
    if (revealLocksRef.current.has(key)) return;
    revealLocksRef.current.add(key);

    const revealedOutcome = revealPackCard(gameRef.current, currentOpening.result.cards, index, { manual: true });
    const revealedPull = revealedOutcome.cards[index];
    let state = revealedOutcome.state;
    let cards = revealedOutcome.cards;
    const events = [...revealedOutcome.events];
    let fusionNotice = null;
    let fusionCount = 0;

    const sellRevealedDuplicates = () => {
      const sale = sellDuplicatesDetailed(state, { injectCards: cards });
      state = sale.state;
      cards = sale.cards || cards;
      events.push(...sale.events);
    };
    sellRevealedDuplicates();

    // Resolve every newly available pair immediately. Each replacement takes
    // the earlier slot and is itself revealed through the normal engine path.
    for (let guard = 0; guard < 32; guard += 1) {
      const fusion = resolveImmediateFusion(state, cards, { manual: true });
      if (!fusion.fused) break;
      state = fusion.state;
      cards = fusion.cards;
      events.push(...fusion.events);
      fusionCount += 1;
      fusionNotice = {
        index: fusion.index,
        cardId: fusion.cardId,
        count: fusionCount,
        serial: ++impactSerialRef.current,
      };
      sellRevealedDuplicates();
    }

    if (fusionCount > 0) revealLocksRef.current.clear();
    commit(state);
    pushFx(events);

    const echoesByIndex = new Map();
    for (const event of events) {
      if (event.t !== "echo" || !Number.isInteger(event.index)) continue;
      echoesByIndex.set(event.index, (echoesByIndex.get(event.index) || 0) + 1);
    }
    for (const [echoIndex, echoCount] of echoesByIndex) {
      const echoSerial = ++fxSerialRef.current;
      setRevealEchoes((current) => ({ ...current, [echoIndex]: { count: echoCount, serial: echoSerial } }));
      openingTimersRef.current.push(window.setTimeout(() => {
        setRevealEchoes((current) => {
          if (current[echoIndex]?.serial !== echoSerial) return current;
          const next = { ...current };
          delete next[echoIndex];
          return next;
        });
      }, 800 + 620 * Math.min(4, echoCount)));
    }

    const impactIndex = fusionNotice?.index ?? index;
    const impactPull = cards[impactIndex] || revealedPull;
    const rarity = RARITIES[impactPull.rarity];
    const allRevealed = cards.every((entry) => entry.revealed || entry.fusedAway);
    const overflowFlags = getOverflowFlags(currentOpening, cards);
    const impact = {
      index: impactIndex,
      rarity: impactPull.rarity,
      foil: impactPull.foil,
      serial: ++impactSerialRef.current,
    };
    commitOpening({
      ...currentOpening,
      result: { ...currentOpening.result, cards },
      phase: allRevealed ? "complete" : "ready",
      ...overflowFlags,
      revealed: cards.map((entry, position) => (entry.revealed ? position : -1)).filter((position) => position >= 0),
      impact,
      fusionNotice,
    });

    // In Overflow mode every reveal launches a ghost card that flies from the
    // face-down stack into its pile; the pile counter ticks when it lands.
    if (overflowFlags.overflow) {
      flightQueueRef.current.push({
        serial: ++flightSerialRef.current,
        cardId: impactPull.card.id,
        card: impactPull.card,
        rarity: impactPull.rarity,
        foil: Boolean(impactPull.foil),
      });
      const pending = { ...pendingLandRef.current };
      pending[impactPull.card.id] = (pending[impactPull.card.id] || 0) + 1;
      pendingLandRef.current = pending;
      setPendingLand(pending);
    }

    const audio = getAudio();
    const revealedRarity = RARITIES[revealedPull.rarity];
    audio.sound("reveal", revealedRarity.order);
    getHaptics().pulse("reveal", revealedRarity.order);
    if (revealedRarity.order >= RARITIES.legendary.order) {
      audio.sound("legendary", revealedRarity.order);
    }
    if (events.some((event) => event.t === "echo")) audio.sound("fusion", 2);
    if (fusionNotice) {
      const fusedCard = getCard(fusionNotice.cardId);
      audio.sound("fusion", 4);
      getHaptics().pulse("fuse");
      playGameplayCue(
        "fusion",
        fusionCount > 1 ? `FUSION ×${fusionCount}` : "FUSION",
        `${fusedCard?.name?.toUpperCase() || "UPGRADED CARD"} REVEALED`,
      );
      openingTimersRef.current.push(window.setTimeout(() => {
        commitOpening((current) => current?.id === currentOpening.id
          && current.fusionNotice?.serial === fusionNotice.serial
          ? { ...current, fusionNotice: null }
          : current);
      }, 1_000));
    }

    if (allRevealed) {
      const delay = rarity.order >= 4 ? 1550 : rarity.order === 3 ? 1200 : 900;
      openingTimersRef.current.push(window.setTimeout(() => {
        if (
          openingRef.current?.id !== currentOpening.id
          || openingRef.current.phase !== "complete"
        ) return;
        audio.sound("packComplete");
        audio.sound("caseBreak");
        getHaptics().pulse("open");
        commitOpening((current) => current?.id === currentOpening.id
          ? { ...current, phase: "collecting", impact: null, fusionNotice: null }
          : current);
      }, delay));
      openingTimersRef.current.push(window.setTimeout(() => {
        if (
          openingRef.current?.id !== currentOpening.id
          || openingRef.current.phase !== "collecting"
        ) return;
        revealLocksRef.current.clear();
        swipePointerRef.current = null;
        setSwipeRevealing(false);
        commitOpening(null);
      }, delay + COLLECTION_ANIMATION_MS));
    }
  }, [commit, commitOpening, getAudio, getHaptics, playGameplayCue, pushFx]);

  // Mystery and Fracture cards visibly spill into the current deal, then flip
  // through the exact same reveal function as a player-clicked card. Resolving
  // one at a time keeps mobile DOM/animation work bounded and preserves trigger
  // attribution (including Locklure) for every generated reveal.
  useEffect(() => {
    if (opening?.phase !== "ready") return undefined;
    const generatedIndex = opening.result.cards.findIndex((pull) => (
      pull
      && !pull.revealed
      && !pull.fusedAway
      && (pull.fromMystery || pull.fromFracture)
    ));
    if (generatedIndex < 0) return undefined;
    const timer = window.setTimeout(() => revealCard(generatedIndex), 180);
    return () => window.clearTimeout(timer);
  }, [opening?.phase, opening?.result?.cards, revealCard]);

  const forceFinishOpening = useCallback(() => {
    const currentOpening = openingRef.current;
    if (!currentOpening?.canForceFinish || currentOpening.phase === "collecting") return;
    clearOpeningTimers();
    clearHoldRevealTimer();
    revealLocksRef.current.clear();
    swipePointerRef.current = null;
    mobileAutoPointerRef.current = null;
    spaceHeldRef.current = false;
    setSwipeRevealing(false);
    setMobileAutoHeld(false);
    setSpaceHeld(false);

    let state = gameRef.current;
    let cards = currentOpening.result.cards;
    const events = [];
    for (let index = 0; index < cards.length; index += 1) {
      if (cards[index].revealed || cards[index].fusedAway) continue;
      const step = revealPackCard(state, cards, index, {
        manual: true,
        suppressEffects: true,
      });
      state = step.state;
      cards = step.cards;
      events.push(...step.events);
    }
    const automaticSale = sellDuplicatesDetailed(state, { injectCards: cards });
    state = automaticSale.state;
    cards = automaticSale.cards || cards;
    events.push(...automaticSale.events);
    for (let index = 0; index < cards.length; index += 1) {
      if (cards[index].revealed || cards[index].fusedAway) continue;
      const step = revealPackCard(state, cards, index, {
        manual: true,
        suppressEffects: true,
      });
      state = step.state;
      cards = step.cards;
      events.push(...step.events);
    }
    // FINISH is the hard loop breaker: generated cards still join the table and
    // are collected, but their resulting duplicate sale cannot start a new
    // display-effect chain.
    const cleanupSale = sellDuplicatesDetailed(state, { suppressEffects: true });
    state = cleanupSale.state;
    events.push(...cleanupSale.events);
    commit(state);
    pushFx(events);

    flightQueueRef.current = [];
    for (const timer of flightTimersRef.current.values()) window.clearTimeout(timer);
    flightTimersRef.current.clear();
    flightsRef.current = [];
    pendingLandRef.current = {};
    setFlights([]);
    setPendingLand({});
    setLandPulse(null);
    commitOpening({
      ...currentOpening,
      result: { ...currentOpening.result, cards },
      phase: "collecting",
      ...getOverflowFlags(currentOpening, cards),
      revealed: cards.map((entry, index) => (entry.revealed ? index : -1)).filter((index) => index >= 0),
      impact: null,
      fusionNotice: null,
    });
    getAudio().sound("packComplete");
    getAudio().sound("caseBreak");
    getHaptics().pulse("open");
    openingTimersRef.current.push(window.setTimeout(() => {
      if (
        openingRef.current?.id !== currentOpening.id
        || openingRef.current.phase !== "collecting"
      ) return;
      revealLocksRef.current.clear();
      swipePointerRef.current = null;
      setSwipeRevealing(false);
      commitOpening(null);
    }, COLLECTION_ANIMATION_MS));
  }, [
    clearHoldRevealTimer,
    clearOpeningTimers,
    commit,
    commitOpening,
    getAudio,
    getHaptics,
    pushFx,
  ]);

  const beginManualOpen = useCallback(() => {
    if (!ready || drawer || selectedCard || gameRef.current.discoverOffer) return;
    const currentOpening = openingRef.current;
    if (currentOpening && currentOpening.phase !== "collecting") return;
    let current = gameRef.current;
    if (getProductCount(current, current.activeSet, selectedPackType.id) <= 0) {
      if (selectedPackType.id === "loose" && getProductCount(current, current.activeSet, "case") > 0) {
        current = breakProduct(current, "case");
      }
      if (getProductCount(current, current.activeSet, selectedPackType.id) <= 0) {
        current = buyProduct(current, selectedPackType.id, current.activeSet);
      }
      if (getProductCount(current, current.activeSet, selectedPackType.id) <= 0) {
        const now = Date.now();
        if (now - purchaseDenyAtRef.current > 3_500) {
          purchaseDenyAtRef.current = now;
          const price = getPackPrice(current, selectedPackType.id, current.activeSet);
          getAudio().sound("deny");
          playGameplayCue("price", `${money(price)} CASH`, "KEEP HOLDING — PURCHASE RESUMES");
        }
        return;
      }
    }
    setRevealEchoes({});
    const rolled = openPack(current, { manual: true, source: selectedPackType.id, now: Date.now() });
    if (!rolled.result) {
      if (rolled.error === "MANUAL_RATE_CAP") {
        getAudio().sound("deny");
        playGameplayCue("pack-deny", "FOIL SETTLING", "");
      }
      return;
    }

    clearOpeningTimers();
    clearFlights();
    revealLocksRef.current.clear();
    swipePointerRef.current = null;
    setSwipeRevealing(false);
    commitOpening(null);
    commit(rolled.state);
    setBinderSetId(rolled.state.activeSet);
    const audio = getAudio();
    audio.ensure();
    audio.sound("pack");
    const haptics = getHaptics();
    haptics.ensure();
    haptics.pulse("open");

    pushFx(rolled.result.events);

    const id = `${Date.now()}-${rolled.state.packsOpened}`;
    const freshOpening = {
      id,
      result: rolled.result,
      phase: "sealed",
      revealed: [],
      impact: null,
      overflow: false,
      canForceFinish: false,
    };
    commitOpening({ ...freshOpening, ...getOverflowFlags(freshOpening, rolled.result.cards) });
    const quick = rolled.state.settings.quickOpen;
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
  }, [
    clearFlights,
    clearOpeningTimers,
    commit,
    commitOpening,
    drawer,
    getAudio,
    getHaptics,
    playGameplayCue,
    pushFx,
    ready,
    selectedCard,
    selectedPackType,
  ]);

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
    if (!autoOpeningHeld || drawer || selectedCard || game.discoverOffer) return undefined;

    if (!opening || opening.phase === "collecting") {
      const retry = () => {
        holdRevealTimerRef.current = null;
        beginManualOpen();
        const stillHeld = spaceHeldRef.current || mobileAutoPointerRef.current !== null;
        const current = openingRef.current;
        const canStart = !current || current.phase === "collecting";
        if (stillHeld && canStart) {
          holdRevealTimerRef.current = window.setTimeout(retry, 600);
        }
      };
      holdRevealTimerRef.current = window.setTimeout(retry, opening ? 900 : 450);
      return clearHoldRevealTimer;
    }

    if (opening.phase === "ready") {
      const nextIndex = findNextRevealIndex(opening.result.cards);
      if (nextIndex >= 0) {
        const lastIndex = opening.revealed.at(-1);
        const lastPull = Number.isInteger(lastIndex) ? opening.result.cards[lastIndex] : null;
        const lastOrder = lastPull ? RARITIES[lastPull.rarity].order : 0;
        // Overflow stacks drain faster: commons whip into their piles while
        // rare-or-better landings still get room to breathe.
        const delay = opening.overflow
          ? (mobileAutoHeld
            ? lastOrder >= 4 ? 1350 : lastOrder === 3 ? 950 : lastOrder === 2 ? 640 : 460
            : lastOrder >= 4 ? 1250 : lastOrder === 3 ? 820 : lastOrder === 2 ? 520 : 340)
          : (mobileAutoHeld
            ? lastOrder >= 4 ? 1500 : lastOrder === 3 ? 1180 : lastOrder === 2 ? 920 : 720
            : lastOrder >= 4 ? 1250 : lastOrder === 3 ? 900 : lastOrder === 2 ? 650 : 480);
        holdRevealTimerRef.current = window.setTimeout(() => {
          holdRevealTimerRef.current = null;
          revealCard(nextIndex);
        }, delay);
      }
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

  const revealNextFromStack = useCallback(() => {
    const currentOpening = openingRef.current;
    if (!currentOpening || currentOpening.phase !== "ready") return;
    const nextIndex = findNextRevealIndex(currentOpening.result.cards);
    if (nextIndex >= 0) revealCard(nextIndex);
  }, [revealCard]);

  // Turn queued overflow reveals into positioned flight ghosts once the new
  // piles exist in the DOM. Runs before paint so counters (held back through
  // pendingLand) never show a value ahead of the animation.
  useLayoutEffect(() => {
    if (!flightQueueRef.current.length) return;
    const queue = flightQueueRef.current;
    flightQueueRef.current = [];
    const layerRect = overflowBoardRef.current?.getBoundingClientRect();
    const stackRect = overflowStackRef.current?.getBoundingClientRect();
    const pending = { ...pendingLandRef.current };
    const pulses = [];
    const settle = (cardId) => {
      const left = (pending[cardId] || 0) - 1;
      if (left > 0) pending[cardId] = left;
      else delete pending[cardId];
    };
    const pileW = overflowLayout?.pileW || 60;
    const additions = [];
    for (const item of queue) {
      const pileRect = pileRefs.current.get(item.cardId)?.getBoundingClientRect();
      if (!layerRect || !stackRect || !pileRect) {
        settle(item.cardId);
        pulses.push(item);
        continue;
      }
      const fromX = stackRect.left + stackRect.width / 2 - layerRect.left;
      const fromY = stackRect.top + stackRect.width * 0.71 - layerRect.top;
      const toX = pileRect.left + pileRect.width / 2 - layerRect.left;
      const toY = pileRect.top + pileRect.width * 0.71 - layerRect.top;
      additions.push({
        ...item,
        x: fromX,
        y: fromY,
        dx: toX - fromX,
        dy: toY - fromY,
        scale: pileW / PILE_BASE_WIDTH,
      });
    }
    let working = [...flightsRef.current, ...additions];
    while (working.length > MAX_CONCURRENT_FLIGHTS) {
      const oldest = working.shift();
      const timer = flightTimersRef.current.get(oldest.serial);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        flightTimersRef.current.delete(oldest.serial);
      }
      settle(oldest.cardId);
      pulses.push(oldest);
    }
    flightsRef.current = working;
    pendingLandRef.current = pending;
    setFlights(working);
    setPendingLand(pending);
    if (pulses.length) {
      const last = pulses.at(-1);
      setLandPulse({ cardId: last.cardId, serial: last.serial, rarity: last.rarity });
    }
    for (const flight of additions) {
      flightTimersRef.current.set(flight.serial, window.setTimeout(
        () => landFlight(flight.serial),
        FLIGHT_DURATION_MS + 300,
      ));
    }
  }, [opening, landFlight, overflowLayout]);

  // FLIP: when a fresh pile squeezes into binder order, neighbours glide to
  // their new spots instead of teleporting.
  useLayoutEffect(() => {
    if (!overflowActive) {
      prevPileRectsRef.current = new Map();
      return;
    }
    const nextRects = new Map();
    for (const [id, el] of pileRefs.current) {
      if (el?.isConnected) nextRects.set(id, el.getBoundingClientRect());
    }
    const previous = prevPileRectsRef.current;
    const moved = [];
    for (const [id, rect] of nextRects) {
      const before = previous.get(id);
      if (!before) continue;
      const dx = before.left - rect.left;
      const dy = before.top - rect.top;
      if (Math.abs(dx) + Math.abs(dy) < 3) continue;
      const el = pileRefs.current.get(id);
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      moved.push(el);
    }
    if (moved.length) {
      window.requestAnimationFrame(() => {
        for (const el of moved) {
          el.style.transition = "transform 400ms cubic-bezier(0.18, 0.8, 0.24, 1)";
          el.style.transform = "";
        }
        window.setTimeout(() => {
          for (const el of moved) {
            if (!el.isConnected) continue;
            el.style.transition = "";
            el.style.transform = "";
          }
        }, 430);
      });
    }
    prevPileRectsRef.current = nextRects;
  }, [overflowActive, overflowPiles]);

  // Stack feedback: swell when spill cards join the face-down pile, squash
  // when a card launches out of it.
  useEffect(() => {
    const previous = prevUnrevealedRef.current;
    prevUnrevealedRef.current = overflowUnrevealed.count;
    if (!overflowActive || overflowUnrevealed.count === previous) return;
    setStackPulse({
      serial: ++fxSerialRef.current,
      kind: overflowUnrevealed.count > previous ? "gain" : "launch",
    });
  }, [overflowActive, overflowUnrevealed.count]);

  // One-shot OVERFLOW! announcement the moment the reveal tips over.
  useEffect(() => {
    if (!overflowActive || !opening?.id || opening.overflowAnnounced) return undefined;
    commitOpening((current) => (current?.id === opening.id
      ? { ...current, overflowAnnounced: true }
      : current));
    setOverflowBanner({ serial: ++impactSerialRef.current });
    getAudio().sound("caseBreak");
    getHaptics().pulse("burst");
    const timer = window.setTimeout(() => setOverflowBanner(null), 2_600);
    return () => window.clearTimeout(timer);
  }, [
    commitOpening,
    getAudio,
    getHaptics,
    opening?.id,
    opening?.overflowAnnounced,
    overflowActive,
  ]);

  const handleDisplay = useCallback((cardId) => {
    const next = displayCard(gameRef.current, cardId, Date.now());
    if (next === gameRef.current) {
      getAudio().sound("deny");
      return;
    }
    commit(next);
    getAudio().sound("switch");
    playGameplayCue("case", getCard(cardId)?.name?.toUpperCase() || "CARD SEATED", "ACTIVE IN THE CASE");
  }, [commit, getAudio, playGameplayCue]);

  const handleUndisplay = useCallback((cardId) => {
    const next = undisplayCard(gameRef.current, cardId);
    if (next === gameRef.current) return;
    commit(next);
    getAudio().sound("switch");
  }, [commit, getAudio]);

  const handleReset = useCallback(() => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    window.localStorage.removeItem(adminActiveRef.current ? ADMIN_SAVE_KEY : SAVE_KEY);
    const fresh = adminActiveRef.current ? createAdminState(Date.now()) : createInitialState(Date.now());
    legacyAutoSoldRef.current = false;
    commit(fresh);
    setBinderSetId(fresh.activeSet);
    setDrawer(null);
    setResetArmed(false);
    closeOpening();
  }, [closeOpening, commit, resetArmed]);

  const handleRewrite = useCallback(() => {
    if (!rewriteArmed) {
      setRewriteArmed(true);
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
    playGameplayCue("rewrite", "THE STORY REWRITES", `+${formatNumber(earned)} INSCRIPTIONS`, 3_600);
  }, [closeOpening, commit, getAudio, playGameplayCue, rewriteArmed]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === "Space" && !drawer && !selectedCard) {
        event.preventDefault();
        if (gameRef.current.discoverOffer) return;
        if (event.repeat || spaceHeldRef.current) return;
        spaceHeldRef.current = true;
        setSpaceHeld(true);
        if (!opening || opening.phase === "collecting") beginManualOpen();
      } else if (event.key === "Escape") {
        if (gameRef.current.discoverOffer) {
          const outcome = dismissDiscoverOfferDetailed(gameRef.current);
          commit(outcome.state);
          pushFx(outcome.events);
        }
        else if (selectedCard) setSelectedCard(null);
        else if (opening?.phase === "collecting") closeOpening();
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
  }, [
    beginManualOpen,
    clearHoldRevealTimer,
    closeOpening,
    drawer,
    opening,
    pushFx,
    selectedCard,
  ]);

  useEffect(() => {
    const preventSelection = (event) => event.preventDefault();
    document.addEventListener("selectstart", preventSelection);
    return () => document.removeEventListener("selectstart", preventSelection);
  }, []);

  useEffect(() => () => {
    clearOpeningTimers();
    clearHoldRevealTimer();
    for (const timer of flightTimersRef.current.values()) window.clearTimeout(timer);
    flightTimersRef.current.clear();
  }, [clearHoldRevealTimer, clearOpeningTimers]);

  const rotatePackType = useCallback((step) => {
    if (openingRef.current) return;
    setPackRotation(step < 0 ? "left" : "right");
    setPackTypeIndex((current) => (current + step + PACK_TYPES.length) % PACK_TYPES.length);
    getAudio().sound("switch");
  }, [getAudio]);

  const derived = useMemo(() => getDerived(game), [game]);
  const activeSet = getSet(game.activeSet);
  const selectedPackStock = getProductCount(game, game.activeSet, selectedPackType.id);
  const nextPackPrice = getPackPrice(game, selectedPackType.id, game.activeSet);
  const mobileAutoTitle = mobileAutoHeld
    ? "AUTO-OPENING"
    : "HOLD TO AUTO-OPEN";
  const mobileAutoDetail = mobileAutoHeld
    ? selectedPackStock > 0 || game.coins >= nextPackPrice ? "RELEASE TO STOP" : `WAITING FOR ${money(nextPackPrice)} CASH`
    : "SLOW REVEAL / CONTINUES INTO NEXT PACK";

  return (
    <main
      className={`packworks pw2 pw-clean theme-league fx-holo ${opening ? "opening-active" : ""} ${spaceHeld ? "space-held" : ""} ${mobileAutoHeld ? "mobile-auto-held" : ""} ${swipeRevealing ? "swipe-revealing" : ""}`}
      data-fx-style="holo"
      style={{ "--set-a": activeSet.colors[0], "--set-b": activeSet.colors[1], "--set-c": activeSet.colors[2] }}
    >
      <header className="clean-topbar">
        <button
          type="button"
          className="clean-brand"
          onClick={() => {
            setResetArmed(false);
            setDrawer(drawer === "settings" ? null : "settings");
          }}
          aria-label="PACKWORKS game options"
          aria-expanded={drawer === "settings"}
        >
          <span className="clean-brand-mark"><i /><i /><i /></span>
          <strong>PACKWORKS</strong>
        </button>
        <div className={`clean-wallet ${cashStreams.length ? "is-cash-receiving" : ""}`}>
          <strong>{money(game.coins)}</strong>
          <span>
            CASH / +{rate(derived.passiveRate)} PER SECOND
            {derived.inscriptions > 0 ? ` / ${formatNumber(derived.inscriptions)} INSCRIPTIONS` : ""}
          </span>
        </div>
      </header>

      <section className="clean-stage">
        <div className="clean-stage-light" />
        <div className="clean-floor"><i /><i /><i /><i /><i /></div>
        <div className={`stage-case-dock${opening ? " is-opening" : ""}`}>
          <div className="case-dock-row">
            {opening?.canForceFinish && !["complete", "collecting"].includes(opening.phase) && (
              <button
                type="button"
                className="opening-back-button"
                onClick={forceFinishOpening}
                aria-label="Finish opening and collect every card"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15.5 4.5 8 12l7.5 7.5" />
                </svg>
              </button>
            )}
            <CaseStrip game={game} derived={derived} fx={fx} onOpenCase={() => setDrawer("case")} />
          </div>
          {Object.keys(game.discoverStack || {}).length > 0 && (
            <div className="discover-stack" aria-label="Pending Discover stacks">
              {Object.entries(game.discoverStack).map(([id, count]) => {
                const option = DISCOVER_POOL.find((candidate) => candidate.id === id);
                return <span key={id}>{option?.name || id} ×{count}</span>;
              })}
            </div>
          )}
        </div>

        <div className="clean-pack-station" data-pack-type={selectedPackType.id}>
          <div className="pack-rotunda">
            <button
              type="button"
              className="pack-rotunda-arrow is-previous"
              onClick={() => rotatePackType(-1)}
              aria-label="Previous pack type"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15.5 4.5 8 12l7.5 7.5" />
              </svg>
            </button>
            <button
              className="clean-pack-clicker"
              onPointerDown={(event) => {
                if (event.pointerType === "mouse") return;
                startMobileAuto(event);
                beginManualOpen();
              }}
              onPointerUp={stopMobileAuto}
              onPointerCancel={stopMobileAuto}
              onContextMenu={(event) => event.preventDefault()}
              onClick={beginManualOpen}
              aria-label={selectedPackStock
                ? `Open a pack: ${selectedPackType.name}. ${selectedPackStock} ready.`
                : `Buy and open a pack: ${selectedPackType.name} for ${exactMoney(nextPackPrice)} cash.`}
            >
              <span className="clean-pack-shadow" />
              <span
                className={`clean-pack-stack rotates-${packRotation}`}
                key={selectedPackType.id}
              >
                <i /><i />
                <PackFace set={activeSet} packType={selectedPackType} />
              </span>
            </button>
            <button
              type="button"
              className="pack-rotunda-arrow is-next"
              onClick={() => rotatePackType(1)}
              aria-label="Next pack type"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m8.5 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
          <div className="pack-type-copy" aria-live="polite">
            <strong>{exactMoney(nextPackPrice)} CASH</strong>
            <small>{selectedPackType.description}</small>
          </div>
        </div>

        <SetTray
          game={game}
          set={activeSet}
          onOpenBinder={() => {
            setBinderSetId(game.activeSet);
            setDrawer("binder");
          }}
        />
      </section>

      {drawer && (
        <button
          className="clean-drawer-scrim"
          aria-label="Close panel"
          onClick={() => {
            setDrawer(null);
            setResetArmed(false);
          }}
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
      {drawer === "settings" && (
        <SettingsPanel
          game={game}
          hapticsAvailable={hapticsAvailable}
          resetArmed={resetArmed}
          onClose={() => {
            setDrawer(null);
            setResetArmed(false);
          }}
          onToggleSound={() => {
            commit((current) => ({ ...current, settings: { ...current.settings, sound: !current.settings.sound } }));
            getAudio().ensure();
            getAudio().sound("switch");
          }}
          onToggleHaptics={() => {
            commit((current) => ({ ...current, settings: { ...current.settings, haptics: current.settings.haptics === false } }));
            const haptics = getHaptics();
            haptics.ensure();
            haptics.pulse("open");
          }}
          onReset={handleReset}
        />
      )}

      {opening && (
        <div
          className={`opening-layer phase-${opening.phase} clean-opening ${overflowActive ? "is-overflow" : ""} ${opening.impact ? `screen-impact-${opening.impact.rarity}` : ""}`}
          style={{
            "--set-a": opening.result.set.colors[0],
            "--set-b": opening.result.set.colors[1],
            "--set-c": opening.result.set.colors[2],
          }}
        >
          <div className="opening-haze" />
          <div className="foil-pack-wrap">
            <div className="foil-half foil-top"><PackFace set={opening.result.set} packType={opening.result.packType} /></div>
            <div className="foil-half foil-bottom"><PackFace set={opening.result.set} packType={opening.result.packType} /></div>
            <span className="tear-ribbon">PACKWORKS / FACTORY WRAPPED</span>
            <span className="tear-shockwave" />
            <PackDebris />
          </div>
          {!overflowActive && (
            <div
              className={`reveal-deck ${swipeRevealing ? "is-swipe-revealing" : ""}`}
              style={boardLayout.count ? {
                "--board-gap-x": `${boardLayout.gapX}px`,
                "--board-gap-y": `${boardLayout.gapY}px`,
              } : undefined}
              onPointerDown={startSwipeReveal}
              onPointerMove={continueSwipeReveal}
              onPointerUp={stopSwipeReveal}
              onPointerCancel={stopSwipeReveal}
            >
              {openingActiveIndices.map((index, position) => {
                const pull = opening.result.cards[index];
                return (
                  <RevealCard
                    key={`${opening.id}-${index}`}
                    pull={pull}
                    index={index}
                    position={position}
                    count={boardLayout.count}
                    perRow={boardLayout.perRow}
                    rows={boardLayout.rows}
                    shrink={boardLayout.shrink}
                    revealed={!!pull.revealed}
                    echo={revealEchoes[index]}
                    latest={opening.impact?.index === index}
                    phase={opening.phase}
                    onReveal={revealCard}
                  />
                );
              })}
            </div>
          )}
          {overflowActive && overflowLayout && (
            <div
              ref={overflowBoardRef}
              className="overflow-board"
              style={{
                "--pile-w": `${overflowLayout.pileW}px`,
                "--pile-scale": +(overflowLayout.pileW / PILE_BASE_WIDTH).toFixed(4),
                "--pile-gap": `${overflowLayout.gap}px`,
                "--piles-top": `${overflowLayout.pilesTop}px`,
                "--piles-bottom": `${overflowLayout.pilesBottom}px`,
                "--stack-w": `${overflowLayout.stackW}px`,
              }}
            >
              <button
                type="button"
                className={`overflow-stack ${overflowUnrevealed.count === 0 ? "is-empty" : ""} ${spaceHeld || mobileAutoHeld ? "is-auto" : ""}`.trim()}
                onClick={revealNextFromStack}
                disabled={overflowUnrevealed.count === 0 || opening.phase !== "ready"}
                aria-label={overflowUnrevealed.count
                  ? `Reveal the next of ${overflowUnrevealed.count} face-down cards`
                  : "Every card is revealed"}
              >
                <span
                  key={stackPulse?.serial || "idle"}
                  className={`overflow-stack-inner ${stackPulse ? `pulse-${stackPulse.kind}` : ""}`.trim()}
                >
                  <span className="overflow-stack-cards" ref={overflowStackRef} aria-hidden="true">
                    <CrestBack label={opening.result.set.short} />
                    <CrestBack label={opening.result.set.short} />
                    <CrestBack label={opening.result.set.short} />
                  </span>
                  <span className="overflow-stack-meta">
                    <b className="overflow-stack-count" key={overflowUnrevealed.count}>
                      {overflowUnrevealed.count}
                    </b>
                    <small className="overflow-stack-label">
                      {overflowUnrevealed.count ? "UNREVEALED" : "ALL REVEALED"}
                    </small>
                    {overflowUnrevealed.marked > 0 && (
                      <i className="overflow-stack-chip is-marked">{overflowUnrevealed.marked} MARKED</i>
                    )}
                    {overflowUnrevealed.mystery > 0 && (
                      <i className="overflow-stack-chip is-mystery">{overflowUnrevealed.mystery} MYSTERY</i>
                    )}
                  </span>
                </span>
              </button>
              <div
                className={`overflow-piles ${overflowLayout.scrollable ? "is-scrollable" : ""}`.trim()}
                aria-label={`${overflowPiles.length} distinct cards revealed`}
              >
                {overflowPiles.map((pile, position) => {
                  const shown = Math.max(0, pile.count - (pendingLand[pile.card.id] || 0));
                  return (
                    <OverflowPile
                      key={pile.card.id}
                      card={pile.card}
                      count={shown}
                      foil={pile.foil}
                      incoming={shown === 0}
                      pulse={landPulse?.cardId === pile.card.id ? landPulse : null}
                      enterDelay={Math.min(position * 14, 420)}
                      onRef={getPileRefCallback(pile.card.id)}
                    />
                  );
                })}
              </div>
              <OverflowFlightLayer flights={flights} onLand={landFlight} />
            </div>
          )}
          {overflowBanner && (
            <div key={overflowBanner.serial} className="overflow-banner" aria-live="polite">
              <span className="overflow-banner-shockwave" aria-hidden="true" />
              <strong>OVERFLOW!</strong>
            </div>
          )}
          <OpeningImpact impact={opening.impact} />
          {opening.fusionNotice && (
            <div
              key={opening.fusionNotice.serial}
              className="opening-fusion-notice"
              aria-live="polite"
            >
              <span>FUSION</span>
              <strong>{getCard(opening.fusionNotice.cardId)?.name || "UPGRADED CARD"}</strong>
              <small>REVEALED</small>
            </div>
          )}
          <button
            type="button"
            className={`mobile-auto-control ${mobileAutoHeld ? "is-held" : ""}`}
            aria-label="Continue opening. Hold to reveal cards, buy packs when needed, and continue automatically."
            aria-pressed={mobileAutoHeld}
            onPointerDown={startMobileAuto}
            onPointerUp={stopMobileAuto}
            onPointerCancel={stopMobileAuto}
            onLostPointerCapture={stopMobileAuto}
            onContextMenu={(event) => event.preventDefault()}
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
                      const outcome = chooseDiscoverOptionDetailed(gameRef.current, id);
                      commit(outcome.state);
                      pushFx(outcome.events);
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
            <button
              className="discover-skip"
              onClick={() => {
                const outcome = dismissDiscoverOfferDetailed(gameRef.current);
                commit(outcome.state);
                pushFx(outcome.events);
              }}
            >
              SKIP
            </button>
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

      <CashStreamLayer streams={cashStreams} />
      <GameplayCueLayer cues={gameplayCues} />

      {globalBursts.length > 0 && (
        <GlobalBurstLayer
          bursts={globalBursts}
          onComplete={(id) => {
            setGlobalBursts((current) => current.filter((burst) => burst.id !== id));
          }}
        />
      )}

      {!ready && <div className="loading-screen"><span>PACKWORKS</span><i /></div>}
    </main>
  );
}
