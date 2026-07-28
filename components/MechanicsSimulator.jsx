"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_CARDS, RARITIES, getCardRulesId, getSet } from "../lib/gameData";
import { DISCOVER_POOL } from "../lib/engineCards";
import { MECHANICS } from "../lib/mechanicsCatalog";
import { OpeningImpact, PrintedCard } from "./PackworksGameClean";
import GlobalBurstLayer from "./GlobalBurstLayer";

const LEGACY_SAMPLE = {
  reveal: "lastlight-12",
  echo: "corner-12",
  mark: "circuit-12",
  salvage: "frontier-12",
  mimic: "abyss-12",
  fusion: "verdant-12",
  transmute: "polar-12",
  fracture: "ember-12",
  catalyst: "cloud-12",
  blueprint: "glass-12",
  relay: "harbor-12",
  discover: "orchard-08",
  autopilot: "orchard-12",
  rewrite: "unwritten-12",
};

function cardFor(legacyId) {
  return ALL_CARDS.find((card) => getCardRulesId(card) === legacyId)
    || ALL_CARDS.find((card) => card.id === legacyId)
    || ALL_CARDS[0];
}

function CardBack({ card, label = "PACKWORKS" }) {
  const set = getSet(card.setId);
  return (
    <span
      className="card-back back-style-crest"
      style={{ "--set-a": set.colors[0], "--set-b": set.colors[1], "--set-c": set.colors[2] }}
    >
      <span className="back-set">{set.short}</span>
      <span className="back-orbit"><i /><i /><i /></span>
      <span className="back-rule" />
      <span className="back-mark"><span><b>PW</b><small>PACKWORKS</small></span></span>
      <small className="mechanic-back-label">{label}</small>
    </span>
  );
}

function MechanicCard({
  card,
  className = "",
  faceUp = false,
  foil = false,
  label,
  rarityId = card.rarity,
}) {
  return (
    <span className={`mechanic-card ${faceUp ? "is-face-up" : ""} ${className}`.trim()}>
      <span className="mechanic-card-inner">
        <CardBack card={card} />
        <PrintedCard card={card} rarityId={rarityId} foil={foil} copyLabel="SIMULATOR" />
      </span>
      {label && <b className="mechanic-card-label">{label}</b>}
    </span>
  );
}

function DiscoverFan({ picked, onPick, automatic = false }) {
  const options = DISCOVER_POOL.slice(0, 3);
  return (
    <div className={`mechanic-discover ${automatic ? "is-automatic" : ""}`}>
      <header className="discover-head">
        <b>{automatic ? "AUTOPILOT / DISCOVER" : "DISCOVER"}</b>
        <p>{automatic ? "An enhanced option is selected automatically." : "Choose a boon to add it to your next matching mechanic."}</p>
      </header>
      <div className={`discover-fan count-${options.length}`}>
        {options.map((option, index) => {
          const spread = index - (options.length - 1) / 2;
          const selected = picked === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`discover-card option-${option.id} ${selected ? "is-picked" : ""}`}
              style={{ "--spread": spread, "--deal": `${index * 95}ms` }}
              onClick={() => !automatic && onPick(option.id)}
              disabled={automatic}
              aria-pressed={selected}
            >
              <span className="discover-card-head">
                <span>DISCOVER</span>
                <b>{"I".repeat(index + 1)}</b>
              </span>
              <span className="discover-card-glyph" aria-hidden="true"><i /><i /><i /></span>
              <strong>{option.name}</strong>
              <span className="discover-card-text">{option.text}</span>
              <span className="discover-card-foot">
                {selected ? (automatic ? "AUTO-PICKED ×2" : "ADDED TO STACK") : "TAKE THIS"}
              </span>
            </button>
          );
        })}
      </div>
      {picked && (
        <div className="mechanic-stack-result">
          <span>{DISCOVER_POOL.find((option) => option.id === picked)?.name}</span>
          <b>×{automatic ? 2 : 1}</b>
          <small>READY</small>
        </div>
      )}
    </div>
  );
}

