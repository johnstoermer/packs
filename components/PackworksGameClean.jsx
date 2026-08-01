"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  PACK_TYPES,
  RARITIES,
  formatNumber,
  getCard,
  getCardArtId,
  getSet,
} from "../lib/gameData";
import {
  ADMIN_FLAG_KEY,
  ADMIN_SAVE_KEY,
  PACK_SIZE,
  SAVE_KEY,
  applyAdminGuarantees,
  buyPack,
  clearOpeningQueue,
  createAdminState,
  createInitialState,
  displayCard,
  enqueueReveal,
  getDerived,
  getPackPrice,
  getPendingCardCount,
  hydrateState,
  isOpeningSettled,
  openPack,
  reorderDisplayed,
  serializeState,
  stepOpening,
  storedSaveDominates,
  undisplayCard,
} from "../lib/gameLogic";
import {
  CASE_SIZE,
  getCardDef,
  getCardRules,
} from "../lib/engineCards";
import { createAudioEngine } from "../lib/audio";
import { createHapticsEngine } from "../lib/haptics";
import { solveOverflowLayout } from "../lib/overflowLayout";
import GlobalBurstLayer from "./GlobalBurstLayer";

const ASSET_BASE = process.env.NEXT_PUBLIC_PACKWORKS_BASE || "";
const PIXEL_ART_VERSION = "20260726-2";
const MOBILE_REVEAL_COLUMNS = 6;
const COLLECTION_ANIMATION_MS = 950;
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

// The board holds at most one standard pack of loose cards. Past that the
// opening tips into Overflow mode — one face-down stack up top, one counted
// pile per distinct card below — and stays there for the rest of the reveal.
function getOverflowFlags(openingValue, cards) {
  const active = countActiveCards(cards);
  const overflow = Boolean(openingValue.overflow) || active > PACK_SIZE;
  return { overflow };
}

function money(value) {
  return formatNumber(Math.round(Number(value) || 0));
}

function exactMoney(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

function CardArt({ card, compact = false, animated = false }) {
  const pixelRef = useRef(null);
  const [pixelReady, setPixelReady] = useState(false);
  const set = getSet(card.setId);
  // Art is filed under the print each card's illustration came from.
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

export const PrintedCard = memo(function PrintedCard({
  card,
  rarityId = card.rarity,
  copyLabel = "COLLECTED",
  foil = false,
  compact = false,
  className = "",
}) {
  const rarity = RARITIES[rarityId];
  const set = getSet(card.setId);
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
        <span className="card-type-line">{rarity.label} / Creature</span>
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
});

const RevealCard = memo(function RevealCard({
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
  const dealt = ["ready", "complete", "collecting"].includes(phase);
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
      className={`reveal-card count-${count} rarity-${pull.rarity} ${dealt ? "is-dealt" : ""} ${revealed ? "is-revealed" : ""} ${latest ? "is-impacting" : ""} ${canReveal ? "is-revealable" : ""} ${pull.foil ? "is-foil" : ""} ${pull.fusedAway ? "is-fused-away" : ""} ${pull.fromEffect && !revealed ? "is-mystery" : ""}`}
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
          <b className="reveal-echo-chip">{echo.label || "ECHO"}</b>
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
});

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
  depleted,
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
      className={`overflow-pile rarity-${card.rarity} ${incoming ? "is-incoming" : ""} ${depleted ? "is-depleted" : ""} ${count > 1 ? "is-stacked" : ""}`.trim()}
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
        <small>{impact.foil ? "FOIL PULL" : impact.label || "CARD REVEALED"}</small>
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
          className={`cash-stream-value${stream.kind === "scrap" ? " is-scrap" : ""}`}
          key={stream.id}
          style={{
            "--cash-x": `${stream.x}px`,
            "--cash-delay": `${stream.delay}ms`,
          }}
        >
          +{money(stream.amount)}{stream.kind === "scrap" ? " SCRAP" : ""}
        </span>
      ))}
    </div>
  );
}

