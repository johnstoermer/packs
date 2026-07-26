import { RARITIES, getCardArtId, getSet } from "./gameData.js";
import { getCardRules } from "./engineCards.js";

export const THREE_CARD_WIDTH = 2.5;
export const THREE_CARD_HEIGHT = 3.55;
export const THREE_CARD_ASPECT = THREE_CARD_WIDTH / THREE_CARD_HEIGHT;
export const THREE_CARD_TEXTURE_WIDTH = 600;
export const THREE_CARD_TEXTURE_HEIGHT = 852;
export const THREE_PIXEL_ART_VERSION = "20260726-2";

const canvasCache = new Map();

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth, startSize, weight = 900) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px "Trebuchet MS", Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 1;
  } while (size > 14);
  return size;
}

function wrapWords(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const lines = wrapWords(ctx, text, maxWidth);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines && visible.length) {
    let last = visible.at(-1);
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    visible[visible.length - 1] = `${last}…`;
  }
  visible.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return visible.length;
}

const TOKEN_PALETTE = {
  green: { background: "#ddf7e7", color: "#187346" },
  red: { background: "#ffe5df", color: "#a63833" },
  violet: { background: "#eee5ff", color: "#6740a0" },
  gold: { background: "#fff1bd", color: "#8b5a00" },
  blue: { background: "#def1ff", color: "#075596" },
  cash: { background: "#ddf7e7", color: "#187346" },
  foil: { background: "#eee9ff", color: "#514489" },
  rarity: { background: "#e2f3ff", color: "#075596" },
  neutral: { background: "#e8eff4", color: "#365269" },
};

function tokenFont(token) {
  return `${token.type === "text" ? 800 : 950} 21px "Trebuchet MS", Arial, sans-serif`;
}

function drawTokenizedText(ctx, tokens, x, y, maxWidth, lineHeight, maxLines) {
  const fragments = tokens.flatMap((token) => (
    String(token.value).split(/(\s+)/).filter(Boolean).map((value) => ({ ...token, value }))
  ));
  let cursorX = x;
  let cursorY = y;
  let line = 0;

  for (const fragment of fragments) {
    const whitespace = /^\s+$/.test(fragment.value);
    ctx.font = tokenFont(fragment);
    const width = ctx.measureText(fragment.value).width;
    if (!whitespace && cursorX > x && cursorX + width > x + maxWidth) {
      line += 1;
      if (line >= maxLines) {
        ctx.fillStyle = "#163d63";
        ctx.font = tokenFont({ type: "text" });
        ctx.fillText("…", Math.min(cursorX, x + maxWidth - 14), cursorY);
        return line;
      }
      cursorX = x;
      cursorY += lineHeight;
    }
    if (whitespace && cursorX === x) continue;

    if (fragment.type === "keyword") {
      const palette = TOKEN_PALETTE[fragment.tone] || TOKEN_PALETTE.blue;
      roundedRect(ctx, cursorX - 2, cursorY - 20, width + 4, 25, 5);
      ctx.fillStyle = palette.background;
      ctx.fill();
      ctx.fillStyle = palette.color;
    } else if (fragment.type === "number") {
      ctx.fillStyle = "#a84a08";
    } else {
      ctx.fillStyle = "#163d63";
    }
    ctx.font = tokenFont(fragment);
    ctx.fillText(fragment.value, cursorX, cursorY);
    cursorX += width;
  }
  return line + 1;
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

function artPaths(card, assetBase, animated = false) {
  const key = getCardArtId(card);
  const at = key.lastIndexOf("-");
  const setId = key.slice(0, at);
  const number = key.slice(at + 1);
  return [
    animated ? `${assetBase}/card-art-pixel/${setId}/${number}/holo-strip.png?v=${THREE_PIXEL_ART_VERSION}` : null,
    `${assetBase}/card-art-pixel/${setId}/${number}/frame-0.png?v=${THREE_PIXEL_ART_VERSION}`,
    `${assetBase}/card-art/${setId}/${number}.webp`,
  ];
}

function makeCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = THREE_CARD_TEXTURE_WIDTH;
  canvas.height = THREE_CARD_TEXTURE_HEIGHT;
  return canvas;
}

