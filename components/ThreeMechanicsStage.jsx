"use client";

import { useEffect, useRef } from "react";
import { ALL_CARDS, RARITIES, getCardRulesId } from "../lib/gameData";
import { DISCOVER_POOL } from "../lib/engineCards";
import { createThreeCardObject, shortestAngleDelta, THREE } from "../lib/threeCardObjects";

const ASSET_BASE = process.env.NEXT_PUBLIC_PACKWORKS_BASE || "";

const SAMPLE = {
  reveal: "lastlight-12",
  echo: "corner-12",
  mark: "circuit-12",
  salvage: "frontier-12",
  mimic: "abyss-12",
  fusion: "verdant-12",
  transmute: "polar-12",
  fracture: "ember-12",
  catalyst: "cloud-12",
  blueprint: "glass-12",
  relay: "harbor-12",
  discover: "orchard-08",
  autopilot: "orchard-12",
  rewrite: "unwritten-12",
};

const SECONDARY = {
  mimic: "abyss-04",
  fusion: "verdant-02",
  transmute: "polar-04",
  catalyst: "cloud-04",
  blueprint: "glass-01",
  relay: "harbor-01",
};

function cardFor(legacyId) {
  return ALL_CARDS.find((card) => getCardRulesId(card) === legacyId)
    || ALL_CARDS.find((card) => card.id === legacyId)
    || ALL_CARDS[0];
}

function ease(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function beat(phase, start, end) {
  return ease((phase - start) / Math.max(0.0001, end - start));
}

function outBack(value, overshoot = 1.45) {
  const t = THREE.MathUtils.clamp(value, 0, 1) - 1;
  return 1 + (overshoot + 1) * t ** 3 + overshoot * t ** 2;
}

function hit(phase, center, width = 0.055) {
  const distance = Math.abs(phase - center) / width;
  return distance >= 1 ? 0 : (1 - distance) ** 2;
}

function outExpo(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

function starGeometry(points = 5, outer = 0.42, inner = 0.19, depth = 0.08) {
  const shape = new THREE.Shape();
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + index * Math.PI / points;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
}

function tornPackShape(direction) {
  const shape = new THREE.Shape();
  const outer = direction < 0 ? -0.64 : 0.64;
  const inner = direction < 0 ? 0.64 : -0.64;
  shape.moveTo(outer, -1.43);
  shape.lineTo(inner, -1.43);
  [
    [-1.08, -0.1],
    [-0.73, 0.08],
    [-0.38, -0.09],
    [-0.04, 0.11],
    [0.31, -0.08],
    [0.67, 0.1],
    [1.04, -0.07],
    [1.43, 0],
  ].forEach(([y, inset]) => {
    shape.lineTo(inner + inset * direction, y);
  });
  shape.lineTo(outer, 1.43);
  shape.closePath();
  return shape;
}

function radialFlashTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 126);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.12, "rgba(255,255,255,.98)");
  gradient.addColorStop(0.38, "rgba(255,255,255,.36)");
  gradient.addColorStop(0.72, "rgba(255,255,255,.08)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function cardSpecs(mechanicId) {
  const main = SAMPLE[mechanicId] || SAMPLE.reveal;
  const secondary = SECONDARY[mechanicId] || "corner-02";
  switch (mechanicId) {
    case "echo":
      return [
        { legacy: main, x: 0, y: 0, z: 0, face: true, foil: true, scale: 0.92 },
        { legacy: main, x: -0.55, y: 0.18, z: -0.55, face: true, ghost: true, scale: 0.86 },
        { legacy: main, x: 0.55, y: -0.06, z: -0.75, face: true, ghost: true, scale: 0.82 },
      ];
    case "mark":
      return [-1.9, 0, 1.9].map((x, index) => ({
        legacy: index === 1 ? main : `corner-0${index ? 9 : 5}`,
        x,
        y: index === 1 ? 0.12 : -0.1,
        z: index === 1 ? 0.2 : -0.25,
        face: false,
        scale: index === 1 ? 0.78 : 0.7,
      }));
    case "salvage":
      return [
        { legacy: "frontier-01", x: -1.35, y: 0.5, z: -0.15, face: true, scale: 0.57, salvageInput: true },
        { legacy: "frontier-01", x: -0.48, y: -0.38, z: -0.05, face: true, scale: 0.57, salvageInput: true },
        { legacy: "frontier-01", x: 0.5, y: 0.45, z: 0.02, face: true, scale: 0.57, salvageInput: true },
        { legacy: "frontier-01", x: 1.35, y: -0.34, z: -0.12, face: true, scale: 0.57, salvageInput: true },
        { legacy: main, x: 0, y: 0.12, z: 0.28, face: false, foil: true, scale: 0.76, salvageOutput: true },
      ];
    case "fracture":
      return Array.from({ length: 7 }, (_, index) => ({
        legacy: index === 6 ? main : `corner-0${(index % 9) + 1}`,
        x: 0,
        y: 0,
        z: -index * 0.03,
        face: index === 6,
        foil: index === 6,
        scale: 0.6,
        spill: true,
      }));
    case "mimic":
      return [
        { legacy: main, x: -2.2, y: 0, z: 0, face: true, scale: 0.72 },
        { legacy: secondary, x: 0, y: 0, z: 0, face: false, scale: 0.72 },
        { legacy: main, x: 2.2, y: 0, z: 0, face: true, scale: 0.72 },
      ];
    case "fusion":
      return [
        { legacy: secondary, x: -2.05, y: -0.08, z: 0, face: true, scale: 0.68, rarityId: "common" },
        { legacy: secondary, x: 2.05, y: -0.08, z: 0, face: true, scale: 0.68, rarityId: "common" },
        { legacy: main, x: 0, y: 0.18, z: 0.3, face: true, foil: true, scale: 0.78, rarityId: "uncommon" },
      ];
    case "transmute":
      return [
        { legacy: main, x: -1.65, y: 0, z: 0, face: true, scale: 0.76, rarityId: "rare" },
        { legacy: secondary, x: 1.65, y: 0, z: 0, face: false, scale: 0.76, rarityId: "rare" },
      ];
    case "catalyst":
      return [-1.9, 0, 1.9].map((x, index) => ({
        legacy: index === 1 ? main : secondary,
        x,
        y: index === 1 ? 0.12 : -0.08,
        z: 0,
        face: index === 1,
        scale: 0.7,
      }));
    case "blueprint":
    case "relay":
      return [-2.15, 0, 2.15].map((x, index) => ({
        legacy: index === 1 ? main : secondary,
        x,
        y: index === 1 ? 0.14 : -0.08,
        z: 0,
        face: true,
        foil: index === 1,
        scale: 0.7,
      }));
    case "discover":
    case "autopilot":
      return [-1.65, 0, 1.65].map((x, index) => ({
        legacy: ["orchard-01", main, "orchard-03"][index],
        x,
        y: index === 1 ? 0.18 : -0.05,
        z: index === 1 ? 0.18 : 0,
        face: true,
        foil: mechanicId === "autopilot" && index === 1,
        scale: index === 1 ? 0.78 : 0.7,
        fan: index - 1,
      }));
    case "rewrite":
      return [{ legacy: main, x: 0, y: 0, z: 0, face: true, foil: true, scale: 0.94 }];
    default:
      return [{ legacy: main, x: 0, y: 0, z: 0, face: false, foil: true, scale: 0.94 }];
  }
}

