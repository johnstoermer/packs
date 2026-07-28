import { expect, test } from "@playwright/test";
import { LEGACY_CARD_MAP, SETS, getCard } from "../../lib/gameData.js";
import { SAVE_KEY, advanceBeat, createInitialState, displayCard } from "../../lib/gameLogic.js";

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

async function waitForCollection(page, timeout = 7_000) {
  await expect(page.locator(".opening-layer.phase-collecting")).toBeVisible({ timeout });
  await expect(page.locator(".reveal-deck")).toHaveCSS("animation-name", "league-deck-collect");
  await expect(page.locator(".opening-layer")).toHaveCount(0, { timeout: 3_000 });
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
  const collection = page.locator(".clean-set-progress");
  await expect(collection).toBeVisible();
  await expect(collection.locator("header strong")).toHaveText("COLLECTION");
  await expect(collection).toContainText("0/98");
  await expect(page.locator(".clean-simple-stats")).toHaveCount(0);
  await expect(page.getByText("PACKS OPENED", { exact: true })).toHaveCount(0);
  await expect(page.getByText("PACKS READY", { exact: true })).toHaveCount(0);
  expect(await collection.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return Math.round(bounds.left + bounds.width / 2 - window.innerWidth / 2);
  })).toBe(0);
  await expect(page.getByText("MANUAL HEAT")).toHaveCount(0);
  await expect(page.getByText("RULES", { exact: true })).toHaveCount(0);
  await expect(page.getByText("PLAY", { exact: true })).toHaveCount(0);
  await expect(page.locator(".pw-beat-rail")).toHaveCount(0);
  await page.screenshot({ path: "test-results/clean-table.png" });

  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible({ timeout: 6_000 });
  await expect(page.locator(".reveal-card")).toHaveCount(6);
  await expect(page.locator(".case-strip")).toHaveCount(1);
  await expect(page.locator(".clean-stage")).toBeVisible();
  await expect(page.locator(".clean-set-progress")).toBeVisible();
  await expect(page.locator(".clean-simple-stats")).toHaveCount(0);
  await expect(page.locator(".opening-layer")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".opening-topline")).toHaveCount(0);

  const first = page.locator(".reveal-card").first();
  await first.hover();
  await expect(first.locator(".rarity-signal")).toHaveCount(0);
  await expect(page.locator(".opening-instruction")).toHaveCount(0);
  await expect(page.getByText("HOVER FOR RARITY")).toHaveCount(0);
  await page.screenshot({ path: "test-results/clean-pack.png" });

  await revealAll(page);
  await expect(page.getByText("PACK RESULTS")).toHaveCount(0);
  await expect(page.locator(".card-art-index, .card-art-grade, .card-print-mark, .pw-misprint-stamp")).toHaveCount(0);
  await expect(page.locator('[class*="treatment-"]')).toHaveCount(0);
  await expect(page.locator(".card-identity small")).toHaveCount(0);
  await expect(page.getByText(/PW-\d+|PW\s*\/\s*\d+/)).toHaveCount(0);
  await waitForCollection(page);
  await expect(page.locator(".clean-set-progress")).not.toContainText("0/98");
  await page.locator(".clean-set-progress").click();
  await expect(page.locator(".clean-binder-grid button.found").first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("the pack rotunda presents every real pack type without duplicating wrapper details", async ({ page }) => {
  // Bankrolled on purpose: a pack you cannot afford greys out and swaps its
  // description for the shortfall, which the next test covers.
  const state = createInitialState(Date.now());
  state.coins = 50_000_000;
  state.lifetimeCoins = 50_000_000;
  state.settings.sound = false;
  state.lastSavedAt = Date.now();
  await seedState(page, advanceBeat(state));
  await page.goto("/");

  const arrow = page.getByRole("button", { name: "Next pack type" });
  await expect(page.getByRole("button", { name: "Previous pack type" })).toBeVisible();
  await expect(arrow).toBeVisible();
  await expect(arrow.locator("svg")).toHaveCount(1);
  await expect(arrow).toHaveCSS("border-top-width", "3px");

  const expected = [
    {
      name: "Standard",
      price: "100 CASH",
      description: "Standard distribution.",
      creatures: "Bankslime, Coinbud, and Packross",
    },
    {
      name: "Rare",
      price: "10,000 CASH",
      description: "Common and Uncommon removed.",
      creatures: "Echowl, Portalink, and Catalystag",
    },
    {
      name: "Mega Standard",
      price: "10,000 CASH",
      description: "Standard distribution.",
      creatures: "Rootpack, Absolumute, and Reverbogre",
    },
    {
      name: "Mega Rare",
      price: "1,000,000 CASH",
      description: "Common and Uncommon removed.",
      creatures: "Omniecho, Prismorph, and Luxquest",
    },
    {
      name: "Collector",
      price: "10,000 CASH",
      description: "Standard distribution with a guaranteed foil.",
      creatures: "Foilmonk, Foilvan, and Foilpress",
    },
  ];

  for (const [index, packType] of expected.entries()) {
    await expect(page.locator(".clean-pack-station .pack-title strong")).toHaveText(packType.name);
    await expect(page.locator(".pack-type-copy strong")).toHaveText(packType.price);
    await expect(page.locator(".pack-type-copy small")).toHaveText(packType.description);
    await expect(page.locator(".clean-pack-station .pack-creature-scene")).toHaveAttribute("aria-label", packType.creatures);
    if (index < expected.length - 1) await arrow.click();
  }

  await arrow.click();
  await expect(page.locator(".clean-pack-station .pack-title strong")).toHaveText("Standard");
});

test("a pack you cannot afford greys out until the cash is there", async ({ page }) => {
  await page.goto("/");
  const station = page.locator(".clean-pack-station");
  const arrow = page.getByRole("button", { name: "Next pack type" });

  // A fresh save opens with sealed Standard packs on hand, so Standard reads
  // as available even at zero cash.
  await expect(station).not.toHaveClass(/is-unaffordable/);
  await expect(page.locator(".pack-type-copy small")).toHaveText("Standard distribution.");

  // Rare costs 10,000 and there is no stock of it.
  await arrow.click();
  await expect(station).toHaveClass(/is-unaffordable/);
  await expect(page.locator(".pack-type-copy small")).toHaveText("NOT ENOUGH CASH");
  await expect(page.locator(".clean-pack-clicker")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator(".clean-pack-clicker")).toHaveAttribute("aria-label", /Not enough cash/);
  const filter = await page.locator(".clean-pack-station.is-unaffordable .clean-pack-stack")
    .evaluate((node) => getComputedStyle(node).filter);
  expect(filter).toContain("grayscale");

  // Same pack, funded: the grey lifts and the description comes back.
  const funded = createInitialState(Date.now());
  funded.coins = 50_000_000;
  funded.lifetimeCoins = 50_000_000;
  funded.settings.sound = false;
  funded.lastSavedAt = Date.now();
  await seedState(page, advanceBeat(funded));
  await page.goto("/");
  await arrow.click();
  await expect(station).toHaveClass(/clean-pack-station/);
  await expect(station).not.toHaveClass(/is-unaffordable/);
  await expect(page.locator(".pack-type-copy small")).toHaveText("Common and Uncommon removed.");
  await expect(page.locator(".clean-pack-clicker")).not.toHaveAttribute("aria-disabled", "true");
});

test("desktop mounts at most 72 cards", async ({ page }) => {
  const fractureId = SETS[0].cards.find((card) => card.name === "Dawnrift").id;
  const locklureId = SETS[0].cards.find((card) => card.name === "Locklure").id;
  const state = createInitialState(Date.now());
  state.coins = 10_000;
  state.lifetimeCoins = 10_000;
  state.collection = { [fractureId]: 1, [locklureId]: 1 };
  state.bestRarities = {
    [fractureId]: getCard(fractureId).rarity,
    [locklureId]: getCard(locklureId).rarity,
  };
  state.displayed = [
    { id: fractureId, at: Date.now() },
    { id: locklureId, at: Date.now() + 1 },
  ];
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, advanceBeat(state));
  await page.goto("/");
  await page.evaluate(() => {
    Math.random = () => 0;
  });

  await page.getByRole("button", { name: "Next pack type" }).click();
  await page.getByRole("button", { name: "Next pack type" }).click();
  await page.getByRole("button", { name: /Buy and open a pack: Mega Standard/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  await expect(page.locator(".reveal-card")).toHaveCount(72);
  await expect(page.getByRole("button", { name: "FINISH" })).toHaveCount(0);
  await page.waitForTimeout(2_000);
  await expect(page.locator(".opening-overflow-count")).toContainText(/^\d+ CARDS NOT ON SCREEN$/);

  const viewport = page.viewportSize();
  const bounds = await page.locator(".reveal-card").evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  }));
  for (const box of bounds) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewport.width);
    expect(box.bottom).toBeLessThanOrEqual(viewport.height);
  }

  await page.screenshot({ path: "test-results/clean-mega-pack.png" });
});

