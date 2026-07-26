import sharp from "sharp";

// PixelLab occasionally returns an opaque near-white canvas even when
// no_background is requested. Remove only the connected edge color so cream
// pixels enclosed by the generated lettering/creature remain untouched.
export async function removeConnectedEdgeBackground(buffer, threshold = 32) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const background = [data[0], data[1], data[2]];
  const visited = new Uint8Array(width * height);
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel]) return;
    visited[pixel] = 1;
    const offset = pixel * channels;
    const distance = Math.hypot(
      data[offset] - background[0],
      data[offset + 1] - background[1],
      data[offset + 2] - background[2],
    );
    if (distance <= threshold) queue.push(pixel);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    data[pixel * channels + 3] = 0;
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  return sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
}
