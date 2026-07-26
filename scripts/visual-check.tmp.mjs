import { chromium } from "@playwright/test";
import { createAdminState, displayCard, serializeState, ADMIN_SAVE_KEY, ADMIN_FLAG_KEY } from "../lib/gameLogic.js";
import { LEGACY_CARD_MAP } from "../lib/gameData.js";

const L = (id) => LEGACY_CARD_MAP[id] || id;
const SHOTS = process.argv[2];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

const makeSeed = (displayIds, extraDups = 0) => {
  let seed = createAdminState(1);
  for (const id of displayIds) seed = displayCard(seed, id, 1);
  seed = { ...seed, sealed: { ...seed.sealed, [seed.activeSet]: { ...(seed.sealed[seed.activeSet] || {}), loose: 80 } } };
  if (extraDups > 0) {
    const first = Object.keys(seed.collection).find((id) => !displayIds.includes(id));
    seed = {
      ...seed,
      collection: { ...seed.collection, [first]: (seed.collection[first] || 0) + extraDups },
      duplicateBank: extraDups,
    };
  }
  return serializeState(seed);
};

const boot = async (payload, viewport = { width: 1180, height: 740 }) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(([key, value, flag]) => {
    window.localStorage.setItem(key, value);
    window.localStorage.setItem(flag, "1");
  }, [ADMIN_SAVE_KEY, payload, ADMIN_FLAG_KEY]);
  await page.goto("http://127.0.0.1:4327/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".clean-pack-clicker:not([disabled])", { timeout: 15_000 });
  return { context, page };
};

// (a) Mystery cards join an in-progress reveal
{
  const payload = makeSeed([L("corner-05"), L("hollow-02"), L("frontier-04"), L("frontier-09")]);
  const { context, page } = await boot(payload);
  let joined = 0;
  for (let attempt = 0; attempt < 10 && !joined; attempt += 1) {
    await page.goto("http://127.0.0.1:4327/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".clean-pack-clicker:not([disabled])", { timeout: 15_000 });
    await page.click(".clean-pack-clicker");
    await page.waitForSelector(".reveal-card", { timeout: 10_000 });
    await page.waitForTimeout(1_500);
    const before = await page.locator(".reveal-card").count();
    await page.keyboard.down(" ");
    for (let step = 0; step < 30 && !joined; step += 1) {
      await page.waitForTimeout(400);
      joined = await page.locator(".reveal-card.is-mystery").count();
    }
    await page.keyboard.up(" ");
    const after = await page.locator(".reveal-card").count();
    console.log(`mystery attempt: board ${before} -> ${after}, mystery cards ${joined}`);
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/visual-mystery-injection.png` });
  console.log("mystery-injection:", joined > 0 ? "OK" : "NOT OBSERVED");
  await context.close();
}

// (b) Home-screen salvage burst + auto-process chips
{
  const payload = makeSeed([L("apocalypse-04"), L("harbor-05"), L("frontier-01")], 400);
  const { context, page } = await boot(payload);
  await page.waitForSelector(".clean-sell-duplicates:not([disabled])", { timeout: 15_000 });
  const chips = await page.locator(".clean-auto-process button").count();
  console.log("auto-process chips:", chips);
  await page.click(".clean-sell-duplicates");
  const burst = await page.waitForSelector(".salvage-burst", { timeout: 5_000 }).catch(() => null);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/visual-salvage-burst.png` });
  console.log("salvage-burst:", burst ? "OK" : "NOT OBSERVED");
  await context.close();
}

// (c) Fracture board still fans post-restructure
{
  const payload = makeSeed([L("ember-12"), L("lastlight-07"), L("ember-07"), L("foundry-05"), L("foundry-09"), L("ember-04")]);
  const { context, page } = await boot(payload);
  let count = 0;
  for (let attempt = 0; attempt < 10 && count < 20; attempt += 1) {
    await page.goto("http://127.0.0.1:4327/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".clean-pack-clicker:not([disabled])", { timeout: 15_000 });
    await page.click(".clean-pack-clicker");
    await page.waitForSelector(".reveal-card", { timeout: 10_000 });
    await page.waitForTimeout(2_000);
    count = await page.locator(".reveal-card").count();
  }
  await page.waitForTimeout(Math.min(6_000, count * 95 + 1_500));
  const box = await page.evaluate(() => {
    const rects = [...document.querySelectorAll(".reveal-card")].map((node) => node.getBoundingClientRect());
    return {
      minX: Math.round(Math.min(...rects.map((r) => r.left))),
      maxX: Math.round(Math.max(...rects.map((r) => r.right))),
      maxY: Math.round(Math.max(...rects.map((r) => r.bottom))),
    };
  });
  console.log(`fracture board: ${count} cards, bounds`, JSON.stringify(box), box.minX >= -4 && box.maxX <= 1184 && box.maxY <= 744 ? "FITS" : "OVERFLOW");
  await page.screenshot({ path: `${SHOTS}/visual-fracture.png` });
  await context.close();
}

await browser.close();
