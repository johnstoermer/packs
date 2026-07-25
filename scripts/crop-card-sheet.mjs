import path from "node:path";
import process from "node:process";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const [inputPath, setId] = process.argv.slice(2);

if (!inputPath || !setId || !/^[a-z0-9-]+$/.test(setId)) {
  throw new Error("Usage: node scripts/crop-card-sheet.mjs <sheet.png> <set-id>");
}

const metadata = await sharp(inputPath).metadata();
if (!metadata.width || !metadata.height) {
  throw new Error(`Could not read sheet dimensions: ${inputPath}`);
}

const outputDirectory = path.join(process.cwd(), "public", "card-art", setId);
await mkdir(outputDirectory, { recursive: true });

const gutter = Math.max(2, Math.round(Math.min(metadata.width, metadata.height) * 0.003));
const jobs = [];

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 3; column += 1) {
    const leftEdge = Math.round((column * metadata.width) / 3);
    const rightEdge = Math.round(((column + 1) * metadata.width) / 3);
    const topEdge = Math.round((row * metadata.height) / 4);
    const bottomEdge = Math.round(((row + 1) * metadata.height) / 4);
    const number = row * 3 + column + 1;

    jobs.push(
      sharp(inputPath)
        .extract({
          left: leftEdge + gutter,
          top: topEdge + gutter,
          width: rightEdge - leftEdge - gutter * 2,
          height: bottomEdge - topEdge - gutter * 2,
        })
        .resize(640, 480, { fit: "cover", position: "centre" })
        .webp({ quality: 88, effort: 5 })
        .toFile(path.join(outputDirectory, `${String(number).padStart(2, "0")}.webp`)),
    );
  }
}

await Promise.all(jobs);
console.log(`Cropped 12 cards for ${setId} from ${metadata.width}x${metadata.height}.`);
