import { expect, test } from "@playwright/test";
import { SETS } from "../../lib/gameData.js";
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
  await expect(page.getByRole("button", { name: "SELL DUPLICATES" })).toBeVisible();
  await expect(page.locator(".clean-set-progress")).toBeVisible();
  await expect(page.locator(".clean-set-progress")).toContainText("0/48");
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
  await expect(page.locator(".summary-total")).toContainText("SELL PILE");
  await page.screenshot({ path: "test-results/clean-pack-summary.png" });

  await page.getByRole("button", { name: "BACK TO TABLE" }).click();
  await expect(page.locator(".clean-set-progress")).not.toContainText("0/48");
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
  await expect(page.locator(".clean-simple-stats div").first().locator("strong")).toHaveText("2");
});

test("all six cards remain tappable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createInitialState(Date.now());
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await page.screenshot({ path: "test-results/clean-mobile-table.png" });
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
  await page.screenshot({ path: "test-results/clean-mobile-summary.png" });
});

test("a held mobile swipe reveals every face-down card it crosses", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createInitialState(Date.now());
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  await page.waitForTimeout(450);
  const cards = page.locator(".reveal-card");
  const centers = await cards.evaluateAll((nodes) => nodes.slice(0, 4).map((node) => {
    const bounds = node.getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  }));

  await page.mouse.move(centers[0].x, centers[0].y);
  await page.mouse.down();
  await expect(page.locator(".reveal-deck")).toHaveClass(/is-swipe-revealing/);
  for (const center of centers.slice(1)) {
    await page.mouse.move(center.x, center.y, { steps: 4 });
  }
  await page.mouse.up();

  expect(await page.locator(".reveal-card.is-revealed").count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator(".reveal-deck")).not.toHaveClass(/is-swipe-revealing/);
});

test("the large mobile hold control runs complete packs until released", async ({ page }) => {
  test.setTimeout(35_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createInitialState(Date.now());
  state.sealed[SETS[0].id].loose = 4;
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");
  await page.evaluate(() => {
    Math.random = () => 0.99;
  });

  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  const autoControl = page.locator(".mobile-auto-control");
  await expect(autoControl).toBeVisible();
  const bounds = await autoControl.boundingBox();
  expect(bounds.width).toBeGreaterThanOrEqual(360);
  expect(bounds.height).toBeGreaterThanOrEqual(64);

  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect(autoControl).toHaveClass(/is-held/);
  await expect(autoControl).toContainText("RELEASE TO STOP");
  await expect(page.locator(".clean-simple-stats div").first().locator("strong")).toHaveText("2", { timeout: 15_000 });
  await page.mouse.up();

  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible({ timeout: 4_000 });
  const stoppedAt = await page.locator(".reveal-card.is-revealed").count();
  await page.waitForTimeout(1_100);
  await expect(page.locator(".reveal-card.is-revealed")).toHaveCount(stoppedAt);
  await expect(autoControl).not.toHaveClass(/is-held/);
  await page.screenshot({ path: "test-results/clean-mobile-auto.png" });
});

test("the shop reveals product and upgrade choices gradually", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "SHOP", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pack shop" })).toBeVisible();
  await expect(page.getByText("SEALED VALUE")).toHaveCount(0);
  await expect(page.locator(".clean-set-stock")).toHaveCount(5);
  await expect(page.locator(".clean-set-stock.is-stocked")).toHaveCount(1);
  const stockRow = (name) => page.locator(".clean-set-stock").filter({
    has: page.getByRole("heading", { name, exact: true }),
  });
  await expect(stockRow(SETS[1].name)).toContainText(`Find 20 cards in ${SETS[0].name} 0/20`);
  await expect(stockRow(SETS[2].name)).toContainText(`Find 20 cards in ${SETS[1].name} 0/20`);
  await expect(stockRow(SETS.at(-1).name)).toContainText(`Find 20 cards in ${SETS.at(-2).name} 0/20`);
  await expect(stockRow(SETS.at(-1).name)).not.toContainText("chase");
  await expect(page.getByText("Booster box")).toHaveCount(0);
  await expect(page.getByText("THREE SIMPLE TRACKS")).toHaveCount(0);
  await expect(page.locator(".clean-upgrades")).toContainText("Open 5 more packs");
  await expect(page.getByText("Standing orders")).toHaveCount(0);
  await expect(page.getByText("Filing rules")).toHaveCount(0);

  const state = advanceBeat({
    ...createInitialState(Date.now()),
    packsOpened: 25,
    coins: 600,
    collection: Object.fromEntries(SETS[0].cards.slice(0, 24).map((card) => [card.id, 1])),
    bestRarities: Object.fromEntries(SETS[0].cards.slice(0, 24).map((card) => [card.id, card.rarity])),
    settings: { sound: false, reducedEffects: false, quickOpen: true },
    lastSavedAt: Date.now(),
  });
  await seedState(page, state);
  await page.reload();
  await page.getByRole("button", { name: "SHOP", exact: true }).click();
  await expect(page.locator(".clean-set-stock.is-stocked")).toHaveCount(2);
  await expect(page.locator(".clean-upgrade", { hasText: "Dealer tray" })).toBeVisible();
  await page.getByRole("button", { name: `Select ${SETS[1].name}` }).click();
  await expect(page.locator(".clean-set-title")).toContainText(SETS[1].name);
  await page.screenshot({ path: "test-results/clean-shop.png" });
});