test("FINISH appears on the 100th reveal, never earlier", async ({ page }) => {
  const locklureId = SETS[0].cards.find((card) => card.name === "Locklure").id;
  const state = createInitialState(Date.now());
  state.coins = 10_000;
  state.lifetimeCoins = 10_000;
  state.collection = { [locklureId]: 1 };
  state.bestRarities = { [locklureId]: getCard(locklureId).rarity };
  state.displayed = [{ id: locklureId, at: Date.now() }];
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, advanceBeat(state));
  await page.goto("/");
  await page.evaluate(() => {
    Math.random = () => 0;
  });

  await page.getByRole("button", { name: "Next pack type" }).click();
  await page.getByRole("button", { name: "Next pack type" }).click();
  await page.getByRole("button", { name: /Buy and open a pack: Mega Standard/ }).click();
  const opening = page.locator(".opening-layer");
  await expect(opening).toHaveClass(/phase-ready/);

  for (let target = 1; target <= 99; target += 1) {
    const next = page.locator(".reveal-card.is-revealable").first();
    await expect(next).toBeVisible();
    await next.evaluate((node) => node.click());
    await expect(opening).toHaveAttribute("data-revealed-count", String(target));
  }
  await expect(page.getByRole("button", { name: "FINISH" })).toHaveCount(0);

  const hundredth = page.locator(".reveal-card.is-revealable").first();
  await expect(hundredth).toBeVisible();
  await hundredth.evaluate((node) => node.click());
  await expect(opening).toHaveAttribute("data-revealed-count", "100");
  await expect(page.getByRole("button", { name: "FINISH" })).toBeVisible();
});

