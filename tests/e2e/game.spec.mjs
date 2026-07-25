import { expect, test } from "@playwright/test";
import { SAVE_KEY, advanceBeat, createInitialState } from "../../lib/gameLogic.js";

async function seedState(page, state) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: SAVE_KEY, value: state });
}

async function revealAll(page) {
  const cards = page.locator(".reveal-card");
  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    await cards.nth(index).click();
  }
}

test("the clean game presents one obvious loop and a manual six-card opening", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  await expect(page.locator("body")).toHaveCSS("user-select", "none");
  const selectStartAllowed = await page.evaluate(() => {
    const event = new Event("selectstart", { bubbles: true, cancelable: true });
    return document.body.dispatchEvent(event);
  });
  expect(selectStartAllowed).toBe(false);

  await expect(page.getByRole("button", { name: /Open a pack/ })).toBeVisible();
  await expect(page.locator(".clean-stage")).toContainText("Open cards. The binder earns cash. Cash buys more packs.");
  await expect(page.getByText("MANUAL HEAT")).toHaveCount(0);
  await expect(page.getByText("RULES", { exact: true })).toHaveCount(0);
  await expect(page.getByText("PLAY", { exact: true })).toHaveCount(0);
  await expect(page.locator(".pw-beat-rail")).toHaveCount(0);
  await page.screenshot({ path: "test-results/clean-table.png" });

  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible({ timeout: 6_000 });
  await expect(page.locator(".reveal-card")).toHaveCount(6);

  const first = page.locator(".reveal-card").first();
  await first.hover();
  await expect(first.locator(".rarity-signal")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/clean-pack-signals.png" });

  await revealAll(page);
  await expect(page.locator(".opening-layer.phase-summary")).toBeVisible({ timeout: 6_000 });
  await expect(page.locator(".reveal-card.is-revealed")).toHaveCount(6);
  await expect(page.locator(".summary-total")).toContainText("BINDER INCOME");
  await expect(page.locator(".summary-total strong")).toContainText("/s");
  await page.screenshot({ path: "test-results/clean-pack-summary.png" });

  await page.getByRole("button", { name: "BACK TO TABLE" }).click();
  await page.getByRole("button", { name: "BINDER", exact: true }).click();
  await expect(page.locator(".clean-binder-grid button.found").first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("holding Space reveals cards in order and releasing stops the sequence", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await expect(page.getByRole("button", { name: /Open a pack/ })).toBeVisible();
  await expect(page.locator(".loading-screen")).toHaveCount(0);
  await page.keyboard.down("Space");
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  await expect(page.locator(".reveal-card.is-revealed")).toHaveCount(2, { timeout: 4_000 });
  await page.keyboard.up("Space");
  const stoppedAt = await page.locator(".reveal-card.is-revealed").count();
  await page.waitForTimeout(900);
  await expect(page.locator(".reveal-card.is-revealed")).toHaveCount(stoppedAt);

  await page.keyboard.down("Space");
  await expect(page.locator(".opening-layer.phase-summary")).toBeVisible({ timeout: 7_000 });
  await expect(page.locator(".reveal-card.is-revealed")).toHaveCount(6);
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible({ timeout: 3_000 });
  await page.keyboard.up("Space");
  await expect(page.locator(".clean-simple-stats div").nth(1).locator("strong")).toHaveText("2");
});

test("all six cards remain tappable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createInitialState(Date.now());
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  await page.waitForTimeout(900);
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
  await page.screenshot({ path: "test-results/clean-mobile-pack.png" });
  await revealAll(page);
  await expect(page.locator(".opening-layer.phase-summary")).toBeVisible({ timeout: 6_000 });
});

test("the shop reveals product and upgrade choices gradually", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "SHOP", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pack shop" })).toBeVisible();
  await expect(page.getByText("SEALED VALUE")).toHaveCount(0);
  await expect(page.locator(".clean-product")).toHaveCount(1);
  await expect(page.locator(".clean-product").first()).toContainText("Loose pack");
  await expect(page.locator(".clean-upgrades")).toContainText("Open 5 more packs");
  await expect(page.getByText("Standing orders")).toHaveCount(0);
  await expect(page.getByText("Filing rules")).toHaveCount(0);

  const state = advanceBeat({
    ...createInitialState(Date.now()),
    packsOpened: 10,
    coins: 600,
    collection: { "corner-01": 2, "corner-06": 1 },
    settings: { sound: false, reducedEffects: false, quickOpen: true },
    lastSavedAt: Date.now(),
  });
  await seedState(page, state);
  await page.reload();
  await page.getByRole("button", { name: "SHOP", exact: true }).click();
  await expect(page.locator(".clean-product")).toHaveCount(2);
  await expect(page.locator(".clean-product", { hasText: "Booster box" })).toBeVisible();
  await expect(page.locator(".clean-upgrade", { hasText: "Display shelf" })).toBeVisible();
  await page.screenshot({ path: "test-results/clean-shop.png" });
});

test("legendary pulls retain the full impact treatment", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.packsOpened = 1;
  state.manualPacks = 1;
  state.pityLegendary = 10_000;
  state.sealed.corner.loose = 1;
  state.settings = { sound: false, reducedEffects: false, quickOpen: true };
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");
  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  const legendary = page.locator(".reveal-card.rarity-legendary").first();
  await expect(legendary).toBeVisible();
  await legendary.hover();
  await legendary.click();
  await expect(page.locator(".opening-impact.impact-legendary")).toBeVisible();
  await page.screenshot({ path: "test-results/clean-legendary-impact.png" });
});

test("the clean table remains usable inside the compact game frame", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 450 });
  const state = createInitialState(Date.now());
  state.packsOpened = 3;
  state.collection = { "corner-01": 2, "corner-02": 1, "corner-06": 1 };
  state.settings.sound = false;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Open a pack/ })).toBeVisible();
  await expect(page.locator(".clean-simple-stats")).toBeVisible();
  const packBounds = await page.locator(".clean-pack-clicker").boundingBox();
  expect(packBounds.x).toBeGreaterThanOrEqual(0);
  expect(packBounds.x + packBounds.width).toBeLessThanOrEqual(800);
  expect(packBounds.y + packBounds.height).toBeLessThanOrEqual(450);
  await page.screenshot({ path: "test-results/clean-compact.png" });
});
