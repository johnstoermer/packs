"use client";

import { useEffect } from "react";
import { RARITIES } from "../lib/gameData";

const BURST_RARITIES = [
  "common", "uncommon", "rare", "common", "epic", "uncommon", "common",
  "rare", "common", "legendary", "uncommon", "common", "rare", "epic",
  "common", "uncommon", "rare", "common",
];

function Burst({ burst, onComplete }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onComplete(burst.id), 1_450);
    return () => window.clearTimeout(timer);
  }, [burst.id, onComplete]);

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
        <b>{fracture ? "FRACTURE / +6 CARDS" : `SALVAGE ×${burst.count || 1}`}</b>
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
