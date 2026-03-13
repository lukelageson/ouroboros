import * as THREE from 'three';
import { webgl } from './renderer.js';

/**
 * Generates a 512x512 DataTexture with ~2000 warm-tinted star pixels.
 */
function createStarfieldTexture() {
  const size = 512;
  const data = new Uint8Array(size * size * 4);

  // Fill with near-black
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 2;
    data[i + 1] = 1;
    data[i + 2] = 1;
    data[i + 3] = 255;
  }

  // Place ~2000 stars with warm tint (white to #ffe8c0)
  for (let s = 0; s < 2000; s++) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    const idx = (y * size + x) * 4;
    const brightness = 0.3 + Math.random() * 0.7;

    // Warm tint: R=255, G=232, B=192 scaled by brightness
    data[idx] = Math.floor(255 * brightness);
    data[idx + 1] = Math.floor(232 * brightness);
    data[idx + 2] = Math.floor(192 * brightness);
    data[idx + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates a starfield environment map using PMREMGenerator.
 * Returns a processed envMap suitable for material.envMap.
 */
function createStarfieldEnvMap() {
  const starTexture = createStarfieldTexture();

  // Create a cube render target scene with the star texture on a sphere
  const envScene = new THREE.Scene();
  const envGeo = new THREE.SphereGeometry(100, 32, 32);
  const envMat = new THREE.MeshBasicMaterial({
    map: starTexture,
    side: THREE.BackSide,
  });
  envScene.add(new THREE.Mesh(envGeo, envMat));

  const pmrem = new THREE.PMREMGenerator(webgl);
  pmrem.compileCubemapShader();
  const envMap = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
  pmrem.dispose();

  envGeo.dispose();
  envMat.dispose();
  starTexture.dispose();

  return envMap;
}

/**
 * Builds the reflective ground plane at Y=0 with starfield reflection.
 */
export function buildGroundPlane() {
  const envMap = createStarfieldEnvMap();

  const geometry = new THREE.PlaneGeometry(400, 400);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x1a1008,
    roughness: 0.08,
    metalness: 0.4,
    reflectivity: 1.0,
    envMap,
    envMapIntensity: 1.0,
  });

  const plane = new THREE.Mesh(geometry, material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0;
  plane.receiveShadow = true;

  return plane;
}
