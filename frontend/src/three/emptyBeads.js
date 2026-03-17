/**
 * emptyBeads.js — Small white dots for every unfilled calendar date.
 *
 * Uses THREE.Points (single draw call) for ~14k positions.
 * sizeAttenuation: true — dots scale naturally with camera distance.
 * Base size tuned so dots appear ~2-3px at typical perspective distance.
 *
 * Hover: raycasting against Points, hovered dot gets a highlight mesh overlay.
 */

import * as THREE from 'three';
import { scene } from './renderer.js';
import { dateToPosition } from './spiralMath.js';

const DOT_SIZE    = 4;       // base size — attenuates with distance
const DOT_COLOR   = 0xffffff; // solid white
const DOT_OPACITY = 0.5;     // base opacity for visible dots
const HOVER_COLOR = 0xf5a623; // amber highlight
const MS_PER_DAY  = 86400000;

let pointsMesh     = null;   // THREE.Points
let positionsArray  = null;   // Float32Array of xyz
let opacitiesArray  = null;   // Float32Array per-point opacity
let instanceDates   = [];     // ISO date strings parallel to point indices
let instancePositions = [];   // THREE.Vector3[] parallel to point indices
let _hoveredIndex   = -1;
let _highlightMesh  = null;   // small sphere shown on hover

const _removedIndices = new Set();

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the Points cloud for every calendar date not in filledEntryDates.
 * @param {Date} birthday
 * @param {string[]} filledDates  ISO date strings of filled entries
 */
export function initEmptyBeads(birthday, filledDates) {
  const filled = new Set(
    filledDates.map(d => new Date(d).toISOString().slice(0, 10))
  );

  const bday  = new Date(birthday); bday.setHours(0, 0, 0, 0);
  const today = new Date();         today.setHours(0, 0, 0, 0);

  instancePositions = [];
  instanceDates     = [];
  const cur = new Date(bday);
  while (cur <= today) {
    // Skip Feb 29
    if (!(cur.getMonth() === 1 && cur.getDate() === 29)) {
      const key = cur.toISOString().slice(0, 10);
      if (!filled.has(key)) {
        instancePositions.push(dateToPosition(new Date(cur), bday));
        instanceDates.push(key);
      }
    }
    cur.setTime(cur.getTime() + MS_PER_DAY);
  }

  const count = instancePositions.length;
  if (count === 0) return;

  // Build geometry
  positionsArray = new Float32Array(count * 3);
  opacitiesArray = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const p = instancePositions[i];
    positionsArray[i * 3]     = p.x;
    positionsArray[i * 3 + 1] = p.y;
    positionsArray[i * 3 + 2] = p.z;
    opacitiesArray[i] = DOT_OPACITY;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positionsArray, 3));
  geo.setAttribute('aOpacity', new THREE.BufferAttribute(opacitiesArray, 1));

  // Custom shader material with size attenuation and per-point opacity
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(DOT_COLOR) },
      size:  { value: DOT_SIZE },
    },
    vertexShader: `
      attribute float aOpacity;
      varying float vOpacity;
      uniform float size;
      void main() {
        vOpacity = aOpacity;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // Size attenuation: scale inversely with distance from camera
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      varying float vOpacity;
      void main() {
        vec2 center = gl_PointCoord - vec2(0.5);
        if (length(center) > 0.5) discard;
        gl_FragColor = vec4(color, vOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  pointsMesh = new THREE.Points(geo, mat);
  pointsMesh.frustumCulled = false;
  scene.add(pointsMesh);

  // Highlight sphere (hidden until hover)
  const hlGeo = new THREE.SphereGeometry(0.5, 12, 8);
  const hlMat = new THREE.MeshStandardMaterial({
    color:             HOVER_COLOR,
    emissive:          HOVER_COLOR,
    emissiveIntensity: 0.6,
    transparent:       true,
    opacity:           0.9,
    metalness:         0.2,
    roughness:         0.4,
  });
  _highlightMesh = new THREE.Mesh(hlGeo, hlMat);
  _highlightMesh.visible = false;
  scene.add(_highlightMesh);
}

/**
 * Update dot visibility based on view mode and date range.
 * Dots are always visible in all three views (subject to date culling).
 */
export function showEmptyBeadsNearMouse(mouseEvent, cam, viewMode, ceilingDate = null, floorDate = null) {
  if (!pointsMesh || !opacitiesArray) return;

  const count    = opacitiesArray.length;
  const ceilISO  = ceilingDate ? ceilingDate.toISOString().slice(0, 10) : '9999-12-31';
  const floorISO = floorDate   ? floorDate.toISOString().slice(0, 10)   : '0000-01-01';

  if (viewMode === 'detail') {
    for (let i = 0; i < count; i++) {
      if (_removedIndices.has(i)) { opacitiesArray[i] = 0; continue; }
      const dateISO = instanceDates[i];
      opacitiesArray[i] = (dateISO >= floorISO && dateISO <= ceilISO) ? DOT_OPACITY : 0;
    }
  } else if (viewMode === 'plan' || viewMode === 'perspective') {
    for (let i = 0; i < count; i++) {
      if (_removedIndices.has(i)) { opacitiesArray[i] = 0; continue; }
      const dateISO = instanceDates[i];
      opacitiesArray[i] = (dateISO <= ceilISO) ? DOT_OPACITY : 0;
    }
  } else {
    for (let i = 0; i < count; i++) opacitiesArray[i] = 0;
  }

  // Boost hovered dot
  if (_hoveredIndex >= 0 && _hoveredIndex < count && opacitiesArray[_hoveredIndex] > 0) {
    opacitiesArray[_hoveredIndex] = 1.0;
  }

  pointsMesh.geometry.attributes.aOpacity.needsUpdate = true;
}

/** Hide all dots. */
export function hideAllEmptyBeads() {
  if (!opacitiesArray) return;
  for (let i = 0; i < opacitiesArray.length; i++) opacitiesArray[i] = 0;
  if (pointsMesh) pointsMesh.geometry.attributes.aOpacity.needsUpdate = true;
}

/**
 * Set which point index is hovered. Shows highlight mesh at that position.
 */
export function setHoveredEmptyBead(instanceId) {
  if (instanceId === _hoveredIndex) return;
  _hoveredIndex = instanceId;

  if (_highlightMesh) {
    if (instanceId >= 0 && instanceId < instancePositions.length && !_removedIndices.has(instanceId)) {
      _highlightMesh.position.copy(instancePositions[instanceId]);
      _highlightMesh.visible = true;
    } else {
      _highlightMesh.visible = false;
    }
  }
}

/** Get the Points mesh (for raycasting). */
export function getEmptyBeadMesh() {
  return pointsMesh;
}

/** Get the ISO date string for a given point index. */
export function getEmptyBeadDate(instanceId) {
  return instanceDates[instanceId] || null;
}

/**
 * Mark a point as removed (entry was created for that date).
 */
export function removeEmptyBeadInstance(instanceId) {
  if (!pointsMesh || instanceId < 0) return;
  _removedIndices.add(instanceId);
  if (opacitiesArray) {
    opacitiesArray[instanceId] = 0;
    pointsMesh.geometry.attributes.aOpacity.needsUpdate = true;
  }
  if (_hoveredIndex === instanceId) {
    _hoveredIndex = -1;
    if (_highlightMesh) _highlightMesh.visible = false;
  }
}
