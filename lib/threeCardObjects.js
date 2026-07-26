import * as THREE from "three";
import {
  THREE_CARD_HEIGHT,
  THREE_CARD_WIDTH,
  getThreeCardCanvases,
} from "./threeCardTextures.js";
import { RARITIES } from "./gameData.js";

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

export function makeRoundedShape(width, height, radius) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const resolvedRadius = Math.min(radius, halfWidth, halfHeight);
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + resolvedRadius, -halfHeight);
  shape.lineTo(halfWidth - resolvedRadius, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + resolvedRadius);
  shape.lineTo(halfWidth, halfHeight - resolvedRadius);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - resolvedRadius, halfHeight);
  shape.lineTo(-halfWidth + resolvedRadius, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - resolvedRadius);
  shape.lineTo(-halfWidth, -halfHeight + resolvedRadius);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + resolvedRadius, -halfHeight);
  return shape;
}

export function makeRoundedPlaneGeometry(width, height, radius, curveSegments = 10) {
  const geometry = new THREE.ShapeGeometry(makeRoundedShape(width, height, radius), curveSegments);
  const positions = geometry.getAttribute("position");
  const uvs = geometry.getAttribute("uv");
  for (let index = 0; index < positions.count; index += 1) {
    uvs.setXY(
      index,
      positions.getX(index) / width + 0.5,
      positions.getY(index) / height + 0.5,
    );
  }
  uvs.needsUpdate = true;
  return geometry;
}

