import * as THREE from 'three';
import { webgl, scene } from './renderer.js';
import { buildSpiral } from './spiralGeometry.js';

export function initScene() {
  // Enable shadow maps
  webgl.shadowMap.enabled = true;
  webgl.shadowMap.type = THREE.PCFSoftShadowMap;

  // Ambient light
  const ambient = new THREE.AmbientLight(0xffe8c0, 0.3);
  scene.add(ambient);

  // Directional light
  const directional = new THREE.DirectionalLight(0xffe8c0, 1.2);
  directional.position.set(50, 100, 30);
  directional.castShadow = true;
  scene.add(directional);

  // Spiral — hardcoded birthday 40 years ago
  const today = new Date();
  const birthday = new Date(today.getFullYear() - 40, today.getMonth(), today.getDate());
  const spiral = buildSpiral(birthday, today);
  scene.add(spiral);
}
