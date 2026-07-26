"use client";

import { useEffect, useRef } from "react";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { THREE } from "../lib/threeCardObjects";

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function span(value, start, end) {
  const t = clamp01((value - start) / Math.max(0.0001, end - start));
  return t * t * (3 - 2 * t);
}

function outExpo(value) {
  const t = clamp01(value);
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

function outBack(value, overshoot = 1.45) {
  const t = clamp01(value) - 1;
  return 1 + (overshoot + 1) * t ** 3 + overshoot * t ** 2;
}

function hit(value, center, width = 0.07) {
  const distance = Math.abs(value - center) / width;
  return distance >= 1 ? 0 : (1 - distance) ** 2;
}

function tornHalfShape(direction) {
  const shape = new THREE.Shape();
  const outer = direction < 0 ? -0.43 : 0.43;
  const inner = direction < 0 ? 0.05 : -0.05;
  shape.moveTo(outer, -0.61);
  shape.lineTo(inner, -0.61);
  [
    [-0.36, -0.08],
    [-0.13, 0.08],
    [0.11, -0.07],
    [0.35, 0.08],
    [0.61, 0],
  ].forEach(([y, inset]) => shape.lineTo(inner + inset * direction, y));
  shape.lineTo(outer, 0.61);
  shape.closePath();
  return shape;
}

function radialTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 63);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.2, "rgba(255,255,255,.9)");
  gradient.addColorStop(0.58, "rgba(255,255,255,.16)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createSalvageBurst(shared, descriptor) {
  const group = new THREE.Group();
  const inputs = Array.from({ length: 4 }, (_, index) => {
    const mesh = new THREE.Mesh(shared.cardGeometry, shared.salvageCardMaterial);
    mesh.userData.index = index;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  });
  const rings = [0, 1].map((index) => {
    const mesh = new THREE.Mesh(
      shared.ringGeometry,
      index ? shared.cyanMaterial : shared.goldMaterial,
    );
    mesh.userData.index = index;
    group.add(mesh);
    return mesh;
  });
  const core = new THREE.Mesh(shared.coreGeometry, shared.salvageCoreMaterial);
  group.add(core);

  const output = new THREE.Group();
  const pack = new THREE.Mesh(shared.packGeometry, shared.goldPhysicalMaterial);
  pack.castShadow = true;
  const crest = new THREE.Mesh(shared.crestGeometry, shared.navyMaterial);
  crest.position.z = 0.075;
  crest.rotation.z = Math.PI / 4;
  output.add(pack, crest);
  group.add(output);

  const sparks = Array.from({ length: 10 }, (_, index) => {
    const mesh = new THREE.Mesh(
      shared.sparkGeometry,
      index % 2 ? shared.cyanMaterial : shared.goldMaterial,
    );
    mesh.userData.index = index;
    group.add(mesh);
    return mesh;
  });

  return {
    ...descriptor,
    type: "salvage",
    duration: 1.28,
    group,
    inputs,
    rings,
    core,
    output,
    sparks,
  };
}

function createFractureBurst(shared, descriptor) {
  const group = new THREE.Group();
  const halves = [-1, 1].map((direction) => {
    const mesh = new THREE.Mesh(
      direction < 0 ? shared.leftHalfGeometry : shared.rightHalfGeometry,
      shared.fracturePackMaterial,
    );
    mesh.userData.direction = direction;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  });
  const crack = new THREE.LineSegments(shared.crackGeometry, shared.crackMaterial);
  crack.position.z = 0.16;
  group.add(crack);
  const rewards = Array.from({ length: 4 }, (_, index) => {
    const mesh = new THREE.Mesh(
      shared.cardGeometry,
      index % 2 ? shared.fractureCardAltMaterial : shared.fractureCardMaterial,
    );
    mesh.userData.index = index;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  });
  const shards = Array.from({ length: 12 }, (_, index) => {
    const mesh = new THREE.Mesh(
      shared.sparkGeometry,
      index % 3 ? shared.coralMaterial : shared.violetMaterial,
    );
    mesh.userData.index = index;
    group.add(mesh);
    return mesh;
  });
  const flash = new THREE.Mesh(shared.flashGeometry, shared.flashMaterial);
  flash.position.z = -0.2;
  group.add(flash);
  return {
    ...descriptor,
    type: "fracture",
    duration: 1.16,
    group,
    halves,
    crack,
    rewards,
    shards,
    flash,
  };
}