function BinderDrawer({ game, set, onClose, onCard, displayedIds }) {
  const [query, setQuery] = useState("");
  const [ownership, setOwnership] = useState("all");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [sort, setSort] = useState("number");
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
    <aside className="clean-drawer clean-binder" aria-label="Binder">
      <header>
        <div><span>BINDER</span><h2>{set.name}</h2></div>
        <button onClick={onClose} aria-label="Close binder">CLOSE</button>
      </header>
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
            <option value="owned">Opened</option>
            <option value="missing">Not opened</option>
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
            <option value="number">Card number</option>
            <option value="rarity">Rarity / high first</option>
            <option value="rarity-low">Rarity / low first</option>
            <option value="name">Card name</option>
          </select>
        </label>
        <div className="clean-binder-count">
          <strong>{found}/{set.cards.length}</strong>
          <span>COLLECTED</span>
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
              aria-label={count ? `${card.name}, opened ${count} times` : `Missing card ${card.number}, show rarity`}
            >
              {count ? (
                <PrintedCard
                  card={card}
                  compact
                  foil={(game.foils?.[card.id] || 0) > 0}
                  copyLabel={displayedIds?.has(card.id) ? "ON DISPLAY" : "COLLECTED"}
                />
              ) : (
                <span className="card-back back-style-crest">
                  <span className="back-orbit"><i /><i /><i /></span>
                  <span className="back-mark"><span><b>PW</b><small>PACKWORKS</small></span></span>
                  <span className="back-rule" />
                </span>
              )}
              <span className="clean-binder-card-state">
                {count ? rarity.label : `${rarity.label} / NOT OPENED`}
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
  const isDisplayed = derived.displayedEntries.some((entry) => entry.id === card.id);
  const caseFull = derived.displayedEntries.length >= derived.caseSlots;
  const hasEffect = Boolean(getCardDef(card.id));
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
              copyLabel={`OPENED ${count}×`}
            />
          ) : (
            <span className="card-back card-zoom-back back-style-crest" aria-label={`Card ${String(card.number).padStart(2, "0")}, not opened yet`}>
              <span className="back-set">{getSet(card.setId).short}</span>
              <span className="back-orbit"><i /><i /><i /></span>
              <span className="back-mark"><span><b>PW</b><small>PACKWORKS</small></span></span>
              <span className="back-rule" />
            </span>
          )}
        </div>
        <div className="card-zoom-hud">
          <div className="card-zoom-status">
            <span>{count ? `${rarity.label} / ${rarity.rateLabel} PULL RATE` : "NOT OPENED YET"}</span>
            <strong>{count ? card.name : `Card ${String(card.number).padStart(2, "0")}`}</strong>
            <small>
              {count
                ? `Pays ${money(rarity.sellValue)} cash on reveal (foil pays double) / Salvages into ${money(rarity.scrapValue)} Scrap${hasEffect ? " / carries a display effect" : ""}`
                : `${rarity.label} / ${rarity.rateLabel} pull rate`}
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

// Pointer-driven reordering for the display case. Pointer events rather than
// HTML5 drag-and-drop so the same code path serves mouse and touch; the drag
// only arms past DRAG_SLOP so a tap still reads as "zoom this card".
const DRAG_SLOP = 7;

