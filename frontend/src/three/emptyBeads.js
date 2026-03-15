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
const EMPTY_COLOR = 0x3d2e1e;
const MS_PER_DAY  = 86400000;
const REVEAL_DIST = 15;   // scene units — full opacity at 0, zero at this distance
const ZOOM_GATE   = 60;   // camera must be closer than this to spiral surface

let instancedMesh = null;
let opacityAttr   = null;
let instancePositions = []; // THREE.Vector3[] parallel to instance indices
let instanceDates     = []; // ISO date strings parallel to instance indices

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
    color:       EMPTY_COLOR,
    transparent: true,
    opacity:     1.0,
    depthWrite:  false,
    metalness:   0.1,
    roughness:   0.8,
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
    // Plan view: all empties at constant opacity
    for (let i = 0; i < count; i++) arr[i] = 0.4;
    opacityAttr.needsUpdate = true;
    return;
  }

  if (viewMode === 'detail') {
    // Detail view: show empties near camera at constant opacity
    const camXZ = Math.sqrt(cam.position.x ** 2 + cam.position.z ** 2);
    const camY  = cam.position.y;
    for (let i = 0; i < count; i++) {
      const p = instancePositions[i];
      const dy = Math.abs(p.y - camY);
      // Angular distance on the spiral
      const angDist = Math.abs(
        Math.atan2(p.z, p.x) - Math.atan2(cam.position.z, cam.position.x)
      );
      const near = dy < 12 && angDist < 1.2;
      arr[i] = near ? 0.5 : 0;
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
  // Use distance from camera to the nearest point on the Y-axis (spiral center)
  if (spiralAxisDist > ZOOM_GATE && camDist > ZOOM_GATE) {
    hideAllEmptyBeads();
    return;
  }

  // Build ray from mouse
  _mouse.x =  (mouseEvent.clientX / window.innerWidth)  * 2 - 1;
  _mouse.y = -(mouseEvent.clientY / window.innerHeight) * 2 + 1;
  _ray.setFromCamera(_mouse, cam);

  const ro = _ray.ray.origin;
  const rd = _ray.ray.direction;

  for (let i = 0; i < count; i++) {
    const p = instancePositions[i];

    // Distance from point to ray
    _v.subVectors(p, ro);
    const t = _v.dot(rd);
    _proj.copy(rd).multiplyScalar(t).add(ro);
    const dist = p.distanceTo(_proj);

    // Smooth falloff: 1 at dist=0, 0 at dist=REVEAL_DIST
    arr[i] = Math.max(0, 1 - dist / REVEAL_DIST) * 0.9;
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