test("mobile lays out up to eighteen cards in fixed rows of six", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createInitialState(Date.now());
  state.coins = 10_000;
  state.lifetimeCoins = 10_000;
  state.discoverStack = { acceleration: 1, reflection: 1 };
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await page.getByRole("button", { name: "Next pack type" }).click();
  await page.getByRole("button", { name: "Next pack type" }).click();
  await page.getByRole("button", { name: /Buy and open a pack: Mega Standard/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  await expect(page.locator(".reveal-card")).toHaveCount(18);
  await expect(page.locator(".opening-overflow-count")).toHaveText("18 CARDS NOT ON SCREEN");
  await page.waitForTimeout(2_000);
  const mobileWidths = await page.locator(".reveal-card").evaluateAll(
    (nodes) => nodes.map((node) => node.getBoundingClientRect().width),
  );
  expect(Math.min(...mobileWidths)).toBeGreaterThan(70);
  const rows = await page.locator(".reveal-card").evaluateAll((nodes) => {
    const offsets = nodes.map((node) => node.style.getPropertyValue("--rowoff"));
    return [...new Set(offsets)].map((offset) => offsets.filter((candidate) => candidate === offset).length);
  });
  expect(rows).toEqual([6, 6, 6]);
  await expect(page.locator(".stage-case-dock")).toBeVisible();
  await expect(page.locator(".discover-stack")).toBeVisible();
  await page.screenshot({ path: "test-results/clean-mobile-overflow.png" });
  const cards = page.locator(".reveal-card");
  for (let index = 0; index < await cards.count(); index += 1) {
    await cards.nth(index).evaluate((node) => node.click());
  }
  await expect(page.getByRole("button", { name: "FINISH" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/clean-mobile-batch-filed.png" });
  await expect(page.locator(".opening-layer.phase-filing")).toBeVisible();
  await expect(page.locator(".reveal-card")).toHaveCount(18);
});

test("mobile keeps a standard six-card pack in one row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createInitialState(Date.now());
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  await expect(page.locator(".reveal-card")).toHaveCount(6);
  await page.waitForTimeout(1_500);
  const rowOffsets = await page.locator(".reveal-card").evaluateAll(
    (nodes) => [...new Set(nodes.map((node) => node.style.getPropertyValue("--rowoff")))],
  );
  expect(rowOffsets).toEqual(["0"]);
});

test("holding Space reveals cards in order and releasing stops the sequence", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");
  await page.evaluate(() => {
    Math.random = () => 0.99;
  });

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
  await expect(page.locator(".clean-pack-clicker")).toHaveAttribute("aria-label", /1 ready/, { timeout: 10_000 });
  await page.keyboard.up("Space");
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
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
  await expect(page.locator(".opening-layer.phase-collecting")).toBeVisible({ timeout: 6_000 });
  await page.screenshot({ path: "test-results/clean-mobile-collecting.png" });
  await expect(page.locator(".opening-layer")).toHaveCount(0, { timeout: 3_000 });
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
  await expect(page.locator(".clean-pack-clicker")).toHaveAttribute("aria-label", /2 ready/, { timeout: 15_000 });
  await page.mouse.up();

  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible({ timeout: 4_000 });
  const stoppedAt = await page.locator(".reveal-card.is-revealed").count();
  await page.waitForTimeout(1_100);
  await expect(page.locator(".reveal-card.is-revealed")).toHaveCount(stoppedAt);
  await expect(autoControl).not.toHaveClass(/is-held/);
  await page.screenshot({ path: "test-results/clean-mobile-auto.png" });
});

test("the PACKWORKS title opens centered game options with no settings wheel", async ({ page }) => {
  await page.goto("/");
  const title = page.getByRole("button", { name: "PACKWORKS game options" });
  await expect(title).toContainText("PACKWORKS");
  await expect(page.locator(".clean-topbar .clean-wallet")).toBeVisible();
  await expect(page.locator(".clean-topbar nav")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "SHOP", exact: true })).toHaveCount(0);
  await expect(page.locator(".clean-upgrades")).toHaveCount(0);
  await expect(page.locator(".clean-settings-gear")).toHaveCount(0);
  await title.click();
  await expect(title).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".clean-settings")).toBeVisible();
  await expect(page.locator(".clean-settings-options > button")).toHaveCount(3);
  await expect(page.locator(".clean-settings")).toContainText("Sound");
  await expect(page.locator(".clean-settings")).toContainText("Haptics");
  await expect(page.locator(".clean-settings")).toContainText("Reset save");
  await expect.poll(async () => page.locator(".clean-settings").evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return {
      x: Math.round(bounds.left + bounds.width / 2 - window.innerWidth / 2),
      y: Math.round(bounds.top + bounds.height / 2 - window.innerHeight / 2),
    };
  })).toEqual({ x: 0, y: 0 });
});

