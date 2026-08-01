import { expect, test } from "@playwright/test";
import { ALL_CARDS } from "../../lib/gameData.js";
import { SAVE_KEY, createInitialState } from "../../lib/gameLogic.js";

function findCard(name) {
  return ALL_CARDS.find((card) => card.name === name);
}

async function seedState(page, state) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: SAVE_KEY, value: state });
}

async function waitForOpeningReady(page) {
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible({ timeout: 6_000 });
}

async function waitForOpeningClosed(page, timeout = 20_000) {
  await expect(page.locator(".opening-layer")).toHaveCount(0, { timeout });
}

test("the game loads with cash, scrap, packs, and a 50-card collection meter", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  await expect(page.locator(".clean-wallet")).toContainText("CASH");
  await expect(page.locator(".clean-wallet")).toContainText("SCRAP");
  await expect(page.locator(".clean-wallet")).toContainText("3 PACKS");
  const collection = page.locator(".clean-set-progress");
  await expect(collection).toBeVisible();
  await expect(collection).toContainText("0/50");
  await expect(page.locator(".case-strip")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("opening a pack deals six cards; reveals resolve in order and pay cash", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  await page.getByRole("button", { name: /Open a pack/ }).click();
  await waitForOpeningReady(page);
  await expect(page.locator(".reveal-card")).toHaveCount(6);

  // Rapid-fire every card: each click queues an action and the stack drains
  // strictly one reveal at a time.
  const cards = page.locator(".reveal-card");
  for (let index = 0; index < 6; index += 1) {
    await cards.nth(index).click();
  }
  await expect(page.locator(".reveal-card.is-revealed")).toHaveCount(6, { timeout: 15_000 });
  await waitForOpeningClosed(page);

  const wallet = await page.locator(".clean-wallet strong").first().textContent();
  expect(Number(wallet.replace(/[^0-9]/g, ""))).toBeGreaterThan(0);
  await expect(page.locator(".clean-set-progress")).not.toContainText("0/50");
  expect(pageErrors).toEqual([]);
});

test("a displayed Firstseer reveals the whole pack from one flip, one card at a time", async ({ page }) => {
  const firstseer = findCard("Firstseer");
  const state = createInitialState(0);
  state.collection[firstseer.id] = 1;
  state.displayed = [{ id: firstseer.id }];
  state.packsOpened = 100; // every case slot unlocked
  await seedState(page, state);

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  await expect(page.locator(".case-strip-slot.is-filled")).toHaveCount(1);
  await page.getByRole("button", { name: /Open a pack/ }).click();
  await waitForOpeningReady(page);
  await page.locator(".reveal-card").first().click();

  // One click; the queue does the rest.
  await expect(page.locator(".reveal-card.is-revealed")).toHaveCount(6, { timeout: 15_000 });
  await waitForOpeningClosed(page);
  expect(pageErrors).toEqual([]);
});

test("leaving an opening clears the stack and abandons face-down cards", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Open a pack/ }).click();
  await waitForOpeningReady(page);

  await page.locator(".reveal-card").first().click();
  await expect(page.locator(".reveal-card.is-revealed")).toHaveCount(1, { timeout: 6_000 });
  await page.getByRole("button", { name: /End the opening/ }).click();
  await waitForOpeningClosed(page, 6_000);

  // Only the one revealed card joined the collection.
  await expect(page.locator(".clean-set-progress")).toContainText("1/50");
});

test("the binder lists all 50 cards and a pulled card can be displayed", async ({ page }) => {
  const coinbud = findCard("Coinbud");
  const state = createInitialState(0);
  state.collection[coinbud.id] = 2;
  await seedState(page, state);
  await page.goto("/");

  await page.locator(".clean-set-progress").click();
  await expect(page.locator(".clean-binder-grid button")).toHaveCount(50);
  await page.locator(".clean-binder-grid button.found").first().click();
  await page.getByRole("button", { name: "DISPLAY IN CASE" }).click();
  await expect(page.locator(".clean-display-toggle.is-displayed")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator(".case-strip-slot.is-filled")).toHaveCount(1);
});

test("effect cards print their rules text with highlighted keywords", async ({ page }) => {
  const scrapactus = findCard("Scrapactus");
  const state = createInitialState(0);
  state.collection[scrapactus.id] = 1;
  await seedState(page, state);
  await page.goto("/");

  await page.locator(".clean-set-progress").click();
  const entry = page.locator(".clean-binder-grid button.found").first();
  await expect(entry).toContainText("25%");
  await expect(entry.locator(".rules-token").first()).toBeVisible();
});