function CaseSlots({ kind }) {
  const source = cardFor(kind === "blueprint" ? "glass-01" : "harbor-01");
  const middle = cardFor(kind === "blueprint" ? "glass-12" : "harbor-12");
  const target = cardFor(kind === "blueprint" ? "glass-03" : "harbor-03");
  return (
    <div className={`mechanic-case mechanic-case-${kind}`}>
      {[source, middle, target].map((card, index) => (
        <span
          key={card.id}
          className={`mechanic-case-slot is-${index + 1} rarity-${card.rarity}`}
          style={{ "--rarity": RARITIES[card.rarity].color }}
        >
          <PrintedCard card={card} copyLabel={`SLOT ${index + 1}`} />
          <b>{index + 1}</b>
        </span>
      ))}
      <span className="mechanic-case-track" aria-hidden="true"><i /></span>
      <div className="mechanic-case-caption">
        <strong>{kind === "blueprint" ? "EFFECT COPIED" : "TRIGGER RELAYED"}</strong>
        <small>{kind === "blueprint" ? "SLOT 1 → BLUEPRINT" : "SLOT 1 → SLOT 2 → SLOT 3"}</small>
      </div>
    </div>
  );
}

function SalvageBurst() {
  const rarities = ["uncommon", "rare", "common", "epic", "common", "uncommon", "rare"];
  return (
    <div className="salvage-burst is-simulator-burst" aria-hidden="true">
      <div className="salvage-burst-pack">
        <i className="salvage-burst-half is-left" />
        <i className="salvage-burst-half is-right" />
        <b>SALVAGE ×2</b>
      </div>
      <div className="salvage-burst-cards">
        {rarities.map((rarity, index) => (
          <span
            key={`${rarity}-${index}`}
            className={`salvage-burst-card rarity-${rarity}${index < 2 ? " is-new" : ""}`}
            style={{ "--i": index, "--n": rarities.length, "--rarity": RARITIES[rarity].color }}
          >
            {index < 2 && <em>NEW</em>}
          </span>
        ))}
      </div>
    </div>
  );
}

function FracturePack({ card }) {
  return (
    <div className="mechanic-fracture">
      <div className="mechanic-pack">
        <span className="mechanic-pack-half is-left">PACK</span>
        <span className="mechanic-pack-half is-right">WORKS</span>
        <i className="mechanic-fracture-line" />
      </div>
      <div className="mechanic-spill">
        {Array.from({ length: 6 }, (_, index) => (
          <MechanicCard
            key={index}
            card={index === 5 ? card : ALL_CARDS[index + 2]}
            faceUp={index === 5}
            foil={index === 5}
            className={`spill-${index + 1}`}
          />
        ))}
      </div>
      <div className="mechanic-callout"><strong>FRACTURE</strong><small>+6 CARDS JOINED THE REVEAL</small></div>
    </div>
  );
}

