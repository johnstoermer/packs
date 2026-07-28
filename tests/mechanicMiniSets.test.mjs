import test from "node:test";
import assert from "node:assert/strict";

import { ALL_CARDS } from "../lib/gameData.js";
import { MECHANIC_MINI_SETS, getMechanicMiniSet } from "../lib/mechanicMiniSets.js";
import { MECHANICS } from "../lib/mechanicsCatalog.js";

test("every live mechanic has one complete eight-card review package", () => {
  assert.deepEqual(
    MECHANIC_MINI_SETS.map((miniSet) => miniSet.id),
    MECHANICS.map((mechanic) => mechanic.id),
  );
  assert.equal(MECHANIC_MINI_SETS.length, 14);

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
  assert.equal(getMechanicMiniSet("not-a-mechanic").id, MECHANIC_MINI_SETS[0].id);
});
