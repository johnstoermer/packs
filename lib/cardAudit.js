import { getCardRulesId } from "./gameData.js";

// Curated after reviewing the full 240-card rules pool. "Impact" identifies
// cards that can anchor or sharply accelerate a build. "Interesting"
// identifies cards that change sequencing, targeting, pack composition, or
// engine topology instead of only increasing a number.
const CARD_AUDIT = Object.freeze({
  "corner-10": {
    interesting: true,
    reason: "Turns every Echo into pack growth and creates self-feeding reveal chains.",
  },
  "circuit-11": {
    impact: true,
    reason: "Adds Echo to every Marked rarity and bridges two major engines.",
  },
  "crown-01": {
    impact: true,
    reason: "A guaranteed additional Rare-or-better Echo is one of the cleanest payoff multipliers.",
  },
  "crown-07": {
    interesting: true,
    reason: "Legendary pulls can award packs from locked sets and break normal progression boundaries.",
  },
  "crown-08": {
    interesting: true,
    reason: "Changes Marks from a binary state into a stackable resource.",
  },
  "corner-12": {
    impact: true,
    interesting: true,
    reason: "Guarantees Common Echo and anchors the strongest high-volume Common builds.",
  },
  "crown-09": {
    impact: true,
    reason: "Turns collection breadth into permanent cash-per-second scaling.",
  },
  "crown-10": {
    impact: true,
    interesting: true,
    reason: "Converts cash milestones into direct duplicate reveals and more trigger fuel.",
  },
  "circuit-12": {
    impact: true,
    interesting: true,
    reason: "Guarantees a Marked card in every pack and switches on the entire Mark engine.",
  },
  "crown-11": {
    impact: true,
    interesting: true,
    reason: "Rewrites pack composition to Common-only and adds recursive pack growth.",
  },
  "observatory-01": {
    interesting: true,
    reason: "Rewards exact display positioning by listening to the card on its left.",
  },
  "observatory-02": {
    interesting: true,
    reason: "Turns Marked reveals into a positional retrigger tool.",
  },
  "observatory-03": {
    interesting: true,
    reason: "Banks cash milestones as additional future Marks.",
  },
  "observatory-05": {
    impact: true,
    reason: "Discover on every opened pack produces unusually consistent upgrade access.",
  },
  "observatory-06": {
    impact: true,
    interesting: true,
    reason: "A Marked reveal can Echo every revealed Marked card at once.",
  },
  "observatory-07": {
    impact: true,
    interesting: true,
    reason: "Collapses a full pack reveal into one action and dramatically accelerates auto-opening.",
  },
  "observatory-12": {
    impact: true,
    reason: "Adds a guaranteed additional Mark to every pack.",
  },
  "frontier-12": {
    impact: true,
    interesting: true,
    reason: "Makes duplicate selling a repeatable source of free Mystery Packs.",
  },
  "signal-09": {
    impact: true,
    reason: "Completed sets scale into multiple Salvages and compound collection progress.",
  },
  "harbor-12": {
    impact: true,
    interesting: true,
    reason: "Relay changes the display from six isolated cards into a positional trigger chain.",
  },
  "signal-12": {
    impact: true,
    reason: "Multiplies every Salvage into a much larger Mystery Pack burst.",
  },
  "apocalypse-12": {
    impact: true,
    interesting: true,
    reason: "Mystery Packs can recursively Salvage, enabling explosive chain reactions.",
  },
  "verdant-12": {
    impact: true,
    interesting: true,
    reason: "Fusion turns duplicate rarity pairs into higher-rarity cards that reveal again.",
  },
  "ember-12": {
    impact: true,
    interesting: true,
    reason: "Fracture spills whole extra packs into the current reveal.",
  },
  "foundry-12": {
    impact: true,
    interesting: true,
    reason: "Runs the complete Fusion chain twice.",
  },
  "hollow-12": {
    impact: true,
    interesting: true,
    reason: "Connects every Fusion to Salvage and merges two high-output engines.",
  },
  "abyss-12": {
    impact: true,
    interesting: true,
    reason: "Mimic rewrites an unrevealed card before the pack is opened.",
  },
  "polar-12": {
    impact: true,
    interesting: true,
    reason: "Transmute redirects unrevealed cards toward the revealed rarity.",
  },
  "cloud-12": {
    impact: true,
    reason: "Spreads Marks, copies, and Transmutes across the pack at high frequency.",
  },
  "prism-12": {
    impact: true,
    reason: "Adds Echo chance to every card regardless of rarity.",
  },
  "lastlight-01": {
    impact: true,
    reason: "Guarantees an additional Common Echo without requiring a signature card.",
  },
  "lastlight-02": {
    impact: true,
    reason: "Guarantees an additional Rare-or-better Echo.",
  },
  "lastlight-04": {
    impact: true,
    reason: "Guarantees an additional Marked card in every pack.",
  },
  "lastlight-05": {
    impact: true,
    reason: "Guarantees Transmute and turns a chance engine into a dependable tool.",
  },
  "lastlight-06": {
    impact: true,
    reason: "Guarantees Catalyst spread for every eligible change.",
  },
  "glass-12": {
    impact: true,
    interesting: true,
    reason: "Blueprint copies slot 1 and enables flexible duplicate keystones.",
  },
  "orchard-12": {
    impact: true,
    interesting: true,
    reason: "Autopilot converts every Discover into an automatic enhanced pick.",
  },
  "unwritten-11": {
    impact: true,
    interesting: true,
    reason: "Completing a set triggers the entire displayed build at once.",
  },
  "lastlight-12": {
    impact: true,
    reason: "Enhances every Discover option for the rest of the run.",
  },
  "unwritten-12": {
    impact: true,
    interesting: true,
    reason: "Unlocks Rewrite and permanent Inscriptions.",
  },
});

export function getCardAudit(card) {
  if (!card) return null;
  return CARD_AUDIT[getCardRulesId(card)] || null;
}

export function cardMatchesAudit(card, filter) {
  if (filter === "all") return true;
  const audit = getCardAudit(card);
  if (!audit) return false;
  if (filter === "impact") return !!audit.impact;
  if (filter === "interesting") return !!audit.interesting;
  return filter === "audit";
}

export default CARD_AUDIT;
