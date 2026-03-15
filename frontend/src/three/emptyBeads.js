/**
 * emptyBeads.js — ghost beads for every unfilled calendar date.
 *
 * Uses a single InstancedMesh for all empty positions (~14k instances).
 * Per-instance opacity is controlled via a custom shader attribute so that:
 *   - Plan View: all empty beads show at opacity 0.4
 *   - Perspective View: beads near the mouse ray glow, others hidden
 */

import * as THREE from 'three';
import { scene } from './renderer.js';
import { dateToPosition } from './spiralMath.js';

const EMPTY_R     = 0.3;
const EMPTY_COLOR = 0xc8a870; // warm sand — visible against dark background
const MS_PER_DAY  = 86400000;
const REVEAL_DIST = 15;   // scene units — full opacity at 0, zero at this distance
const ZOOM_GATE   = 60;   // camera must be closer than this to spiral surface

let instancedMesh = null;
let opacityAttr   = null;
let instancePositions = []; // THREE.Vector3[] parallel to instance indices
let instanceDates     = []; // ISO date strings parallel to instance indices
let _hoveredInstanceId = -1; // instance currently under the cursor

// Reusable temporaries for per-frame distance calc
const _ray    = new THREE.Raycaster();
const _mouse  = new THREE.Vector2();
const _v      = new THREE.Vector3();
const _proj   = new THREE.Vector3();

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the InstancedMesh for every calendar date not in filledEntryDates.
 * @param {Date} birthday       scene birthday (same one used by dateToPosition)
 * @param {string[]} filledDates  ISO date strings of filled entries
 */
export function initEmptyBeads(birthday, filledDates) {
  const filled = new Set(
    filledDates.map(d => new Date(d).toISOString().slice(0, 10))
  );

  const bday  = new Date(birthday); bday.setHours(0, 0, 0, 0);
  const today = new Date();         today.setHours(0, 0, 0, 0);

  // Collect unfilled positions
  instancePositions = [];
  instanceDates     = [];
  const cur = new Date(bday);
  while (cur <= today) {
    const key = cur.toISOString().slice(0, 10);
    if (!filled.has(key)) {
      instancePositions.push(dateToPosition(new Date(cur), bday));
      instanceDates.push(key);
    }
    cur.setTime(cur.getTime() + MS_PER_DAY);
  }

  const count = instancePositions.length;
  if (count === 0) return;

  // Geometry + material
  const geo = new THREE.SphereGeometry(EMPTY_R, 6, 4);
  const mat = new THREE.MeshStandardMaterial({
    color:             EMPTY_COLOR,
    emissive:          0x7a5020,
    emissiveIntensity: 0.5,
    transparent:       true,
    opacity:           1.0,
    depthWrite:        false,
    metalness:         0.15,
    roughness:         0.65,
  });

  // Inject per-instance opacity into the shader
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       attribute float instanceOpacity;
       varying float vInstanceOpacity;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vInstanceOpacity = instanceOpacity;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       varying float vInstanceOpacity;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <premultiplied_alpha_fragment>',
      `gl_FragColor.a *= vInstanceOpacity;
       #include <premultiplied_alpha_fragment>`
    );
  };

  instancedMesh = new THREE.InstancedMesh(geo, mat, count);

  // Set instance transforms
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.copy(instancePositions[i]);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }
  instancedMesh.instanceMatrix.needsUpdate = true;

  // Per-instance opacity attribute (starts at 0 — hidden)
  const opacities = new Float32Array(count);
  opacityAttr = new THREE.InstancedBufferAttribute(opacities, 1);
  instancedMesh.geometry.setAttribute('instanceOpacity', opacityAttr);

  instancedMesh.frustumCulled = false;
  scene.add(instancedMesh);
}

/**
 * Update empty-bead visibility based on mouse position and view mode.
 *
 * @param {MouseEvent|null} mouseEvent  latest mousemove event (null = hide)
 * @param {THREE.Camera}    cam         active camera
 * @param {string}          viewMode    'plan' | 'perspective' | 'detail'
 */