function updateSalvage(instance, phase, elapsed) {
  const collapse = outExpo(span(phase, 0.04, 0.34));
  const impact = hit(phase, 0.36, 0.08);
  instance.inputs.forEach((mesh, index) => {
    const angle = index * Math.PI / 2 + collapse * Math.PI * (1.25 + index * 0.07);
    const radius = (1 - collapse) * (0.76 + (index % 2) * 0.18);
    mesh.visible = collapse < 0.985;
    mesh.position.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius * 0.58,
      collapse * 0.18,
    );
    mesh.rotation.set(collapse * 0.5, collapse * Math.PI * 1.6, angle + Math.PI / 2);
    mesh.scale.setScalar(Math.max(0.02, 0.76 - collapse * 0.73));
  });
  instance.rings.forEach((ring, index) => {
    const coil = span(phase, 0.08 + index * 0.025, 0.39);
    ring.visible = coil > 0 && coil < 1;
    ring.rotation.z = elapsed * (index ? -9 : 11);
    ring.scale.setScalar(1.35 - coil * 1.1 + index * 0.18);
  });
  instance.core.visible = phase > 0.08 && phase < 0.48;
  instance.core.rotation.set(elapsed * 8, elapsed * 11, elapsed * 6);
  instance.core.scale.setScalar(0.08 + span(phase, 0.08, 0.32) * 0.74 - span(phase, 0.36, 0.48) * 0.6);

  const release = outBack(span(phase, 0.34, 0.58), 1.8);
  instance.output.visible = phase > 0.33;
  instance.output.position.set(0, -0.25 + release * 0.52, 0.22 + release * 0.18);
  instance.output.rotation.set(0.08, (1 - Math.min(1, release)) * Math.PI, -0.18 + release * 0.18);
  instance.output.scale.setScalar(Math.max(0.02, release * 0.72));
  instance.sparks.forEach((spark, index) => {
    const burst = span(phase, 0.35 + (index % 2) * 0.012, 0.7);
    const angle = index * Math.PI * 2 / instance.sparks.length + 0.2;
    spark.visible = burst > 0 && burst < 1;
    spark.position.set(
      Math.cos(angle) * outExpo(burst) * (0.78 + (index % 3) * 0.12),
      Math.sin(angle) * outExpo(burst) * (0.52 + (index % 2) * 0.1),
      0.3,
    );
    spark.rotation.set(burst * 5, burst * 7, angle);
    spark.scale.setScalar((1 - burst) * 0.72 + 0.08);
  });
  instance.group.rotation.z = Math.sin(elapsed * 86) * impact * 0.025;
}

function updateFracture(instance, phase, elapsed) {
  const tear = outBack(span(phase, 0.06, 0.3), 1.7);
  const impact = hit(phase, 0.28, 0.075);
  instance.halves.forEach((half) => {
    const direction = half.userData.direction;
    half.visible = phase < 0.76;
    half.position.set(direction * tear * 0.68, -tear * 0.06, 0.08);
    half.rotation.set(-tear * 0.16, direction * tear * 0.3, direction * tear * 0.56);
  });
  instance.crack.visible = phase > 0.04 && phase < 0.42;
  instance.crack.scale.setScalar(0.35 + span(phase, 0.04, 0.18) * 0.82);
  instance.crack.rotation.z = Math.sin(elapsed * 55) * 0.035;

  instance.flash.visible = impact > 0.01;
  instance.flash.scale.setScalar(0.45 + impact * 1.15);
  instance.rewards.forEach((card, index) => {
    const launch = outBack(span(phase, 0.21 + index * 0.025, 0.49 + index * 0.025), 1.35);
    const direction = (index - 1.5) / 1.5;
    card.visible = phase > 0.19 + index * 0.025;
    card.position.set(direction * launch * 0.92, -0.14 + launch * (0.72 + Math.abs(direction) * 0.14), 0.14 + index * 0.035);
    card.rotation.set(-0.1 * launch, direction * 0.22 * launch, direction * -0.28 * launch);
    card.scale.setScalar(Math.max(0.02, launch * 0.66));
  });
  instance.shards.forEach((shard, index) => {
    const burst = span(phase, 0.25 + (index % 3) * 0.008, 0.62);
    const angle = index * Math.PI * 2 / instance.shards.length + 0.08;
    shard.visible = burst > 0 && burst < 1;
    shard.position.set(
      Math.cos(angle) * outExpo(burst) * (0.72 + (index % 4) * 0.13),
      Math.sin(angle) * outExpo(burst) * (0.6 + (index % 3) * 0.09),
      0.28,
    );
    shard.rotation.set(burst * 8, burst * 5, angle);
    shard.scale.setScalar(0.78 - burst * 0.68);
  });
  instance.group.rotation.z = Math.sin(elapsed * 92) * impact * 0.04;
}

