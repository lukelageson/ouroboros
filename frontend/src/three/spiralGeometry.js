import * as THREE from 'three';
import { dateToPosition } from './spiralMath.js';

/**
 * Builds the spiral mesh from birthday to today.
 * Simple warm-white TubeGeometry — no shader modifications.
 * Visibility is handled per-segment (Change 2) and per-bead via date comparison.
 */
export function buildSpiral(birthday, today, spiralTopY) {
  const b = new Date(birthday);
  const t = new Date(today);
  const totalMs = t - b;
  const numPoints = 2000;

  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints;
    const date = new Date(b.getTime() + fraction * totalMs);
    points.push(dateToPosition(date, birthday));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, numPoints, 0.11, 8, false);

  const material = new THREE.MeshStandardMaterial({
    color:             0xfff5e6,
    emissive:          0xffecd4,
    emissiveIntensity: 0.35,
    metalness:         0.3,
    roughness:         0.55,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

// No-op — kept so imports don't break before Change 2 removes the call
export function updateSpiralMaterial() {}
