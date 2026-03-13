import * as THREE from 'three';
import { dateToPosition } from './spiralMath.js';

const MS_PER_DAY = 86400000;

/**
 * Builds an Archimedean spiral mesh from birthday to today.
 * Returns a THREE.Mesh using TubeGeometry with emissive amber material.
 */
export function buildSpiral(birthday, today) {
  const b = new Date(birthday);
  const t = new Date(today);
  const totalMs = t - b;
  const numPoints = 2000;

  // Generate points along the spiral
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints;
    const date = new Date(b.getTime() + fraction * totalMs);
    points.push(dateToPosition(date, birthday));
  }

  // Create a smooth curve through the points
  const curve = new THREE.CatmullRomCurve3(points);

  // TubeGeometry: path, tubular segments, radius, radial segments, closed
  const geometry = new THREE.TubeGeometry(curve, numPoints, 0.15, 8, false);

  const material = new THREE.MeshStandardMaterial({
    color: 0x1a0e04,
    emissive: 0xf5a623,
    emissiveIntensity: 0.4,
    metalness: 0.3,
    roughness: 0.6,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}
