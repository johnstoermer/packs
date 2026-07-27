"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_CARDS, RARITIES, SETS, getSet } from "../lib/gameData";
import { getCardRules } from "../lib/engineCards";
import { PrintedCard } from "./PackworksGameClean";

const BASE_SET_PICKS_KEY = "packworks-card-lab-base-set-v1";
const SNAPSHOT_CARDS = [...ALL_CARDS];
const ASSET_BASE = process.env.NEXT_PUBLIC_PACKWORKS_BASE || "";

export default function BaseSetSelector() {
  const [pickedIds, setPickedIds] = useState(() => new Set());
  const [pickFilter, setPickFilter] = useState("all");
  const [setId, setSetId] = useState("all");
  const [rarityId, setRarityId] = useState("all");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState(null);

  useEffect(() => {
    document.documentElement.classList.add("subset-selector-document");
    document.body.classList.add("subset-selector-document");
    try {
      const saved = JSON.parse(window.localStorage.getItem(BASE_SET_PICKS_KEY) || "[]");
      if (Array.isArray(saved)) setPickedIds(new Set(saved.filter((id) => typeof id === "string")));
    } catch {
      setPickedIds(new Set());
    }
    return () => {
      document.documentElement.classList.remove("subset-selector-document");
      document.body.classList.remove("subset-selector-document");
    };
  }, []);

  const togglePicked = useCallback((cardId) => {
    setPickedIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      try {
        window.localStorage.setItem(BASE_SET_PICKS_KEY, JSON.stringify([...next]));
      } catch {
        // Keep the selector usable for the current session when storage is blocked.
      }
      return next;
    });
  }, []);

  const filteredCards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return SNAPSHOT_CARDS.filter((card) => {
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
  }, [pickFilter, pickedIds, query, rarityId, setId]);
  const selectedCard = selectedCardId
    ? SNAPSHOT_CARDS.find((card) => card.id === selectedCardId)
    : null;

  const copySelection = async () => {
    const selected = SNAPSHOT_CARDS
      .filter((card) => pickedIds.has(card.id))
      .map((card) => `${card.id}\t${card.name}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(selected);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="subset-selector pw-clean theme-league">
      <header className="subset-masthead">
        <a href={`${ASSET_BASE}/`} className="subset-brand" aria-label="Back to PACKWORKS">
          <span className="clean-brand-mark"><i /><i /><i /></span>
          <strong>PACKWORKS</strong>
        </a>
        <div className="subset-title">
          <span>STABLE 2D WORKSPACE</span>
          <h1>Base Set Builder</h1>
          <p>This page is isolated from the live 3D and effects review work.</p>
        </div>
        <div className="subset-count">
          <strong>{pickedIds.size}</strong>
          <span>CARDS PICKED</span>
          <button type="button" disabled={!pickedIds.size} onClick={copySelection}>
            {copied ? "COPIED" : "COPY LIST"}
          </button>
        </div>
      </header>

      <section className="subset-controls" aria-label="Base set filters">
        <label>
          <span>SELECTION</span>
          <select value={pickFilter} onChange={(event) => setPickFilter(event.target.value)}>
            <option value="all">All cards ({SNAPSHOT_CARDS.length})</option>
            <option value="selected">My base set ({pickedIds.size})</option>
            <option value="unselected">Not selected</option>
          </select>
        </label>
        <label>
          <span>PRINT LINE</span>
          <select value={setId} onChange={(event) => setSetId(event.target.value)}>
            <option value="all">All cards</option>
            {SETS.map((set) => <option value={set.id} key={set.id}>{set.short} / {set.name}</option>)}
          </select>
        </label>
        <label>
          <span>RARITY</span>
          <select value={rarityId} onChange={(event) => setRarityId(event.target.value)}>
            <option value="all">All rarities</option>
            {Object.values(RARITIES).map((rarity) => (
              <option value={rarity.id} key={rarity.id}>{rarity.label}</option>
            ))}
          </select>
        </label>
        <label className="subset-search">
          <span>NAME / EFFECT / KEYWORD</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the current card snapshot…"
          />
        </label>
      </section>

      <section className="subset-results-heading">
        <div>
          <span>CURRENT CARD SNAPSHOT</span>
          <h2>{filteredCards.length} cards shown</h2>
        </div>
        <a href={`${ASSET_BASE}/review/`}>OPEN LIVE EFFECTS LAB</a>
      </section>

      <section className="subset-grid" aria-label={`${filteredCards.length} cards`}>
        {filteredCards.map((card) => {
          const picked = pickedIds.has(card.id);
          const rules = getCardRules(card.id);
          return (
            <article className={`subset-card ${picked ? "is-picked" : ""}`} key={card.id}>
              <button
                type="button"
                className="subset-pick"
                aria-pressed={picked}
                aria-label={`${picked ? "Remove" : "Add"} ${card.name} ${picked ? "from" : "to"} my base set`}
                onClick={() => togglePicked(card.id)}
              >
                <i aria-hidden="true">{picked ? "✓" : "+"}</i>
                <span>{picked ? "IN BASE SET" : "ADD TO SET"}</span>
              </button>
              <button
                type="button"
                className="subset-card-view"
                onClick={() => setSelectedCardId(card.id)}
                aria-label={`Inspect the full ${card.name} card`}
              >
                <PrintedCard card={card} foil={false} compact copyLabel="BASE SET DRAFT" />
              </button>
              <footer>
                <b>{rules?.title}</b>
                <p>{rules?.text}</p>
                <small>{card.id}</small>
              </footer>
            </article>
          );
        })}
      </section>

      {selectedCard && (
        <div className="subset-zoom" onMouseDown={() => setSelectedCardId(null)}>
          <button
            className="subset-zoom-close"
            type="button"
            onClick={() => setSelectedCardId(null)}
          >
            CLOSE
          </button>
          <div className="subset-zoom-content" onMouseDown={(event) => event.stopPropagation()}>
            <div className="subset-zoom-card">
              <PrintedCard card={selectedCard} foil={false} copyLabel="BASE SET DRAFT" />
            </div>
            <aside>
              <span>FULL CARD EFFECT</span>
              <h2>{selectedCard.name}</h2>
              <b>{getCardRules(selectedCard.id)?.title}</b>
              <p>{getCardRules(selectedCard.id)?.text}</p>
              <small>Keywords remain highlighted directly on the original 2D card.</small>
              <button
                type="button"
                aria-pressed={pickedIds.has(selectedCard.id)}
                onClick={() => togglePicked(selectedCard.id)}
              >
                {pickedIds.has(selectedCard.id) ? "✓ IN BASE SET" : "+ ADD TO BASE SET"}
              </button>
            </aside>
          </div>
        </div>
      )}
    </main>
  );
}