test("Locklure shakes its display slot when it adds a Common card", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.collection["crown-11"] = 1;
  state.displayed = [{ id: "crown-11", at: Date.now() }];
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");
  await page.evaluate(() => {
    Math.random = () => 0;
  });

  const slot = page.locator(".case-strip-slot.is-filled").first();
  await expect(slot).toHaveAttribute("title", "Locklure");
  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".reveal-card")).toHaveCount(6);
  await page.locator(".reveal-card").first().click();

  await expect(page.locator(".reveal-card")).toHaveCount(7);
  await expect(slot).toHaveClass(/is-triggered/);
  await expect(slot).toHaveClass(/fx-trigger/);
  await expect(slot).toHaveCSS("animation-name", "league-strip-trigger");
  await expect(slot).toHaveAttribute("data-fx", /\d+/);
});

test("Fusion immediately replaces the earlier card and reveals it through display triggers", async ({ page }) => {
  const fusionId = LEGACY_CARD_MAP["verdant-12"];
  const fusedRevealId = LEGACY_CARD_MAP["verdant-02"];
  const fusionName = getCard(fusionId).name;
  const fusedRevealName = getCard(fusedRevealId).name;
  const state = createInitialState(Date.now());
  state.collection = Object.fromEntries(SETS[0].cards.map((card) => [card.id, 1]));
  state.bestRarities = Object.fromEntries(SETS[0].cards.map((card) => [card.id, card.rarity]));
  state.displayed = [
    { id: fusionId, at: Date.now() },
    { id: LEGACY_CARD_MAP["crown-11"], at: Date.now() + 1 },
    { id: fusedRevealId, at: Date.now() + 2 },
  ];
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, advanceBeat(state));
  await page.goto("/");
  await page.evaluate(() => {
    Math.random = () => 0.99;
  });

  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  const first = page.locator(".reveal-card").nth(0);
  await first.click();
  const firstRevealLabel = await first.getAttribute("aria-label");
  await page.locator(".reveal-card").nth(1).click();

  await expect(page.locator(".opening-fusion-notice")).toContainText("FUSION");
  await expect(first).toHaveClass(/is-revealed/);
  await expect(first).toHaveClass(/rarity-uncommon/);
  await expect.poll(() => first.getAttribute("aria-label")).not.toBe(firstRevealLabel);
  await expect(page.locator(`.case-strip-slot[title="${fusionName}"]`)).toHaveClass(/is-triggered/);
  await expect(page.locator(`.case-strip-slot[title="${fusedRevealName}"]`)).toHaveClass(/is-triggered/);
});

