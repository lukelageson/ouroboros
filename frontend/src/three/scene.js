import * as THREE from 'three';
import { webgl, scene } from './renderer.js';
import { buildSpiral } from './spiralGeometry.js';
import { buildGroundPlane } from './groundPlane.js';

export function initScene() {
  // Enable shadow maps
  webgl.shadowMap.enabled = true;
  webgl.shadowMap.type = THREE.PCFSoftShadowMap;

  // Scene background — dark warm, no stars
  scene.background = new THREE.Color('#0e0a06');

  // Ambient light
  const ambient = new THREE.AmbientLight(0xffe8c0, 0.3);
  scene.add(ambient);

  // Directional light with shadow config for spiral coverage
  const directional = new THREE.DirectionalLight(0xffe8c0, 1.2);
  directional.position.set(50, 350, 30);
  directional.castShadow = true;
  directional.shadow.mapSize.width = 2048;
  directional.shadow.mapSize.height = 2048;
  directional.shadow.camera.near = 1;
  directional.shadow.camera.far = 500;
  directional.shadow.camera.left = -50;
  directional.shadow.camera.right = 50;
  directional.shadow.camera.top = 400;
  directional.shadow.camera.bottom = -10;
  scene.add(directional);

  // Ground plane with starfield reflection
  const ground = buildGroundPlane();
  scene.add(ground);

  // Spiral — hardcoded birthday 40 years ago
  const today = new Date();
  const birthday = new Date(today.getFullYear() - 40, today.getMonth(), today.getDate());
  const spiral = buildSpiral(birthday, today);
  scene.add(spiral);
}