async function renderFront(card, rarityId, assetBase, copyLabel, artFrame = null) {
  const canvas = makeCanvas();
  const ctx = canvas.getContext("2d");
  const rarity = RARITIES[rarityId] || RARITIES[card.rarity];
  const set = getSet(card.setId);
  const rules = getCardRules(card.id);
  const navy = "#062b57";
  const paper = "#fffdf0";

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  roundedRect(ctx, 2, 2, 596, 848, 34);
  ctx.fillStyle = rarity.color;
  ctx.fill();
  roundedRect(ctx, 11, 11, 578, 830, 27);
  ctx.fillStyle = navy;
  ctx.fill();
  roundedRect(ctx, 18, 18, 564, 816, 21);
  ctx.fillStyle = paper;
  ctx.fill();

  const head = ctx.createLinearGradient(20, 20, 580, 58);
  head.addColorStop(0, rarity.color);
  head.addColorStop(1, "#eaf7ff");
  roundedRect(ctx, 20, 20, 560, 54, 17);
  ctx.fillStyle = head;
  ctx.fill();
  ctx.fillStyle = navy;
  ctx.font = '900 18px "Trebuchet MS", Arial, sans-serif';
  ctx.textBaseline = "middle";
  ctx.fillText(`${set.short}-${String(card.number).padStart(2, "0")}`, 36, 47);
  ctx.textAlign = "right";
  ctx.fillText(rarity.short, 558, 47);
  ctx.textAlign = "left";

  const artX = 20;
  const artY = 80;
  const artW = 560;
  const artH = 350;
  const artGradient = ctx.createLinearGradient(0, artY, 0, artY + artH);
  artGradient.addColorStop(0, `${set.colors[0]}99`);
  artGradient.addColorStop(0.52, "#f4f1d9");
  artGradient.addColorStop(1, `${set.colors[2]}77`);
  ctx.fillStyle = artGradient;
  ctx.fillRect(artX, artY, artW, artH);
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = navy;
  ctx.lineWidth = 1;
  for (let y = artY + 7; y < artY + artH; y += 9) {
    ctx.beginPath();
    ctx.moveTo(artX, y);
    ctx.lineTo(artX + artW, y);
    ctx.stroke();
  }
  ctx.restore();

  const image = await loadImage(artPaths(card, assetBase, artFrame !== null));
  if (image) {
    const box = 318;
    const isStrip = image.naturalWidth >= image.naturalHeight * 3.5;
    const sourceWidth = isStrip ? image.naturalWidth / 4 : image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    const scale = Math.min(box / sourceWidth, box / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.shadowColor = "rgba(4, 31, 62, .42)";
    ctx.shadowBlur = 13;
    ctx.shadowOffsetY = 9;
    if (isStrip) {
      ctx.drawImage(
        image,
        (artFrame || 0) * sourceWidth,
        0,
        sourceWidth,
        sourceHeight,
        artX + (artW - width) / 2,
        artY + (artH - height) / 2 - 4,
        width,
        height,
      );
    } else {
      ctx.drawImage(image, artX + (artW - width) / 2, artY + (artH - height) / 2 - 4, width, height);
    }
    ctx.shadowColor = "transparent";
  }
  ctx.strokeStyle = navy;
  ctx.lineWidth = 5;
  ctx.strokeRect(artX, artY, artW, artH);

  ctx.fillStyle = "#3975a3";
  ctx.font = '900 14px "Trebuchet MS", Arial, sans-serif';
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`${rarity.label.toUpperCase()} / CREATURE`, 32, 463);

  const titleSize = fitText(ctx, card.name, 536, 38);
  ctx.fillStyle = navy;
  ctx.font = `950 ${titleSize}px "Trebuchet MS", Arial, sans-serif`;
  ctx.fillText(card.name, 32, 504);
  ctx.fillStyle = "#a9c6d7";
  ctx.fillRect(32, 519, 536, 3);

  drawTokenizedText(ctx, rules?.tokens || [], 32, 557, 536, 29, 5);

  ctx.fillStyle = "#718497";
  ctx.font = 'italic 700 16px Georgia, serif';
  drawWrappedText(ctx, `“${card.flavor}”`, 32, 744, 536, 22, 2);

  ctx.fillStyle = navy;
  ctx.fillRect(20, 788, 560, 4);
  ctx.fillStyle = "#eef8ff";
  ctx.fillRect(20, 794, 560, 38);
  ctx.fillStyle = "#567397";
  ctx.font = '900 14px "Trebuchet MS", Arial, sans-serif';
  ctx.textBaseline = "middle";
  ctx.fillText(copyLabel || "PACKWORKS", 34, 813);
  ctx.textAlign = "right";
  ctx.fillText(rarity.label.toUpperCase(), 566, 813);
  ctx.textAlign = "left";
  return canvas;
}