test("generated Mystery cards auto-reveal through the live opening", async ({ page }) => {
  const locklureId = LEGACY_CARD_MAP["crown-11"];
  const salvageId = LEGACY_CARD_MAP["frontier-01"];
  const state = createInitialState(Date.now());
  state.collection = Object.fromEntries(SETS[0].cards.map((card) => [card.id, 1]));
  state.bestRarities = Object.fromEntries(SETS[0].cards.map((card) => [card.id, card.rarity]));
  state.displayed = [
    { id: locklureId, at: Date.now() },
    { id: salvageId, at: Date.now() + 1 },
  ];
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, advanceBeat(state));
  await page.goto("/");
  await page.evaluate(() => {
    Math.random = () => 0;
  });

  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  await page.locator(".reveal-card").first().click();

  await expect(page.locator(".reveal-card")).toHaveCount(72);
  await expect.poll(
    () => page.locator(".reveal-card.is-revealed").count(),
    { timeout: 5_000 },
  ).toBeGreaterThan(1);
  await expect(page.locator('.case-strip-slot[title="Locklure"]')).toHaveClass(/is-triggered/);
});

// Regalynx reveals a card every 1,000 cash earned. With no pack open that
// card resolves straight into the binder, so it gets a burst of its own.
function seedQuietRevealState() {
  const state = createInitialState(Date.now());
  state.packsOpened = 400;
  state.collection = Object.fromEntries(SETS[0].cards.map((card) => [card.id, 1]));
  state.bestRarities = Object.fromEntries(SETS[0].cards.map((card) => [card.id, card.rarity]));
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  // Seat it through displayCard: seating stamps the card's threshold counter
  // at the cash earned so far, so a hand-written `displayed` array would start
  // crediting from the seeded total and never fire. Cash arrives after, which
  // is the real order of events anyway.
  const regalynx = SETS[0].cards.find((card) => card.name === "Regalynx").id;
  const seated = displayCard(advanceBeat(state), regalynx, Date.now());
  if (!seated.displayed.length) throw new Error("Regalynx was not seated");
  return { ...seated, coins: 40_000, lifetimeCoins: 40_000 };
}

test("a card revealed with no pack open gets its own burst", async ({ page }) => {
  await seedState(page, seedQuietRevealState());
  await page.goto("/");
  await expect(page.locator(".opening-layer")).toHaveCount(0);

  // The idle sweep runs on a 2s interval.
  const burst = page.locator(".burst-reveal").first();
  await expect(burst).toBeVisible({ timeout: 15_000 });
  await expect(burst.locator("small")).toHaveText("REVEALED");
  await expect(burst.locator("b")).not.toBeEmpty();
  await expect(burst.locator(".global-burst-card.is-single")).toHaveCount(1);
  // Never more than a pair at once, so a catch-up batch stays readable.
  expect(await page.locator(".burst-reveal").count()).toBeLessThanOrEqual(2);
  // The collection has to actually grow — the burst is not decoration.
  await expect(page.locator(".clean-set-progress")).not.toContainText("0/98");
});

test("a card that spills into an open pack is shown on the board, not as a burst", async ({ page }) => {
  await seedState(page, seedQuietRevealState());
  await page.goto("/");
  await page.locator(".clean-pack-clicker").click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  const dealt = await page.locator(".reveal-card").count();

  // Sit in the open pack across several idle sweeps: the generated cards join
  // the deal instead of bursting, so the player never sees the same reveal twice.
  await page.waitForTimeout(7_000);
  expect(await page.locator(".reveal-card").count()).toBeGreaterThan(dealt);
  await expect(page.locator(".burst-reveal")).toHaveCount(0);
});

