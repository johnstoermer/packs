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
  await expect(page.getByRole("button", { name: "SELL DUPLICATES" })).toHaveCount(0);
  await expect(page.locator(".clean-topbar nav")).toHaveCount(0);
  await expect(page.locator(".clean-set-progress")).toBeVisible();
  await expect(page.locator(".clean-set-progress")).toContainText("0/98");
  await expect(page.locator(".clean-pack-station > .clean-simple-stats")).toBeVisible();
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
  await expect(first.locator(".rarity-signal")).toHaveText("");
  await page.screenshot({ path: "test-results/clean-pack-signals.png" });

  await revealAll(page);
  await expect(page.locator(".opening-layer.phase-summary")).toBeVisible({ timeout: 6_000 });
  await expect(page.locator(".reveal-card.is-revealed")).toHaveCount(6);
  await expect(page.locator(".summary-total")).toContainText("PACK RESULTS");
  await page.screenshot({ path: "test-results/clean-pack-summary.png" });

  await page.getByRole("button", { name: "BACK TO TABLE" }).click();
  await expect(page.locator(".clean-set-progress")).not.toContainText("0/98");
  await page.locator(".clean-set-progress").click();
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

test("the top bar is only the brand and wallet, with options on the corner gear", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".clean-topbar .clean-brand")).toContainText("PACKWORKS");
  await expect(page.locator(".clean-topbar .clean-wallet")).toBeVisible();
  await expect(page.locator(".clean-topbar nav")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "SHOP", exact: true })).toHaveCount(0);
  await expect(page.locator(".clean-upgrades")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator(".clean-settings")).toBeVisible();
  await expect(page.locator(".clean-settings-options > button")).toHaveCount(3);
  await expect(page.locator(".clean-settings")).toContainText("Sound");
  await expect(page.locator(".clean-settings")).toContainText("Haptics");
  await expect(page.locator(".clean-settings")).toContainText("Reset save");
});

test("clicking an empty pack stack buys and opens without visiting a shop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createInitialState(Date.now());
  state.sealed[SETS[0].id].loose = 0;
  state.coins = 200;
  state.lifetimeCoins = 200;
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await expect(page.locator(".clean-open-copy")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Buy and open a pack/ })).toBeVisible();
  await page.getByRole("button", { name: /Buy and open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  await expect(page.locator(".clean-wallet strong")).not.toHaveText("200");
  await expect(page.getByRole("heading", { name: "Pack shop" })).toHaveCount(0);
});

test("clicking an undiscovered card shows its rarity without spoiling the card", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.settings.sound = false;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await page.locator(".clean-set-progress").click();
  await expect(page.locator(".clean-binder-tools")).toBeVisible();
  await expect(page.locator(".clean-binder-grid > button")).toHaveCount(98);

  await page.getByRole("button", { name: "Missing card 1, show rarity" }).first().click();
  const detail = page.locator(".clean-card-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Card 01");
  await expect(detail).toContainText("Common");
  await expect(detail).toContainText("~82%");
  await expect(detail).not.toContainText("Coinbud");
  await expect(detail.locator(".clean-detail-art.is-missing")).toBeVisible();
  await page.screenshot({ path: "test-results/clean-undiscovered-rarity.png" });
  await detail.getByRole("button", { name: "CLOSE" }).click();
  await expect(detail).toHaveCount(0);

  await page.getByRole("button", { name: "Missing card 98, show rarity" }).click();
  await expect(page.locator(".clean-card-detail")).toContainText("Card 98");
  await expect(page.locator(".clean-card-detail .clean-detail-effect")).toHaveCount(0);
  await expect(page.locator(".clean-card-detail .clean-detail-art.is-missing")).toBeVisible();
  await expect(page.locator(".clean-card-detail .card-zoom-back")).toBeVisible();
  await expect(page.locator(".clean-card-detail .card-front")).toHaveCount(0);
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

  await page.locator(".clean-set-progress").click();
  await page.getByRole("button", { name: /Pennigeon, 1 cop/ }).click();
  const detail = page.locator(".clean-card-detail");
  await expect(detail.locator(".clean-detail-art .card-front")).toBeVisible();
  await expect(detail.locator("canvas")).toHaveCount(0);
  await expect(detail.locator(".clean-detail-copy")).toHaveCount(0);
  await expect(detail).toContainText("Whenever you reveal a Common");
  await expect(detail.locator(".card-head")).toContainText("Pennigeon");
  await expect(detail.locator(".card-copy > strong")).toHaveCount(0);
  expect(await detail.locator(".card-rules-copy").evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await detail.getByRole("button", { name: "DISPLAY IN CASE" }).click();
  await expect(detail.getByRole("button", { name: "UNSEAT FROM CASE" })).toBeVisible();
  await detail.getByRole("button", { name: "CLOSE" }).click();
  await expect(page.locator(".clean-binder-grid")).toContainText("ON DISPLAY");
  await expect(page.locator(".case-strip-slot.is-filled").first()).toBeVisible();

  await page.getByRole("button", { name: "Close binder" }).click();
  await page.locator(".case-strip-label").first().click();
  const caseDrawer = page.locator(".clean-case");
  await expect(caseDrawer).toBeVisible();
  await expect(caseDrawer).toContainText("Pennigeon");
  await expect(caseDrawer).toContainText("1/1 available slots filled");
  await expect(caseDrawer.locator(".clean-case-slot.is-locked")).toHaveCount(5);
  await expect(caseDrawer).toContainText("Rewrite");
  await page.screenshot({ path: "test-results/clean-display-case.png" });

  await caseDrawer.getByRole("button", { name: "UNSEAT" }).click();
  await expect(caseDrawer).toContainText("0/1 available slots filled");
});