export async function createThreeCardObject(card, options = {}) {
  const rarityId = options.rarityId || card.rarity;
  const rarity = RARITIES[rarityId] || RARITIES[card.rarity];
  const foil = !!options.foil;
  const scale = options.scale || 1;
  const canvases = await getThreeCardCanvases(card, {
    rarityId,
    assetBase: options.assetBase || "",
    copyLabel: options.copyLabel || "PACKWORKS",
    backStyle: options.backStyle || "crest",
    animated: foil,
  });
  const frontTextures = (canvases.fronts || [canvases.front]).map(textureFromCanvas);
  const frontTexture = frontTextures[0];
  const backTexture = textureFromCanvas(canvases.back);

  const group = new THREE.Group();
  group.name = `card:${card.id}`;
  group.userData.card = card;
  group.userData.rarityId = rarityId;
  group.scale.setScalar(scale);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: rarity.deep,
    roughness: 0.52,
    metalness: 0.06,
  });
  // Keep just enough physical separation to prevent the two textured faces
  // from depth-fighting during an edge-on turn. At normal viewing scale this
  // reads as printed stock, not a plastic slab.
  const cardDepth = 0.004;
  const surfaceGap = 0.001;
  const cardRadius = 0.105;
  const bodyGeometry = new THREE.ExtrudeGeometry(
    makeRoundedShape(
      THREE_CARD_WIDTH - 0.014,
      THREE_CARD_HEIGHT - 0.014,
      cardRadius,
    ),
    {
      depth: cardDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.004,
      bevelThickness: 0.001,
      curveSegments: 10,
      steps: 1,
    },
  );
  bodyGeometry.translate(0, 0, -cardDepth / 2);
  const body = new THREE.Mesh(
    bodyGeometry,
    bodyMaterial,
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const surfaceWidth = THREE_CARD_WIDTH - 0.046;
  const surfaceHeight = THREE_CARD_HEIGHT - 0.046;
  const surfaceGeometry = makeRoundedPlaneGeometry(surfaceWidth, surfaceHeight, cardRadius - 0.018);
  const frontPhysical = {
    roughness: foil ? 0.2 : 0.43,
    metalness: foil ? 0.18 : 0.02,
    clearcoat: foil ? 1 : 0.42,
    clearcoatRoughness: foil ? 0.08 : 0.28,
    iridescence: foil ? 1 : 0,
    iridescenceIOR: 1.72,
    iridescenceThicknessRange: [120, 680],
    transparent: true,
    alphaTest: 0.04,
  };
  const frontMaterial = new THREE.MeshPhysicalMaterial({
    ...frontPhysical,
    map: frontTexture,
    color: 0xffffff,
  });
  const backMaterial = new THREE.MeshPhysicalMaterial({
    roughness: 0.46,
    metalness: 0.025,
    clearcoat: 0.38,
    clearcoatRoughness: 0.3,
    transparent: true,
    alphaTest: 0.04,
    map: backTexture,
    color: 0xffffff,
  });
  const front = new THREE.Mesh(surfaceGeometry, frontMaterial);
  front.position.z = cardDepth / 2 + surfaceGap;
  front.castShadow = true;
  front.userData.cardSurface = "front";
  group.add(front);

  const back = new THREE.Mesh(surfaceGeometry.clone(), backMaterial);
  back.position.z = -cardDepth / 2 - surfaceGap;
  back.rotation.y = Math.PI;
  back.castShadow = true;
  back.userData.cardSurface = "back";
  group.add(back);

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: rarity.color,
    transparent: true,
    opacity: 0.58,
  });
  const edgePoints = makeRoundedShape(
    THREE_CARD_WIDTH - 0.018,
    THREE_CARD_HEIGHT - 0.018,
    cardRadius,
  ).getSpacedPoints(56);
  const edgeGeometry = new THREE.BufferGeometry().setFromPoints(edgePoints);
  const frontEdge = new THREE.LineLoop(edgeGeometry, edgeMaterial);
  frontEdge.position.z = cardDepth / 2 + surfaceGap * 0.45;
  const backEdge = new THREE.LineLoop(edgeGeometry.clone(), edgeMaterial);
  backEdge.position.z = -cardDepth / 2 - surfaceGap * 0.45;
  group.add(frontEdge, backEdge);

  let shimmer = null;
  if (foil) {
    const shimmerMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.26 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        void main() {
          vUv = uv;
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        vec3 hue(float t) {
          return 0.58 + 0.42 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + t));
        }
        void main() {
          float band = 1.0 - smoothstep(0.0, 0.06, abs(fract(vUv.x * 0.72 + vUv.y * 0.48 + uTime * 0.12) - 0.5));
          float facing = pow(1.0 - abs(vNormalWorld.z), 1.6);
          vec3 color = hue(vUv.x * 0.55 + vUv.y * 0.28 + uTime * 0.04);
          gl_FragColor = vec4(color, (0.06 + band * 0.55 + facing * 0.2) * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    shimmer = new THREE.Mesh(surfaceGeometry.clone(), shimmerMaterial);
    shimmer.position.z = cardDepth / 2 + surfaceGap + 0.00035;
    shimmer.userData.cardSurface = "foil";
    group.add(shimmer);
  }

  group.userData.update = (time) => {
    if (foil && frontTextures.length > 1) {
      const frame = Math.floor(time / 0.18) % frontTextures.length;
      if (frontMaterial.map !== frontTextures[frame]) frontMaterial.map = frontTextures[frame];
    }
    if (shimmer) shimmer.material.uniforms.uTime.value = time;
  };
  group.userData.setGlow = (amount) => {
    edgeMaterial.opacity = THREE.MathUtils.clamp(0.48 + amount * 0.26, 0, 0.8);
    if (shimmer) shimmer.material.uniforms.uOpacity.value = 0.2 + amount * 0.28;
  };
  group.userData.dispose = () => {
    frontTextures.forEach((texture) => texture.dispose());
    backTexture.dispose();
    body.geometry.dispose();
    bodyMaterial.dispose();
    front.geometry.dispose();
    frontMaterial.dispose();
    back.geometry.dispose();
    backMaterial.dispose();
    frontEdge.geometry.dispose();
    backEdge.geometry.dispose();
    edgeMaterial.dispose();
    if (shimmer) {
      shimmer.geometry.dispose();
      shimmer.material.dispose();
    }
  };
  return group;
}

export function shortestAngleDelta(current, target) {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export { THREE };