test("Fracture spill cards auto-reveal without flipping the original pack", async ({ page }) => {
  const fractureId = LEGACY_CARD_MAP["ember-01"];
  const state = createInitialState(Date.now());
  state.collection = { [fractureId]: 1 };
  state.bestRarities = { [fractureId]: SETS[0].cards.find((card) => card.id === fractureId).rarity };
  state.displayed = [{ id: fractureId, at: Date.now() }];
  state.settings.sound = false;
  state.settings.quickOpen = true;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");
  await page.evaluate(() => {
    Math.random = () => 0;
  });

  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  await expect(page.locator(".reveal-card")).toHaveCount(12);
  await expect(page.locator(".reveal-card.is-revealed")).toHaveCount(6, { timeout: 5_000 });
  await expect(page.locator(".reveal-card:not(.is-revealed)")).toHaveCount(6);
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
  const binderSelects = page.locator(".clean-binder-tools select");
  await expect(binderSelects.nth(0)).toHaveValue("owned");
  await expect(binderSelects.nth(2)).toHaveValue("rarity-low");
  await expect(page.locator(".clean-binder-grid > button")).toHaveCount(0);
  await binderSelects.nth(0).selectOption("all");
  await expect(page.locator(".clean-binder-grid > button")).toHaveCount(98);
  await expect(page.locator(".clean-binder-grid").getByText(/PW-\d+|PW\s*\/\s*\d+/)).toHaveCount(0);

  await page.getByRole("button", { name: "Missing card 1, show rarity" }).first().click();
  const detail = page.locator(".clean-card-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Card 01");
  await expect(detail).toContainText("Common");
  await expect(detail).toContainText("75%");
  await expect(detail).not.toContainText("Coinbud");
  await expect(detail.locator(".clean-detail-art.is-missing")).toBeVisible();
  await expect(detail.locator(".card-zoom-close")).toHaveCount(0);
  await page.screenshot({ path: "test-results/clean-undiscovered-rarity.png" });
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);

  await page.getByRole("button", { name: "Missing card 98, show rarity" }).click();
  await expect(page.locator(".clean-card-detail")).toContainText("Card 98");
  await expect(page.locator(".clean-card-detail .clean-detail-effect")).toHaveCount(0);
  await expect(page.locator(".clean-card-detail .clean-detail-art.is-missing")).toBeVisible();
  await expect(page.locator(".clean-card-detail .card-zoom-back")).toBeVisible();
  await expect(page.locator(".clean-card-detail .card-front")).toHaveCount(0);
});