test("holding Space buys the next pack automatically when stock reaches zero", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.coins = 200;
  state.lifetimeCoins = 200;
  state.sealed[SETS[0].id].loose = 0;
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");
  await page.getByRole("button", { name: /Buy and open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  await revealAll(page);
  await expect(page.locator(".opening-layer.phase-summary")).toBeVisible({ timeout: 6_000 });
  await page.keyboard.down("Space");
  await expect(page.locator(".clean-simple-stats div").first().locator("strong")).toHaveText("2", { timeout: 4_000 });
  await page.keyboard.up("Space");
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pack shop" })).toHaveCount(0);
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
  await expect(legendary.locator(".back-mark")).toHaveCSS("visibility", "hidden");
  await expect(page.locator(".opening-impact.impact-legendary")).toBeVisible();
  await page.waitForTimeout(950);
  const legendaryFace = legendary.locator(".card-front");
  const legendaryBack = legendary.locator(".card-back");
  expect(await legendaryFace.evaluate((node) => getComputedStyle(node).transform)).not.toBe("none");
  await expect(legendaryFace).toHaveCSS("backface-visibility", "hidden");
  await expect(legendaryBack).toHaveCSS("visibility", "hidden");
  await expect(legendaryBack).toHaveCSS("opacity", "0");
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
  expect(await border.evaluate((node) => getComputedStyle(node).animationName)).toContain("league-nameless-glitch");
  await page.waitForTimeout(750);
  await page.screenshot({ path: "test-results/clean-nameless.png" });
});

test("reveals fire haptic pulses through the vibration API when enabled", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.addInitScript(() => {
    window.__vibrations = [];
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 2 });
    navigator.vibrate = (pattern) => {
      // Ignore cancel calls (vibrate(0)) — only count real pulses.
      const shape = Array.isArray(pattern) ? pattern : [pattern];
      if (shape.some((ms) => ms > 0)) window.__vibrations.push(pattern);
      return true;
    };
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Open a pack/ })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const haptics = page.locator(".clean-settings-options > button").filter({ hasText: "Haptics" });
  await expect(haptics).toContainText("ON");
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible({ timeout: 6_000 });
  await revealAll(page);
  await expect(page.locator(".opening-layer.phase-summary")).toBeVisible({ timeout: 6_000 });
  const withHaptics = await page.evaluate(() => window.__vibrations.length);
  expect(withHaptics).toBeGreaterThanOrEqual(7); // pack open + six reveals

  await page.getByRole("button", { name: "BACK TO TABLE" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await haptics.click();
  await expect(haptics).toContainText("OFF");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const beforeMuted = await page.evaluate(() => window.__vibrations.length);
  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible({ timeout: 6_000 });
  await revealAll(page);
  await expect(page.locator(".opening-layer.phase-summary")).toBeVisible({ timeout: 6_000 });
  const afterMuted = await page.evaluate(() => window.__vibrations.length);
  expect(afterMuted).toBe(beforeMuted);
});

