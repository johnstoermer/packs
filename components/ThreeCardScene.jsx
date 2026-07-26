"use client";

import { useEffect, useRef, useState } from "react";
import { createThreeCardObject, shortestAngleDelta, THREE } from "../lib/threeCardObjects";

const ASSET_BASE = process.env.NEXT_PUBLIC_PACKWORKS_BASE || "";

export default function ThreeCardScene({
  card,
  rarityId = card?.rarity,
  foil = false,
  faceUp,
  initialFaceUp = true,
  interactive = true,
  paused = false,
  autoFloat = true,
  className = "",
  copyLabel = "PACKWORKS",
  backStyle = "crest",
  label,
  onFlip,
  wrapper = "button",
}) {
  const mountRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  const [internalFaceUp, setInternalFaceUp] = useState(initialFaceUp);
  const resolvedFaceUp = faceUp ?? internalFaceUp;
  const faceRef = useRef(resolvedFaceUp);
  const pausedRef = useRef(paused);

  useEffect(() => {
    faceRef.current = resolvedFaceUp;
  }, [resolvedFaceUp]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !card) return undefined;
    let alive = true;
    let frame = 0;
    let resizeObserver;
    let cardObject = null;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 40);
    camera.position.set(0, 0.05, 6.45);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "three-card-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xdff5ff, 0x102542, 2.15);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xfff2c0, 3.8);
    key.position.set(-3.5, 5, 6);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.PointLight(foil ? 0xc482ff : 0x62dfff, foil ? 18 : 9, 14, 2);
    rim.position.set(3.2, 1.8, 4.5);
    scene.add(rim);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.65, 48),
      new THREE.MeshBasicMaterial({
        color: 0x031a38,
        transparent: true,
        opacity: 0.23,
        depthWrite: false,
      }),
    );
    shadow.scale.set(1.12, 0.22, 1);
    shadow.position.set(0, -2.02, -0.52);
    scene.add(shadow);

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

    createThreeCardObject(card, {
      rarityId,
      foil,
      assetBase: ASSET_BASE,
      copyLabel,
      backStyle,
    }).then((object) => {
      if (!alive) {
        object.userData.dispose?.();
        return;
      }
      cardObject = object;
      object.rotation.y = faceRef.current ? 0 : Math.PI;
      scene.add(object);
    });

    const clock = new THREE.Clock();
    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      if (cardObject) {
        const pointer = pointerRef.current;
        const activity = interactive && pointer.active ? 1 : 0;
        const tiltX = activity ? pointer.y * 0.17 : 0;
        const tiltY = activity ? pointer.x * 0.23 : 0;
        const targetY = faceRef.current ? tiltY : Math.PI - tiltY;
        const floatY = !pausedRef.current && autoFloat ? Math.sin(time * 1.22) * 0.035 : 0;
        const floatZ = !pausedRef.current && autoFloat ? Math.sin(time * 0.77) * 0.018 : 0;
        cardObject.rotation.x += (tiltX - cardObject.rotation.x) * 0.12;
        cardObject.rotation.y += shortestAngleDelta(cardObject.rotation.y, targetY) * 0.13;
        cardObject.rotation.z += ((activity ? -pointer.x * 0.026 : 0) - cardObject.rotation.z) * 0.1;
        cardObject.position.y += (floatY - cardObject.position.y) * 0.08;
        cardObject.position.z += (floatZ - cardObject.position.z) * 0.08;
        cardObject.userData.update?.(pausedRef.current ? 0 : time);
        cardObject.userData.setGlow?.(activity);
        rim.position.x = 3.2 + pointer.x * 2.2;
        rim.position.y = 1.8 - pointer.y * 1.4;
        if (foil && !pausedRef.current) rim.color.setHSL((time * 0.055) % 1, 0.72, 0.66);
        shadow.material.opacity = 0.2 + Math.abs(floatY) * 0.55;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      cardObject?.userData.dispose?.();
      shadow.geometry.dispose();
      shadow.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [autoFloat, backStyle, card, copyLabel, foil, interactive, rarityId]);

  const handlePointerMove = (event) => {
    if (!interactive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      y: -((event.clientY - rect.top) / rect.height - 0.5) * 2,
      active: true,
    };
  };

  const handleFlip = () => {
    if (!interactive) return;
    const next = !resolvedFaceUp;
    if (onFlip) onFlip(next);
    else setInternalFaceUp(next);
  };

  const Root = wrapper === "span" ? "span" : "button";
  return (
    <Root
      {...(Root === "button" ? { type: "button" } : {})}
      className={`three-card-scene ${className}`.trim()}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerMove}
      onPointerLeave={() => {
        pointerRef.current = { x: 0, y: 0, active: false };
      }}
      onClick={interactive ? handleFlip : undefined}
      aria-label={interactive ? `${resolvedFaceUp ? "Turn" : "Reveal"} ${card.name}` : undefined}
      aria-hidden={interactive ? undefined : "true"}
    >
      <span ref={mountRef} className="three-card-mount" />
      {label && <span className="three-card-label">{label}</span>}
    </Root>
  );
}
