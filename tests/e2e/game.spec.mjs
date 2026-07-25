import { expect, test } from "@playwright/test";
import { RARITIES, getSet } from "../../lib/gameData.js";
import {
  SAVE_KEY,
  changeDeckCard,
  createInitialState,
  openPack,
  startSealedRun,
} from "../../lib/gameLogic.js";

async function seedState(page, state) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: SAVE_KEY, value: state });
}

async function enterDesk(page) {
  await page.goto("/");
  const intro = page.getByRole("button", { name: /TAKE THE NIGHT DESK/ });
  if (await intro.isVisible()) await intro.click();
}

async function revealAll(page) {
  const cards = page.locator(".reveal-card");
  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    await cards.nth(index).click();
  }
}

test("manual pack opening files six cards without allowing text selection", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("EVERYTHING");
  await expect(page.locator("body")).toHaveCSS("user-select", "none");
  const selectStartAllowed = await page.evaluate(() => {
    const event = new Event("selectstart", { bubbles: true, cancelable: true });
    return document.body.dispatchEvent(event);
  });
  expect(selectStartAllowed).toBe(false);

  await page.screenshot({ path: "test-results/intro-v2.png" });
  await page.getByRole("button", { name: /TAKE THE NIGHT DESK/ }).click();
  await expect(page.getByRole("button", { name: /BREAK THE FOIL/ })).toBeVisible();
  await page.getByRole("button", { name: /BREAK THE FOIL/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  await expect(page.locator(".reveal-card")).toHaveCount(6);

  const first = page.locator(".reveal-card").first();
  await first.hover();
  await expect(first.locator(".rarity-signal")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/pack-signals-v2.png" });

  await revealAll(page);
  await expect(page.locator(".opening-layer.phase-summary")).toBeVisible();
  await expect(page.locator(".reveal-card.is-revealed")).toHaveCount(6);
  await expect(page.locator(".summary-total")).toContainText("BINDER EFFECT CHANGE");
  await expect(page.locator(".summary-total strong")).toContainText("/s");
  await page.screenshot({ path: "test-results/pack-summary-v2.png" });

  await page.getByRole("button", { name: /RETURN TO DESK/ }).click();
  await page.getByRole("button", { name: /BINDER/ }).first().click();
  await expect(page.locator(".pw-binder-card.found").first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("all six face-down cards remain tappable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterDesk(page);
  await page.getByRole("button", { name: /BREAK THE FOIL/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  const cards = page.locator(".reveal-card");
  await expect(cards).toHaveCount(6);
  const boxes = await cards.evaluateAll((nodes) => nodes.map((node) => {
    const bounds = node.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
  }));
  for (const bounds of boxes) {
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(390);
    expect(bounds.bottom).toBeLessThanOrEqual(844);
  }
  await page.screenshot({ path: "test-results/mobile-pack-ready-v2.png" });
  await revealAll(page);
  await expect(page.locator(".opening-layer.phase-summary")).toBeVisible();
});

test("legendary manual pull gets full impact and rarity audio path", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.packsOpened = 1;
  state.manualPacks = 1;
  state.pityLegendary = 10_000;
  state.sealed.corner.loose = 1;
  state.settings = { sound: false, reducedEffects: false, quickOpen: true };
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await enterDesk(page);
  await page.getByRole("button", { name: /BREAK THE FOIL/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  const legendary = page.locator(".reveal-card.rarity-legendary").first();
  await expect(legendary).toBeVisible();
  await legendary.hover();
  await legendary.click();
  await expect(page.locator(".opening-impact.impact-legendary")).toBeVisible();
  await page.screenshot({ path: "test-results/legendary-impact-v2.png" });
});

test("constructed duel runs its authored sequence and awards sealed product", async ({ page }) => {
  const state = createInitialState(Date.now());
  const highCards = [...getSet("corner").cards]
    .sort((a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order)
    .slice(0, 4);
  state.beat = 3;
  state.packsOpened = 6;
  state.cardsPulled = 36;
  state.collection = Object.fromEntries(highCards.map((card) => [card.id, 3]));
  state.duelDeck = highCards.flatMap((card) => [card.id, card.id, card.id]);
  state.settings = { sound: false, reducedEffects: true, quickOpen: true };
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await enterDesk(page);
  await page.getByRole("button", { name: /PLAY/ }).click();
  await expect(page.locator(".pw-deck-readout")).toContainText("12/12 CARDS");
  await page.getByRole("button", { name: /RUN 8-SECOND DUEL/ }).click();
  await expect(page.locator(".pw-duel-layer")).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({ path: "test-results/duel-sequence-v2.png" });
  await expect(page.locator(".pw-duel-result")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".pw-duel-result")).toContainText("+3 SEALED PACKS");
  await page.screenshot({ path: "test-results/duel-win-v2.png" });
});

test("sealed deck builder excludes binder-only cards", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.beat = 4;
  state.duelsWon = 1;
  state.packsOpened = 12;
  state.collection = { "circuit-12": 1 };
  state.sealed.corner.loose = 6;
  state.settings = { sound: false, reducedEffects: true, quickOpen: true };
  state.lastSavedAt = Date.now();
  let runState = startSealedRun(state, "corner", Date.now());
  for (let index = 0; index < 6; index += 1) {
    runState = openPack(runState, {
      manual: true,
      context: "sealed",
      now: Date.now() + index * 2_000,
      rng: () => 0,
    }).state;
  }
  const poolCards = getSet("corner").cards
    .filter((card) => runState.sealedRun.pool[card.id])
    .flatMap((card) => Array.from({ length: runState.sealedRun.pool[card.id] }, () => card))
    .sort((a, b) => b.power - a.power)
    .slice(0, 12);
  for (const card of poolCards) runState = changeDeckCard(runState, card.id, 1, "sealed");

  await seedState(page, runState);
  await enterDesk(page);
  await page.getByRole("button", { name: /PLAY/ }).click();
  await page.getByRole("button", { name: /SEALED/ }).click();
  await expect(page.locator(".pw-deck-readout")).toContainText("SEALED POOL ONLY");
  await expect(page.locator(".pw-deck-card-list article", { hasText: "Zero-Day Seraph" })).toHaveCount(0);
  await expect(page.locator(".pw-deck-readout")).toContainText("12/12 CARDS");
  await page.getByRole("button", { name: /RUN 8-SECOND DUEL/ }).click();
  await expect(page.locator(".pw-duel-result")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".pw-duel-result")).toContainText("+4 SEALED PACKS");
});

test("beat-five rules and forge create targeted sealed stock", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.beat = 5;
  state.sealedWins = 1;
  state.packsOpened = 40;
  state.forgeMaterial = 24;
  state.collection = Object.fromEntries(getSet("corner").cards.map((card) => [card.id, 2]));
  state.settings = { sound: false, reducedEffects: true, quickOpen: true };
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await enterDesk(page);
  await page.getByRole("button", { name: /RULES/ }).click();
  await expect(page.getByRole("heading", { name: "Rules & forge" })).toBeVisible();
  await page.getByRole("button", { name: "ADD RULE" }).click();
  await expect(page.locator(".pw-rule-list article")).toHaveCount(1);
  const swarmForge = page.locator(".pw-forge-grid article").first();
  await swarmForge.getByRole("button", { name: "FORGE" }).click();
  await expect(swarmForge).toContainText("1 SEALED");
  await expect(page.locator(".pw-source-rack")).toContainText("SW CUT");
  await page.screenshot({ path: "test-results/rules-forge-v2.png" });
});

test("the redesigned desk remains usable in a compact iframe", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 560 });
  const state = createInitialState(Date.now());
  state.packsOpened = 3;
  state.beat = 2;
  state.collection = Object.fromEntries(getSet("corner").cards.slice(0, 6).map((card) => [card.id, 2]));
  state.settings.sound = false;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await enterDesk(page);
  await expect(page.getByRole("button", { name: /BREAK THE FOIL/ })).toBeVisible();
  await expect(page.locator(".pw-beat-rail")).toBeVisible();
  await page.screenshot({ path: "test-results/desk-compact-v2.png" });
});
