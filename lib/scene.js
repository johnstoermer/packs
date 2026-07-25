import { RARITIES, getSet, hashString, seededRandom } from "./gameData.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function mixColor(hex, amount) {
  const raw = hex.replace("#", "");
  const value = Number.parseInt(raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw, 16);
  const target = amount < 0 ? 0 : 255;
  const ratio = Math.abs(amount);
  const red = value >> 16;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const channel = (current) => Math.round(current + (target - current) * ratio).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

export function createPackworksScene(canvas, getGameState) {
  const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
  let width = 1;
  let height = 1;
  let dpr = 1;
  let tileWidth = 64;
  let tileHeight = 32;
  let originX = 0;
  let originY = 0;
  let animationFrame = 0;
  let lastTime = performance.now();
  let elapsed = 0;
  let packKick = 0;
  let purchaseGlow = 0;
  let openingDim = 0;
  let autoPulse = 0;
  let pointerX = 0;
  let pointerY = 0;
  let smoothPointerX = 0;
  let smoothPointerY = 0;
  let resizeObserver;
  const particles = [];
  const floaters = [];
  const motes = Array.from({ length: 34 }, (_, index) => {
    const rng = seededRandom(7823 + index * 31);
    return { x: rng(), y: rng(), size: 0.5 + rng() * 1.7, speed: 0.05 + rng() * 0.12, phase: rng() * Math.PI * 2 };
  });

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = false;
    const compact = width < 700;
    tileWidth = clamp(Math.min(width / (compact ? 10.5 : 12.5), height / 8.5), 38, 76);
    tileHeight = tileWidth * 0.5;
    originX = width * (compact ? 0.5 : 0.51);
    originY = height * (compact ? 0.54 : 0.52);
  }

  function iso(x, y, z = 0) {
    return {
      x: originX + (x - y) * tileWidth * 0.5 + smoothPointerX * 7,
      y: originY + (x + y) * tileHeight * 0.5 - z * tileHeight + smoothPointerY * 4,
    };
  }

  function polygon(points, fill, stroke, lineWidth = 1) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = lineWidth;
      context.stroke();
    }
  }

  function diamond(x, y, z, sizeX, sizeY, fill, stroke = null) {
    polygon([
      iso(x, y, z),
      iso(x + sizeX, y, z),
      iso(x + sizeX, y + sizeY, z),
      iso(x, y + sizeY, z),
    ], fill, stroke);
  }

  function box(x, y, z, sizeX, sizeY, sizeZ, colors, stroke = "rgba(5,10,12,.16)") {
    const top = [
      iso(x, y, z + sizeZ),
      iso(x + sizeX, y, z + sizeZ),
      iso(x + sizeX, y + sizeY, z + sizeZ),
      iso(x, y + sizeY, z + sizeZ),
    ];
    const left = [
      iso(x, y + sizeY, z),
      iso(x, y + sizeY, z + sizeZ),
      iso(x + sizeX, y + sizeY, z + sizeZ),
      iso(x + sizeX, y + sizeY, z),
    ];
    const right = [
      iso(x + sizeX, y, z),
      iso(x + sizeX, y, z + sizeZ),
      iso(x + sizeX, y + sizeY, z + sizeZ),
      iso(x + sizeX, y + sizeY, z),
    ];
    polygon(left, colors[1], stroke);
    polygon(right, colors[2], stroke);
    polygon(top, colors[0], stroke);
  }

  function line(from, to, color, lineWidth = 1) {
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.stroke();
  }

  function drawBackground(set) {
    const top = mixColor(set.colors[2], -0.58);
    const bottom = mixColor(set.colors[2], -0.35);
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.58, bottom);
    gradient.addColorStop(1, "#101719");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    const windowLeft = width * 0.08;
    const windowTop = height * 0.07;
    const windowWidth = width * 0.84;
    const windowHeight = height * 0.34;
    context.fillStyle = "rgba(5,12,18,.62)";
    context.fillRect(windowLeft, windowTop, windowWidth, windowHeight);
    context.strokeStyle = "rgba(237,218,179,.12)";
    context.lineWidth = 2;
    context.strokeRect(windowLeft, windowTop, windowWidth, windowHeight);

    const cityRng = seededRandom(hashString(set.id) + 119);
    let cityX = windowLeft;
    while (cityX < windowLeft + windowWidth) {
      const buildingWidth = 18 + cityRng() * 38;
      const buildingHeight = 25 + cityRng() * windowHeight * 0.58;
      const buildingY = windowTop + windowHeight - buildingHeight;
      context.fillStyle = cityRng() > 0.5 ? "rgba(13,24,32,.94)" : "rgba(17,29,35,.94)";
      context.fillRect(cityX, buildingY, buildingWidth, buildingHeight);
      context.fillStyle = set.colors[0];
      for (let wx = cityX + 6; wx < cityX + buildingWidth - 4; wx += 9) {
        for (let wy = buildingY + 8; wy < windowTop + windowHeight - 5; wy += 11) {
          if (cityRng() > 0.68) {
            context.globalAlpha = 0.14 + cityRng() * 0.26;
            context.fillRect(Math.round(wx), Math.round(wy), 3, 4);
          }
        }
      }
      context.globalAlpha = 1;
      cityX += buildingWidth + 3;
    }

    context.fillStyle = "rgba(238,220,185,.13)";
    context.fillRect(windowLeft + windowWidth * 0.333, windowTop, 3, windowHeight);
    context.fillRect(windowLeft + windowWidth * 0.666, windowTop, 3, windowHeight);
    context.fillRect(windowLeft, windowTop + windowHeight * 0.58, windowWidth, 3);

    const lampGlow = context.createRadialGradient(width * 0.5, height * 0.1, 0, width * 0.5, height * 0.1, height * 0.57);
    lampGlow.addColorStop(0, "rgba(255,218,143,.13)");
    lampGlow.addColorStop(0.45, "rgba(255,210,120,.04)");
    lampGlow.addColorStop(1, "rgba(255,210,120,0)");
    context.fillStyle = lampGlow;
    context.fillRect(0, 0, width, height);

    for (const mote of motes) {
      const y = ((mote.y + elapsed * mote.speed * 0.01) % 1) * height;
      const x = mote.x * width + Math.sin(elapsed * 0.0004 + mote.phase) * 12;
      context.fillStyle = "rgba(245,226,182,.20)";
      context.fillRect(Math.round(x), Math.round(y), mote.size, mote.size);
    }
  }

  function drawPlatform(set) {
    box(-5.2, -4.1, -0.45, 10.4, 8.2, 0.45, ["#354246", "#192326", "#253136"]);
    for (let x = -5; x < 5; x += 1) {
      for (let y = -4; y < 4; y += 1) {
        const checker = (x + y) % 2 === 0;
        diamond(x, y, 0.01, 1, 1, checker ? "#314044" : "#2d3b3f", "rgba(118,139,140,.075)");
      }
    }
    diamond(-2.25, -0.4, 0.025, 4.7, 3.2, "rgba(161,76,48,.38)", "rgba(235,139,90,.22)");
    diamond(-2.05, -0.2, 0.03, 4.3, 2.8, "rgba(31,40,41,.55)", "rgba(245,189,112,.10)");

    const frontLeft = iso(-5.2, 4.1, -0.45);
    const frontRight = iso(5.2, 4.1, -0.45);
    const edgeGradient = context.createLinearGradient(frontLeft.x, frontLeft.y, frontRight.x, frontRight.y);
    edgeGradient.addColorStop(0, "rgba(255,255,255,0)");
    edgeGradient.addColorStop(0.5, `${set.colors[0]}66`);
    edgeGradient.addColorStop(1, "rgba(255,255,255,0)");
    line(frontLeft, frontRight, edgeGradient, 2);
  }

  function drawShelf(x, y, level, set, fill = 1) {
    const wood = ["#8a6b48", "#3f3229", "#604936"];
    box(x, y, 0, 2.45, 0.46, 0.18, wood);
    box(x, y, 0.12, 0.16, 0.46, 2.28, wood);
    box(x + 2.29, y, 0.12, 0.16, 0.46, 2.28, wood);
    for (let shelf = 1; shelf <= 3; shelf += 1) {
      box(x, y, shelf * 0.62, 2.45, 0.46, 0.12, wood);
      const packs = Math.min(5, Math.max(1, Math.round(fill * 5)));
      for (let pack = 0; pack < packs; pack += 1) {
        const paletteIndex = (pack + shelf + level) % 3;
        const face = set.colors[paletteIndex];
        box(
          x + 0.18 + pack * 0.43,
          y + 0.06,
          shelf * 0.62 + 0.12,
          0.28,
          0.18,
          0.36 + ((pack + shelf) % 2) * 0.08,
          [mixColor(face, 0.18), mixColor(face, -0.34), mixColor(face, -0.16)],
          "rgba(7,10,12,.25)",
        );
      }
    }
  }

  function drawTable(x, y, set) {
    const top = ["#c49b68", "#5d4635", "#896546"];
    box(x, y, 0.78, 3.25, 1.75, 0.18, top);
    box(x + 0.12, y + 0.1, 0.08, 0.24, 0.24, 0.72, ["#75583e", "#352b25", "#4b3a2d"]);
    box(x + 2.88, y + 0.1, 0.08, 0.24, 0.24, 0.72, ["#75583e", "#352b25", "#4b3a2d"]);
    box(x + 0.12, y + 1.39, 0.08, 0.24, 0.24, 0.72, ["#75583e", "#352b25", "#4b3a2d"]);
    box(x + 2.88, y + 1.39, 0.08, 0.24, 0.24, 0.72, ["#75583e", "#352b25", "#4b3a2d"]);
    diamond(x + 0.38, y + 0.25, 0.971, 2.5, 1.18, "#233033", "rgba(104,216,200,.25)");
    for (let lineIndex = 0; lineIndex < 4; lineIndex += 1) {
      line(
        iso(x + 0.55 + lineIndex * 0.58, y + 0.34, 0.98),
        iso(x + 0.55 + lineIndex * 0.58, y + 1.3, 0.98),
        "rgba(118,168,164,.12)",
      );
    }

    const packLift = Math.sin(elapsed * 0.0032) * 0.04 + packKick * 0.42;
    const packX = x + 1.28;
    const packY = y + 0.68;
    const packZ = 0.99 + packLift;
    const packColor = set.colors[0];
    box(packX, packY, packZ, 0.75, 0.46, 0.1, [
      mixColor(packColor, 0.2),
      mixColor(packColor, -0.38),
      mixColor(packColor, -0.2),
    ]);
    diamond(packX + 0.12, packY + 0.04, packZ + 0.105, 0.5, 0.34, set.colors[1]);
    line(iso(packX + 0.12, packY + 0.08, packZ + 0.112), iso(packX + 0.62, packY + 0.08, packZ + 0.112), "rgba(255,255,255,.48)", 1.2);

    const light = context.createRadialGradient(
      iso(packX + 0.38, packY + 0.23, packZ + 0.4).x,
      iso(packX + 0.38, packY + 0.23, packZ + 0.4).y,
      0,
      iso(packX + 0.38, packY + 0.23, packZ + 0.4).x,
      iso(packX + 0.38, packY + 0.23, packZ + 0.4).y,
      tileWidth * (1.2 + purchaseGlow),
    );
    light.addColorStop(0, `${set.colors[0]}${purchaseGlow > 0.08 ? "55" : "24"}`);
    light.addColorStop(1, `${set.colors[0]}00`);
    context.fillStyle = light;
    const center = iso(packX + 0.38, packY + 0.23, packZ + 0.4);
    context.fillRect(center.x - tileWidth * 1.5, center.y - tileWidth, tileWidth * 3, tileWidth * 2);

    return center;
  }

  function drawConveyor(x, y, set, rank) {
    const metal = ["#718083", "#303a3d", "#4b595d"];
    box(x, y, 0.28, 3.9, 0.72, 0.32, metal);
    diamond(x + 0.08, y + 0.06, 0.61, 3.72, 0.6, "#252f33", "rgba(130,154,157,.22)");
    for (let segment = 0; segment < 8; segment += 1) {
      line(
        iso(x + 0.2 + segment * 0.46, y + 0.07, 0.62),
        iso(x + 0.2 + segment * 0.46, y + 0.63, 0.62),
        "rgba(139,159,160,.17)",
      );
    }
    for (let leg = 0; leg < 4; leg += 1) {
      const legX = x + 0.12 + leg * 1.15;
      box(legX, y + 0.1, 0.03, 0.12, 0.12, 0.28, metal);
      box(legX, y + 0.52, 0.03, 0.12, 0.12, 0.28, metal);
    }
    const count = Math.min(5, 1 + Math.floor(rank / 2));
    for (let index = 0; index < count; index += 1) {
      const progress = (elapsed * (0.00022 + rank * 0.000005) + index / count + autoPulse * 0.08) % 1;
      const packX = x + 0.15 + progress * 3.45;
      const bob = Math.sin(progress * Math.PI) * 0.04;
      box(packX, y + 0.18, 0.64 + bob, 0.4, 0.3, 0.08, [
        mixColor(set.colors[index % 2], 0.18),
        mixColor(set.colors[index % 2], -0.42),
        mixColor(set.colors[index % 2], -0.22),
      ]);
    }
  }

  function drawMachine(x, y, set, rank) {
    const body = ["#8c9895", "#3e4948", "#5d6967"];
    box(x, y, 0.05, 1.5, 1.16, 1.78, body);
    box(x + 0.16, y + 0.08, 0.42, 1.18, 0.12, 0.75, ["#263438", "#10191c", "#182428"]);
    const screenColor = rank > 0 ? set.colors[0] : "#6f7975";
    diamond(x + 0.26, y + 0.065, 1.52, 0.78, 0.02, `${screenColor}99`);
    box(x + 0.21, y + 0.12, 1.32, 0.18, 0.15, 0.14, [set.colors[1], mixColor(set.colors[1], -0.46), mixColor(set.colors[1], -0.28)]);
    box(x + 1.03, y + 0.12, 1.32, 0.18, 0.15, 0.14, ["#e8b750", "#7e5723", "#aa792f"]);
    box(x + 0.25, y + 0.36, 0.12, 1.0, 0.54, 0.22, ["#2a3538", "#111a1d", "#1d282b"]);
    const chuteColor = autoPulse > 0.15 ? set.colors[0] : "#62706f";
    box(x + 0.55, y + 0.84, 0.02, 0.46, 0.55, 0.2, [mixColor(chuteColor, 0.16), mixColor(chuteColor, -0.5), mixColor(chuteColor, -0.28)]);
  }

  function drawCrewStation(x, y, set, rank) {
    const metal = ["#798687", "#303b3e", "#505d5f"];
    const dark = ["#344044", "#151d20", "#242e32"];
    const pulse = (Math.sin(elapsed * 0.006) + 1) * 0.5;
    box(x, y, 0.04, 2.1, 1.0, 0.3, metal);
    box(x + 0.14, y + 0.14, 0.34, 0.76, 0.72, 0.16, dark);
    box(x + 1.18, y + 0.14, 0.34, 0.76, 0.72, 0.16, dark);
    box(x + 0.92, y + 0.38, 0.36, 0.24, 0.24, 1.12, metal);
    box(x + 0.73, y + 0.3, 1.34, 0.62, 0.38, 0.18, metal);
    box(x + 0.58 + pulse * 0.42, y + 0.2, 1.18, 0.28, 0.28, 0.22, [
      mixColor(set.colors[0], 0.2),
      mixColor(set.colors[0], -0.48),
      mixColor(set.colors[0], -0.24),
    ]);
    const sorted = Math.min(4, 1 + Math.floor(rank / 4));
    for (let index = 0; index < sorted; index += 1) {
      const color = set.colors[index % 2];
      box(x + 0.22 + index * 0.4, y + 0.17, 0.52 + index * 0.025, 0.3, 0.24, 0.055, [
        mixColor(color, 0.2),
        mixColor(color, -0.44),
        mixColor(color, -0.2),
      ]);
    }
  }

  function drawDisplay(x, y, set, rank) {
    const base = ["#49575a", "#202a2d", "#313d41"];
    box(x, y, 0.03, 1.8, 1.0, 0.52, base);
    box(x + 0.1, y + 0.1, 0.55, 1.6, 0.8, 0.78, [
      "rgba(156,216,216,.18)",
      "rgba(61,105,111,.18)",
      "rgba(94,143,148,.18)",
    ], "rgba(155,214,211,.3)");
    const cardCount = Math.min(3, Math.max(1, Math.ceil(rank / 4)));
    for (let index = 0; index < cardCount; index += 1) {
      const cardX = x + 0.22 + index * 0.47;
      const color = set.colors[index % set.colors.length];
      box(cardX, y + 0.33, 0.6, 0.3, 0.08, 0.5, [
        mixColor(color, 0.2),
        mixColor(color, -0.42),
        mixColor(color, -0.18),
      ]);
    }
  }

  function drawLamp(x, y, set, active) {
    box(x, y, 0.03, 0.24, 0.24, 2.6, ["#596466", "#283235", "#3b474a"]);
    box(x - 0.28, y - 0.22, 2.54, 0.8, 0.68, 0.16, ["#d8d1b9", "#68675d", "#999582"]);
    const point = iso(x + 0.12, y + 0.12, 2.46);
    const glow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, tileWidth * 2.1);
    glow.addColorStop(0, active ? `${set.colors[0]}4a` : "rgba(255,222,163,.24)");
    glow.addColorStop(1, "rgba(255,220,150,0)");
    context.fillStyle = glow;
    context.fillRect(point.x - tileWidth * 2.1, point.y - tileWidth * 1.2, tileWidth * 4.2, tileWidth * 3.4);
  }

  function drawNeonSign(set, rank) {
    if (!rank) return;
    const x = width * 0.5 + smoothPointerX * 4;
    const y = height * 0.12 + smoothPointerY * 2;
    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `800 ${clamp(width * 0.025, 13, 23)}px Bahnschrift, Arial Narrow, sans-serif`;
    context.letterSpacing = "0.18em";
    context.shadowColor = set.colors[0];
    context.shadowBlur = 9 + Math.sin(elapsed * 0.003) * 2;
    context.fillStyle = `${set.colors[0]}dd`;
    context.fillText("PACKWORKS", x, y);
    context.shadowBlur = 0;
    context.fillStyle = "rgba(255,255,255,.65)";
    context.font = `600 ${clamp(width * 0.008, 6, 9)}px Consolas, monospace`;
    context.fillText("NIGHT SHIFT / DISTRICT 04", x, y + 18);
    context.restore();
  }

  function drawScene() {
    const state = getGameState();
    const set = getSet(state.activeSet);
    drawBackground(set);
    drawPlatform(set);

    const renderables = [];
    const add = (depth, draw) => renderables.push({ depth, draw });
    const unlockedCount = state.unlockedSets.length;
    add(-6.7, () => drawShelf(-4.25, -3.4, 0, getSet(state.unlockedSets[0]), 1));
    if (unlockedCount > 1) add(-4.1, () => drawShelf(-1.45, -3.4, 1, getSet(state.unlockedSets[Math.min(1, unlockedCount - 1)]), unlockedCount / 5));
    if (unlockedCount > 2) add(-1.5, () => drawShelf(1.35, -3.4, 2, getSet(state.unlockedSets[Math.min(2, unlockedCount - 1)]), unlockedCount / 5));
    add(-2.4, () => drawMachine(-4.15, 1.15, set, state.upgrades.sorter));
    if (state.upgrades.sorter > 0) add(-0.7, () => drawConveyor(-3.1, 2.25, set, state.upgrades.sorter));
    add(0.2, () => drawTable(-1.6, -0.55, set));
    if (state.upgrades.crew > 0) add(4.5, () => drawCrewStation(0.9, 2.7, set, state.upgrades.crew));
    if (state.upgrades.case > 0) add(5.1, () => drawDisplay(2.55, 2.0, set, state.upgrades.case));
    add(4.8, () => drawLamp(3.85, 0.95, set, state.upgrades.lights > 0));
    renderables.sort((a, b) => a.depth - b.depth);
    for (const renderable of renderables) renderable.draw();
    drawNeonSign(set, state.upgrades.lights);

    const vignette = context.createRadialGradient(width * 0.5, height * 0.5, Math.min(width, height) * 0.22, width * 0.5, height * 0.52, Math.max(width, height) * 0.72);
    vignette.addColorStop(0, "rgba(2,6,8,0)");
    vignette.addColorStop(1, `rgba(2,7,9,${0.46 + openingDim * 0.25})`);
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  }

  function drawEffects(delta) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 0.00055 * delta;
      particle.rotation += particle.spin * delta;
      if (particle.life <= 0) {
        particles.splice(index, 1);
        continue;
      }
      const alpha = Math.min(1, particle.life / 260);
      context.save();
      context.globalAlpha = alpha;
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillStyle = particle.color;
      if (particle.shape === "diamond") {
        context.beginPath();
        context.moveTo(0, -particle.size);
        context.lineTo(particle.size, 0);
        context.lineTo(0, particle.size);
        context.lineTo(-particle.size, 0);
        context.closePath();
        context.fill();
      } else {
        context.fillRect(-particle.size * 0.5, -particle.size * 0.5, particle.size, particle.size);
      }
      context.restore();
    }

    for (let index = floaters.length - 1; index >= 0; index -= 1) {
      const floater = floaters[index];
      floater.life -= delta;
      floater.y -= delta * 0.026;
      if (floater.life <= 0) {
        floaters.splice(index, 1);
        continue;
      }
      context.save();
      context.globalAlpha = Math.min(1, floater.life / 220);
      context.font = "700 11px Consolas, monospace";
      context.textAlign = "center";
      context.fillStyle = floater.color;
      context.shadowColor = "rgba(0,0,0,.8)";
      context.shadowBlur = 4;
      context.fillText(floater.text, floater.x, floater.y);
      context.restore();
    }
  }

  function frame(now) {
    const delta = clamp(now - lastTime, 0, 50);
    lastTime = now;
    elapsed += delta;
    smoothPointerX += (pointerX - smoothPointerX) * Math.min(1, delta * 0.004);
    smoothPointerY += (pointerY - smoothPointerY) * Math.min(1, delta * 0.004);
    packKick = Math.max(0, packKick - delta * 0.0028);
    purchaseGlow = Math.max(0, purchaseGlow - delta * 0.0016);
    autoPulse = Math.max(0, autoPulse - delta * 0.0018);
    drawScene();
    drawEffects(delta);
    animationFrame = requestAnimationFrame(frame);
  }

  function burst(rarityId = "uncommon", strength = 1) {
    const rarity = RARITIES[rarityId] || RARITIES.uncommon;
    const center = { x: width * 0.5, y: height * 0.48 };
    const count = Math.round((rarity.order * 7 + 14) * strength);
    for (let index = 0; index < count; index += 1) {
      const angle = Math.PI * 2 * (index / count) + Math.random() * 0.35;
      const speed = (0.055 + Math.random() * 0.13) * (1 + rarity.order * 0.16);
      particles.push({
        x: center.x + (Math.random() - 0.5) * 24,
        y: center.y + (Math.random() - 0.5) * 18,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.035,
        life: 520 + Math.random() * 520,
        size: 2 + Math.random() * (3 + rarity.order),
        color: Math.random() > 0.34 ? rarity.color : "#fff3cd",
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.008,
        shape: Math.random() > 0.46 ? "diamond" : "square",
      });
    }
    packKick = 1;
    purchaseGlow = Math.max(purchaseGlow, 0.28 + rarity.order * 0.16);
  }

  function autoResult(result) {
    autoPulse = 1;
    if (!result) return;
    const highest = result.cards.reduce((best, pull) => RARITIES[pull.rarity].order > RARITIES[best].order ? pull.rarity : best, "common");
    const center = iso(0.3, 1.1, 1.6);
    floaters.push({
      x: center.x,
      y: center.y,
      life: 850,
      text: `AUTO +${Math.floor(result.totalValue).toLocaleString("en-US")}`,
      color: RARITIES[highest].color,
    });
    if (RARITIES[highest].order >= 3) burst(highest, 0.45);
  }

  function setPointer(clientX, clientY) {
    const bounds = canvas.getBoundingClientRect();
    pointerX = clamp(((clientX - bounds.left) / bounds.width - 0.5) * 2, -1, 1);
    pointerY = clamp(((clientY - bounds.top) / bounds.height - 0.5) * 2, -1, 1);
  }

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();
  animationFrame = requestAnimationFrame(frame);

  return {
    burst,
    autoResult,
    packPulse() {
      packKick = 1;
      purchaseGlow = Math.max(purchaseGlow, 0.4);
    },
    purchase() {
      purchaseGlow = 1;
    },
    setOpening(value) {
      openingDim = value ? 1 : 0;
    },
    setPointer,
    destroy() {
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    },
  };
}