test("the display case holds cards whose unique effects augment the game", async ({ page }) => {
  const pennigeonId = LEGACY_CARD_MAP["corner-02"];
  const state = createInitialState(Date.now());
  state.collection = { [pennigeonId]: 2 };
  state.bestRarities = { [pennigeonId]: "common" };
  state.foils = { [pennigeonId]: 1 };
  state.settings.sound = false;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await expect(page.locator(".case-strip").first()).toBeVisible();

  await page.locator(".clean-set-progress").click();
  await page.getByRole("button", { name: /Pennigeon, 1 cop/ }).click();
  const detail = page.locator(".clean-card-detail");
  await expect(detail.locator(".clean-detail-art .card-front")).toBeVisible();
  await expect(detail.locator(".clean-detail-art .card-front")).toHaveClass(/is-foil/);
  await expect(detail.locator(".clean-detail-art .foil-sheen")).toBeVisible();
  await expect(detail.locator(".card-zoom-card")).toHaveCSS("filter", "none");
  await expect(detail.locator(".card-zoom-card")).toHaveCSS("perspective", "none");
  await expect(detail.locator(".card-zoom-card .card-art")).toHaveCSS("transform", "none");
  await expect.poll(() => detail.locator(".card-zoom-card").evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return {
      x: Math.round(bounds.left + bounds.width / 2 - window.innerWidth / 2),
      y: Math.round(bounds.top + bounds.height / 2 - window.innerHeight / 2),
    };
  })).toEqual({ x: 0, y: 0 });
  await expect(detail.locator("canvas")).toHaveCount(0);
  await expect(detail.locator(".clean-detail-copy")).toHaveCount(0);
  await expect(detail.locator(".card-art-index, .card-art-grade, .card-print-mark, .pw-misprint-stamp")).toHaveCount(0);
  await expect(detail.locator('[class*="treatment-"]')).toHaveCount(0);
  await expect(detail.locator(".card-identity small")).toHaveCount(0);
  await expect(detail.locator(".card-zoom-close")).toHaveCount(0);
  await page.screenshot({ path: "test-results/clean-card-zoom-centered.png" });
  await expect(detail).toContainText("Whenever you reveal a Common");
  await expect(detail.locator(".card-head")).toContainText("Pennigeon");
  await expect(detail.locator(".card-copy > strong")).toHaveCount(0);
  expect(await detail.locator(".card-rules-copy").evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await detail.getByRole("button", { name: "DISPLAY IN CASE" }).click();
  await expect(detail.getByRole("button", { name: "UNSEAT FROM CASE" })).toBeVisible();
  await page.keyboard.press("Escape");
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

test("Omniecho stays centered in the display case with PixelLab art only", async ({ page }) => {
  const state = createInitialState(Date.now());
  state.collection = { "mirrorfield-48": 1 };
  state.bestRarities = { "mirrorfield-48": "divine" };
  state.displayed = [{ id: "mirrorfield-48", at: Date.now() }];
  state.settings.sound = false;
  state.lastSavedAt = Date.now();
  await seedState(page, state);
  await page.goto("/");

  await page.locator(".case-strip-label").first().click();
  const art = page.locator(".clean-case-slot.is-filled .card-art-mirrorfield-48");
  await expect(art).toBeVisible();
  const image = art.locator(".card-art-pixel");
  await expect(image).toHaveAttribute("src", /\/card-art-pixel\/prism\/12\/frame-0\.png/);
  await expect(page.locator(".card-art-legacy")).toHaveCount(0);
  await expect.poll(() => image.evaluate((node) => node.complete && node.naturalWidth > 0)).toBe(true);

  const offset = await art.evaluate((node) => {
    const wrapper = node.getBoundingClientRect();
    const sprite = node.querySelector(".card-art-pixel").getBoundingClientRect();
    // Alpha centroid of the shipped 128px Omniecho frame.
    const visibleX = sprite.left + sprite.width * (64.52 / 128);
    const visibleY = sprite.top + sprite.height * (66.18 / 128);
    return {
      x: Math.abs(visibleX - (wrapper.left + wrapper.width / 2)) / wrapper.width,
      y: Math.abs(visibleY - (wrapper.top + wrapper.height / 2)) / wrapper.height,
    };
  });
  expect(offset.x).toBeLessThan(0.06);
  expect(offset.y).toBeLessThan(0.08);
  await page.screenshot({ path: "test-results/clean-omniecho-centered.png" });
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
  await waitForCollection(page);
  await page.keyboard.down("Space");
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible({ timeout: 4_000 });
  await expect(page.locator(".clean-pack-clicker")).toHaveAttribute("aria-label", /Buy and open a pack/);
  await page.keyboard.up("Space");
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pack shop" })).toHaveCount(0);
});

test("legendary pulls retain the full impact treatment", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const state = createInitialState(Date.now());
  state.packsOpened = 1;
  state.manualPacks = 1;
  state.pityLegendary = 10_000;
  state.sealed[SETS[0].id].loose = 1;
  state.settings = { sound: false, quickOpen: true };
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
  const borderAnimationSeconds = await legendary.locator(".rarity-border-fx").evaluate(
    (node) => Number.parseFloat(getComputedStyle(node).animationDuration),
  );
  expect(borderAnimationSeconds).toBeGreaterThan(0.1);
  expect(await legendaryFace.evaluate((node) => {
    const matrix = new DOMMatrix(getComputedStyle(node).transform);
    return { x: Math.round(matrix.m11), z: Math.round(matrix.m33) };
  })).toEqual({ x: 1, z: 1 });
  await expect(legendaryFace).toHaveCSS("backface-visibility", "visible");
  await expect(legendaryBack).toHaveCSS("visibility", "hidden");
  await expect(legendaryBack).toHaveCSS("opacity", "0");
  await page.screenshot({ path: "test-results/clean-legendary-impact.png" });
});