function MechanicVisual({ mechanicId, picked, onPick, runId }) {
  const card = cardFor(LEGACY_SAMPLE[mechanicId]);
  const secondary = cardFor({
    mimic: "abyss-04",
    fusion: "verdant-02",
    transmute: "polar-04",
    catalyst: "cloud-04",
  }[mechanicId] || "corner-02");

  if (mechanicId === "discover") return <DiscoverFan picked={picked} onPick={onPick} />;
  if (mechanicId === "autopilot") return <DiscoverFan picked="resonance" onPick={() => {}} automatic />;
  if (mechanicId === "salvage") return <SalvageBurst />;
  if (mechanicId === "blueprint" || mechanicId === "relay") return <CaseSlots kind={mechanicId} />;
  if (mechanicId === "fracture") return <FracturePack card={card} />;

  if (mechanicId === "reveal") {
    return (
      <div className="mechanic-single mechanic-reveal">
        <MechanicCard card={card} className="is-impacting" faceUp foil label="HOLO PULL" />
        <OpeningImpact impact={{ rarity: card.rarity, foil: true, serial: runId }} />
      </div>
    );
  }

  if (mechanicId === "echo") {
    return (
      <div className="mechanic-single mechanic-echo">
        <MechanicCard card={card} faceUp className="is-echoing" label="REVEAL EFFECT" />
        <span className="reveal-echo" aria-hidden="true">
          <i className="reveal-echo-flash" />
          <b className="reveal-echo-chip">ECHO ×2</b>
        </span>
        <span className="mechanic-echo-copy"><PrintedCard card={card} copyLabel="ECHO" /></span>
      </div>
    );
  }

  if (mechanicId === "mark") {
    return (
      <div className="mechanic-trio mechanic-mark">
        <MechanicCard card={ALL_CARDS[4]} />
        <MechanicCard card={card} className="is-marked" label="MARKED" />
        <MechanicCard card={ALL_CARDS[8]} />
        <span className="mechanic-scanline" />
      </div>
    );
  }

  if (mechanicId === "mimic") {
    return (
      <div className="mechanic-trio mechanic-mimic">
        <MechanicCard card={card} faceUp label="SOURCE" />
        <span className="mechanic-copy-beam"><i /><i /><i /></span>
        <MechanicCard card={secondary} className="is-mimic-before" label="TARGET" />
        <MechanicCard card={card} faceUp className="is-mimic-after" label="COPIED" />
      </div>
    );
  }

  if (mechanicId === "fusion") {
    return (
      <div className="mechanic-trio mechanic-fusion">
        <MechanicCard card={secondary} faceUp className="is-fusion-left" label="COMMON" rarityId="common" />
        <span className="mechanic-fusion-core"><i /><i /><b>FUSION</b></span>
        <MechanicCard card={secondary} faceUp className="is-fusion-right" label="COMMON" rarityId="common" />
        <MechanicCard card={card} faceUp foil className="is-fusion-result" label="UNCOMMON" rarityId="uncommon" />
      </div>
    );
  }

  if (mechanicId === "transmute") {
    return (
      <div className="mechanic-trio mechanic-transmute">
        <MechanicCard card={card} faceUp label="RARE SOURCE" rarityId="rare" />
        <span className="mechanic-transmute-wave"><i /><i /><i /></span>
        <MechanicCard card={secondary} className="is-transmute-target" label="COMMON → RARE" rarityId="rare" />
      </div>
    );
  }

  if (mechanicId === "catalyst") {
    return (
      <div className="mechanic-trio mechanic-catalyst">
        {[secondary, card, ALL_CARDS[10]].map((entry, index) => (
          <MechanicCard
            key={entry.id}
            card={entry}
            className={`catalyst-${index + 1} ${index > 0 ? "is-marked" : ""}`}
            label={index === 0 ? "ORIGINAL MARK" : "SPREAD"}
          />
        ))}
        <span className="mechanic-catalyst-ring"><b>CATALYST</b></span>
      </div>
    );
  }

  return (
    <div className="mechanic-rewrite">
      <MechanicCard card={card} faceUp foil className="is-rewrite-card" label="FINALE" />
      <div className="mechanic-book">
        <span className="mechanic-page is-left"><i /><i /><i /></span>
        <span className="mechanic-page is-right"><i /><i /><i /></span>
        <b>+7</b>
        <strong>INSCRIPTIONS</strong>
      </div>
      <div className="mechanic-edition-stamp">NEW EDITION / 01</div>
    </div>
  );
}