function drawBackWordmark(ctx, style, set) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (style === "crest") {
    ctx.save();
    ctx.translate(300, 390);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#fff8dd";
    roundedRect(ctx, -126, -126, 252, 252, 31);
    ctx.fill();
    ctx.strokeStyle = "#ffe163";
    ctx.lineWidth = 13;
    ctx.stroke();
    ctx.strokeStyle = "#052752";
    ctx.lineWidth = 5;
    roundedRect(ctx, -105, -105, 210, 210, 23);
    ctx.stroke();
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = "#075ca1";
    ctx.font = '950 64px "Trebuchet MS", Arial, sans-serif';
    ctx.fillText("PW", 0, -12);
    ctx.fillStyle = "#052752";
    ctx.font = '950 19px "Trebuchet MS", Arial, sans-serif';
    ctx.fillText("PACKWORKS", 0, 48);
    ctx.restore();
    return;
  }

  if (style === "seal") {
    ctx.fillStyle = "#fff8dd";
    ctx.beginPath();
    ctx.arc(300, 390, 142, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffe163";
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.strokeStyle = "#075ca1";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(300, 390, 112, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#052752";
    ctx.font = '950 36px "Trebuchet MS", Arial, sans-serif';
    ctx.fillText("PACK", 300, 363);
    ctx.fillText("WORKS", 300, 407);
    ctx.fillStyle = "#075ca1";
    ctx.font = '950 14px "Trebuchet MS", Arial, sans-serif';
    ctx.fillText("CARD FACTORY", 300, 455);
    return;
  }

  ctx.fillStyle = "#fff8dd";
  ctx.beginPath();
  ctx.arc(300, 390, 139, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffe163";
  ctx.lineWidth = 13;
  ctx.stroke();
  ctx.strokeStyle = "#075ca1";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(300, 390, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffe163";
  for (const x of [266, 300, 334]) {
    ctx.beginPath();
    ctx.arc(x, 322, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#052752";
  ctx.font = '950 41px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText("PACKWORKS", 300, 383);
  ctx.fillStyle = "#075ca1";
  ctx.font = '950 16px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText("CARD FACTORY", 300, 424);
}

function renderBack(card, backStyle = "crest") {
  const canvas = makeCanvas();
  const ctx = canvas.getContext("2d");
  const set = getSet(card.setId);
  const navy = "#052752";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  roundedRect(ctx, 2, 2, 596, 848, 34);
  ctx.fillStyle = navy;
  ctx.fill();
  roundedRect(ctx, 13, 13, 574, 826, 26);
  const background = ctx.createRadialGradient(300, 390, 25, 300, 390, 460);
  background.addColorStop(0, "#1679c1");
  background.addColorStop(0.48, set.colors[2]);
  background.addColorStop(1, navy);
  ctx.fillStyle = background;
  ctx.fill();

  ctx.save();
  roundedRect(ctx, 13, 13, 574, 826, 26);
  ctx.clip();
  ctx.globalAlpha = 0.13;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  for (let offset = -800; offset < 900; offset += 48) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + 852, 852);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = "#ffe163";
  ctx.lineWidth = 8;
  roundedRect(ctx, 27, 27, 546, 798, 20);
  ctx.stroke();
  ctx.strokeStyle = "#8ce8ff";
  ctx.lineWidth = 3;
  roundedRect(ctx, 42, 42, 516, 768, 16);
  ctx.stroke();

  ctx.strokeStyle = `${set.colors[0]}cc`;
  ctx.lineWidth = 6;
  for (let radius = 178; radius <= 278; radius += 50) {
    ctx.beginPath();
    ctx.arc(300, 390, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,.42)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(76, 390);
  ctx.lineTo(524, 390);
  ctx.moveTo(300, 166);
  ctx.lineTo(300, 614);
  ctx.stroke();
  for (const [x, y] of [[76, 390], [524, 390], [300, 166], [300, 614]]) {
    ctx.fillStyle = "#ffe163";
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#052752";
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  ctx.fillStyle = "#dff5ff";
  ctx.font = '950 15px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${set.short} • FIRST EDITION`, 300, 93);
  ctx.fillText("COLLECT • BUILD • DISCOVER", 300, 690);
  drawBackWordmark(ctx, backStyle, set);
  ctx.fillStyle = "#f7fbff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '900 16px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText(`${set.short} • FACTORY WRAPPED`, 300, 740);
  return canvas;
}

export async function getThreeCardCanvases(card, options = {}) {
  const rarityId = options.rarityId || card.rarity;
  const assetBase = options.assetBase || "";
  const copyLabel = options.copyLabel || "PACKWORKS";
  const backStyle = options.backStyle || "crest";
  const animated = !!options.animated;
  const key = `${card.id}:${rarityId}:${assetBase}:${copyLabel}:${backStyle}:${animated}`;
  if (!canvasCache.has(key)) {
    const fronts = animated
      ? [0, 1, 2, 3].map((frame) => renderFront(card, rarityId, assetBase, copyLabel, frame))
      : [renderFront(card, rarityId, assetBase, copyLabel)];
    canvasCache.set(key, Promise.all([
      Promise.all(fronts),
      Promise.resolve(renderBack(card, backStyle)),
    ]).then(([renderedFronts, back]) => ({
      front: renderedFronts[0],
      fronts: renderedFronts,
      back,
    })));
  }
  return canvasCache.get(key);
}
