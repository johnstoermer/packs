import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";
import { ALL_CARDS, getCardArtId, getCardRulesId, getSet } from "../lib/gameData.js";
import { getCardRules } from "../lib/engineCards.js";

const API_ROOT = "https://api.pixellab.ai/v2";
const ART_ROOT = path.resolve("public/card-art-pixel");
const FRAME_SIZE = 128;
const FRAME_COUNT = 4;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);
const key = process.env.PIXELLAB_API_KEY;

if (!key) {
  console.error("PIXELLAB_API_KEY is required in the process environment.");
  process.exit(1);
}

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [name, ...rest] = arg.replace(/^--/, "").split("=");
    return [name, rest.length ? rest.join("=") : true];
  }),
);
const requestedIds = typeof args.get("ids") === "string"
  ? new Set(args.get("ids").split(",").map((id) => id.trim()).filter(Boolean))
  : null;
const concurrency = Math.max(1, Math.min(10, Number(args.get("concurrency")) || 3));
const force = args.has("force");

const SET_WORLDS = {
  corner: "a cheerful city block of pocket parks, fire escapes, corner shops, and painted crosswalks",
  circuit: "a neon arcade circuit of friendly robots, electric glyphs, and glowing game cabinets",
  frontier: "a sunny brass-and-cactus frontier crossed by toy-like railways and glittering mesas",
  abyss: "a luminous deep-sea garden of coral, bubbles, velvet kelp, and pearl light",
  crown: "a storybook fallen kingdom of candles, velvet banners, thorn crowns, and porcelain",
  verdant: "a walking greenhouse where brass mechanisms grow leaves, roots, and bright flowers",
  polar: "an icebound archive of living books, auroras, lanterns, and crystalline shelves",
  ember: "a heroic railway racing through warm cinders, lava light, brass engines, and sparks",
  cloud: "a floating sky market of kites, parcels, rain coins, and cloud bridges",
  glass: "a prismatic desert of mirrored dunes, crystal oases, and split sunlight",
  harbor: "a moonlit fantasy harbor of fog bells, ghost wakes, anchors, and constellations",
  orchard: "a clockwork orchard of gear fruit, copper blossoms, comets, and springtime",
  hollow: "a cavern mountain of crystal veins, ancient stone, echoes, and underground stars",
  prism: "a radiant sanctuary of rainbow creatures, silver mirrors, halos, and impossible color",
  signal: "a submerged broadcast world of antennae, sonar rings, buoys, and coded starlight",
  observatory: "a pale cosmic observatory of telescopes, moons, lenses, and orbiting maps",
  foundry: "a celestial foundry of star iron, glowing anvils, gravity hammers, and gentle sparks",
  apocalypse: "a quiet overgrown town after the end, where small creatures protect hopeful relics",
  lastlight: "the final golden horizon, filled with living lanterns, dawn crowns, and luminous shadows",
  unwritten: "a magical blank storybook realm of ink creatures, floating pages, margins, and dawn light",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function seedFor(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getArtCoordinates(card) {
  const id = getCardArtId(card);
  const separator = id.lastIndexOf("-");
  return {
    id,
    setId: id.slice(0, separator),
    number: id.slice(separator + 1),
  };
}

function imageObject(buffer) {
  return {
    type: "base64",
    format: "png",
    base64: `data:image/png;base64,${buffer.toString("base64")}`,
  };
}

function decodeImage(image) {
  const encoded = image?.base64 || "";
  return Buffer.from(encoded.includes(",") ? encoded.slice(encoded.indexOf(",") + 1) : encoded, "base64");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function api(pathname, { method = "GET", body, attempts = 20 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${API_ROOT}${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { detail: text };
      }
      if (response.ok) return payload;
      const detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail || payload);
      if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts) {
        throw new Error(`${method} ${pathname} failed (${response.status}): ${detail}`);
      }
      lastError = new Error(`${response.status}: ${detail}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    const retryDelay = lastError?.message?.startsWith("429:")
      ? 30_000
      : Math.min(30_000, 1_200 * 2 ** (attempt - 1));
    await sleep(retryDelay);
  }
  throw lastError;
}

function mechanicMotif(card) {
  const rules = getCardRules(card.id);
  const copy = `${rules?.title || ""} ${rules?.text || ""}`.toLowerCase();
  const motifs = [];
  const add = (pattern, value) => {
    if (pattern.test(copy)) motifs.push(value);
  };
  add(/echo|resonance/, "soft spectral afterimages orbiting in rhythm");
  add(/mark|insight/, "a bright star-shaped sigil pulsing above its brow");
  add(/salvage|duplicate sold|sell your duplicates/, "a tiny mystery pack assembled from colorful reclaimed scraps");
  add(/mimic|copy|copies/, "one friendly mirrored double made of light");
  add(/fusion|fuse|catalyst/, "two small energy motes merging into a stronger crystal");
  add(/transmute|reflection/, "color-shifting crystal bands transforming around its body");
  add(/fracture/, "a harmless glowing rift cracking open behind a sealed card pack");
  add(/discover|option/, "a floating compass and three sparkling path icons");
  add(/foil/, "a controlled rainbow-metal glint across its markings");
  add(/mystery/, "a sealed mystery parcel with a question-star emblem");
  add(/cash|coin|sell value|price/, "a few chunky golden coin tokens bouncing nearby");
  add(/pack|card/, "a small sealed card pack tucked into its gear");
  add(/rare|epic|chase|grade/, "a faceted rarity gem shining above it");
  add(/set complete|completed set/, "a completed binder crest opening like a crown");
  add(/threshold|for every/, "a bead counter clicking to its final notch");
  add(/signal|lie/, "two sonar rings switching from blue to gold");
  add(/relay|right/, "a chain of light hopping toward a companion off-frame");
  add(/rewrite|inscription/, "living ink strokes rewriting a page beneath its feet");
  return motifs.slice(0, 3).join(", ") || "small motes of set-colored energy responding to its power";
}

function basePrompt(card) {
  const set = getSet(card.setId);
  const art = getArtCoordinates(card);
  const rules = getCardRules(card.id);
  return [
    `Create an original collectible creature named ${card.name}.`,
    `It is a charming monster inspired by ${card.subject}, designed for ${SET_WORLDS[art.setId]}.`,
    `Its visual ability is ${mechanicMotif(card)}.`,
    `Use this set palette as the dominant color direction: ${set.colors.join(", ")}, with cream highlights and dark navy outlines.`,
    `Gameplay identity: ${rules?.title || "card power"}.`,
    "Single full-body creature, centered, three-quarter front view, readable silhouette, expressive face, compact heroic proportions.",
    "True 16-bit pixel art with deliberate square pixels, selective dark-navy outline, medium cel shading, restrained highlights, and a subtle sense of volume.",
    "Original creature-collector RPG design; no existing franchise characters, logos, letters, words, card frame, UI, border, scenery panel, or photorealism.",
  ].join(" ");
}

function animationPrompt(card) {
  return [
    "Create a seamless four-frame collectible-card idle loop.",
    `Keep ${card.name}'s exact anatomy, colors, markings, scale, outline, and centered position unchanged.`,
    `${mechanicMotif(card)}.`,
    "Use subtle breathing, a tiny weight shift, gentle secondary motion, and light parallax only.",
    "The creature must remain fully visible. Do not rotate the camera, redraw the design, add limbs, add text, or crop.",
    "Frame four should flow naturally back into frame one.",
  ].join(" ");
}

async function createBase(card) {
  const art = getArtCoordinates(card);
  const submitted = await api("/generate-image-v2", {
    method: "POST",
    body: {
      description: basePrompt(card),
      image_size: { width: FRAME_SIZE, height: FRAME_SIZE },
      no_background: true,
      seed: seedFor(`packworks:${art.id}`),
    },
  });
  const completed = await pollJob(submitted.background_job_id);
  const images = completed?.images;
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error(`PixelLab base generation for ${card.id} returned no images`);
  }
  return decodeImage(images[0]);
}

async function pollJob(jobId) {
  for (let poll = 0; poll < 120; poll += 1) {
    const result = await api(`/background-jobs/${jobId}`);
    if (result.status === "completed") return result.last_response;
    if (result.status === "failed") {
      throw new Error(`PixelLab job ${jobId} failed: ${JSON.stringify(result.last_response || {})}`);
    }
    await sleep(3_000);
  }
  throw new Error(`PixelLab job ${jobId} timed out`);
}

async function animate(card, base) {
  const art = getArtCoordinates(card);
  const submitted = await api("/animate-with-text-v3", {
    method: "POST",
    body: {
      first_frame: imageObject(base),
      action: animationPrompt(card),
      frame_count: FRAME_COUNT,
      seed: seedFor(`packworks:holo:${art.id}`),
      no_background: true,
      enhance_prompt: false,
    },
  });
  const completed = await pollJob(submitted.background_job_id);
  const images = completed?.images;
  if (!Array.isArray(images) || images.length < FRAME_COUNT) {
    throw new Error(`PixelLab animation for ${card.id} returned ${images?.length || 0} frames`);
  }
  return images.slice(0, FRAME_COUNT).map(decodeImage);
}

async function saveCardArt(card, base, frames) {
  const art = getArtCoordinates(card);
  const directory = path.join(ART_ROOT, art.setId, art.number);
  await mkdir(directory, { recursive: true });
  const normalized = await Promise.all(frames.map((frame) => sharp(frame)
    .resize(FRAME_SIZE, FRAME_SIZE, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toBuffer()));
  const strip = await sharp({
    create: {
      width: FRAME_SIZE * FRAME_COUNT,
      height: FRAME_SIZE,
      channels: 4,
      background: "#00000000",
    },
  }).composite(normalized.map((input, index) => ({
    input,
    left: FRAME_SIZE * index,
    top: 0,
  }))).png({ compressionLevel: 9 }).toBuffer();
  await Promise.all([
    writeFile(path.join(directory, "source.png"), base),
    writeFile(path.join(directory, "frame-0.png"), normalized[0]),
    writeFile(path.join(directory, "holo-strip.png"), strip),
  ]);
}

async function generateCard(card, position, total) {
  const art = getArtCoordinates(card);
  const directory = path.join(ART_ROOT, art.setId, art.number);
  const staticPath = path.join(directory, "frame-0.png");
  const holoPath = path.join(directory, "holo-strip.png");
  if (!force && await exists(staticPath) && await exists(holoPath)) {
    console.log(`[${position}/${total}] ${card.id} ${card.name} — already complete`);
    return { id: card.id, legacyId: art.id, generated: true, skipped: true };
  }
  console.log(`[${position}/${total}] ${card.id} ${card.name} — generating base`);
  let base;
  const sourcePath = path.join(directory, "source.png");
  if (!force && await exists(sourcePath)) {
    base = await readFile(sourcePath);
  } else {
    base = await createBase(card);
    await mkdir(directory, { recursive: true });
    await writeFile(sourcePath, base);
  }
  console.log(`[${position}/${total}] ${card.id} ${card.name} — animating ${FRAME_COUNT} frames`);
  const frames = await animate(card, base);
  await saveCardArt(card, base, frames);
  console.log(`[${position}/${total}] ${card.id} ${card.name} — complete`);
  return { id: card.id, legacyId: art.id, generated: true, skipped: false };
}

async function writeManifest(cards, results = []) {
  const resultMap = new Map(results.map((result) => [result.id, result]));
  const manifest = {
    provider: "PixelLab v2",
    frameCount: FRAME_COUNT,
    frameSize: FRAME_SIZE,
    generatedAt: new Date().toISOString(),
    cards: await Promise.all(cards.map(async (card) => {
      const art = getArtCoordinates(card);
      const directory = path.join(ART_ROOT, art.setId, art.number);
      const generated = await exists(path.join(directory, "frame-0.png"))
        && await exists(path.join(directory, "holo-strip.png"));
      return {
        id: card.id,
        legacyId: art.id,
        name: card.name,
        generated,
        static: `/card-art-pixel/${art.setId}/${art.number}/frame-0.png`,
        holo: `/card-art-pixel/${art.setId}/${art.number}/holo-strip.png`,
        animation: animationPrompt(card),
        ...resultMap.get(card.id),
      };
    })),
  };
  await mkdir(ART_ROOT, { recursive: true });
  await writeFile(path.join(ART_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

let manifestWriteQueue = Promise.resolve();
function queueManifestWrite(cards, results = []) {
  manifestWriteQueue = manifestWriteQueue.then(() => writeManifest(cards, results));
  return manifestWriteQueue;
}

async function worker(queue, results, total) {
  while (queue.length) {
    const item = queue.shift();
    try {
      results.push(await generateCard(item.card, item.position, total));
    } catch (error) {
      console.error(`[${item.position}/${total}] ${item.card.id} failed: ${error.message}`);
      results.push({ id: item.card.id, generated: false, error: error.message });
    }
    await queueManifestWrite(ALL_CARDS, results);
  }
}

const cards = ALL_CARDS.filter((card) => (
  !requestedIds
  || requestedIds.has(card.id)
  || requestedIds.has(getCardArtId(card))
  || requestedIds.has(getCardRulesId(card))
));
if (!cards.length) {
  console.error("No cards matched --ids.");
  process.exit(1);
}

await queueManifestWrite(ALL_CARDS);
const queue = cards.map((card, index) => ({ card, position: index + 1 }));
const results = [];
await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker(queue, results, cards.length)));
await queueManifestWrite(ALL_CARDS, results);

const failures = results.filter((result) => !result.generated);
console.log(`PixelLab batch finished: ${results.length - failures.length}/${results.length} cards complete.`);
if (failures.length) {
  console.error(`Failed cards: ${failures.map((result) => result.id).join(", ")}`);
  process.exitCode = 1;
}
