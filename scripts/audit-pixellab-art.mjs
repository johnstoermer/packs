import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ALL_CARDS, getCardArtId } from "../lib/gameData.js";

const FRAME_SIZE = 128;
const FRAME_COUNT = 4;
const ART_ROOT = path.resolve("public/card-art-pixel");

function getArtCoordinates(card) {
  const id = getCardArtId(card);
  const separator = id.lastIndexOf("-");
  return {
    setId: id.slice(0, separator),
    number: id.slice(separator + 1),
  };
}

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function canonicalPixels(buffer) {
  const pixels = Buffer.from(buffer);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] !== 0) continue;
    pixels[offset] = 0;
    pixels[offset + 1] = 0;
    pixels[offset + 2] = 0;
  }
  return pixels;
}

const manifest = JSON.parse(await readFile(path.join(ART_ROOT, "manifest.json"), "utf8"));
assert.equal(manifest.provider, "PixelLab v2");
assert.equal(manifest.frameCount, FRAME_COUNT);
assert.equal(manifest.cards.length, ALL_CARDS.length);
assert.ok(manifest.cards.every((card) => card.generated), "manifest contains incomplete cards");

const hashes = new Set();
for (const card of ALL_CARDS) {
  const art = getArtCoordinates(card);
  const directory = path.join(ART_ROOT, art.setId, art.number);
  const staticFile = path.join(directory, "frame-0.png");
  const holoFile = path.join(directory, "holo-strip.png");
  const [staticBuffer, holoBuffer] = await Promise.all([readFile(staticFile), readFile(holoFile)]);
  const [staticMeta, holoMeta] = await Promise.all([sharp(staticBuffer).metadata(), sharp(holoBuffer).metadata()]);
  assert.equal(staticMeta.width, FRAME_SIZE, `${card.id} standard width`);
  assert.equal(staticMeta.height, FRAME_SIZE, `${card.id} standard height`);
  assert.equal(staticMeta.hasAlpha, true, `${card.id} standard alpha`);
  assert.equal(holoMeta.width, FRAME_SIZE * FRAME_COUNT, `${card.id} holo width`);
  assert.equal(holoMeta.height, FRAME_SIZE, `${card.id} holo height`);
  assert.equal(holoMeta.hasAlpha, true, `${card.id} holo alpha`);

  const [staticPixels, firstHoloFrame] = await Promise.all([
    sharp(staticBuffer).ensureAlpha().raw().toBuffer(),
    sharp(holoBuffer)
      .extract({ left: 0, top: 0, width: FRAME_SIZE, height: FRAME_SIZE })
      .ensureAlpha()
      .raw()
      .toBuffer(),
  ]);
  const canonicalStatic = canonicalPixels(staticPixels);
  const canonicalHolo = canonicalPixels(firstHoloFrame);
  assert.equal(digest(canonicalStatic), digest(canonicalHolo), `${card.id} standard must equal holo frame 1`);
  hashes.add(digest(canonicalStatic));
}
assert.equal(hashes.size, ALL_CARDS.length, "standard art must be unique for every card");

console.log(`PixelLab art audit passed: ${ALL_CARDS.length} unique standard frames and ${ALL_CARDS.length * FRAME_COUNT} holo frames.`);
