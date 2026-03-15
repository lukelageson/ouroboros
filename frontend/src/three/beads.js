/**
 * beads.js — entry beads on the spiral.
 *
 * Each journal entry is rendered as a small sphere positioned on the spiral
 * using dateToPosition.  Milestone entries are larger (radius 1.1 vs 0.6).
 * Every mesh stores its entry ID in userData.entryId for raycasting.
 */

import * as THREE from 'three';
import { scene } from './renderer.js';
import { dateToPosition } from './spiralMath.js';

const STANDARD_R  = 0.6;
const MILESTONE_R = 1.1;

// Shared geometries — one per size to avoid duplicating vertex buffers
const standardGeo  = new THREE.SphereGeometry(STANDARD_R,  16, 12);
const milestoneGeo = new THREE.SphereGeometry(MILESTONE_R, 20, 14);

// entryId → Mesh lookup
const meshMap = new Map();

/**
 * Create a single bead mesh and add it to the scene.
 */
export function addBead(entry, birthday) {
  const isMilestone = !!entry.is_milestone;
  const geo   = isMilestone ? milestoneGeo : standardGeo;
  const color = new THREE.Color(entry.color);

  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive:          color,
    emissiveIntensity: 0.3,
    metalness:         0.25,
    roughness:         0.5,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.entryId = entry.id;

  const pos = dateToPosition(new Date(entry.entry_date), birthday);
  mesh.position.copy(pos);

  mesh.castShadow    = true;
  mesh.receiveShadow = true;

  scene.add(mesh);
  meshMap.set(entry.id, mesh);
  return mesh;
}

/**
 * Batch-create beads for all entries.
 */
export function initBeads(entries, birthday) {
  for (const entry of entries) {
    addBead(entry, birthday);
  }
}

/**
 * Retrieve the mesh for a given entry ID (for raycasting, highlighting, etc.).
 */
export function getBeadMesh(entryId) {
  return meshMap.get(entryId) || null;
}

/**
 * Get all bead meshes as an array (for raycasting).
 */
export function getAllBeadMeshes() {
  return [...meshMap.values()];
}
