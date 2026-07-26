import { RARITIES, getCardArtId } from "./gameData.js";

export const THREE_PACK_TEXTURE_WIDTH = 640;
export const THREE_PACK_TEXTURE_HEIGHT = 940;
export const THREE_PACK_ART_VERSION = "20260726-2";

const packCanvasCache = new Map();

function makeCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = THREE_PACK_TEXTURE_WIDTH;
  canvas.height = THREE_PACK_TEXTURE_HEIGHT;
  return canvas;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x + width, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function loadImage(sources) {
  const queue = sources.filter(Boolean);
  return new Promise((resolve) => {
    const attempt = () => {
      const source = queue.shift();
      if (!source) {
        resolve(null);
        return;
      }
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = attempt;
      image.src = source;
    };
    attempt();
  });
}

function cardArtPaths(card, assetBase) {
  const key = getCardArtId(card);
  const at = key.lastIndexOf("-");
  const setId = key.slice(0, at);
  const number = key.slice(at + 1);
  return [
    `${assetBase}/card-art-pixel/${setId}/${number}/frame-0.png?v=${THREE_PACK_ART_VERSION}`,
    `${assetBase}/card-art/${setId}/${number}.webp`,
  ];
}

function drawWrapperBase(ctx, set) {
  ctx.clearRect(0, 0, THREE_PACK_TEXTURE_WIDTH, THREE_PACK_TEXTURE_HEIGHT);
  const background = ctx.createLinearGradient(40, 0, 600, 940);
  background.addColorStop(0, set.colors[0]);
  background.addColorStop(0.42, set.colors[2]);
  background.addColorStop(1, set.colors[1]);
  roundedRect(ctx, 4, 4, 632, 932, 26);
  ctx.fillStyle = background;
  ctx.fill();

  ctx.save();
  roundedRect(ctx, 4, 4, 632, 932, 26);
  ctx.clip();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  for (let offset = -900; offset < 900; offset += 58) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + 940, 940);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,.52)";
  ctx.lineWidth = 4;
  roundedRect(ctx, 12, 12, 616, 916, 22);
  ctx.stroke();
}

async function renderPackFront(set, assetBase) {
  const canvas = makeCanvas();
  const ctx = canvas.getContext("2d");
  drawWrapperBase(ctx, set);

  ctx.fillStyle = "#052752";
  roundedRect(ctx, 44, 58, 552, 116, 20);
  ctx.fill();
  ctx.fillStyle = "#fff7d0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let titleSize = 53;
  do {
    ctx.font = `950 ${titleSize}px "Trebuchet MS", Arial, sans-serif`;
    if (ctx.measureText(set.name.toUpperCase()).width <= 500) break;
    titleSize -= 2;
  } while (titleSize > 28);
  ctx.fillText(set.name.toUpperCase(), 320, 112);
  ctx.fillStyle = "#8ce8ff";
  ctx.font = '950 17px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText(`${set.short} PRINT LINE`, 320, 150);

  roundedRect(ctx, 38, 194, 564, 590, 24);
  const scene = ctx.createLinearGradient(0, 194, 0, 784);
  scene.addColorStop(0, "rgba(229,248,255,.92)");
  scene.addColorStop(0.55, "rgba(255,249,214,.92)");
  scene.addColorStop(1, `${set.colors[0]}dd`);
  ctx.fillStyle = scene;
  ctx.fill();
  ctx.strokeStyle = "#052752";
  ctx.lineWidth = 9;
  ctx.stroke();

  const featured = [...set.cards]
    .sort((left, right) => (
      RARITIES[right.rarity].order - RARITIES[left.rarity].order
      || right.number - left.number
    ))
    .slice(0, 3);
  const [chase, leftFeature, rightFeature] = featured;
  const images = await Promise.all([
    loadImage(cardArtPaths(chase, assetBase)),
    loadImage(cardArtPaths(leftFeature, assetBase)),
    loadImage(cardArtPaths(rightFeature, assetBase)),
  ]);
  const placements = [
    { x: 320, y: 455, box: 350 },
    { x: 160, y: 535, box: 245 },
    { x: 480, y: 535, box: 245 },
  ];
  images.forEach((image, index) => {
    if (!image) return;
    const placement = placements[index];
    const scale = Math.min(placement.box / image.naturalWidth, placement.box / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.shadowColor = "rgba(2, 27, 60, .45)";
    ctx.shadowBlur = 13;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(
      image,
      placement.x - width / 2,
      placement.y - height / 2,
      width,
      height,
    );
  });
  ctx.shadowColor = "transparent";

  ctx.fillStyle = "#052752";
  roundedRect(ctx, 124, 698, 392, 62, 14);
  ctx.fill();
  ctx.fillStyle = "#ffe163";
  ctx.font = '950 25px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText("6 CARDS", 232, 729);
  ctx.fillStyle = "#f7fbff";
  ctx.font = '950 20px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText("PACKWORKS", 397, 729);

  ctx.fillStyle = "#f8fcff";
  ctx.font = '950 18px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText("FACTORY SEALED • FIRST EDITION", 320, 850);
  for (const x of [292, 320, 348]) {
    ctx.beginPath();
    ctx.arc(x, 890, 8, 0, Math.PI * 2);
    ctx.fillStyle = x === 320 ? "#ffe163" : "#8ce8ff";
    ctx.fill();
  }
  return canvas;
}

function renderPackBack(set) {
  const canvas = makeCanvas();
  const ctx = canvas.getContext("2d");
  drawWrapperBase(ctx, set);

  ctx.fillStyle = "#052752";
  roundedRect(ctx, 56, 70, 528, 650, 26);
  ctx.fill();
  ctx.strokeStyle = "#ffe163";
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.fillStyle = "#f7fbff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '950 48px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText("PACKWORKS", 320, 178);
  ctx.fillStyle = "#8ce8ff";
  ctx.font = '950 18px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText(`${set.name.toUpperCase()} • 6 CARD BOOSTER`, 320, 225);

  ctx.textAlign = "left";
  ctx.fillStyle = "#d9efff";
  ctx.font = '800 20px "Trebuchet MS", Arial, sans-serif';
  const lines = [
    "Every pack is assembled at the",
    "Packworks Card Factory.",
    "",
    "Collect creatures. Build displays.",
    "Set the whole machine in motion.",
  ];
  lines.forEach((line, index) => ctx.fillText(line, 104, 315 + index * 34));

  ctx.fillStyle = "#f7fbff";
  for (let bar = 0; bar < 42; bar += 1) {
    const width = bar % 5 === 0 ? 7 : bar % 3 === 0 ? 4 : 2;
    ctx.fillRect(112 + bar * 9, 540, width, 94);
  }
  ctx.fillStyle = "#8ce8ff";
  ctx.font = '900 16px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText("PW-6-" + set.short + "-2026", 112, 664);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f7fbff";
  ctx.font = '950 17px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText("PACKWORKS CARD FACTORY", 320, 842);
  return canvas;
}

export function getThreePackCanvases(set, assetBase = "") {
  const key = `${set.id}:${assetBase}`;
  if (!packCanvasCache.has(key)) {
    packCanvasCache.set(key, Promise.all([
      renderPackFront(set, assetBase),
      Promise.resolve(renderPackBack(set)),
    ]).then(([front, back]) => ({ front, back })));
  }
  return packCanvasCache.get(key);
}
