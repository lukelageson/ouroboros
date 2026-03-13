import * as THREE from 'three';
import { webgl, scene } from './renderer.js';
import { createPanel } from './css3dPanel.js';
import { registerPanel } from './renderer.js';

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

  // Temporary test cube
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const cube = new THREE.Mesh(geometry, material);
  cube.castShadow = true;
  scene.add(cube);

  // Test CSS3D panel
  const anchorPos = new THREE.Vector3(0, 5, 0);
  const panel = createPanel(anchorPos, 'Hello from CSS3D');
  registerPanel(panel, anchorPos);
}
