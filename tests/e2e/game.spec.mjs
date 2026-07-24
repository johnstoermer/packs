import { expect, test } from "@playwright/test";
import { ALL_CARDS } from "../../lib/gameData.js";
import { SAVE_KEY, createInitialState } from "../../lib/gameLogic.js";

test("opens a pack and files the pulls into the binder", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("PACK");
  await page.screenshot({ path: "test-results/intro.png", fullPage: true });
  await page.getByRole("button", { name: "OPEN THE WORKSHOP" }).click();
  await expect(page.locator(".scene-canvas")).toBeVisible();

  await page.getByRole("button", { name: "OPEN PACK" }).click();
  await expect(page.locator(".opening-layer.phase-summary")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".reveal-card.is-revealed")).toHaveCount(4);
  await expect(page.locator(".summary-total strong")).toContainText("+");

  await page.screenshot({ path: "test-results/pack-opening.png", fullPage: true });
  await page.getByRole("button", { name: "BACK TO SHOP" }).click();
  await page.getByRole("button", { name: /BINDER/ }).first().click();
  await expect(page.locator(".binder-card.found").first()).toBeVisible();
});

test("workshop remains usable at a compact iframe size", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 560 });
  await page.goto("/");
  await page.getByRole("button", { name: "OPEN THE WORKSHOP" }).click();
  await expect(page.getByRole("button", { name: "OPEN PACK" })).toBeVisible();
  await expect(page.locator(".set-dock")).toBeVisible();
  await page.screenshot({ path: "test-results/workshop-compact.png", fullPage: true });
});

test("an upgraded workshop and populated binder remain legible", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const seeded = {
    ...createInitialState(Date.now()),
    coins: 18_400_000,
    lifetimeCoins: 32_000_000,
    runCoins: 32_000_000,
    packsOpened: 220,
    runPacks: 220,
    cardsPulled: 900,
    collection: Object.fromEntries(ALL_CARDS.slice(0, 36).map((card, index) => [card.id, 1 + (index % 4)])),
    foils: Object.fromEntries(ALL_CARDS.slice(0, 36).filter((_, index) => index % 7 === 0).map((card) => [card.id, 1])),
    masteredSets: { corner: true, circuit: true, frontier: true },
    unlockedSets: ["corner", "circuit", "frontier"],
    activeSet: "frontier",
    upgrades: {
      fingers: 14,
      sorter: 13,
      scanner: 9,
      sleeves: 7,
      lights: 8,
      case: 6,
      crew: 3,
      press: 2,
    },
    lastSavedAt: Date.now(),
  };
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: SAVE_KEY, value: seeded });
  await page.goto("/");
  await expect(page.locator(".loading-screen")).toBeHidden();
  await expect(page.locator(".intro-screen")).toBeHidden();
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/workshop-upgraded.png", fullPage: true });
  await page.getByRole("button", { name: /BINDER/ }).first().click();
  await expect(page.locator(".binder-card.found")).toHaveCount(12);
  await page.screenshot({ path: "test-results/binder-upgraded.png", fullPage: true });
  expect(pageErrors).toEqual([]);
});
