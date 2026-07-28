"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_CARDS, RARITIES, SETS, getCardArtId, getSet } from "../lib/gameData";
import { cardMatchesAudit, getCardAudit } from "../lib/cardAudit";
import { getCardRules } from "../lib/engineCards";
import { PackFace, PrintedCard } from "./PackworksGameClean";
import MechanicsSimulator from "./MechanicsSimulator";

const ASSET_BASE = process.env.NEXT_PUBLIC_PACKWORKS_BASE || "";
const RARITY_OPTIONS = Object.values(RARITIES);
const BASE_SET_PICKS_KEY = "packworks-card-lab-base-set-v1";
const CARD_BACK_OPTIONS = [
  { id: "crest", label: "FACTORY CREST", note: "Diamond press insignia" },
  { id: "orbit", label: "ORBIT MARK", note: "Restored radial factory identity" },
  { id: "seal", label: "COLLECTOR SEAL", note: "Round tournament-style stamp" },
];

function CardBack({ set, style = "crest" }) {
  return (
    <span className={`card-back back-style-${style}`}>
      <span className="back-set">{set.short}</span>
      <span className="back-orbit"><i /><i /><i /></span>
      <span className="back-mark"><span><b>PW</b><small>PACKWORKS</small></span></span>
      <span className="back-rule" />
    </span>
  );
}

function applyTilt(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
  const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  event.currentTarget.style.setProperty("--review-tilt-x", `${(-y * 4.5).toFixed(2)}deg`);
  event.currentTarget.style.setProperty("--review-tilt-y", `${(x * 6).toFixed(2)}deg`);
  event.currentTarget.style.setProperty("--review-shine-x", `${((x + 1) * 50).toFixed(1)}%`);
  event.currentTarget.style.setProperty("--review-shine-y", `${((y + 1) * 50).toFixed(1)}%`);
}

function clearTilt(event) {
  event.currentTarget.style.removeProperty("--review-tilt-x");
  event.currentTarget.style.removeProperty("--review-tilt-y");
  event.currentTarget.style.removeProperty("--review-shine-x");
  event.currentTarget.style.removeProperty("--review-shine-y");
}