test("the Nameless tier uses its shifting border treatment", async ({ page }) => {
  const collection = Object.fromEntries(
    SETS[0].cards.filter((card) => card.rarity !== "nameless").map((card) => [card.id, 1]),
  );
  const state = advanceBeat({
    ...createInitialState(Date.now()),
    collection,
    activeSet: SETS.at(-1).id,
  });
  state.sealed[SETS.at(-1).id].loose = 1;
  state.settings = { sound: false, quickOpen: true };
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
  const options = page.getByRole("button", { name: "PACKWORKS game options" });
  await options.click();
  const haptics = page.locator(".clean-settings-options > button").filter({ hasText: "Haptics" });
  await expect(haptics).toContainText("ON");
  await options.click();

  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible({ timeout: 6_000 });
  await revealAll(page);
  await waitForCollection(page);
  const withHaptics = await page.evaluate(() => window.__vibrations.length);
  expect(withHaptics).toBeGreaterThanOrEqual(7); // pack open + six reveals

  await options.click();
  await haptics.click();
  await expect(haptics).toContainText("OFF");
  await options.click();
  const beforeMuted = await page.evaluate(() => window.__vibrations.length);
  await page.getByRole("button", { name: /Open a pack/ }).click();
  await expect(page.locator(".opening-layer.phase-ready")).toBeVisible({ timeout: 6_000 });
  await revealAll(page);
  await waitForCollection(page);
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
  await expect(page.locator(".clean-simple-stats")).toHaveCount(0);
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

test("the mechanic mini-set viewer presents every eight-card build and saves review notes locally", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/mini-sets/");

  await expect(page.getByRole("heading", { name: "Mechanic Mini-Sets" })).toBeVisible();
  const index = page.locator(".mini-set-index");
  await expect(index.getByRole("button")).toHaveCount(15);
  await expect(page.locator(".mini-set-card")).toHaveCount(8);
  await expect(page.locator(".mini-set-card.is-core")).toHaveCount(6);
  await expect(page.locator(".mini-set-card.is-flex")).toHaveCount(2);
  await expect(page.locator(".mini-case-order > div > span")).toHaveCount(6);

  await index.getByRole("button", { name: /Fracture/ }).click();
  await expect(page.getByRole("heading", { name: "Fracture: Rift Cascade" })).toBeVisible();
  await expect(page.locator(".mini-set-card")).toHaveCount(8);

  const notes = page.getByPlaceholder("Balance concerns, card swaps, missing links, wording…");
  await notes.fill("Keep the spill package; revisit the cash flex slot.");
  await page.getByRole("button", { name: "APPROVE", exact: true }).click();
  await expect(page.getByRole("button", { name: "APPROVE", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Fracture: Rift Cascade" })).toBeVisible();
  await expect(notes).toHaveValue("Keep the spill package; revisit the cash flex slot.");
  await expect(page.getByRole("button", { name: "APPROVE", exact: true })).toHaveAttribute("aria-pressed", "true");

  await index.getByRole("button", { name: /Salvage \/ Scrap/ }).click();
  await expect(page.getByRole("heading", { name: "Salvage / Scrap: Scrapyard Economy" })).toBeVisible();
  await expect(page.locator(".mini-set-card")).toHaveCount(8);
  await expect(page.locator(".mini-proposal-badge")).toContainText("ALTERNATE RULESET");
  await expect(page.locator(".mini-scrap-pitch")).toContainText("permanently delete one copy");
  await expect(page.locator(".mini-scrap-pitch")).toContainText("Spending Scrap is never a trigger");
  await expect(page.locator(".mini-set-card-grid")).toContainText(
    "Whenever you reveal a duplicate, if you have 10 Scrap, spend 10 Scrap to open a Mystery Pack.",
  );
  await expect(page.locator(".mini-set-card-grid")).toContainText(
    "Whenever you open a pack, if you have 15 Scrap, spend 15 Scrap to add 3 random cards to that pack.",
  );
  await expect(page.locator(".scrap-card-half")).toHaveCount(2);
  await expect(page.locator(".scrap-fragments i")).toHaveCount(12);
  await expect(page.getByText("COPY DELETED")).toHaveCount(0);
  await page.getByRole("button", { name: "REPLAY SALVAGE" }).click();

  await index.getByRole("button", { name: /Catalyst/ }).click();
  await expect(page.locator(".mini-set-flag")).toContainText("MISSING LIVE SIGNATURE");
  await index.getByRole("button", { name: /Blueprint/ }).click();
  await expect(page.locator(".mini-set-flag")).toContainText("SIGNATURE TEXT MISMATCH");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator(".mini-set-viewer").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
});
