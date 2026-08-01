"use client";

import { useEffect } from "react";
import { RARITIES } from "../lib/gameData";

const BURST_RARITIES = [
  "common", "rare", "common", "epic", "common", "rare", "common",
  "legendary", "common", "rare", "epic", "common", "rare", "common",
  "epic", "common", "rare", "common",
];

function Burst({ burst, onComplete }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onComplete(burst.id), 1_450);
    return () => window.clearTimeout(timer);
  }, [burst.id, onComplete]);

  // A single card that turned itself over with nothing on screen. Same family
  // as the Salvage burst, but one card and no pack to tear open — nothing was
  // opened here, a card just resolved.
  if (burst.type === "reveal" && burst.card) {
    const rarity = RARITIES[burst.card.rarity] || RARITIES.common;
    return (
      <div
        className={`global-burst burst-reveal rarity-${burst.card.rarity}`}
        style={{
          // Alternate sides and keep off the middle: the pack stack owns the
          // centre of the stage, and catching up can float three of these at
          // once. Inset far enough that the name chip never runs off a phone.
          "--burst-x": `${(burst.id % 2 ? 20 : 66) + (burst.id * 7) % 14}%`,
          "--burst-y": `${32 + (burst.id * 23) % 30}%`,
          "--rarity": rarity.color,
        }}
      >
        <div className="global-burst-single">
          <span className="global-burst-card is-single" />
          <b>{burst.card.name}</b>
          <small>REVEALED</small>
        </div>
      </div>
    );
  }

  const fracture = burst.type === "fracture";
  return (
    <div
      className={`global-burst burst-${fracture ? "fracture" : "salvage"}`}
      style={{
        "--burst-x": `${22 + (burst.id * 37) % 56}%`,
        "--burst-y": `${28 + (burst.id * 29) % 42}%`,
      }}
      aria-hidden="true"
    >
      <div className="global-burst-pack">
        <i className="global-burst-half is-left" />
        <i className="global-burst-half is-right" />
        <b>{fracture ? "PACK BURST / +6 CARDS" : `SALVAGE ×${burst.count || 1}`}</b>
      </div>
      <div className="global-burst-cards">
        {BURST_RARITIES.map((rarity, index) => (
          <span
            key={`${burst.id}-${rarity}-${index}`}
            className={`global-burst-card rarity-${rarity}`}
            style={{
              "--i": index,
              "--n": BURST_RARITIES.length,
              "--rarity": RARITIES[rarity].color,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function GlobalBurstLayer({ bursts, onComplete }) {
  return (
    <div className="global-burst-layer" aria-hidden="true">
      {bursts.map((burst) => (
        <Burst key={burst.id} burst={burst} onComplete={onComplete} />
      ))}
    </div>
  );
}
