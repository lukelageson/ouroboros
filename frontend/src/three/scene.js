import * as THREE from 'three';
import { webgl, scene, css3dScene } from './renderer.js';
import { buildGroundPlane } from './groundPlane.js';
import { buildRibbon } from './ribbon.js';

export function initScene() {
  // Enable shadow maps
  webgl.shadowMap.enabled = true;
  webgl.shadowMap.type = THREE.PCFSoftShadowMap;

  // Scene background and fog — match landing page exactly
  scene.background = new THREE.Color('#000000');
  scene.fog = new THREE.FogExp2(0x000000, 0.0015);

  // Ambient light
  const ambient = new THREE.AmbientLight(0xffe8c0, 0.3);
  scene.add(ambient);

  // Directional light
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

  // Ground plane
  const ground = buildGroundPlane();
  ground.renderOrder = -1;
  scene.add(ground);

  // Spiral parameters — kept for positioning calculations
  const DAYS_IN_YEAR = 365;
  const MS_PER_DAY = 86400000;
  const today = new Date();
  const birthday = new Date(today.getFullYear() - 40, today.getMonth(), today.getDate());
  const spiralTopY = ((today - birthday) / (DAYS_IN_YEAR * MS_PER_DAY)) * 8;

  // NO spiral line segments — the dot cloud in emptyBeads.js defines the helix
  const spiralGroup = new THREE.Group();
  scene.add(spiralGroup);
  const spiralSegments = [];

  // Ribbon
  const { group: ribbonGroup, arcSegments, dividerObjects, labels } = buildRibbon(birthday, today);
  scene.add(ribbonGroup);
  for (const seg of dividerObjects) scene.add(seg);
  for (const label of labels) css3dScene.add(label);

  return {
    ribbonGroup, arcSegments, dividerObjects, labels,
    spiralGroup, spiralSegments,
    spiralTopY, birthday, today, ground,
  };
}