function useCaseDragReorder(filledCount, onReorder) {
  const [drag, setDrag] = useState(null);
  const slotRefs = useRef(new Map());
  const dragRef = useRef(null);

  // Pointer events can outpace React's commit, so the ref is written
  // synchronously and is what the handlers read; state only drives rendering.
  const applyDrag = useCallback((next) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const registerSlot = useCallback((index, node) => {
    if (node) slotRefs.current.set(index, node);
    else slotRefs.current.delete(index);
  }, []);

  // Nearest slot centre wins, so a card dropped in the gutter still lands.
  const slotAt = useCallback((x, y) => {
    let best = null;
    let bestDistance = Infinity;
    for (const [index, node] of slotRefs.current) {
      if (index >= filledCount) continue;
      const rect = node.getBoundingClientRect();
      const dx = x - (rect.left + rect.width / 2);
      const dy = y - (rect.top + rect.height / 2);
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  }, [filledCount]);

  // Capture on press, not on the first move past the slop: a fast flick can
  // leave the card's box before any move event lands on it, and an uncaptured
  // pointer would then drop the gesture entirely.
  const onPointerDown = useCallback((index) => (event) => {
    if (event.button != null && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    applyDrag({
      index,
      over: index,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      dx: 0,
      dy: 0,
      active: false,
    });
  }, [applyDrag]);

  const onPointerMove = useCallback((event) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.originX;
    const dy = event.clientY - current.originY;
    if (!current.active && Math.hypot(dx, dy) <= DRAG_SLOP) return;
    event.preventDefault();
    applyDrag({ ...current, dx, dy, active: true, over: slotAt(event.clientX, event.clientY) ?? current.index });
  }, [applyDrag, slotAt]);

  // Returns true when the gesture was a real drag, so the click that follows
  // can be swallowed instead of zooming the card that was just dropped.
  const endDrag = useCallback((event) => {
    const current = dragRef.current;
    if (!current || (event && current.pointerId !== event.pointerId)) return false;
    applyDrag(null);
    if (!current.active) return false;
    if (current.over != null && current.over !== current.index) onReorder(current.index, current.over);
    return true;
  }, [applyDrag, onReorder]);

  return { drag, registerSlot, onPointerDown, onPointerMove, endDrag };
}

function CaseDrawer({ game, derived, onClose, onUndisplay, onPickCard, onOpenBinder, onReorder }) {
  const filledCount = derived.displayedEntries.length;
  const { drag, registerSlot, onPointerDown, onPointerMove, endDrag } = useCaseDragReorder(filledCount, onReorder);
  const suppressClickRef = useRef(false);
  return (
    <aside className="clean-drawer clean-case" aria-label="Display case">
      <header>
        <div><span>DISPLAY CASE</span><h2>On display</h2></div>
        <button onClick={onClose} aria-label="Close display case">CLOSE</button>
      </header>
      <div className="clean-drawer-scroll">
        <p className="clean-case-note">
          Displayed cards fire their printed effects while a pack is open.
          {" "}{derived.displayedEntries.length}/{derived.caseSlots} available slots filled.
          {" "}Slot order matters — some effects look at the card to their right.
          {filledCount > 1 && " Drag a card to move it to another slot."}
        </p>
        <div className={`clean-case-slots ${drag?.active ? "is-reordering" : ""}`}>
          {Array.from({ length: CASE_SIZE }, (_, index) => {
            const entry = derived.displayedEntries[index];
            if (entry) {
              const card = getCard(entry.id);
              const rarity = RARITIES[card.rarity];
              const tally = game.triggerTallies?.[entry.id] || 0;
              const dragging = drag?.active && drag.index === index;
              const dropTarget = drag?.active && drag.over === index && drag.index !== index;
              return (
                <article
                  className={`clean-case-slot is-filled rarity-${card.rarity}${filledCount > 1 ? " is-draggable" : ""}${dragging ? " is-dragging" : ""}${dropTarget ? " is-drop-target" : ""}`}
                  key={`slot-${index}`}
                  ref={(node) => registerSlot(index, node)}
                  style={{
                    "--rarity": rarity.color,
                    ...(dragging ? { "--drag-x": `${drag.dx}px`, "--drag-y": `${drag.dy}px` } : null),
                  }}
                >
                  <button
                    className="clean-case-card"
                    onPointerDown={filledCount > 1 ? onPointerDown(index) : undefined}
                    onPointerMove={filledCount > 1 ? onPointerMove : undefined}
                    onPointerUp={(event) => { suppressClickRef.current = endDrag(event); }}
                    onPointerCancel={(event) => { endDrag(event); suppressClickRef.current = false; }}
                    onClick={() => {
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                      onPickCard(card.id);
                    }}
                    onKeyDown={(event) => {
                      if (filledCount < 2) return;
                      const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
                      if (!step) return;
                      event.preventDefault();
                      const target = index + step;
                      if (target >= 0 && target < filledCount) onReorder(index, target);
                    }}
                    aria-label={filledCount > 1
                      ? `${card.name}, case slot ${index + 1} of ${filledCount}. Drag to move, or use the arrow keys. Click to zoom.`
                      : `Zoom ${card.name}`}
                  >
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
      </div>
    </aside>
  );
}

function CaseStrip({ derived, fx, onOpenCase }) {
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
        const pulse = fx[entry.id];
        return (
          <button
            type="button"
            key={`${entry.id}-${pulse?.serial || "idle"}`}
            className={`case-strip-slot is-filled rarity-${card.rarity}${pulse ? ` is-triggered fx-${pulse.kind}` : ""}`}
            style={{ "--rarity": RARITIES[card.rarity].color }}
            data-fx={pulse ? pulse.serial : undefined}
            title={card.name}
            onClick={onOpenCase}
            aria-label={`${card.name} — open display case`}
          >
            <CardArt card={card} compact />
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

// Bottom-center collection meter: one compact progress bar for the set.
// Click-through to the binder for per-card detail.
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
  const pumpTimerRef = useRef(null);
  const holdRevealTimerRef = useRef(null);
  const spaceHeldRef = useRef(false);
  const mobileAutoPointerRef = useRef(null);
  const swipePointerRef = useRef(null);
  const impactSerialRef = useRef(0);
  const globalBurstSerialRef = useRef(0);
  const cashStreamSerialRef = useRef(0);
  const purchaseDenyAtRef = useRef(0);
  const adminActiveRef = useRef(false);
  const fxSerialRef = useRef(0);

  const [game, setGame] = useState(() => createInitialState(0));
  const [ready, setReady] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [opening, setOpening] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [globalBursts, setGlobalBursts] = useState([]);
  const [cashStreams, setCashStreams] = useState([]);
  const [resetArmed, setResetArmed] = useState(false);
  const [fx, setFx] = useState({});
  const [revealEchoes, setRevealEchoes] = useState({});
  const [viewport, setViewport] = useState({ w: 1200, h: 800, coarse: false });
  const [hapticsAvailable, setHapticsAvailable] = useState(false);
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

  const packType = PACK_TYPES[0];

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

  const playResourceGains = useCallback((items) => {
    const queued = items
      .filter((item) => item.amount > 0)
      .slice(0, 18)
      .map((item, index) => ({
        id: ++cashStreamSerialRef.current,
        amount: item.amount,
        kind: item.kind || "cash",
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

  const queueGlobalBurst = useCallback((type, count = 1, card = null) => {
    const burst = {
      id: ++globalBurstSerialRef.current,
      type,
      count: Math.max(1, count),
      card,
    };
    setGlobalBursts((current) => [...current.slice(-4), burst]);
  }, []);

  const pushFx = useCallback((events) => {
    if (!events?.length) return;
    const gains = [];
    for (const event of events) {
      if (event.t === "coins" && event.amount > 0) gains.push({ amount: event.amount, kind: "cash" });
      if (event.t === "scrap" && event.amount > 0) gains.push({ amount: event.amount, kind: "scrap" });
    }
    playResourceGains(gains);
    const stamp = {};
    for (const event of events) {
      const kind = event.t === "trigger" ? "trigger"
        : event.t === "encore" ? "echo"
        : event.t === "salvage" && event.source ? "mystery"
        : ["fusion", "rareShift", "reroll"].includes(event.t) && event.source ? "pulse"
        : null;
      const displayCardId = event.t === "trigger" || event.t === "encore" ? event.cardId : event.source;
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
    const salvages = events.filter((event) => event.t === "salvage").length;
    if (salvages > 0) {
      queueGlobalBurst("salvage", salvages);
      getHaptics().pulse("burst");
    }
    const bursts = events.filter((event) => event.t === "addCards" && event.packBurst).length;
    if (bursts > 0) {
      queueGlobalBurst("fracture", bursts);
      getAudio().sound("caseBreak");
      getHaptics().pulse("burst");
    }
  }, [getAudio, getHaptics, playResourceGains, queueGlobalBurst]);

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
      setReady(true);
      return;
    }
    let loaded = null;
    try {
      loaded = JSON.parse(window.localStorage.getItem(SAVE_KEY) || "null");
    } catch {
      loaded = null;
    }
    // The game only runs while a pack is open in front of you: no offline
    // earnings, no away report, nothing ticking in the background.
    const hydrated = hydrateState(loaded, Date.now());
    commit(hydrated);
    setReady(true);
  }, [commit]);

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

  const clearOpeningTimers = useCallback(() => {
    openingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    openingTimersRef.current = [];
    if (pumpTimerRef.current !== null) {
      window.clearTimeout(pumpTimerRef.current);
      pumpTimerRef.current = null;
    }
  }, []);

  const clearHoldRevealTimer = useCallback(() => {
    if (holdRevealTimerRef.current !== null) {
      window.clearTimeout(holdRevealTimerRef.current);
      holdRevealTimerRef.current = null;
    }
  }, []);

  // Leaving an opening clears the action stack — pending reveals and queued
  // effects are gone, revealed cards keep everything they already paid.
  const closeOpening = useCallback(() => {
    clearOpeningTimers();
    clearHoldRevealTimer();
    clearFlights();
    mobileAutoPointerRef.current = null;
    swipePointerRef.current = null;
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
      }
    } catch {
      // Local storage can be unavailable in strict privacy modes.
    }
  }, [closeOpening, commit]);

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

  const openingCards = opening?.session?.cards;
  const openingActiveIndices = useMemo(() => getActiveIndices(openingCards), [openingCards]);
  const overflowActive = Boolean(opening?.overflow);

  // Overflow piles: one entry per distinct revealed card. New cards append at
  // the end in first-revealed order, so the board never reshuffles under a
  // fresh arrival. The sequence tracker survives re-renders (idempotent per
  // card) and resets with each opening.
  const pileSeqRef = useRef({ openingId: null, seq: new Map(), next: 0, waveSize: -1 });
  const overflowPiles = useMemo(() => {
    if (!overflowActive || !openingCards) return [];
    const tracker = pileSeqRef.current;
    if (tracker.openingId !== opening?.id) {
      tracker.openingId = opening?.id;
      tracker.seq = new Map();
      tracker.next = 0;
      tracker.waveSize = -1;
    }
    const live = new Map();
    for (const pull of openingCards) {
      if (!pull.revealed || pull.fusedAway) continue;
      const entry = live.get(pull.card.id);
      if (entry) {
        entry.count += 1;
        entry.foil = entry.foil || Boolean(pull.foil);
      } else {
        live.set(pull.card.id, { card: pull.card, count: 1, foil: Boolean(pull.foil) });
      }
    }
    for (const [id, entry] of live) {
      if (!tracker.seq.has(id)) tracker.seq.set(id, { seq: tracker.next++, card: entry.card });
    }
    if (tracker.waveSize < 0 && tracker.next > 0) tracker.waveSize = tracker.next;
    // Once a card has shown on the board it stays for the rest of the
    // opening; when effects like Fuse or Salvage consume every copy, its pile
    // greys out at zero instead of disappearing.
    const entries = [];
    for (const [id, meta] of tracker.seq) {
      const current = live.get(id);
      entries.push({
        card: current?.card || meta.card,
        count: current ? current.count : 0,
        foil: Boolean(current?.foil),
        seq: meta.seq,
      });
    }
    entries.sort((left, right) => left.seq - right.seq);
    return entries;
  }, [overflowActive, openingCards, opening?.id]);

  const overflowUnrevealed = useMemo(() => {
    if (!overflowActive || !openingCards) return { count: 0, bonus: 0 };
    let count = 0;
    let bonus = 0;
    for (const pull of openingCards) {
      if (pull.revealed || pull.fusedAway) continue;
      count += 1;
      if (pull.fromEffect) bonus += 1;
    }
    return { count, bonus };
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
      setSize: opening?.set?.cards?.length || 50,
    });
  }, [overflowActive, overflowPiles.length, opening?.set, viewport]);

  // Rarity-scaled pacing between queued actions: commons whip by, premium
  // reveals get room to breathe, and overflow reveals drain faster.
  const delayForStep = useCallback((outcome, overflow) => {
    const action = outcome.action;
    if (!action) return 220;
    if (action.type === "reveal") {
      const pull = outcome.session.cards[action.index];
      const order = pull ? RARITIES[pull.rarity].order : 0;
      if (overflow) {
        return order >= 3 ? 1250 : order === 2 ? 820 : order === 1 ? 520 : 340;
      }
      return order >= 3 ? 1250 : order === 2 ? 900 : order === 1 ? 650 : 480;
    }
    if (action.type === "fuse") return 700;
    if (action.type === "salvage") return 520;
    return 360;
  }, []);

  const scheduleCompletion = useCallback((openingId, lastRarityOrder = 0) => {
    const delay = lastRarityOrder >= 3 ? 1550 : lastRarityOrder === 2 ? 1200 : 900;
    openingTimersRef.current.push(window.setTimeout(() => {
      if (
        openingRef.current?.id !== openingId
        || openingRef.current.phase !== "complete"
      ) return;
      const audio = getAudio();
      audio.sound("packComplete");
      audio.sound("caseBreak");
      getHaptics().pulse("open");
      commitOpening((current) => current?.id === openingId
        ? { ...current, phase: "collecting", impact: null, fusionNotice: null }
        : current);
    }, delay));
    openingTimersRef.current.push(window.setTimeout(() => {
      if (
        openingRef.current?.id !== openingId
        || openingRef.current.phase !== "collecting"
      ) return;
      swipePointerRef.current = null;
      setSwipeRevealing(false);
      commitOpening(null);
    }, delay + COLLECTION_ANIMATION_MS));
  }, [commitOpening, getAudio, getHaptics]);

  // THE ACTION PUMP. Every queued action — player reveals and card effects
  // alike — resolves here, strictly one at a time, in the order it was
  // queued. Rapid clicks stack up; nothing ever resolves simultaneously.
  const pumpQueue = useCallback(() => {
    const currentOpening = openingRef.current;
    if (!currentOpening || currentOpening.phase !== "ready") return;
    const session = currentOpening.session;
    if (!session || session.queue.length === 0) return;

    const outcome = stepOpening(gameRef.current, session, {});
    commit(outcome.state);
    pushFx(outcome.events);

    let impact = currentOpening.impact;
    let fusionNotice = currentOpening.fusionNotice;
    const audio = getAudio();
    let lastRevealOrder = 0;

    for (const event of outcome.events) {
      if (event.t === "reveal") {
        const rarity = RARITIES[event.rarity];
        lastRevealOrder = rarity.order;
        impact = {
          index: event.index,
          rarity: event.rarity,
          foil: event.foil,
          serial: ++impactSerialRef.current,
        };
        audio.sound("reveal", rarity.order);
        getHaptics().pulse("reveal", rarity.order);
        if (rarity.order >= RARITIES.legendary.order) audio.sound("legendary", rarity.order);
        if (getOverflowFlags(currentOpening, outcome.session.cards).overflow) {
          const pull = outcome.session.cards[event.index];
          if (pull) {
            flightQueueRef.current.push({
              serial: ++flightSerialRef.current,
              cardId: pull.card.id,
              card: pull.card,
              rarity: pull.rarity,
              foil: Boolean(pull.foil),
            });
            const pending = { ...pendingLandRef.current };
            pending[pull.card.id] = (pending[pull.card.id] || 0) + 1;
            pendingLandRef.current = pending;
            setPendingLand(pending);
          }
        }
      } else if (event.t === "fusion") {
        fusionNotice = {
          index: event.index,
          cardId: event.cardId,
          serial: ++impactSerialRef.current,
        };
        audio.sound("fusion", 4);
        getHaptics().pulse("fuse");
      } else if (event.t === "salvage") {
        audio.sound("caseBreak");
        const echoSerial = ++fxSerialRef.current;
        setRevealEchoes((current) => ({
          ...current,
          [event.index]: { count: 1, serial: echoSerial, label: "SALVAGED" },
        }));
        openingTimersRef.current.push(window.setTimeout(() => {
          setRevealEchoes((current) => {
            if (current[event.index]?.serial !== echoSerial) return current;
            const next = { ...current };
            delete next[event.index];
            return next;
          });
        }, 1_100));
      } else if (event.t === "reroll") {
        audio.sound("switch");
      } else if (event.t === "encore") {
        audio.sound("fusion", 2);
      }
    }

    const settled = isOpeningSettled(outcome.session);
    const overflowFlags = getOverflowFlags(currentOpening, outcome.session.cards);
    const nextOpening = {
      ...currentOpening,
      session: outcome.session,
      phase: settled ? "complete" : "ready",
      ...overflowFlags,
      revealed: outcome.session.cards
        .map((entry, position) => (entry.revealed ? position : -1))
        .filter((position) => position >= 0),
      impact,
      fusionNotice,
    };
    commitOpening(nextOpening);

    if (fusionNotice && fusionNotice !== currentOpening.fusionNotice) {
      const serial = fusionNotice.serial;
      openingTimersRef.current.push(window.setTimeout(() => {
        commitOpening((current) => current?.id === currentOpening.id
          && current.fusionNotice?.serial === serial
          ? { ...current, fusionNotice: null }
          : current);
      }, 1_000));
    }

    if (settled) {
      scheduleCompletion(currentOpening.id, lastRevealOrder);
      return;
    }
    if (outcome.session.queue.length > 0) {
      if (pumpTimerRef.current === null) {
        pumpTimerRef.current = window.setTimeout(() => {
          pumpTimerRef.current = null;
          pumpQueue();
        }, delayForStep(outcome, overflowFlags.overflow));
      }
    }
  }, [commit, commitOpening, delayForStep, getAudio, getHaptics, pushFx, scheduleCompletion]);

  const kickPump = useCallback(() => {
    if (pumpTimerRef.current !== null) return;
    pumpTimerRef.current = window.setTimeout(() => {
      pumpTimerRef.current = null;
      pumpQueue();
    }, 0);
  }, [pumpQueue]);

  // Player input: add one reveal to the action stack.
  const revealCard = useCallback((index) => {
    const currentOpening = openingRef.current;
    if (!currentOpening || currentOpening.phase !== "ready") return;
    const session = currentOpening.session;
    const nextSession = enqueueReveal(session, index);
    if (nextSession === session) return;
    commitOpening({ ...currentOpening, session: nextSession });
    kickPump();
  }, [commitOpening, kickPump]);

  // Ending an opening early clears the action stack; face-down cards are
  // left behind, revealed cards keep everything they paid.
  const endOpening = useCallback(() => {
    const currentOpening = openingRef.current;
    if (!currentOpening || currentOpening.phase === "collecting") return;
    clearOpeningTimers();
    clearHoldRevealTimer();
    swipePointerRef.current = null;
    mobileAutoPointerRef.current = null;
    spaceHeldRef.current = false;
    setSwipeRevealing(false);
    setMobileAutoHeld(false);
    setSpaceHeld(false);

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
      session: clearOpeningQueue(currentOpening.session),
      phase: "collecting",
      impact: null,
      fusionNotice: null,
    });
    getAudio().sound("packComplete");
    getHaptics().pulse("open");
    openingTimersRef.current.push(window.setTimeout(() => {
      if (
        openingRef.current?.id !== currentOpening.id
        || openingRef.current.phase !== "collecting"
      ) return;
      swipePointerRef.current = null;
      setSwipeRevealing(false);
      commitOpening(null);
    }, COLLECTION_ANIMATION_MS));
  }, [
    clearHoldRevealTimer,
    clearOpeningTimers,
    commitOpening,
    getAudio,
    getHaptics,
  ]);

  const beginManualOpen = useCallback(() => {
    if (!ready || drawer || selectedCard) return;
    const currentOpening = openingRef.current;
    if (currentOpening && currentOpening.phase !== "collecting") return;
    let current = gameRef.current;
    if (current.packs <= 0) {
      current = buyPack(current);
      if (current.packs <= 0) {
        const now = Date.now();
        if (now - purchaseDenyAtRef.current > 3_500) {
          purchaseDenyAtRef.current = now;
          getAudio().sound("deny");
        }
        return;
      }
    }
    setRevealEchoes({});
    const rolled = openPack(current, {});
    if (!rolled.session) {
      getAudio().sound("deny");
      return;
    }

    clearOpeningTimers();
    clearFlights();
    swipePointerRef.current = null;
    setSwipeRevealing(false);
    commitOpening(null);
    commit(rolled.state);
    const audio = getAudio();
    audio.ensure();
    audio.sound("pack");
    const haptics = getHaptics();
    haptics.ensure();
    haptics.pulse("open");

    pushFx(rolled.events);

    const id = rolled.session.id;
    const activeSet = getSet("core");
    const freshOpening = {
      id,
      session: rolled.session,
      set: activeSet,
      packType,
      phase: "sealed",
      revealed: [],
      impact: null,
      fusionNotice: null,
      overflow: false,
    };
    commitOpening({ ...freshOpening, ...getOverflowFlags(freshOpening, rolled.session.cards) });
    const tearDelay = 440;
    const dealDelay = 1250;
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
    packType,
    pushFx,
    ready,
    selectedCard,
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
      || currentOpening.session.cards[index]?.revealed
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

  // Hold-to-auto: while held, feed the queue one reveal at a time. The pump
  // still owns pacing — this only tops the queue up when it runs dry.
  useEffect(() => {
    clearHoldRevealTimer();
    const autoOpeningHeld = spaceHeld || mobileAutoHeld;
    if (!autoOpeningHeld || drawer || selectedCard) return undefined;

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

    if (opening.phase === "ready" && opening.session.queue.length === 0) {
      const nextIndex = findNextRevealIndex(opening.session.cards);
      if (nextIndex >= 0) {
        holdRevealTimerRef.current = window.setTimeout(() => {
          holdRevealTimerRef.current = null;
          revealCard(nextIndex);
        }, mobileAutoHeld ? 340 : 200);
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
    const nextIndex = findNextRevealIndex(currentOpening.session.cards);
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

  // FLIP: when the pile row rewraps (size steps, fusions), existing piles
  // glide to their new spots instead of teleporting. Positions come from
  // offsetLeft/offsetTop, which ignore transforms — so in-flight entrance,
  // pulse, or earlier FLIP animations can never poison the measurements,
  // even when passes overlap at high reveal speed.
  useLayoutEffect(() => {
    if (!overflowActive) {
      prevPileRectsRef.current = new Map();
      return;
    }
    const nextSpots = new Map();
    for (const [id, el] of pileRefs.current) {
      if (el?.isConnected) nextSpots.set(id, { left: el.offsetLeft, top: el.offsetTop });
    }
    const previous = prevPileRectsRef.current;
    const moved = [];
    for (const [id, spot] of nextSpots) {
      const before = previous.get(id);
      if (!before) continue;
      const dx = before.left - spot.left;
      const dy = before.top - spot.top;
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
    prevPileRectsRef.current = nextSpots;
  }, [overflowActive, overflowPiles]);

  // Stack feedback: swell when bonus cards join the face-down pile, squash
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
    const next = displayCard(gameRef.current, cardId);
    if (next === gameRef.current) {
      getAudio().sound("deny");
      return;
    }
    commit(next);
    getAudio().sound("switch");
  }, [commit, getAudio]);

  const handleUndisplay = useCallback((cardId) => {
    const next = undisplayCard(gameRef.current, cardId);
    if (next === gameRef.current) return;
    commit(next);
    getAudio().sound("switch");
  }, [commit, getAudio]);

  const handleReorderDisplay = useCallback((fromIndex, toIndex) => {
    const next = reorderDisplayed(gameRef.current, fromIndex, toIndex);
    if (next === gameRef.current) return;
    commit(next);
    getAudio().sound("switch");
    getHaptics().pulse("open");
  }, [commit, getAudio, getHaptics]);

  const handleReset = useCallback(() => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    window.localStorage.removeItem(adminActiveRef.current ? ADMIN_SAVE_KEY : SAVE_KEY);
    const fresh = adminActiveRef.current ? createAdminState(Date.now()) : createInitialState(Date.now());
    commit(fresh);
    setDrawer(null);
    setResetArmed(false);
    closeOpening();
  }, [closeOpening, commit, resetArmed]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === "Space" && !drawer && !selectedCard) {
        event.preventDefault();
        if (event.repeat || spaceHeldRef.current) return;
        spaceHeldRef.current = true;
        setSpaceHeld(true);
        if (!opening || opening.phase === "collecting") beginManualOpen();
      } else if (event.key === "Escape") {
        if (selectedCard) setSelectedCard(null);
        else if (drawer) setDrawer(null);
        else if (opening && opening.phase !== "collecting") endOpening();
        else if (opening?.phase === "collecting") closeOpening();
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
    endOpening,
    opening,
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

  const derived = useMemo(() => getDerived(game), [game]);
  const activeSet = getSet("core");
  const nextPackPrice = getPackPrice();
  const packAffordable = game.packs > 0 || game.cash >= nextPackPrice;
  const openingPendingCount = opening ? getPendingCardCount(opening.session.cards) : 0;
  const mobileAutoTitle = mobileAutoHeld
    ? "AUTO-OPENING"
    : "HOLD TO AUTO-OPEN";
  const mobileAutoDetail = mobileAutoHeld
    ? packAffordable ? "RELEASE TO STOP" : `WAITING FOR ${money(nextPackPrice)} CASH`
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
          <strong>{money(game.cash)}</strong>
          <span>
            CASH / {money(game.scrap)} SCRAP
            {game.packs > 0 ? ` / ${money(game.packs)} ${game.packs === 1 ? "PACK" : "PACKS"}` : ""}
          </span>
        </div>
      </header>

      <section className="clean-stage">
        <div className="clean-stage-light" />
        <div className="clean-floor"><i /><i /><i /><i /><i /></div>
        <div className={`stage-case-dock${opening ? " is-opening" : ""}`}>
          <div className="case-dock-row">
            {opening && !["complete", "collecting"].includes(opening.phase) && (
              <button
                type="button"
                className="opening-back-button"
                onClick={endOpening}
                aria-label={openingPendingCount > 0
                  ? `End the opening — ${openingPendingCount} face-down ${openingPendingCount === 1 ? "card is" : "cards are"} left behind`
                  : "End the opening"}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15.5 4.5 8 12l7.5 7.5" />
                </svg>
              </button>
            )}
            <CaseStrip derived={derived} fx={fx} onOpenCase={() => setDrawer("case")} />
          </div>
        </div>

        <div
          className={`clean-pack-station ${packAffordable ? "" : "is-unaffordable"}`}
          data-pack-type={packType.id}
        >
          <div className="pack-rotunda">
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
              aria-disabled={packAffordable ? undefined : true}
              aria-label={game.packs > 0
                ? `Open a pack: ${packType.name}. ${game.packs} ready.`
                : `Buy and open a pack: ${packType.name} for ${exactMoney(nextPackPrice)} cash.${
                  packAffordable ? "" : ` Not enough cash — you have ${exactMoney(game.cash)}.`
                }`}
            >
              <span className="clean-pack-shadow" />
              <span className="clean-pack-stack rotates-right" key={packType.id}>
                <i /><i />
                <PackFace set={activeSet} packType={packType} />
              </span>
            </button>
          </div>
          <div className="pack-type-copy" aria-live="polite">
            <strong>{game.packs > 0 ? `${money(game.packs)} SEALED` : `${exactMoney(nextPackPrice)} CASH`}</strong>
            <small>{packAffordable ? packType.description : "NOT ENOUGH CASH"}</small>
          </div>
        </div>

        <SetTray
          game={game}
          set={activeSet}
          onOpenBinder={() => setDrawer("binder")}
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
          onClose={() => setDrawer(null)}
          onUndisplay={handleUndisplay}
          onPickCard={setSelectedCard}
          onOpenBinder={() => setDrawer("binder")}
          onReorder={handleReorderDisplay}
        />
      )}
      {drawer === "binder" && (
        <BinderDrawer
          game={game}
          set={activeSet}
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
            "--set-a": opening.set.colors[0],
            "--set-b": opening.set.colors[1],
            "--set-c": opening.set.colors[2],
          }}
        >
          <div className="opening-haze" />
          <div className="foil-pack-wrap">
            <div className="foil-half foil-top"><PackFace set={opening.set} packType={opening.packType} /></div>
            <div className="foil-half foil-bottom"><PackFace set={opening.set} packType={opening.packType} /></div>
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
                const pull = opening.session.cards[index];
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
                    <CrestBack label={opening.set.short} />
                    <CrestBack label={opening.set.short} />
                    <CrestBack label={opening.set.short} />
                  </span>
                  <span className="overflow-stack-meta">
                    <b className="overflow-stack-count" key={overflowUnrevealed.count}>
                      {overflowUnrevealed.count}
                    </b>
                    <small className="overflow-stack-label">
                      {overflowUnrevealed.count ? "UNREVEALED" : "ALL REVEALED"}
                    </small>
                    {overflowUnrevealed.bonus > 0 && (
                      <i className="overflow-stack-chip is-mystery">{overflowUnrevealed.bonus} BONUS</i>
                    )}
                  </span>
                </span>
              </button>
              <div
                className={`overflow-piles ${overflowLayout.scrollable ? "is-scrollable" : ""}`.trim()}
                aria-label={`${overflowPiles.length} distinct cards revealed`}
              >
                {overflowPiles.map((pile) => {
                  const shown = Math.max(0, pile.count - (pendingLand[pile.card.id] || 0));
                  // Only the initial collapse wave staggers in; later arrivals
                  // pop immediately at the end of the list.
                  const inWave = pile.seq < pileSeqRef.current.waveSize;
                  return (
                    <OverflowPile
                      key={pile.card.id}
                      card={pile.card}
                      count={shown}
                      foil={pile.foil}
                      incoming={pile.count > 0 && shown === 0}
                      depleted={pile.count === 0}
                      pulse={landPulse?.cardId === pile.card.id ? landPulse : null}
                      enterDelay={inWave ? Math.min(pile.seq * 14, 420) : 0}
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
              <span>FUSED</span>
              <strong>{getCard(opening.fusionNotice.cardId)?.name || "UPGRADED CARD"}</strong>
              <small>JOINS THE PACK</small>
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
