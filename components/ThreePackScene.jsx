"use client";

import { useEffect, useRef, useState } from "react";
import { shortestAngleDelta, THREE } from "../lib/threeCardObjects";
import { createThreePackObject } from "../lib/threePackObjects";

const ASSET_BASE = process.env.NEXT_PUBLIC_PACKWORKS_BASE || "";

export default function ThreePackScene({
  set,
  paused = false,
  className = "",
  label = "THREE.JS PACK",
  interactive = true,
  wrapper = "button",
}) {
  const mountRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  const pausedRef = useRef(paused);
  const [front, setFront] = useState(true);
  const frontRef = useRef(front);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    frontRef.current = front;
  }, [front]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !set) return undefined;
    let alive = true;
    let frame = 0;
    let resizeObserver;
    let packObject = null;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
    camera.position.set(0, 0.03, 6.8);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "three-pack-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xdff7ff, 0x092143, 2.35));
    const key = new THREE.DirectionalLight(0xffefb5, 4.4);
    key.position.set(-4, 5, 6);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.PointLight(0x65ddff, 17, 13, 2);
    rim.position.set(3.4, 0.8, 4.4);
    scene.add(rim);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.62, 48),
      new THREE.MeshBasicMaterial({
        color: 0x02172f,
        transparent: true,
        opacity: 0.27,
        depthWrite: false,
      }),
    );
    shadow.scale.set(1.18, 0.2, 1);
    shadow.position.set(0, -2.13, -0.55);
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

    createThreePackObject(set, { assetBase: ASSET_BASE }).then((object) => {
      if (!alive) {
        object.userData.dispose?.();
        return;
      }
      packObject = object;
      scene.add(object);
    });

    const clock = new THREE.Clock();
    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      if (packObject) {
        const pointer = pointerRef.current;
        const active = pointer.active ? 1 : 0;
        const targetY = frontRef.current
          ? (active ? pointer.x * 0.26 : 0)
          : Math.PI - (active ? pointer.x * 0.26 : 0);
        const targetX = active ? pointer.y * 0.16 : 0;
        packObject.rotation.x += (targetX - packObject.rotation.x) * 0.11;
        packObject.rotation.y += shortestAngleDelta(packObject.rotation.y, targetY) * 0.11;
        packObject.rotation.z += ((active ? -pointer.x * 0.035 : 0) - packObject.rotation.z) * 0.09;
        const floatY = pausedRef.current ? 0 : Math.sin(time * 1.12) * 0.04;
        packObject.position.y += (floatY - packObject.position.y) * 0.08;
        packObject.userData.update?.(pausedRef.current ? 0 : time);
        rim.position.x = 3.4 + pointer.x * 2.1;
        rim.position.y = 0.8 - pointer.y * 1.3;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      packObject?.userData.dispose?.();
      shadow.geometry.dispose();
      shadow.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [set]);

  const handlePointerMove = (event) => {
    if (!interactive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      y: -((event.clientY - rect.top) / rect.height - 0.5) * 2,
      active: true,
    };
  };

  const Root = wrapper === "span" ? "span" : "button";
  return (
    <Root
      {...(Root === "button" ? { type: "button" } : {})}
      className={`three-pack-scene ${className}`.trim()}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerMove}
      onPointerLeave={() => {
        pointerRef.current = { x: 0, y: 0, active: false };
      }}
      onClick={interactive ? () => setFront((current) => !current) : undefined}
      aria-label={interactive ? `${front ? "Turn" : "Show front of"} ${set.name} pack` : undefined}
      aria-hidden={interactive ? undefined : "true"}
    >
      <span ref={mountRef} className="three-pack-mount" />
      {label && <span className="three-pack-label">{label}</span>}
    </Root>
  );
}