export default function ThreeMechanicsStage({
  mechanicId,
  runId,
  paused = false,
  slow = false,
  fxStyle = "holo",
  picked,
  onPick,
}) {
  const mountRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let alive = true;
    let animationFrame = 0;
    let resizeObserver;
    const cards = [];
    const disposables = [];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    camera.position.set(0, 0.15, 8.2);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "three-mechanic-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const holoPalette = {
      reveal: { key: 0xffed9a, rim: 0x55eaff, particle: 0xffd854 },
      echo: { key: 0xdffcff, rim: 0x60ddff, particle: 0xb584ff },
      mark: { key: 0xfff2a8, rim: 0xffa63d, particle: 0xffdc45 },
      salvage: { key: 0xffedb5, rim: 0xff8d5e, particle: 0xffd06e },
      mimic: { key: 0xf5eaff, rim: 0xb675ff, particle: 0x73edff },
      fusion: { key: 0xeaffc3, rim: 0x72f5a3, particle: 0xffdc57 },
      transmute: { key: 0xe9faff, rim: 0x52d7ff, particle: 0xaa83ff },
      fracture: { key: 0xfff0ce, rim: 0xff6e73, particle: 0xc785ff },
      catalyst: { key: 0xfff5bb, rim: 0xffad3f, particle: 0xffdf55 },
      blueprint: { key: 0xe5fbff, rim: 0x5cd8ff, particle: 0x80ffd1 },
      relay: { key: 0xecf9ff, rim: 0x68e8cc, particle: 0x6fbbff },
      discover: { key: 0xfff5ba, rim: 0x66e6ff, particle: 0xffd84e },
      autopilot: { key: 0xf1f8ff, rim: 0x74b7ff, particle: 0x79f3e4 },
      rewrite: { key: 0xfaf0ff, rim: 0xc078ff, particle: 0xff78bd },
    }[mechanicId] || { key: 0xeafaff, rim: 0xbd7cff, particle: 0x7df5ff };
    const palette = fxStyle === "broadcast"
      ? { key: 0xffdc45, rim: 0x5ec9ff, particle: 0xfff2a6 }
      : fxStyle === "tabletop"
        ? { key: 0xffe4b0, rim: 0xff875c, particle: 0xffc76d }
        : holoPalette;
    scene.add(new THREE.HemisphereLight(0xe9f8ff, 0x071b38, 2.4));
    const key = new THREE.DirectionalLight(palette.key, 4.2);
    key.position.set(-4, 5, 7);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.PointLight(palette.rim, 22, 15, 2);
    rim.position.set(3.5, 1.8, 4);
    scene.add(rim);

    const root = new THREE.Group();
    scene.add(root);

    const particleCount = 180;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleSeeds = [];
    for (let index = 0; index < particleCount; index += 1) {
      const radius = 0.35 + Math.random() * 3.7;
      const angle = Math.random() * Math.PI * 2;
      particleSeeds.push({
        radius,
        angle,
        speed: 0.3 + Math.random() * 1.4,
        lift: -1.9 + Math.random() * 3.8,
      });
      particlePositions[index * 3] = Math.cos(angle) * radius;
      particlePositions[index * 3 + 1] = -2 + Math.random() * 4;
      particlePositions[index * 3 + 2] = -0.5 + Math.random();
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: palette.particle,
      size: fxStyle === "tabletop" ? 0.055 : 0.075,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);
    disposables.push(particleGeometry, particleMaterial);

    const rings = Array.from({ length: 3 }, (_, index) => {
      const geometry = new THREE.TorusGeometry(
        0.58 + index * 0.18,
        0.012 + index * 0.002,
        10,
        54,
        Math.PI * 1.56,
      );
      const material = new THREE.MeshBasicMaterial({
        color: index % 2 ? palette.rim : palette.key,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.visible = false;
      ring.rotation.x = 0;
      ring.position.z = 0.35;
      scene.add(ring);
      disposables.push(geometry, material);
      return ring;
    });

    const starMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffda3e,
      emissive: 0xff8b22,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.48,
      clearcoat: 1,
    });
    const stars = Array.from({ length: 3 }, () => {
      const geometry = starGeometry();
      const star = new THREE.Mesh(geometry, starMaterial);
      star.visible = false;
      star.position.z = 0.7;
      scene.add(star);
      disposables.push(geometry);
      return star;
    });
    disposables.push(starMaterial);

    const packMaterial = new THREE.MeshPhysicalMaterial({
      color: palette.rim,
      emissive: palette.rim,
      emissiveIntensity: 0.12,
      roughness: 0.25,
      metalness: 0.68,
      clearcoat: 1,
      clearcoatRoughness: 0.14,
    });
    const packPanelMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x082d61,
      roughness: 0.36,
      metalness: 0.42,
      clearcoat: 0.86,
      clearcoatRoughness: 0.18,
    });
    const packTrimMaterial = new THREE.MeshStandardMaterial({
      color: palette.key,
      emissive: palette.rim,
      emissiveIntensity: 0.3,
      roughness: 0.24,
      metalness: 0.8,
    });
    const packEdgeMaterial = new THREE.LineBasicMaterial({
      color: palette.key,
      transparent: true,
      opacity: 0.82,
    });
    const packHalves = [-1, 1].map((direction) => {
      const half = new THREE.Group();
      const shape = tornPackShape(direction);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.15,
        bevelEnabled: true,
        bevelSegments: 3,
        bevelSize: 0.035,
        bevelThickness: 0.035,
      });
      geometry.translate(0, 0, -0.075);
      const shell = new THREE.Mesh(geometry, packMaterial);
      shell.castShadow = true;
      shell.receiveShadow = true;
      half.add(shell);

      const panelGeometry = new THREE.ShapeGeometry(shape, 4);
      const panel = new THREE.Mesh(panelGeometry, packPanelMaterial);
      panel.scale.set(0.86, 0.84, 1);
      panel.position.z = 0.112;
      half.add(panel);

      const edgeGeometry = new THREE.EdgesGeometry(geometry, 24);
      const edge = new THREE.LineSegments(edgeGeometry, packEdgeMaterial);
      edge.position.z = 0.012;
      half.add(edge);

      const crimpGeometry = new THREE.BoxGeometry(1.18, 0.25, 0.16);
      [-1.34, 1.34].forEach((y) => {
        const crimp = new THREE.Mesh(crimpGeometry, packTrimMaterial);
        crimp.position.set(0, y, 0.02);
        crimp.castShadow = true;
        half.add(crimp);
        for (let rib = -2; rib <= 2; rib += 1) {
          const ribGeometry = new THREE.BoxGeometry(0.035, 0.2, 0.18);
          const ribMesh = new THREE.Mesh(ribGeometry, packPanelMaterial);
          ribMesh.position.set(rib * 0.21, y, 0.035);
          half.add(ribMesh);
          disposables.push(ribGeometry);
        }
      });

      const stripeGeometry = new THREE.BoxGeometry(0.055, 2.35, 0.025);
      [-0.28, 0.06, 0.4].forEach((x, stripeIndex) => {
        const stripe = new THREE.Mesh(stripeGeometry, packTrimMaterial);
        stripe.position.set(x * direction, 0, 0.13);
        stripe.rotation.z = direction * (0.19 + stripeIndex * 0.018);
        stripe.scale.y = 0.92 - stripeIndex * 0.07;
        half.add(stripe);
      });

      const sealGeometry = new THREE.RingGeometry(
        0.25,
        0.34,
        6,
        1,
        direction < 0 ? Math.PI / 2 : -Math.PI / 2,
        Math.PI,
      );
      const seal = new THREE.Mesh(sealGeometry, packTrimMaterial);
      seal.position.set(-direction * 0.55, 0.03, 0.15);
      seal.rotation.z = Math.PI / 6;
      half.add(seal);

      half.visible = false;
      half.userData.direction = direction;
      scene.add(half);
      disposables.push(geometry, panelGeometry, edgeGeometry, crimpGeometry, stripeGeometry, sealGeometry);
      return half;
    });
    disposables.push(packMaterial, packPanelMaterial, packTrimMaterial, packEdgeMaterial);

    const flashTexture = radialFlashTexture();
    const flashGeometry = new THREE.PlaneGeometry(5.8, 5.8);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: palette.key,
      map: flashTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const impactFlash = new THREE.Mesh(flashGeometry, flashMaterial);
    impactFlash.position.z = -1.45;
    impactFlash.visible = false;
    scene.add(impactFlash);
    disposables.push(flashTexture, flashGeometry, flashMaterial);

    const streakPositions = [];
    for (let index = 0; index < 44; index += 1) {
      const angle = index * Math.PI * 2 / 44 + (index % 3) * 0.04;
      const inner = 0.45 + (index % 5) * 0.04;
      const outer = 3.3 + (index % 7) * 0.14;
      streakPositions.push(
        Math.cos(angle) * inner, Math.sin(angle) * inner, -0.35,
        Math.cos(angle) * outer, Math.sin(angle) * outer, -0.35,
      );
    }
    const streakGeometry = new THREE.BufferGeometry();
    streakGeometry.setAttribute("position", new THREE.Float32BufferAttribute(streakPositions, 3));
    const streakMaterial = new THREE.LineBasicMaterial({
      color: palette.particle,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const streaks = new THREE.LineSegments(streakGeometry, streakMaterial);
    streaks.visible = false;
    scene.add(streaks);
    disposables.push(streakGeometry, streakMaterial);

    const coreGeometry = new THREE.IcosahedronGeometry(0.34, 1);
    const coreMaterial = new THREE.MeshPhysicalMaterial({
      color: palette.rim,
      emissive: palette.particle,
      emissiveIntensity: 1.5,
      roughness: 0.22,
      metalness: 0.54,
      clearcoat: 1,
      transparent: true,
      opacity: 0.86,
    });
    const coreCageMaterial = new THREE.MeshBasicMaterial({
      color: palette.key,
      wireframe: true,
      transparent: true,
      opacity: 0.76,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const energyCore = new THREE.Group();
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    const coreCage = new THREE.Mesh(coreGeometry, coreCageMaterial);
    coreCage.scale.setScalar(1.2);
    coreCage.rotation.set(0.4, 0.25, 0.16);
    energyCore.add(coreMesh, coreCage);
    energyCore.visible = false;
    energyCore.position.z = 0.75;
    scene.add(energyCore);
    disposables.push(coreGeometry, coreMaterial, coreCageMaterial);

    const shardGeometry = new THREE.TetrahedronGeometry(0.09, 0);
    const shardMaterial = new THREE.MeshBasicMaterial({
      color: palette.rim,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shardSeeds = Array.from({ length: 28 }, (_, index) => ({
      angle: index * Math.PI * 2 / 28 + (index % 4) * 0.09,
      speed: 1.4 + (index % 6) * 0.21,
      lift: 0.6 + (index % 5) * 0.16,
      spin: (index % 2 ? -1 : 1) * (2.6 + (index % 7) * 0.35),
    }));
    const shards = shardSeeds.map(() => {
      const shard = new THREE.Mesh(shardGeometry, shardMaterial);
      shard.visible = false;
      shard.position.z = 0.9;
      scene.add(shard);
      return shard;
    });
    disposables.push(shardGeometry, shardMaterial);

    const specs = cardSpecs(mechanicId);
    const clock = new THREE.Clock(false);
    Promise.all(specs.map(async (spec, index) => {
      const card = cardFor(spec.legacy);
      const object = await createThreeCardObject(card, {
        rarityId: spec.rarityId || card.rarity,
        foil: spec.foil,
        assetBase: ASSET_BASE,
        copyLabel: "3D SIM",
        scale: spec.scale,
      });
      if (!alive) {
        object.userData.dispose?.();
        return;
      }
      object.position.set(spec.x, spec.y, spec.z);
      object.rotation.y = spec.face ? 0 : Math.PI;
      object.rotation.z = spec.fan ? spec.fan * -0.08 : 0;
      object.userData.spec = spec;
      object.userData.index = index;
      object.userData.baseScale = spec.scale;
      if (spec.ghost) {
        object.traverse((child) => {
          if (!child.material) return;
          child.material.transparent = true;
          child.material.opacity = child.material.opacity == null ? 0.24 : Math.min(child.material.opacity, 0.24);
          child.material.depthWrite = false;
        });
      }
      cards[index] = object;
      root.add(object);
    })).then(() => {
      if (alive) clock.start();
    });

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const duration = slow ? 4.2 : 2.1;
    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      const elapsed = pausedRef.current ? 0 : clock.getElapsedTime();
      const phase = (elapsed % duration) / duration;
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 10.5);
      const pointer = pointerRef.current;
      root.rotation.x += ((pointer.y * 0.075) - root.rotation.x) * 0.11;
      root.rotation.y += ((pointer.x * 0.095) - root.rotation.y) * 0.11;

      cards.forEach((object) => {
        const spec = object.userData.spec;
        const index = object.userData.index;
        object.visible = true;
        object.position.x += (spec.x - object.position.x) * 0.24;
        object.position.y += (spec.y + Math.sin(elapsed * 3.1 + index) * 0.018 - object.position.y) * 0.24;
        object.position.z += (spec.z - object.position.z) * 0.24;
        object.rotation.y += shortestAngleDelta(object.rotation.y, spec.face ? 0 : Math.PI) * 0.28;
        object.userData.update?.(elapsed);
        object.userData.setGlow?.(0.25 + pulse * 0.3);
      });
      rings.forEach((ring, index) => {
        ring.visible = false;
        ring.rotation.set(
          0,
          0,
          elapsed * (1.8 + index * 0.45) * (index % 2 ? -1 : 1) + index * 2.08,
        );
        ring.position.set(0, 0, 0.35);
        ring.scale.setScalar(1);
        ring.material.opacity = 0;
      });
      stars.forEach((star) => { star.visible = false; });
      packHalves.forEach((half) => { half.visible = false; });
      energyCore.visible = false;

      const impactSchedule = {
        reveal: [0.31],
        echo: [0.22, 0.34],
        mark: [0.27],
        salvage: [0.28],
        fracture: [0.28],
        mimic: [0.36],
        fusion: [0.31],
        transmute: [0.37],
        catalyst: [0.2, 0.33, 0.46],
        blueprint: [0.29, 0.5],
        relay: [0.29, 0.5],
        discover: picked ? [0.52] : [],
        autopilot: [0.52],
        rewrite: [0.39],
      }[mechanicId] || [0.32];
      const impactAmount = Math.max(0, ...impactSchedule.map((center) => hit(phase, center, 0.065)));
      const primaryImpact = impactSchedule[0] ?? 0.32;
      const burstProgress = beat(phase, primaryImpact, Math.min(0.82, primaryImpact + 0.3));
      const burstActive = phase >= primaryImpact && phase <= primaryImpact + 0.32;

      if (mechanicId === "reveal" && cards[0]) {
        const windup = beat(phase, 0.06, 0.13);
        const turn = outBack(beat(phase, 0.13, 0.31), 0.82);
        cards[0].rotation.y = Math.PI * (1 - turn);
        cards[0].rotation.z = -windup * 0.06 + impactAmount * 0.03;
        cards[0].position.z = Math.sin(Math.min(1, turn) * Math.PI) * 0.92;
        cards[0].scale.setScalar(specs[0].scale * (1 - windup * 0.055 + impactAmount * 0.15));
        rings.forEach((ring, index) => {
          const shock = beat(phase, 0.29 + index * 0.018, 0.58 + index * 0.025);
          ring.visible = shock > 0 && shock < 1;
          ring.scale.setScalar(0.3 + outExpo(shock) * (1.72 + index * 0.24));
          ring.material.opacity = (1 - shock) * (0.68 - index * 0.08);
        });
      } else if (mechanicId === "echo") {
        cards.forEach((object) => {
          const index = object.userData.index;
          if (index === 0) {
            object.position.z = hit(phase, 0.22, 0.09) * 0.52;
            object.scale.setScalar(specs[0].scale * (1 + hit(phase, 0.22, 0.09) * 0.1));
            return;
          }
          const direction = index === 1 ? -1 : 1;
          const echoKick = outBack(beat(phase, 0.14 + index * 0.035, 0.28 + index * 0.04), 1.15);
          object.position.x = direction * echoKick * (0.9 + index * 0.18);
          object.position.y = (index === 1 ? 0.16 : -0.1) + Math.sin(phase * Math.PI * 6 + index) * 0.055;
          object.position.z = -0.36 - index * 0.18 + echoKick * 0.25;
          object.rotation.z = direction * (1 - echoKick) * 0.2;
          object.scale.setScalar(specs[index].scale * Math.max(0.02, echoKick));
        });
        rings.forEach((ring, index) => {
          const wave = beat(phase, 0.19 + index * 0.045, 0.45 + index * 0.04);
          ring.visible = wave > 0 && wave < 1;
          ring.scale.setScalar(0.38 + wave * (1.52 + index * 0.2));
          ring.material.opacity = (1 - wave) * 0.86;
        });
      } else if (mechanicId === "mark") {
        const target = cards.find((object) => object?.userData.index === 1);
        if (target) {
          const slam = outBack(beat(phase, 0.1, 0.27), 1.75);
          const star = stars[0];
          star.visible = phase > 0.07;
          star.position.set(target.position.x, 4.25 - slam * 2.73, 0.92);
          star.rotation.z = elapsed * 7.2;
          star.scale.setScalar(0.3 + slam * 0.74 + impactAmount * 0.24);
          target.position.y -= impactAmount * 0.15;
          target.rotation.z = Math.sin(elapsed * 72) * impactAmount * 0.04;
        }
        rings[0].visible = burstActive;
        rings[0].position.y = 0.1;
        rings[0].scale.set(0.62 + burstProgress * 3.35, 0.16 + burstProgress * 0.14, 1);
        rings[0].material.opacity = (1 - burstProgress) * 0.96;
      } else if (mechanicId === "salvage") {
        const compact = outExpo(beat(phase, 0.06, 0.29));
        const output = cards.find((object) => object?.userData.spec?.salvageOutput);
        cards.filter((object) => object?.userData.spec?.salvageInput).forEach((object) => {
          const index = object.userData.index;
          const orbit = compact * Math.PI * (1.05 + index * 0.08);
          const radius = (1 - compact) * (1.2 + (index % 2) * 0.28);
          const startAngle = index * Math.PI / 2 + 0.35;
          object.position.x = Math.cos(startAngle + orbit) * radius;
          object.position.y = Math.sin(startAngle + orbit) * radius * 0.55;
          object.position.z = compact * 0.5;
          object.rotation.z = orbit * (index % 2 ? -1 : 1);
          object.rotation.y = compact * Math.PI * 1.5;
          object.scale.setScalar(specs[index].scale * Math.max(0.018, 1 - compact));
          object.visible = compact < 0.985;
        });
        energyCore.visible = phase > 0.1 && phase < 0.48;
        energyCore.position.set(0, 0, 0.9);
        energyCore.rotation.set(elapsed * 8, elapsed * 11, elapsed * -6);
        energyCore.scale.setScalar(
          0.18
          + beat(phase, 0.1, 0.29) * 0.88
          - beat(phase, 0.31, 0.47) * 0.74,
        );
        rings.forEach((ring, index) => {
          const coil = beat(phase, 0.1 + index * 0.025, 0.34 + index * 0.02);
          ring.visible = coil > 0 && coil < 1;
          ring.scale.setScalar(1.5 - coil * 1.08 + index * 0.16);
          ring.rotation.z += coil * Math.PI * (index % 2 ? -2.2 : 2.2);
          ring.material.opacity = Math.sin(coil * Math.PI) * 0.72;
        });
        if (output) {
          const release = outBack(beat(phase, 0.29, 0.48), 1.7);
          output.visible = phase > 0.285;
          output.position.set(0, -0.5 + release * 0.64, release * 0.58);
          output.rotation.y = Math.PI * (1 - Math.min(1, release));
          output.rotation.z = (1 - Math.min(1, release)) * -0.22;
          output.scale.setScalar(specs[4].scale * Math.max(0.018, release));
          output.userData.setGlow?.(0.5 + release * 0.5);
        }
      } else if (mechanicId === "fracture") {
        const tear = outBack(beat(phase, 0.08, 0.27), 1.45);
        const burst = outExpo(beat(phase, 0.25, 0.49));
        packHalves.forEach((half) => {
          half.visible = phase < 0.64;
          half.position.x = half.userData.direction * (0.62 + tear * 2.7);
          half.position.y = impactAmount * 0.14;
          half.rotation.z = half.userData.direction * tear * 0.72;
          half.rotation.y = half.userData.direction * tear * 0.24;
        });
        cards.forEach((object) => {
          const index = object.userData.index;
          const angle = -Math.PI * 0.82 + index * (Math.PI * 1.64 / Math.max(1, cards.length - 1));
          const radius = burst * (2.18 + (index % 2) * 0.5);
          object.position.x = Math.cos(angle) * radius;
          object.position.y = Math.sin(angle) * radius * 0.58 - 0.1;
          object.position.z = burst * 0.4 + index * 0.025;
          object.rotation.z = (angle + Math.PI / 2) * burst;
          object.rotation.y = Math.PI * (1 - burst);
          object.scale.setScalar(specs[index].scale * Math.max(0.02, outBack(burst, 0.75)));
        });
      } else if (mechanicId === "mimic" && cards.length >= 3) {
        const travel = outExpo(beat(phase, 0.1, 0.27));
        const copy = outBack(beat(phase, 0.27, 0.43), 0.92);
        const target = cards.find((object) => object?.userData.index === 1);
        energyCore.visible = phase > 0.08 && phase < 0.41;
        energyCore.position.set(-2.2 + travel * 2.2, 0.08 + Math.sin(travel * Math.PI) * 0.38, 0.96);
        energyCore.scale.setScalar(0.28 + hit(phase, 0.36, 0.12) * 0.88);
        if (target) {
          target.rotation.y = Math.PI * (1 - copy);
          target.position.z = Math.sin(Math.min(1, copy) * Math.PI) * 0.76;
          target.scale.setScalar(specs[1].scale * (1 + hit(phase, 0.4, 0.08) * 0.12));
        }
        rings.forEach((ring, index) => {
          const wave = beat(phase, 0.31 + index * 0.025, 0.55 + index * 0.035);
          ring.visible = wave > 0 && wave < 1;
          ring.position.x = 0;
          ring.scale.setScalar(0.32 + wave * (1.42 + index * 0.2));
          ring.material.opacity = (1 - wave) * 0.84;
        });
      } else if (mechanicId === "fusion" && cards.length >= 3) {
        const merge = outExpo(beat(phase, 0.08, 0.3));
        const result = cards.find((object) => object?.userData.index === 2);
        cards.filter((object) => object && object.userData.index < 2).forEach((object) => {
          const index = object.userData.index;
          object.position.x = (index ? 1 : -1) * 2.05 * (1 - merge);
          object.position.y = -0.08 + Math.sin(merge * Math.PI) * 0.22;
          object.scale.setScalar(specs[index].scale * Math.max(0.025, 1 - merge * 0.96));
          object.rotation.z = (index ? -1 : 1) * merge * 0.88;
          object.visible = merge < 0.99;
        });
        if (result) {
          const emerge = outBack(beat(phase, 0.3, 0.5), 1.7);
          result.visible = phase > 0.29;
          result.scale.setScalar(specs[2].scale * Math.max(0.02, emerge));
          result.position.y = -0.55 + emerge * 0.73;
          result.position.z = emerge * 0.42;
          result.rotation.y = Math.PI * (1 - Math.min(1, emerge));
        }
        rings.forEach((ring, index) => {
          const wave = beat(phase, 0.29 + index * 0.022, 0.58 + index * 0.03);
          ring.visible = wave > 0 && wave < 1;
          ring.scale.setScalar(0.26 + wave * (1.82 + index * 0.24));
          ring.material.opacity = (1 - wave) * 0.94;
        });
      } else if (mechanicId === "transmute" && cards.length >= 2) {
        const travel = outExpo(beat(phase, 0.09, 0.28));
        const shift = outBack(beat(phase, 0.27, 0.45), 1.08);
        const target = cards.find((object) => object?.userData.index === 1);
        energyCore.visible = phase > 0.07 && phase < 0.39;
        energyCore.position.set(-1.65 + travel * 3.3, 0.05 + Math.sin(travel * Math.PI) * 0.45, 0.96);
        energyCore.scale.setScalar(0.26 + hit(phase, 0.37, 0.13) * 0.84);
        if (target) {
          target.rotation.y = Math.PI * (1 - shift);
          target.rotation.z = Math.sin(Math.min(1, shift) * Math.PI) * -0.1;
          target.position.z = Math.sin(Math.min(1, shift) * Math.PI) * 0.72;
          target.scale.setScalar(specs[1].scale * (1 + hit(phase, 0.42, 0.08) * 0.12));
        }
        rings.forEach((ring, index) => {
          const wave = beat(phase, 0.27 + index * 0.03, 0.56 + index * 0.035);
          ring.visible = wave > 0 && wave < 1;
          ring.position.x = 1.65;
          ring.rotation.y = elapsed * (3.2 + index);
          ring.scale.setScalar(0.42 + wave * (1.22 + index * 0.16));
          ring.material.opacity = (1 - wave) * 0.88;
        });
      } else if (mechanicId === "catalyst") {
        cards.forEach((object) => {
          const index = object.userData.index;
          const strikeAt = 0.2 + index * 0.13;
          if (phase < strikeAt - 0.1) return;
          const arrive = outBack(beat(phase, strikeAt - 0.09, strikeAt), 1.55);
          const star = stars[index];
          star.visible = true;
          star.position.set(object.position.x, 3.15 - arrive * 1.79, 0.88);
          star.scale.setScalar(0.24 + arrive * 0.62 + hit(phase, strikeAt, 0.05) * 0.2);
          star.rotation.z = elapsed * (index % 2 ? -7.5 : 7.5);
          if (index > 0) {
            const flip = outBack(beat(phase, strikeAt, strikeAt + 0.16), 0.72);
            object.rotation.y = Math.PI * (1 - flip);
          }
          object.position.y -= hit(phase, strikeAt, 0.048) * 0.13;
        });
      } else if (mechanicId === "blueprint" || mechanicId === "relay") {
        const firstHop = outExpo(beat(phase, 0.08, 0.29));
        const secondHop = outExpo(beat(phase, 0.3, 0.5));
        const segment = phase < 0.3 ? 0 : 1;
        const hop = segment ? secondHop : firstHop;
        const from = segment ? 0 : -2.15;
        energyCore.visible = phase > 0.06 && phase < 0.56;
        energyCore.position.set(from + hop * 2.15, 0.12 + Math.sin(hop * Math.PI) * 0.34, 0.96);
        energyCore.scale.setScalar(0.23 + Math.max(hit(phase, 0.29, 0.075), hit(phase, 0.5, 0.075)) * 0.8);
        rings[0].visible = true;
        rings[0].position.set(from + hop * 2.15, 0.12, 0.72);
        rings[0].scale.setScalar(0.2 + pulse * 0.1);
        rings[0].material.opacity = 0.9;
        cards.forEach((object) => {
          const index = object.userData.index;
          const localHit = index === 1 ? hit(phase, 0.29, 0.06) : index === 2 ? hit(phase, 0.5, 0.06) : 0;
          object.position.z += localHit * 0.5;
          object.scale.setScalar(specs[index].scale * (1 + localHit * 0.11));
        });
      } else if (mechanicId === "discover" || mechanicId === "autopilot") {
        cards.forEach((object) => {
          const index = object.userData.index;
          const deal = outBack(beat(phase, 0.05 + index * 0.055, 0.23 + index * 0.055), 1.25);
          object.position.x = specs[index].x * deal;
          object.position.y = -1.65 + (specs[index].y + 1.65) * deal;
          object.position.z = -0.65 + (specs[index].z + 0.65) * deal;
          object.rotation.z = (index - 1) * -0.11 * deal + (1 - deal) * (index - 1) * 0.4;
          object.rotation.y = Math.PI * (1 - Math.min(1, deal));
          object.scale.setScalar(specs[index].scale * Math.max(0.02, deal));
          const selected = mechanicId === "autopilot" ? index === 1 : picked === DISCOVER_POOL[index]?.id;
          const selectBeat = selected ? outBack(beat(phase, 0.43, 0.57), 1.4) : 0;
          object.position.y += selectBeat * 0.43;
          object.position.z += selectBeat * 0.45;
          object.scale.multiplyScalar(selected ? 1 + selectBeat * 0.1 : 1 - selectBeat * 0.05);
          object.userData.setGlow?.(selected ? 0.55 + selectBeat * 0.45 : 0.16);
        });
      } else if (mechanicId === "rewrite" && cards[0]) {
        const collapse = outExpo(beat(phase, 0.08, 0.34));
        const returnBeat = outBack(beat(phase, 0.39, 0.61), 1.9);
        if (phase < 0.38) {
          cards[0].scale.setScalar(specs[0].scale * Math.max(0.018, 1 - collapse));
          cards[0].rotation.y = collapse * Math.PI * 4;
          cards[0].rotation.z = collapse * -0.42;
          cards[0].position.z = collapse * 0.82;
        } else {
          cards[0].scale.setScalar(specs[0].scale * Math.max(0.018, returnBeat));
          cards[0].rotation.y = Math.PI * 2 * (1 - Math.min(1, returnBeat));
          cards[0].position.z = returnBeat * 0.45;
        }
        stars.forEach((star, index) => {
          const orbit = beat(phase, 0.33, 0.62);
          star.visible = phase > 0.3;
          const angle = elapsed * (4.4 + index * 0.45) + index * Math.PI * 2 / 3;
          star.position.set(Math.cos(angle) * (0.45 + orbit * 1.9), Math.sin(angle) * (0.3 + orbit * 1.25), 0.65);
          star.scale.setScalar(0.22 + orbit * 0.3);
          star.rotation.z = -angle;
        });
      }

      const impactPoint = {
        transmute: [1.65, 0],
        mimic: [0, 0],
        blueprint: [phase < 0.4 ? 0 : 2.15, 0.12],
        relay: [phase < 0.4 ? 0 : 2.15, 0.12],
        catalyst: [
          phase < 0.27 ? -1.9 : phase < 0.4 ? 0 : 1.9,
          0.05,
        ],
      }[mechanicId] || [0, 0];
      const [impactX, impactY] = impactPoint;
      impactFlash.visible = impactAmount > 0.005;
      impactFlash.position.set(impactX, impactY, -1.45);
      impactFlash.scale.setScalar(0.74 + impactAmount * 0.56);
      flashMaterial.opacity = impactAmount * (fxStyle === "holo" ? 0.44 : 0.3);
      streaks.visible = impactAmount > 0.015;
      streaks.position.set(impactX, impactY, 0);
      streaks.scale.setScalar(0.52 + (1 - impactAmount) * 0.48);
      streaks.rotation.z = elapsed * 0.18;
      streakMaterial.opacity = impactAmount * 0.9;

      const coreMechanics = ["mimic", "fusion", "transmute", "blueprint", "relay", "rewrite"];
      if (
        coreMechanics.includes(mechanicId)
        && !energyCore.visible
        && phase > primaryImpact - 0.18
        && phase < primaryImpact + 0.12
      ) {
        energyCore.visible = true;
        energyCore.position.set(impactX, impactY, 0.82);
        energyCore.scale.setScalar(0.22 + hit(phase, primaryImpact, 0.17) * 2.1);
        energyCore.rotation.set(elapsed * 7, elapsed * 10, elapsed * 5);
        coreMaterial.opacity = 0.62 + impactAmount * 0.38;
      }

      shardMaterial.opacity = burstActive ? Math.max(0, 1 - burstProgress) * 0.72 : 0;
      shards.forEach((shard, index) => {
        const seed = shardSeeds[index];
        shard.visible = burstActive;
        if (!burstActive) return;
        const distance = outExpo(burstProgress) * seed.speed;
        shard.position.set(
          impactX + Math.cos(seed.angle) * distance,
          impactY + Math.sin(seed.angle) * distance * seed.lift,
          0.72 + Math.sin(seed.angle * 1.7) * 0.28,
        );
        shard.rotation.set(seed.spin * burstProgress, seed.spin * 0.7 * burstProgress, seed.angle);
        shard.scale.setScalar(0.68 + (1 - burstProgress) * 0.92);
      });

      const positions = particleGeometry.attributes.position.array;
      particleSeeds.forEach((seed, index) => {
        const angle = seed.angle + elapsed * seed.speed * 0.55;
        const rush = 1 + impactAmount * 0.95 + (burstActive ? outExpo(burstProgress) * 0.62 : 0);
        positions[index * 3] = impactX + Math.cos(angle) * seed.radius * rush;
        positions[index * 3 + 1] = impactY + seed.lift + Math.sin(elapsed * seed.speed * 2.2 + seed.angle) * 0.14;
        positions[index * 3 + 2] = -0.45 + Math.sin(angle * 1.7) * 0.4;
      });
      particleGeometry.attributes.position.needsUpdate = true;
      particles.rotation.z = elapsed * 0.055;
      particleMaterial.opacity = 0.28 + pulse * 0.18 + impactAmount * 0.5;
      const shake = impactAmount * (fxStyle === "holo" ? 0.105 : 0.07);
      camera.position.set(
        Math.sin(elapsed * 93) * shake,
        0.15 + Math.cos(elapsed * 111) * shake * 0.72,
        8.2 - impactAmount * 0.34,
      );
      rim.intensity = 22 + impactAmount * 38;
      rim.position.x = 3.5 + pointer.x * 2.4 + impactX * 0.15;
      rim.position.y = 1.8 - pointer.y * 1.5 + impactY * 0.15;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      alive = false;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      cards.forEach((object) => object.userData.dispose?.());
      disposables.forEach((item) => item.dispose?.());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [fxStyle, mechanicId, picked, runId, slow]);

  return (
    <div
      className={`three-mechanic-stage mechanic-3d-${mechanicId}`}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pointerRef.current = {
          x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
          y: -((event.clientY - rect.top) / rect.height - 0.5) * 2,
        };
      }}
      onPointerLeave={() => { pointerRef.current = { x: 0, y: 0 }; }}
    >
      <div ref={mountRef} className="three-mechanic-mount" />
      <div className="three-mechanic-hud">
        <span>PACKWORKS FX</span>
        <b>{mechanicId.toUpperCase()}</b>
      </div>
      {(mechanicId === "discover" || mechanicId === "autopilot") && (
        <div className="three-discover-controls">
          {DISCOVER_POOL.slice(0, 3).map((option, index) => {
            const selected = mechanicId === "autopilot" ? index === 1 : picked === option.id;
            return (
              <button
                type="button"
                key={option.id}
                className={selected ? "is-selected" : ""}
                disabled={mechanicId === "autopilot"}
                onClick={() => onPick?.(option.id)}
              >
                <b>{option.name}</b>
                <small>{selected ? "SELECTED" : "CHOOSE"}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