test("the empty table shows no shop cue overlay, only the pack label", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createInitialState(Date.now());
  state.sealed[SETS[0].id].loose = 0;
  state.settings.sound = false;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await expect(page.locator(".clean-open-copy")).toContainText("PACKS AVAILABLE IN SHOP");
  await expect(page.locator(".clean-shop-cue")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Buy .* pack/i })).toHaveCount(0);

  await page.screenshot({ path: "test-results/clean-mobile-no-shop-cue.png" });
  await page.getByRole("button", { name: "SHOP", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pack shop" })).toBeVisible();
});

test("clicking an undiscovered card shows its rarity without spoiling the card", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.settings.sound = false;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await page.getByRole("button", { name: "BINDER", exact: true }).click();
  const borderOf = (label) => page.getByRole("button", { name: label }).first()
    .evaluate((node) => getComputedStyle(node).borderTopColor);
  const commonBorder = await borderOf("Missing card 1, show rarity");
  const chaseBorder = await borderOf("Missing card 48, show rarity");
  expect(commonBorder).not.toBe(chaseBorder);
  expect(commonBorder).not.toBe("rgba(255, 255, 255, 0.1)");

  await page.getByRole("button", { name: "Missing card 1, show rarity" }).first().click();
  const detail = page.locator(".clean-card-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Card 01");
  await expect(detail).toContainText("Common");
  await expect(detail).toContainText("~82%");
  await expect(detail).not.toContainText("Alley Sprout");
  await expect(detail.locator(".clean-detail-art.is-missing")).toBeVisible();
  await page.screenshot({ path: "test-results/clean-undiscovered-rarity.png" });
  await detail.getByRole("button", { name: "CLOSE" }).click();
  await expect(detail).toHaveCount(0);

  await page.locator(".clean-binder-grid > button.missing").last().click();
  await expect(page.locator(".clean-card-detail")).toContainText("Card 48");
  await expect(page.locator(".clean-card-detail .clean-detail-effect")).toBeVisible();
  await expect(page.locator(".clean-card-detail .clean-detail-art.is-missing")).toBeVisible();
});

test("the display case holds cards whose unique effects augment the game", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.collection = { "corner-02": 2 };
  state.bestRarities = { "corner-02": "common" };
  state.settings.sound = false;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await expect(page.locator(".case-strip").first()).toBeVisible();

  await page.getByRole("button", { name: "BINDER", exact: true }).click();
  await page.getByRole("button", { name: "Pavement Pigeon, 2 copies" }).click();
  const detail = page.locator(".clean-card-detail");
  await expect(detail).toContainText("DISPLAY EFFECT");
  await expect(detail).toContainText("When you reveal a Common");
  await detail.getByRole("button", { name: "DISPLAY IN CASE" }).click();
  await expect(detail.getByRole("button", { name: "UNSEAT FROM CASE" })).toBeVisible();
  await detail.getByRole("button", { name: "CLOSE" }).click();
  await expect(page.locator(".clean-binder-grid")).toContainText("ON DISPLAY");
  await expect(page.locator(".case-strip-slot.is-filled").first()).toBeVisible();

  await page.getByRole("button", { name: /^CASE/ }).click();
  const caseDrawer = page.locator(".clean-case");
  await expect(caseDrawer).toBeVisible();
  await expect(caseDrawer).toContainText("Pavement Pigeon");
  await expect(caseDrawer).toContainText("1/1 slots filled");
  await expect(caseDrawer.locator(".clean-case-slot.is-locked")).toHaveCount(5);
  await expect(caseDrawer).toContainText("Rewrite");
  await page.screenshot({ path: "test-results/clean-display-case.png" });

  await caseDrawer.getByRole("button", { name: "UNSEAT" }).click();
  await expect(caseDrawer).toContainText("0/1 slots filled");
});

