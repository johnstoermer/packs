"use client";

import { useEffect, useMemo, useState } from "react";
import { getCard } from "../lib/gameData";
import { MECHANIC_MINI_SETS, getMechanicMiniSet } from "../lib/mechanicMiniSets";
import { PrintedCard } from "./PackworksGameClean";

const ASSET_BASE = process.env.NEXT_PUBLIC_PACKWORKS_BASE || "";
const REVIEW_KEY = "packworks-mechanic-mini-set-reviews-v1";
const STATUS_OPTIONS = [
  { id: "unreviewed", label: "UNREVIEWED" },
  { id: "approved", label: "APPROVE" },
  { id: "rework", label: "REWORK" },
  { id: "watch", label: "WATCH" },
];
const ACCENTS = [
  "#ffd84d",
  "#6ed9ff",
  "#ff8e59",
  "#68dc9b",
  "#c991ff",
  "#ffd15c",
  "#7cb8ff",
  "#ff6f61",
  "#71e4b0",
  "#89d5ff",
  "#ffd261",
  "#69dfbc",
  "#89b6ff",
  "#e4a1ff",
];

function readStoredReviews() {
  try {
    const value = JSON.parse(window.localStorage.getItem(REVIEW_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function cardName(miniSet, id) {
  return miniSet.cards.find((entry) => entry.id === id)?.preview?.name || getCard(id)?.name || id;
}

function ScrapSalvageDemo({ foil, rules }) {
  const [runId, setRunId] = useState(1);
  const victim = getCard("marquee-03");
  const fragments = [
    ["-62px", "-62px", "-18deg"],
    ["-30px", "-86px", "24deg"],
    ["12px", "-74px", "48deg"],
    ["54px", "-52px", "-32deg"],
    ["-74px", "-18px", "35deg"],
    ["-38px", "17px", "-45deg"],
    ["8px", "24px", "62deg"],
    ["61px", "12px", "18deg"],
    ["-54px", "58px", "52deg"],
    ["-8px", "72px", "-26deg"],
    ["38px", "64px", "38deg"],
    ["76px", "44px", "-58deg"],
  ];
  const sacrificePreview = {
    name: "Duplop",
    kind: "Selected duplicate",
    text: "This owned copy is being Salvaged. It will be permanently deleted.",
    flavor: "One last look before it becomes parts.",
  };

  return (
    <section className="mini-scrap-pitch" aria-labelledby="scrap-animation-title">
      <div className="mini-scrap-contract">
        <span>ALTERNATE RULES CONTRACT</span>
        <h3 id="scrap-animation-title">The card is really gone</h3>
        <p>
          Salvage is a destructive choice, not another way to open a pack. The animation must sell
          the loss first, then make the new resource feel physical and satisfying.
        </p>
        <ol>
          {rules.map((rule) => (
            <li key={rule.label}><b>{rule.label}</b><span>{rule.text}</span></li>
          ))}
        </ol>
        <button type="button" onClick={() => setRunId((current) => current + 1)}>REPLAY SALVAGE</button>
      </div>

      <div className="scrap-animation-display">
        <div className="scrap-animation-head">
          <span>ANIMATION PITCH / LIVE CSS MOCKUP</span>
          <b>SELECT → SPLIT → SHRED → VACUUM</b>
        </div>
        <div className="scrap-demo-stage" key={runId}>
          <span className="scrap-source-tag">DUPLICATE SELECTED</span>
          <div className="scrap-card-half is-left">
            <PrintedCard card={victim} compact foil={foil} preview={sacrificePreview} copyLabel="SALVAGE TARGET" />
          </div>
          <div className="scrap-card-half is-right">
            <PrintedCard card={victim} compact foil={foil} preview={sacrificePreview} copyLabel="SALVAGE TARGET" />
          </div>
          <span className="scrap-tear-flash" aria-hidden="true"><i /><i /><i /></span>
          <div className="scrap-fragments" aria-hidden="true">
            {fragments.map(([x, y, rotation], index) => (
              <i
                key={`${x}-${y}`}
                style={{
                  "--fragment-index": index,
                  "--scatter-x": x,
                  "--scatter-y": y,
                  "--fragment-rotation": rotation,
                }}
              />
            ))}
          </div>
          <span className="scrap-vacuum-line" aria-hidden="true"><i /><i /></span>
          <div className="scrap-counter">
            <span className="scrap-bin" aria-hidden="true"><i /><i /><i /></span>
            <span><small>RESOURCE</small><strong>SCRAP</strong></span>
            <b><i>09</i><em>10</em></b>
          </div>
        </div>
        <ol className="scrap-animation-beats">
          <li><b>01</b><span>Card locks</span></li>
          <li><b>02</b><span>Print tears</span></li>
          <li><b>03</b><span>Pieces scatter</span></li>
          <li><b>04</b><span>Scrap banks</span></li>
        </ol>
      </div>
    </section>
  );
}

export default function MechanicMiniSetViewer() {
  const [mechanicId, setMechanicId] = useState(MECHANIC_MINI_SETS[0].id);
  const [reviews, setReviews] = useState({});
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [foil, setFoil] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("mini-sets-document");
    document.body.classList.add("mini-sets-document");
    const requested = new URLSearchParams(window.location.search).get("mechanic");
    if (MECHANIC_MINI_SETS.some((miniSet) => miniSet.id === requested)) setMechanicId(requested);
    setReviews(readStoredReviews());
    return () => {
      document.documentElement.classList.remove("mini-sets-document");
      document.body.classList.remove("mini-sets-document");
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (selectedCardId && event.key === "Escape") {
        setSelectedCardId(null);
        return;
      }
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      const index = MECHANIC_MINI_SETS.findIndex((miniSet) => miniSet.id === mechanicId);
      if (event.key === "ArrowLeft") {
        setMechanicId(MECHANIC_MINI_SETS[(index - 1 + MECHANIC_MINI_SETS.length) % MECHANIC_MINI_SETS.length].id);
      } else if (event.key === "ArrowRight") {
        setMechanicId(MECHANIC_MINI_SETS[(index + 1) % MECHANIC_MINI_SETS.length].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mechanicId, selectedCardId]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("mechanic", mechanicId);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    setSelectedCardId(null);
  }, [mechanicId]);

  const miniSet = getMechanicMiniSet(mechanicId);
  const selectedCard = selectedCardId ? getCard(selectedCardId) : null;
  const selectedEntry = selectedCardId
    ? miniSet.cards.find((entry) => entry.id === selectedCardId)
    : null;
  const review = reviews[mechanicId] || { status: "unreviewed", notes: "" };
  const reviewedCount = useMemo(
    () => MECHANIC_MINI_SETS.filter((entry) => {
      const saved = reviews[entry.id];
      return saved?.status && saved.status !== "unreviewed";
    }).length,
    [reviews],
  );
  const activeIndex = MECHANIC_MINI_SETS.findIndex((entry) => entry.id === mechanicId);
  const coreIds = new Set(miniSet.caseOrder);

  const updateReview = (patch) => {
    setReviews((current) => {
      const next = {
        ...current,
        [mechanicId]: {
          status: current[mechanicId]?.status || "unreviewed",
          notes: current[mechanicId]?.notes || "",
          ...patch,
        },
      };
      try {
        window.localStorage.setItem(REVIEW_KEY, JSON.stringify(next));
      } catch {
        // Keep the viewer usable for this session when local storage is blocked.
      }
      return next;
    });
  };

  return (
    <main
      className={`mini-set-viewer theme-league ${miniSet.proposal ? "is-proposal" : ""}`}
      style={{ "--mini-accent": miniSet.proposal ? "#c8874f" : ACCENTS[activeIndex % ACCENTS.length] }}
    >
      <header className="mini-set-masthead">
        <a className="mini-set-brand" href={`${ASSET_BASE}/`}>
          <span className="clean-brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><b>PACKWORKS</b><small>DESIGN REVIEW</small></span>
        </a>
        <div className="mini-set-title">
          <span>MECHANIC PACKAGE LAB</span>
          <h1>Mechanic Mini-Sets</h1>
          <p>Fifteen packages across fourteen mechanics. Eight cards each. Pick six for the display case.</p>
        </div>
        <div className="mini-set-progress">
          <strong>{reviewedCount} / {MECHANIC_MINI_SETS.length}</strong>
          <span>SETS REVIEWED</span>
          <a href={`${ASSET_BASE}/review/`}>OPEN CARD LAB</a>
        </div>
      </header>

      <div className="mini-set-workspace">
        <nav className="mini-set-index" aria-label="Mechanic mini-sets">
          <header>
            <span>REVIEW QUEUE</span>
            <b>{MECHANIC_MINI_SETS.length} PACKAGES / 14 MECHANICS</b>
          </header>
          {MECHANIC_MINI_SETS.map((entry) => {
            const status = reviews[entry.id]?.status || "unreviewed";
            return (
              <button
                type="button"
                key={entry.id}
                className={entry.id === mechanicId ? "is-active" : ""}
                onClick={() => setMechanicId(entry.id)}
                aria-pressed={entry.id === mechanicId}
              >
                <span>{entry.index}</span>
                <span><b>{entry.name}</b><small>{entry.title}</small></span>
                <i className={`status-${status}`} aria-label={status} />
              </button>
            );
          })}
        </nav>

        <section className="mini-set-sheet" aria-labelledby="mini-set-name">
          <header className="mini-set-hero">
            <div>
              <span>{miniSet.index} / {miniSet.kicker}</span>
              <h2 id="mini-set-name">{miniSet.name}: {miniSet.title}</h2>
              <p>{miniSet.thesis}</p>
              {miniSet.proposal && <b className="mini-proposal-badge">ALTERNATE RULESET / NOT LIVE</b>}
            </div>
            <div className="mini-set-stats">
              <span><b>8</b><small>CARDS</small></span>
              <span><b>6</b><small>CORE</small></span>
              <span><b>2</b><small>FLEX</small></span>
            </div>
          </header>

          {miniSet.flag && (
            <aside className="mini-set-flag">
              <b>{miniSet.flag}</b>
              <p>{miniSet.watchout}</p>
            </aside>
          )}

          {miniSet.resourceRules && (
            <ScrapSalvageDemo foil={foil} rules={miniSet.resourceRules} />
          )}

          <section className="mini-set-meta" aria-labelledby="mini-set-meta-title">
            <div className="mini-meta-plan">
              <span>META BUILD / {miniSet.archetype}</span>
              <h3 id="mini-set-meta-title">How the package works</h3>
              <ol>
                {miniSet.loop.map((step, index) => (
                  <li key={step}><b>{index + 1}</b><p>{step}</p></li>
                ))}
              </ol>
            </div>
            <div className="mini-case-order">
              <span>RECOMMENDED SIX-SLOT ORDER</span>
              <div>
                {miniSet.caseOrder.map((id, index) => (
                  <span key={id}>
                    <i>{index + 1}</i>
                    <b>{cardName(miniSet, id)}</b>
                  </span>
                ))}
              </div>
              <p><b>WHY IT WINS</b>{miniSet.strength}</p>
              {!miniSet.flag && <p><b>PRESSURE POINT</b>{miniSet.watchout}</p>}
            </div>
          </section>

          <div className="mini-set-grid-head">
            <div>
              <span>EIGHT-CARD PACKAGE</span>
              <h3>Card-by-card roles</h3>
            </div>
            <div className="mini-treatment-switch" aria-label="Card treatment">
              <button type="button" className={!foil ? "is-active" : ""} onClick={() => setFoil(false)}>STANDARD</button>
              <button type="button" className={foil ? "is-active" : ""} onClick={() => setFoil(true)}>HOLO</button>
            </div>
          </div>

          <div className="mini-set-card-grid" aria-label={`${miniSet.name} eight-card mini-set`}>
            {miniSet.cards.map((entry, index) => {
              const card = getCard(entry.id);
              const displayName = entry.preview?.name || card.name;
              return (
                <article className={`mini-set-card ${coreIds.has(entry.id) ? "is-core" : "is-flex"}`} key={entry.id}>
                  <div className="mini-set-card-label">
                    <span>{coreIds.has(entry.id) ? `CORE ${miniSet.caseOrder.indexOf(entry.id) + 1}` : `FLEX ${index - 5}`}</span>
                    <b>{entry.role}</b>
                  </div>
                  <button type="button" onClick={() => setSelectedCardId(entry.id)} aria-label={`Inspect ${displayName}`}>
                    <PrintedCard
                      card={card}
                      compact
                      foil={foil}
                      preview={entry.preview}
                      copyLabel={miniSet.proposal ? "SCRAP PROPOSAL" : entry.role}
                    />
                  </button>
                  <footer>
                    <strong>{displayName}</strong>
                    <p>{entry.note}</p>
                  </footer>
                </article>
              );
            })}
          </div>

          <section className="mini-set-review" aria-labelledby="mini-set-review-title">
            <div>
              <span>LOCAL REVIEW</span>
              <h3 id="mini-set-review-title">Your verdict on {miniSet.name}</h3>
              <p>Status and notes stay in this browser.</p>
            </div>
            <div className="mini-review-status" aria-label="Review status">
              {STATUS_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={review.status === option.id ? `is-active status-${option.id}` : ""}
                  onClick={() => updateReview({ status: option.id })}
                  aria-pressed={review.status === option.id}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label>
              <span>REVIEW NOTES</span>
              <textarea
                value={review.notes}
                onChange={(event) => updateReview({ notes: event.target.value })}
                placeholder="Balance concerns, card swaps, missing links, wording…"
              />
            </label>
          </section>

          <footer className="mini-set-pagination">
            <button
              type="button"
              onClick={() => setMechanicId(MECHANIC_MINI_SETS[(activeIndex - 1 + MECHANIC_MINI_SETS.length) % MECHANIC_MINI_SETS.length].id)}
            >
              ← {MECHANIC_MINI_SETS[(activeIndex - 1 + MECHANIC_MINI_SETS.length) % MECHANIC_MINI_SETS.length].name}
            </button>
            <span>Use ← → to move between sets</span>
            <button
              type="button"
              onClick={() => setMechanicId(MECHANIC_MINI_SETS[(activeIndex + 1) % MECHANIC_MINI_SETS.length].id)}
            >
              {MECHANIC_MINI_SETS[(activeIndex + 1) % MECHANIC_MINI_SETS.length].name} →
            </button>
          </footer>
        </section>
      </div>

      {selectedCard && (
        <div className="mini-set-zoom" onMouseDown={() => setSelectedCardId(null)}>
          <button type="button" onClick={() => setSelectedCardId(null)}>CLOSE</button>
          <div onMouseDown={(event) => event.stopPropagation()}>
            <PrintedCard
              card={selectedCard}
              foil={foil}
              preview={selectedEntry?.preview}
              copyLabel={`${miniSet.name} REVIEW`}
            />
          </div>
        </div>
      )}
    </main>
  );
}