export default function CardReviewGallery() {
  const [mode, setMode] = useState("holo");
  const [playing, setPlaying] = useState(true);
  const [setId, setSetId] = useState("all");
  const [rarityId, setRarityId] = useState("all");
  const [artStatus, setArtStatus] = useState("all");
  const [auditFilter, setAuditFilter] = useState("all");
  const [pickFilter, setPickFilter] = useState("all");
  const [pickedIds, setPickedIds] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState(null);
  const [flipCard, setFlipCard] = useState(false);
  const [backStyle, setBackStyle] = useState("crest");
  const [manifest, setManifest] = useState(null);

  const loadManifest = useCallback(() => {
    fetch(`${ASSET_BASE}/card-art-pixel/manifest.json?at=${Date.now()}`)
      .then((response) => response.ok ? response.json() : null)
      .then(setManifest)
      .catch(() => setManifest(null));
  }, []);

  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

  useEffect(() => {
    document.documentElement.classList.add("card-review-document");
    document.body.classList.add("card-review-document");
    return () => {
      document.documentElement.classList.remove("card-review-document");
      document.body.classList.remove("card-review-document");
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("mode");
    const requestedArt = params.get("art");
    const requestedAudit = params.get("audit");
    const requestedPicks = params.get("picks");
    if (["standard", "holo"].includes(requestedMode)) setMode(requestedMode);
    if (["ready", "fallback"].includes(requestedArt)) setArtStatus(requestedArt);
    if (["audit", "impact", "interesting"].includes(requestedAudit)) setAuditFilter(requestedAudit);
    if (requestedPicks === "selected") setPickFilter("selected");
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(BASE_SET_PICKS_KEY) || "[]");
      if (Array.isArray(saved)) setPickedIds(new Set(saved.filter((id) => typeof id === "string")));
    } catch {
      setPickedIds(new Set());
    }
  }, []);

  const togglePicked = useCallback((cardId) => {
    setPickedIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      try {
        window.localStorage.setItem(BASE_SET_PICKS_KEY, JSON.stringify([...next]));
      } catch {
        // The review tool still works for the session when storage is blocked.
      }
      return next;
    });
  }, []);

  const generatedIds = useMemo(() => new Set(
    (manifest?.cards || [])
      .filter((card) => card.generated)
      .flatMap((card) => [card.id, card.legacyId].filter(Boolean)),
  ), [manifest]);
  const generatedCardCount = useMemo(
    () => ALL_CARDS.filter((card) => generatedIds.has(card.id) || generatedIds.has(getCardArtId(card))).length,
    [generatedIds],
  );
  const auditCounts = useMemo(() => ({
    audit: ALL_CARDS.filter((card) => cardMatchesAudit(card, "audit")).length,
    impact: ALL_CARDS.filter((card) => cardMatchesAudit(card, "impact")).length,
    interesting: ALL_CARDS.filter((card) => cardMatchesAudit(card, "interesting")).length,
  }), []);
  const filteredCards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ALL_CARDS.filter((card) => {
      const hasPixelLabArt = generatedIds.has(card.id) || generatedIds.has(getCardArtId(card));
      if (artStatus === "ready" && !hasPixelLabArt) return false;
      if (artStatus === "fallback" && hasPixelLabArt) return false;
      if (!cardMatchesAudit(card, auditFilter)) return false;
      if (pickFilter === "selected" && !pickedIds.has(card.id)) return false;
      if (pickFilter === "unselected" && pickedIds.has(card.id)) return false;
      if (setId !== "all" && card.setId !== setId) return false;
      if (rarityId !== "all" && card.rarity !== rarityId) return false;
      if (!normalized) return true;
      const rules = getCardRules(card.id);
      return [
        card.id,
        card.name,
        card.flavor,
        getSet(card.setId).name,
        rules?.title,
        rules?.text,
        ...(rules?.keywords || []),
      ].join(" ").toLowerCase().includes(normalized);
    });
  }, [artStatus, auditFilter, generatedIds, pickFilter, pickedIds, query, rarityId, setId]);
  const selected = selectedCard ? ALL_CARDS.find((card) => card.id === selectedCard) : null;
  const pilot = filteredCards[0] || ALL_CARDS[0];
  const isHolo = mode === "holo";

  return (
    <main className={`card-review pw-clean theme-league fx-holo ${playing ? "is-playing" : "is-paused"}`}>
      <header className="review-masthead">
        <a href={`${ASSET_BASE}/`} className="review-logo" aria-label="Back to PACKWORKS">
          <span className="clean-brand-mark"><i /><i /><i /></span>
          <strong>PACKWORKS</strong>
        </a>
        <div>
          <span>PIXELLAB ART QA</span>
          <h1>Card Lab</h1>
        </div>
        <div className="review-coverage">
          <strong>{generatedCardCount} / {ALL_CARDS.length}</strong>
          <span>PIXELLAB CARDS READY</span>
          <a className="review-mini-sets-link" href={`${ASSET_BASE}/mini-sets/`}>MECHANIC MINI-SETS</a>
          <button type="button" onClick={loadManifest}>REFRESH STATUS</button>
        </div>
      </header>

      <section className="review-controls" aria-label="Card lab controls">
        <div className="review-segmented" aria-label="Card treatment">
          <button className={mode === "standard" ? "active" : ""} onClick={() => setMode("standard")}>STANDARD</button>
          <button className={mode === "holo" ? "active" : ""} onClick={() => setMode("holo")}>HOLO</button>
        </div>
        <button className={`review-play ${playing ? "active" : ""}`} onClick={() => setPlaying((current) => !current)}>
          {playing ? "PAUSE ALL LOOPS" : "PLAY ALL LOOPS"}
        </button>
        <label>
          <span>SET</span>
          <select value={setId} onChange={(event) => setSetId(event.target.value)}>
            <option value="all">All cards</option>
            {SETS.map((set) => <option value={set.id} key={set.id}>{set.short} / {set.name}</option>)}
          </select>
        </label>
        <label>
          <span>RARITY</span>
          <select value={rarityId} onChange={(event) => setRarityId(event.target.value)}>
            <option value="all">All rarities</option>
            {RARITY_OPTIONS.map((rarity) => <option value={rarity.id} key={rarity.id}>{rarity.label}</option>)}
          </select>
        </label>
        <label>
          <span>ART STATUS</span>
          <select
            value={artStatus}
            onChange={(event) => setArtStatus(event.target.value)}
            disabled={!manifest}
          >
            <option value="all">All cards</option>
            <option value="ready">PixelLab ready ({generatedCardCount})</option>
            <option value="fallback">Needs PixelLab ({ALL_CARDS.length - generatedCardCount})</option>
          </select>
        </label>
        <label>
          <span>SET AUDIT</span>
          <select value={auditFilter} onChange={(event) => setAuditFilter(event.target.value)}>
            <option value="all">All cards</option>
            <option value="audit">Audit shortlist ({auditCounts.audit})</option>
            <option value="impact">Most impactful ({auditCounts.impact})</option>
            <option value="interesting">Most interesting ({auditCounts.interesting})</option>
          </select>
        </label>
        <label>
          <span>BASE SET / {pickedIds.size} PICKED</span>
          <select value={pickFilter} onChange={(event) => setPickFilter(event.target.value)}>
            <option value="all">All cards</option>
            <option value="selected">My selected cards ({pickedIds.size})</option>
            <option value="unselected">Not selected</option>
          </select>
        </label>
        <label className="review-search">
          <span>NAME / EFFECT / KEYWORD</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try Echo, Salvage, Mark…"
          />
        </label>
      </section>

      <section className="review-motion-lab">
        <div className="review-motion-copy">
          <span>2D PRINT BAY</span>
          <h2>Printed card + sealed pack</h2>
          <p>
            Inspect the exact lightweight prints used in the game. Click the card to turn it over.
            Holo portrait animation and foil remain confined to the card front.
          </p>
          <button type="button" onClick={() => setFlipCard((current) => !current)}>
            {flipCard ? "TURN FACE DOWN" : "REVEAL CARD"}
          </button>
          <div className="review-back-options" aria-label="Card back options">
            <b>CARD BACK TREATMENT</b>
            {CARD_BACK_OPTIONS.map((option) => (
              <button
                type="button"
                className={backStyle === option.id ? "active" : ""}
                onClick={() => {
                  setBackStyle(option.id);
                  setFlipCard(false);
                }}
                key={option.id}
              >
                <span>{option.label}</span>
                <small>{option.note}</small>
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className={`review-flip-card ${flipCard ? "is-revealed" : ""}`}
          onClick={() => setFlipCard((current) => !current)}
          onPointerMove={applyTilt}
          onPointerLeave={clearTilt}
          aria-label={`${flipCard ? "Turn" : "Reveal"} ${pilot.name}`}
        >
          <span className="review-flip-inner">
            <CardBack set={getSet(pilot.setId)} style={backStyle} />
            <PrintedCard
              card={pilot}
              foil={isHolo}
              copyLabel={isHolo ? "HOLO TEST" : "STANDARD TEST"}
            />
          </span>
        </button>
        <div className="review-pack-preview">
          <PackFace set={getSet(pilot.setId)} />
          <span>Same creature scene and print line used in the shop and opener.</span>
        </div>
        <div className="review-motion-spec">
          <b>ART CONTRACT</b>
          <span>128 × 128 source</span>
          <span>4-frame seamless loop</span>
          <span>Frame 1 is standard art</span>
          <span>Transparent PNG</span>
          <span>PixelLab v2 generation</span>
          <span>Front-only holo surface</span>
          <span>Rounded 2D card print</span>
          <span>Lightweight CSS motion</span>
        </div>
      </section>

      <MechanicsSimulator paused={!playing} />

      <section className="review-results-head">
        <div>
          <span>FULL CONTACT SHEET</span>
          <h2>{filteredCards.length} cards</h2>
        </div>
        <p>{isHolo ? "Holo animation and foil lighting enabled." : "Standard frame-one art only."}</p>
      </section>

      <section className="review-grid" aria-label={`${filteredCards.length} cards`}>
        {filteredCards.map((card) => {
          const rules = getCardRules(card.id);
          const ready = generatedIds.has(card.id) || generatedIds.has(getCardArtId(card));
          const audit = getCardAudit(card);
          const picked = pickedIds.has(card.id);
          return (
            <article className={`review-grid-item ${picked ? "is-picked" : ""}`} key={card.id}>
              <button
                type="button"
                className="review-pick-toggle"
                aria-pressed={picked}
                aria-label={`${picked ? "Remove" : "Add"} ${card.name} ${picked ? "from" : "to"} my base set`}
                onClick={() => togglePicked(card.id)}
              >
                <i aria-hidden="true">{picked ? "✓" : "+"}</i>
                <span>{picked ? "IN BASE SET" : "ADD TO SET"}</span>
              </button>
              <button
                type="button"
                className="review-card-button"
                onClick={() => setSelectedCard(card.id)}
                onPointerMove={applyTilt}
                onPointerLeave={clearTilt}
                aria-label={`Zoom ${card.name}`}
              >
                <PrintedCard
                  card={card}
                  foil={isHolo}
                  compact
                  copyLabel={isHolo ? "HOLO QA" : "STANDARD QA"}
                />
                <i className="review-card-shine" />
              </button>
              <footer>
                <span className={ready ? "is-ready" : "is-pending"}>{ready ? "PIXELLAB READY" : "LEGACY FALLBACK"}</span>
                {audit && (
                  <span className="review-audit-tags" title={audit.reason}>
                    {audit.impact && <i>IMPACT</i>}
                    {audit.interesting && <i>WILDCARD</i>}
                  </span>
                )}
                <b>{rules?.title}</b>
                {audit && <em>{audit.reason}</em>}
                <small>{card.id}</small>
              </footer>
            </article>
          );
        })}
      </section>

      {selected && (
        <div className="review-zoom" onMouseDown={() => setSelectedCard(null)}>
          <button className="review-zoom-close" type="button" onClick={() => setSelectedCard(null)}>CLOSE</button>
          <div
            className="review-zoom-card"
            onMouseDown={(event) => event.stopPropagation()}
            onPointerMove={applyTilt}
            onPointerLeave={clearTilt}
          >
            <PrintedCard
              card={selected}
              foil={isHolo}
              copyLabel={isHolo ? "HOLO QA" : "STANDARD QA"}
            />
          </div>
        </div>
      )}
    </main>
  );
}