export default function ThreeGlobalBurstLayer({
  bursts,
  onComplete,
  size = "compact",
}) {
  const mountRef = useRef(null);
  const spawnRef = useRef(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let animationFrame = 0;
    let resizeObserver;
    const active = new Map();
    const seen = new Set();
    const view = { width: 10, height: 10, pixelWidth: 1 };
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 30);
    camera.position.set(0, 0, 10);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "three-global-burst-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xf0fbff, 0x10213b, 2.3));
    const key = new THREE.DirectionalLight(0xfff1c6, 4.6);
    key.position.set(-3, 5, 8);
    scene.add(key);
    const rim = new THREE.PointLight(0x8cdfff, 20, 12, 2);
    rim.position.set(3, 2, 5);
    scene.add(rim);

    const flashTexture = radialTexture();
    const shared = {
      cardGeometry: new RoundedBoxGeometry(0.58, 0.82, 0.055, 4, 0.055),
      packGeometry: new RoundedBoxGeometry(0.72, 0.98, 0.1, 5, 0.075),
      crestGeometry: new THREE.RingGeometry(0.13, 0.19, 4),
      ringGeometry: new THREE.TorusGeometry(0.42, 0.016, 8, 40, Math.PI * 1.62),
      coreGeometry: new THREE.IcosahedronGeometry(0.23, 1),
      sparkGeometry: new THREE.TetrahedronGeometry(0.06, 0),
      leftHalfGeometry: new THREE.ExtrudeGeometry(tornHalfShape(-1), {
        depth: 0.1,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.025,
        bevelThickness: 0.025,
      }),
      rightHalfGeometry: new THREE.ExtrudeGeometry(tornHalfShape(1), {
        depth: 0.1,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.025,
        bevelThickness: 0.025,
      }),
      crackGeometry: new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.04, 0.58, 0), new THREE.Vector3(0.06, 0.34, 0),
        new THREE.Vector3(0.06, 0.34, 0), new THREE.Vector3(-0.05, 0.12, 0),
        new THREE.Vector3(-0.05, 0.12, 0), new THREE.Vector3(0.07, -0.1, 0),
        new THREE.Vector3(0.07, -0.1, 0), new THREE.Vector3(-0.06, -0.34, 0),
        new THREE.Vector3(-0.06, -0.34, 0), new THREE.Vector3(0.03, -0.58, 0),
      ]),
      flashGeometry: new THREE.PlaneGeometry(2.5, 2.5),
      salvageCardMaterial: new THREE.MeshPhysicalMaterial({
        color: 0x2f80aa,
        roughness: 0.32,
        metalness: 0.34,
        clearcoat: 0.9,
      }),
      salvageCoreMaterial: new THREE.MeshPhysicalMaterial({
        color: 0x57e5d2,
        emissive: 0x159b91,
        emissiveIntensity: 1.1,
        metalness: 0.58,
        roughness: 0.2,
        clearcoat: 1,
      }),
      fracturePackMaterial: new THREE.MeshPhysicalMaterial({
        color: 0xff715d,
        emissive: 0x7d1638,
        emissiveIntensity: 0.36,
        metalness: 0.68,
        roughness: 0.23,
        clearcoat: 1,
      }),
      fractureCardMaterial: new THREE.MeshPhysicalMaterial({
        color: 0xffd670,
        emissive: 0xff743d,
        emissiveIntensity: 0.2,
        roughness: 0.26,
        metalness: 0.46,
        clearcoat: 1,
      }),
      fractureCardAltMaterial: new THREE.MeshPhysicalMaterial({
        color: 0xbe83ff,
        emissive: 0x7041bd,
        emissiveIntensity: 0.28,
        roughness: 0.25,
        metalness: 0.48,
        clearcoat: 1,
      }),
      goldPhysicalMaterial: new THREE.MeshPhysicalMaterial({
        color: 0xffd85a,
        emissive: 0x9a5715,
        emissiveIntensity: 0.35,
        roughness: 0.2,
        metalness: 0.72,
        clearcoat: 1,
      }),
      navyMaterial: new THREE.MeshBasicMaterial({ color: 0x062b5c }),
      goldMaterial: new THREE.MeshBasicMaterial({
        color: 0xffdc58,
        blending: THREE.AdditiveBlending,
      }),
      cyanMaterial: new THREE.MeshBasicMaterial({
        color: 0x67efff,
        blending: THREE.AdditiveBlending,
      }),
      coralMaterial: new THREE.MeshBasicMaterial({
        color: 0xff795e,
        blending: THREE.AdditiveBlending,
      }),
      violetMaterial: new THREE.MeshBasicMaterial({
        color: 0xc384ff,
        blending: THREE.AdditiveBlending,
      }),
      crackMaterial: new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.96,
        blending: THREE.AdditiveBlending,
      }),
      flashMaterial: new THREE.MeshBasicMaterial({
        color: 0xffd2b4,
        map: flashTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    };
    const geometries = Object.values(shared).filter((value) => value?.isBufferGeometry);
    const materials = Object.values(shared).filter((value) => value?.isMaterial);

    const scaleBase = size === "large" ? 1 : size === "medium" ? 0.82 : 0.68;
    const place = (instance, phase) => {
      const mobile = view.pixelWidth < 720;
      const slot = instance.id % 3;
      const baseX = mobile ? 0 : view.width / 2 - 1.65;
      const baseY = mobile ? view.height / 2 - 1.45 : view.height / 2 - 1.55 - slot * 0.36;
      const exit = span(phase, 0.84, 1);
      const entrance = outBack(span(phase, 0, 0.12), 1.1);
      instance.group.position.set(
        baseX + (slot - 1) * (mobile ? 0.28 : 0.18),
        baseY + (1 - entrance) * 0.45 + exit * 0.18,
        slot * 0.05,
      );
      instance.group.scale.setScalar(scaleBase * entrance * (1 - exit * 0.82));
    };

    const spawn = (descriptor) => {
      if (!descriptor || seen.has(descriptor.id)) return;
      seen.add(descriptor.id);
      const instance = descriptor.type === "fracture"
        ? createFractureBurst(shared, descriptor)
        : createSalvageBurst(shared, descriptor);
      instance.startedAt = performance.now() / 1000;
      active.set(instance.id, instance);
      scene.add(instance.group);
    };
    spawnRef.current = spawn;

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      view.pixelWidth = width;
      view.height = 10;
      view.width = 10 * width / height;
      camera.left = -view.width / 2;
      camera.right = view.width / 2;
      camera.top = view.height / 2;
      camera.bottom = -view.height / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      const now = performance.now() / 1000;
      active.forEach((instance, id) => {
        const elapsed = now - instance.startedAt;
        const phase = elapsed / instance.duration;
        if (phase >= 1) {
          scene.remove(instance.group);
          active.delete(id);
          completeRef.current?.(id);
          return;
        }
        place(instance, phase);
        if (instance.type === "fracture") updateFracture(instance, phase, elapsed);
        else updateSalvage(instance, phase, elapsed);
      });
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      spawnRef.current = null;
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      flashTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [size]);

  useEffect(() => {
    bursts.forEach((burst) => spawnRef.current?.(burst));
  }, [bursts]);

  return (
    <div ref={mountRef} className="three-global-burst-layer" aria-hidden="true">
      {bursts.map((burst) => (
        <span
          key={burst.id}
          className={`global-burst-label is-${burst.type}`}
          style={{ "--burst-slot": burst.id % 3 }}
        >
          {burst.type === "fracture" ? "FRACTURE" : "SALVAGE"}
          {burst.count > 1 ? ` ×${burst.count}` : ""}
        </span>
      ))}
    </div>
  );
}
