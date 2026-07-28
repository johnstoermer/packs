import test from "node:test";
import assert from "node:assert/strict";

import { ALL_CARDS } from "../lib/gameData.js";
import { MECHANIC_MINI_SETS, getMechanicMiniSet } from "../lib/mechanicMiniSets.js";
import { MECHANICS } from "../lib/mechanicsCatalog.js";

test("every live mechanic has one complete eight-card review package", () => {
  assert.deepEqual(
    MECHANICS.map((mechanic) => MECHANIC_MINI_SETS.find((miniSet) => miniSet.id === mechanic.id)?.id),
    MECHANICS.map((mechanic) => mechanic.id),
  );
  assert.equal(MECHANIC_MINI_SETS.length, 15);

  const liveIds = new Set(ALL_CARDS.map((card) => card.id));
  for (const miniSet of MECHANIC_MINI_SETS) {
    assert.equal(miniSet.cards.length, 8, `${miniSet.name} must contain eight cards`);
    assert.equal(new Set(miniSet.cards.map((entry) => entry.id)).size, 8, `${miniSet.name} repeats a card`);
    assert.equal(miniSet.caseOrder.length, 6, `${miniSet.name} must recommend six display slots`);
    assert.equal(new Set(miniSet.caseOrder).size, 6, `${miniSet.name} repeats a display slot`);
    assert.ok(miniSet.title);
    assert.ok(miniSet.archetype);
    assert.ok(miniSet.thesis);
    assert.equal(miniSet.loop.length, 3);
    assert.ok(miniSet.strength);
    assert.ok(miniSet.watchout);

    const packageIds = new Set(miniSet.cards.map((entry) => entry.id));
    for (const entry of miniSet.cards) {
      assert.ok(liveIds.has(entry.id), `${miniSet.name} references missing card ${entry.id}`);
      assert.ok(entry.role, `${miniSet.name}/${entry.id} is missing a role`);
      assert.ok(entry.note, `${miniSet.name}/${entry.id} is missing a review note`);
    }
    for (const id of miniSet.caseOrder) {
      assert.ok(packageIds.has(id), `${miniSet.name} recommends ${id} outside its package`);
    }
  }
});

test("mechanic mini-set lookup falls back safely", () => {
  assert.equal(getMechanicMiniSet("fusion").id, "fusion");
  assert.equal(getMechanicMiniSet("salvage-scrap").id, "salvage-scrap");
  assert.equal(getMechanicMiniSet("not-a-mechanic").id, MECHANIC_MINI_SETS[0].id);
});

test("the alternate Salvage package previews a complete destructive Scrap economy", () => {
  const miniSet = getMechanicMiniSet("salvage-scrap");
  assert.equal(miniSet.proposal, true);
  assert.equal(miniSet.variantOf, "salvage");
  assert.equal(miniSet.resourceRules.length, 3);
  assert.match(miniSet.resourceRules[0].text, /permanently delete/i);
  assert.match(miniSet.resourceRules[2].text, /Spending Scrap is never a trigger/i);
  const paidPayoffs = miniSet.cards.filter((entry) => /spend \d+ Scrap/i.test(entry.preview?.text || ""));
  assert.deepEqual(
    paidPayoffs.map((entry) => entry.preview.text.match(/spend (\d+) Scrap/i)?.[1]),
    ["10", "15", "30", "5", "20"],
  );
  assert.ok(
    paidPayoffs.every((entry) => entry.preview.text.startsWith("Whenever ")),
    "each Scrap payoff needs an event trigger before its optional cost",
  );
  assert.ok(
    paidPayoffs.every((entry) => /you may spend \d+ Scrap/i.test(entry.preview.text)),
    "each triggered Scrap cost should be optional",
  );
  for (const entry of miniSet.cards) {
    assert.ok(entry.preview?.name, `${entry.id} needs a proposed name`);
    assert.ok(entry.preview?.text, `${entry.id} needs proposed rules`);
    assert.ok(entry.preview?.flavor, `${entry.id} needs proposed flavor`);
  }
});
