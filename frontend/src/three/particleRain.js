/**
 * particleRain.js — Particle arc animation from analysis ring to target beads.
 *
 * When an analysis completes, particles arc from the ring position to the
 * specific beads referenced by the analysis, then glow on arrival.
 */

import * as THREE from 'three';
import { scene } from './renderer.js';

const PARTICLE_RADIUS = 0.15;
const AMBER = 0xf5a623;
const ARC_DURATION = 2.0; // seconds
const PARTICLE_GEO = new THREE.SphereGeometry(PARTICLE_RADIUS, 8, 6);
const PARTICLE_MAT = new THREE.MeshStandardMaterial({
  color: AMBER,
  emissive: AMBER,
  emissiveIntensity: 0.8,
  roughness: 0.3,
  metalness: 0.2,
});

/**
 * Compute a cubic bezier point at t ∈ [0,1].
 */
function bezier3(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return new THREE.Vector3()
    .addScaledVector(p0, u * u * u)
    .addScaledVector(p1, 3 * u * u * t)
    .addScaledVector(p2, 3 * u * t * t)
    .addScaledVector(p3, t * t * t);
}

/**
 * Run particle rain from a source ring position to target bead positions.
 *
 * @param {THREE.Vector3} sourcePos - Center of the source analysis ring
 * @param {THREE.Vector3[]} targetPositions - Positions of target beads
 * @param {THREE.Mesh[]} targetMeshes - Bead meshes to glow on arrival
 * @param {Function} onComplete - Called when all particles have arrived
 */
export function runParticleRain(sourcePos, targetPositions, targetMeshes, onComplete) {
  if (!targetPositions.length) {
    if (onComplete) onComplete();
    return;
  }

  // Create 150-300 particles, distributed across targets
  const totalParticles = Math.min(Math.max(targetPositions.length * 5, 150), 300);
  const particles = [];

  for (let i = 0; i < totalParticles; i++) {
    const targetIdx = i % targetPositions.length;
    const target = targetPositions[targetIdx];

    const mesh = new THREE.Mesh(PARTICLE_GEO, PARTICLE_MAT.clone());
    mesh.position.copy(sourcePos);
    scene.add(mesh);

    // Build bezier control points for an arc path
    const mid = new THREE.Vector3().lerpVectors(sourcePos, target, 0.5);
    // Arc outward: offset control points perpendicular to the path
    const dx = target.x - sourcePos.x;
    const dz = target.z - sourcePos.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const perpX = -dz / len;
    const perpZ = dx / len;
    const arcSpread = 5 + Math.random() * 10;
    const sign = (Math.random() > 0.5) ? 1 : -1;

    const cp1 = new THREE.Vector3(
      sourcePos.x + (target.x - sourcePos.x) * 0.25 + perpX * arcSpread * sign,
      sourcePos.y + (target.y - sourcePos.y) * 0.25 + arcSpread * 0.5,
      sourcePos.z + (target.z - sourcePos.z) * 0.25 + perpZ * arcSpread * sign,
    );

    const cp2 = new THREE.Vector3(
      sourcePos.x + (target.x - sourcePos.x) * 0.75 + perpX * arcSpread * sign * 0.5,
      sourcePos.y + (target.y - sourcePos.y) * 0.75 + arcSpread * 0.3,
      sourcePos.z + (target.z - sourcePos.z) * 0.75 + perpZ * arcSpread * sign * 0.5,
    );

    // Stagger start times so particles don't all launch at once
    const delay = Math.random() * 0.5;

    particles.push({
      mesh,
      targetIdx,
      cp0: sourcePos.clone(),
      cp1,
      cp2,
      cp3: target.clone(),
      delay,
      arrived: false,
    });
  }

  let arrivedCount = 0;
  const startTime = performance.now() / 1000;
  const arrivedTargets = new Set();

  function tick() {
    const now = performance.now() / 1000;
    const elapsed = now - startTime;
    let allDone = true;

    for (const p of particles) {
      if (p.arrived) continue;

      const t = (elapsed - p.delay) / ARC_DURATION;
      if (t < 0) {
        allDone = false;
        continue;
      }

      if (t >= 1) {
        // Arrived at target
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        p.arrived = true;
        arrivedCount++;

        // Glow the target bead if not already glowing
        if (!arrivedTargets.has(p.targetIdx)) {
          arrivedTargets.add(p.targetIdx);
          const targetMesh = targetMeshes[p.targetIdx];
          if (targetMesh) {
            rampGlow(targetMesh);
          }
        }
        continue;
      }

      allDone = false;
      // Smooth eased t
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const pos = bezier3(p.cp0, p.cp1, p.cp2, p.cp3, eased);
      p.mesh.position.copy(pos);
    }

    if (allDone) {
      if (onComplete) onComplete();
    } else {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

/**
 * Smoothly ramp a bead's emissive to amber glow over ~0.5s.
 */
function rampGlow(mesh) {
  const target = new THREE.Color(AMBER);
  const startIntensity = mesh.material.emissiveIntensity;
  const endIntensity = 0.7;
  const duration = 500; // ms
  const start = performance.now();

  function step() {
    const t = Math.min((performance.now() - start) / duration, 1);
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    mesh.material.emissive.lerp(target, eased);
    mesh.material.emissiveIntensity = startIntensity + (endIntensity - startIntensity) * eased;
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}