export function showEmptyBeadsNearMouse(mouseEvent, cam, viewMode) {
  if (!instancedMesh || !opacityAttr) return;

  const arr   = opacityAttr.array;
  const count = arr.length;

  if (viewMode === 'plan') {
    // Plan view: all empties at constant opacity; hovered one at full
    for (let i = 0; i < count; i++) arr[i] = 0.82;
    if (_hoveredInstanceId >= 0 && _hoveredInstanceId < count) {
      arr[_hoveredInstanceId] = 1.0;
    }
    opacityAttr.needsUpdate = true;
    return;
  }

  if (viewMode === 'detail') {
    // Camera is DETAIL_H=15 above the target point — compare against target Y
    const targetY  = cam.position.y - 15;
    const camAngle = Math.atan2(cam.position.z, cam.position.x);
    for (let i = 0; i < count; i++) {
      const p = instancePositions[i];
      const dy = Math.abs(p.y - targetY);
      let angDiff = Math.atan2(p.z, p.x) - camAngle;
      if (angDiff >  Math.PI) angDiff -= 2 * Math.PI;
      if (angDiff < -Math.PI) angDiff += 2 * Math.PI;
      arr[i] = (dy < 8 && Math.abs(angDiff) < 1.0) ? 0.88 : 0;
    }
    opacityAttr.needsUpdate = true;
    return;
  }

  if (viewMode !== 'perspective' || !mouseEvent) {
    hideAllEmptyBeads();
    return;
  }

  // Zoom gate: only show when camera is close to the spiral
  const camDist = cam.position.length(); // distance from world origin
  const spiralAxisDist = Math.sqrt(cam.position.x ** 2 + cam.position.z ** 2);
  if (spiralAxisDist > ZOOM_GATE && camDist > ZOOM_GATE) {
    hideAllEmptyBeads();
    return;
  }

  // Perspective: zero all, then highlight exact hovered bead + ±3 index neighbors
  for (let i = 0; i < count; i++) arr[i] = 0;
  if (_hoveredInstanceId >= 0 && _hoveredInstanceId < count) {
    arr[_hoveredInstanceId] = 1.0;
    for (let delta = 1; delta <= 3; delta++) {
      const lo = _hoveredInstanceId - delta;
      const hi = _hoveredInstanceId + delta;
      if (lo >= 0)     arr[lo] = 0.5;
      if (hi < count)  arr[hi] = 0.5;
    }
  }

  opacityAttr.needsUpdate = true;
}

/** Set all empty beads to fully transparent. */
export function hideAllEmptyBeads() {
  if (!opacityAttr) return;
  const arr = opacityAttr.array;
  for (let i = 0; i < arr.length; i++) arr[i] = 0;
  opacityAttr.needsUpdate = true;
}

/**
 * Set which instance is currently hovered so showEmptyBeadsNearMouse
 * can boost its opacity to maximum for a clear highlight.
 */
export function setHoveredEmptyBead(instanceId) {
  _hoveredInstanceId = instanceId;
}

/** Get the InstancedMesh (for raycasting). */
export function getEmptyBeadMesh() {
  return instancedMesh;
}

/** Get the ISO date string for a given instance index. */
export function getEmptyBeadDate(instanceId) {
  return instanceDates[instanceId] || null;
}

/**
 * Hide a single instance (set its scale to 0) after an entry was created for that date.
 * We don't actually remove it — just collapse the transform so it's invisible.
 */
export function removeEmptyBeadInstance(instanceId) {
  if (!instancedMesh || instanceId < 0) return;
  const dummy = new THREE.Object3D();
  dummy.position.set(0, 0, 0);
  dummy.scale.set(0, 0, 0);
  dummy.updateMatrix();
  instancedMesh.setMatrixAt(instanceId, dummy.matrix);
  instancedMesh.instanceMatrix.needsUpdate = true;
  // Also zero the opacity
  if (opacityAttr) {
    opacityAttr.array[instanceId] = 0;
    opacityAttr.needsUpdate = true;
  }
}