test("holding a shop pack price rapidly buys that selected set and stops on release", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.coins = 200;
  state.lifetimeCoins = 200;
  state.settings.sound = false;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");
  await page.getByRole("button", { name: "SHOP", exact: true }).click();

  const row = page.locator(".clean-set-stock").filter({
    has: page.getByRole("heading", { name: SETS[0].name, exact: true }),
  });
  const buy = row.getByRole("button", { name: new RegExp(`Buy ${SETS[0].name} pack`) });
  await expect(row.locator(".clean-owned")).toHaveText("3 owned");
  const bounds = await buy.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect(buy).toHaveClass(/is-repeating/, { timeout: 1_000 });
  await page.waitForTimeout(520);
  await page.mouse.up();

  const boughtCount = Number.parseInt(await row.locator(".clean-owned").innerText(), 10);
  expect(boughtCount).toBeGreaterThan(5);
  await page.waitForTimeout(500);
  await expect(row.locator(".clean-owned")).toHaveText(`${boughtCount} owned`);
});

test("legendary pulls retain the full impact treatment", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const state = createInitialState(Date.now());
  state.packsOpened = 1;
  state.manualPacks = 1;
  state.pityLegendary = 10_000;
  state.sealed[SETS[0].id].loose = 1;
  state.settings = { sound: false, reducedEffects: false, quickOpen: true };
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");
  await expect(page.locator(".loading-screen")).toHaveCount(0);
  await page.evaluate(() => {
    Math.random = () => 0.0015;
  });
  await page.getByRole("button", { name: /Open a pack/ }).click();
  expect(pageErrors).toEqual([]);
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  const legendary = page.locator(".reveal-card.rarity-legendary").first();
  await expect(legendary).toBeVisible();
  await legendary.hover();
  await legendary.click();
  await expect(page.locator(".opening-impact.impact-legendary")).toBeVisible();
  await page.screenshot({ path: "test-results/clean-legendary-impact.png" });
});

test("the Nameless tier uses its shifting border treatment", async ({ page }) => {
  const collection = Object.fromEntries(SETS.slice(0, -1).flatMap((set) => (
    set.cards.map((card) => [card.id, 1])
  )));
  const state = advanceBeat({
    ...createInitialState(Date.now()),
    collection,
    activeSet: SETS.at(-1).id,
  });
  state.sealed[SETS.at(-1).id].loose = 1;
  state.settings = { sound: false, reducedEffects: false, quickOpen: true };
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");
  await expect(page.locator(".loading-screen")).toHaveCount(0);
  await page.evaluate(() => {
    Math.random = () => 0;
  });

  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  const nameless = page.locator(".reveal-card.rarity-nameless").first();
  await expect(nameless).toBeVisible();
  await nameless.click();
  const border = nameless.locator(".rarity-border-fx");
  await expect(border).toBeVisible();
  expect(await border.evaluate((node) => getComputedStyle(node).animationName)).toContain("rarity-nameless-flicker");
  await page.waitForTimeout(750);
  await page.screenshot({ path: "test-results/clean-nameless.png" });
});

test("duplicate selling keeps one copy and pays cash from the table", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.collection = { "corner-01": 3, "corner-06": 2 };
  state.bestRarities = { "corner-01": "rare", "corner-06": "mythic" };
  state.duplicateBank = 42;
  state.settings.sound = false;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  const sell = page.getByRole("button", { name: "SELL DUPLICATES" });
  await expect(sell).toContainText("3 CARDS");
  await sell.click();
  await expect(sell).toContainText("NO EXTRA COPIES");
  await expect(page.locator(".clean-wallet strong")).toContainText("42");
  await expect(page.locator(".clean-set-progress")).toContainText("2/48");
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
  await expect(page.locator(".clean-set-progress")).toBeVisible();
  const packBounds = await page.locator(".clean-pack-clicker").boundingBox();
  expect(packBounds.x).toBeGreaterThanOrEqual(0);
  expect(packBounds.x + packBounds.width).toBeLessThanOrEqual(800);
  expect(packBounds.y + packBounds.height).toBeLessThanOrEqual(450);
  await page.screenshot({ path: "test-results/clean-compact.png" });
});