test("duplicates auto-sell on load and their values stream toward the wallet", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.collection = { "corner-01": 3, "corner-02": 2 };
  state.bestRarities = { "corner-01": "rare", "corner-02": "common" };
  state.duplicateBank = 42;
  state.settings.sound = false;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await expect(page.getByRole("button", { name: "SELL DUPLICATES" })).toHaveCount(0);
  await expect(page.locator(".cash-stream-value").first()).toBeVisible();
  await expect(page.locator(".clean-wallet strong")).not.toHaveText("10");
  await expect(page.locator(".clean-set-progress")).toContainText("2/98");
});

test("Salvage erupts into a roaming blast of small cards", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.collection = { "tideworks-01": 100 };
  state.bestRarities = { "tideworks-01": "common" };
  state.duplicateBank = 990;
  state.displayed = [{ id: "tideworks-01", at: Date.now() }];
  state.settings.sound = false;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await expect(page.locator(".global-burst.burst-salvage")).toBeVisible();
  await expect(page.locator(".global-burst.burst-salvage .global-burst-card")).toHaveCount(18);
  const origin = await page.locator(".global-burst-pack").boundingBox();
  expect(origin.x).toBeGreaterThan(0);
  expect(origin.y).toBeGreaterThan(64);
  await expect(page.locator(".cash-stream-value").first()).toBeVisible();
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

test("the card lab exposes every standard, holo, filter, zoom, and flip state", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/review/");

  await expect(page.getByRole("heading", { name: "Card Lab" })).toBeVisible();
  await expect(page.locator(".review-grid-item")).toHaveCount(98);
  await expect(page.locator("kbd")).toHaveCount(0);
  await expect(page.locator(".review-logo img")).toHaveCount(0);
  await expect(page.locator(".review-logo")).toContainText("PACKWORKS");
  await expect(page.locator(".review-logo .clean-brand-mark i")).toHaveCount(3);

  const mechanics = page.locator(".mechanic-simulator");
  await expect(mechanics.getByRole("heading", { name: "Mechanics Arena" })).toBeVisible();
  await expect(mechanics.locator(".mechanic-selector button")).toHaveCount(14);
  await expect(mechanics.locator(".mechanic-visual")).toHaveAttribute("data-mechanic", "discover");
  const insight = mechanics.locator(".mechanic-discover .discover-card").filter({ hasText: "Insight" });
  await insight.click();
  await expect(insight).toHaveClass(/is-picked/);

  await mechanics.locator(".mechanic-selector button").nth(5).click();
  await expect(mechanics.locator(".mechanic-visual")).toHaveAttribute("data-mechanic", "fusion");
  await expect(mechanics.locator(".mechanic-fusion")).toBeVisible();
  await expect(mechanics.locator("canvas")).toHaveCount(0);
  await mechanics.getByRole("button", { name: "BROADCAST" }).click();
  await expect(mechanics).toHaveClass(/fx-broadcast/);

  const priorRun = await mechanics.locator(".mechanic-visual").getAttribute("data-run");
  await mechanics.getByRole("button", { name: "REPLAY EFFECT" }).click();
  await expect.poll(() => mechanics.locator(".mechanic-visual").getAttribute("data-run")).not.toBe(priorRun);

  await mechanics.getByRole("button", { name: "FOCUS VIEW" }).click();
  await expect(mechanics).toHaveClass(/is-focused/);
  await mechanics.getByRole("button", { name: "EXIT FOCUS" }).click();
  await expect(mechanics).not.toHaveClass(/is-focused/);

  const turn = page.getByRole("button", { name: "Reveal Coinbud" });
  await turn.click();
  await expect(page.getByRole("button", { name: "Turn Coinbud" })).toBeVisible();
  await page.waitForTimeout(720);
  await expect(page.getByRole("button", { name: "Turn Coinbud" }).locator(".card-front")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);

  await page.getByRole("button", { name: "STANDARD" }).click();
  await expect(page.locator(".review-grid .is-pixel-animated")).toHaveCount(0);
  await page.locator(".review-controls select").first().selectOption(SETS[0].id);
  await expect(page.locator(".review-grid-item")).toHaveCount(98);
  await page.getByPlaceholder("Try Echo, Salvage, Mark…").fill("Echo");
  expect(await page.locator(".review-grid-item").count()).toBeGreaterThan(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await mechanics.scrollIntoViewIfNeeded();
  expect(await mechanics.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
});
