import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { makeRoundedPlaneGeometry } from "./threeCardObjects.js";
import { getThreePackCanvases } from "./threePackTextures.js";

function textureFromCanvas(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.premultiplyAlpha = true;
  texture.needsUpdate = true;
  return texture;
}

export async function createThreePackObject(set, options = {}) {
  const canvases = await getThreePackCanvases(set, options.assetBase || "");
  const frontTexture = textureFromCanvas(canvases.front);
  const backTexture = textureFromCanvas(canvases.back);
  const group = new THREE.Group();
  group.name = `pack:${set.id}`;

  const wrapperMaterial = new THREE.MeshPhysicalMaterial({
    color: set.colors[2],
    metalness: 0.52,
    roughness: 0.29,
    clearcoat: 0.8,
    clearcoatRoughness: 0.16,
  });
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(2.56, 3.68, 0.19, 6, 0.085),
    wrapperMaterial,
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const faceGeometry = makeRoundedPlaneGeometry(2.49, 3.57, 0.07, 8);
  const faceSettings = {
    roughness: 0.27,
    metalness: 0.22,
    clearcoat: 0.92,
    clearcoatRoughness: 0.13,
    transparent: true,
    alphaTest: 0.04,
    color: 0xffffff,
  };
  const frontMaterial = new THREE.MeshPhysicalMaterial({ ...faceSettings, map: frontTexture });
  const backMaterial = new THREE.MeshPhysicalMaterial({ ...faceSettings, map: backTexture });
  const front = new THREE.Mesh(faceGeometry, frontMaterial);
  front.position.z = 0.103;
  front.castShadow = true;
  group.add(front);
  const back = new THREE.Mesh(faceGeometry.clone(), backMaterial);
  back.position.z = -0.103;
  back.rotation.y = Math.PI;
  back.castShadow = true;
  group.add(back);

  const crimpMaterial = new THREE.MeshStandardMaterial({
    color: set.colors[0],
    roughness: 0.34,
    metalness: 0.58,
  });
  const crimps = [];
  for (const y of [-1.92, 1.92]) {
    const crimp = new THREE.Mesh(
      new RoundedBoxGeometry(2.72, 0.28, 0.12, 4, 0.045),
      crimpMaterial,
    );
    crimp.position.y = y;
    crimp.castShadow = true;
    group.add(crimp);
    crimps.push(crimp);
    for (let rib = -5; rib <= 5; rib += 1) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.23, 0.128),
        new THREE.MeshStandardMaterial({
          color: rib % 2 ? 0xffffff : set.colors[1],
          transparent: true,
          opacity: 0.26,
          roughness: 0.3,
          metalness: 0.65,
        }),
      );
      line.position.set(rib * 0.22, y, 0);
      group.add(line);
      crimps.push(line);
    }
  }

  const seamMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8f8ff,
    transparent: true,
    opacity: 0.28,
    metalness: 0.6,
    roughness: 0.28,
  });
  const seams = [];
  for (const x of [-1.31, 1.31]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.055, 3.54, 0.12), seamMaterial);
    seam.position.x = x;
    group.add(seam);
    seams.push(seam);
  }

  const shimmerMaterial = new THREE.MeshBasicMaterial({
    color: 0xb9f4ff,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const shimmer = new THREE.Mesh(makeRoundedPlaneGeometry(0.32, 3.2, 0.08, 6), shimmerMaterial);
  shimmer.position.z = 0.109;
  shimmer.rotation.z = -0.34;
  group.add(shimmer);

  group.userData.update = (time) => {
    shimmer.position.x = -1.45 + ((time * 0.42) % 3.15);
    shimmer.material.opacity = 0.08 + Math.sin(time * 2.1) * 0.035;
  };
  group.userData.dispose = () => {
    frontTexture.dispose();
    backTexture.dispose();
    body.geometry.dispose();
    wrapperMaterial.dispose();
    front.geometry.dispose();
    frontMaterial.dispose();
    back.geometry.dispose();
    backMaterial.dispose();
    crimps.forEach((mesh) => {
      mesh.geometry.dispose();
      if (mesh.material !== crimpMaterial) mesh.material.dispose();
    });
    crimpMaterial.dispose();
    seams.forEach((mesh) => mesh.geometry.dispose());
    seamMaterial.dispose();
    shimmer.geometry.dispose();
    shimmerMaterial.dispose();
  };
  return group;
}