export default function MechanicsSimulator({ paused = false }) {
  const [mechanicId, setMechanicId] = useState("discover");
  const [fxStyle, setFxStyle] = useState("holo");
  const [runId, setRunId] = useState(1);
  const [picked, setPicked] = useState(null);
  const [slow, setSlow] = useState(false);
  const [focused, setFocused] = useState(false);
  const [globalBursts, setGlobalBursts] = useState([]);
  const globalBurstSerialRef = useRef(0);
  const mechanic = useMemo(
    () => MECHANICS.find((entry) => entry.id === mechanicId) || MECHANICS[0],
    [mechanicId],
  );

  const replay = () => {
    setPicked(null);
    setRunId((current) => current + 1);
  };

  const triggerGlobalBurst = (repeats = 1) => {
    if (!["salvage", "fracture"].includes(mechanicId)) return;
    for (let index = 0; index < repeats; index += 1) {
      window.setTimeout(() => {
        const burst = {
          id: ++globalBurstSerialRef.current,
          type: mechanicId,
          count: repeats,
        };
        setGlobalBursts((current) => [...current.slice(-4), burst]);
      }, index * 145);
    }
  };

  useEffect(() => {
    replay();
  }, [mechanicId, fxStyle]);

  useEffect(() => {
    if (mechanicId !== "autopilot") return undefined;
    const timer = window.setTimeout(() => setRunId((current) => current + 1), slow ? 6_800 : 3_900);
    return () => window.clearTimeout(timer);
  }, [mechanicId, runId, slow]);

  useEffect(() => {
    if (!focused) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setFocused(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused]);

  return (
    <section
      id="mechanics"
      className={`mechanic-simulator theme-league fx-${fxStyle} ${slow ? "is-slow" : ""} ${paused ? "is-paused" : ""} ${focused ? "is-focused" : ""}`}
      aria-labelledby="mechanic-lab-title"
    >
      <header className="mechanic-simulator-head">
        <div>
          <span>PRODUCTION EFFECTS SANDBOX</span>
          <h2 id="mechanic-lab-title">Mechanics Arena</h2>
          <p>Run every signature mechanic on demand. These demos use the live card frames and effect vocabulary.</p>
        </div>
        <div className="mechanic-fx-switch" aria-label="Effects treatment">
          {[
            ["holo", "HOLO RUSH"],
            ["broadcast", "BROADCAST"],
            ["tabletop", "TABLETOP"],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={fxStyle === id ? "is-active" : ""}
              onClick={() => setFxStyle(id)}
              aria-pressed={fxStyle === id}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="mechanic-console">
        <nav className="mechanic-selector" aria-label="Mechanic demos">
          {MECHANICS.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={mechanicId === entry.id ? "is-active" : ""}
              onClick={() => setMechanicId(entry.id)}
              aria-pressed={mechanicId === entry.id}
            >
              <span>{entry.index}</span>
              <b>{entry.name}</b>
              <small>{entry.kicker}</small>
            </button>
          ))}
        </nav>

        <div className="mechanic-demo">
          <div className="mechanic-demo-bar">
            <div>
              <span>{mechanic.index} / MECHANIC</span>
              <strong>{mechanic.name}</strong>
            </div>
            <div>
              <button type="button" onClick={() => setSlow((current) => !current)} className={slow ? "is-active" : ""}>
                {slow ? "SLOW ×2" : "NORMAL SPEED"}
              </button>
              <button type="button" onClick={replay}>REPLAY EFFECT</button>
              {["salvage", "fracture"].includes(mechanicId) && (
                <>
                  <button type="button" onClick={() => triggerGlobalBurst(1)}>COMPACT TRIGGER</button>
                  <button type="button" onClick={() => triggerGlobalBurst(3)}>RETRIGGER ×3</button>
                </>
              )}
              <button type="button" onClick={() => setFocused((current) => !current)}>
                {focused ? "EXIT FOCUS" : "FOCUS VIEW"}
              </button>
            </div>
          </div>

          <div
            className={`mechanic-visual mechanic-mode-${mechanic.id}`}
            data-mechanic={mechanic.id}
            data-run={runId}
          >
            <MechanicVisual
              key={`${mechanicId}-${fxStyle}-${runId}`}
              mechanicId={mechanicId}
              runId={runId}
              picked={picked}
              onPick={setPicked}
            />
          </div>

          <footer className="mechanic-readout">
            <p>{mechanic.summary}</p>
            <ol>
              {mechanic.steps.map((step, index) => (
                <li key={step}><span>{index + 1}</span>{step}</li>
              ))}
            </ol>
          </footer>
        </div>
      </div>
      {globalBursts.length > 0 && (
        <GlobalBurstLayer
          bursts={globalBursts}
          onComplete={(id) => {
            setGlobalBursts((current) => current.filter((burst) => burst.id !== id));
          }}
        />
      )}
    </section>
  );
}
