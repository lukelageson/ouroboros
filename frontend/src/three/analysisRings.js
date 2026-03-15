/**
 * analysisRings.js — Collapsed/expanded ring stack for analysis categories.
 *
 * One collapsed ring floats above the spiral. Click to expand into 6 category
 * rings with progress arcs, state coloring, and click handlers.
 *
 * Each category has an activeRing (incomplete/available state) and a
 * completedRings sub-stack of previously completed analysis results.
 */

import * as THREE from 'three';
import { scene } from './renderer.js';

// ── Constants ────────────────────────────────────────────────────────────────
const RING_RADIUS   = 12;
const RING_TUBE     = 0.3;
const AMBER         = 0xf5a623;
const DIM_COLOR     = 0x3d2e1e;
const AVAILABLE_CLR = 0xfff5e6;
const STACK_GAP     = 5;      // gap between category rows when expanded
const SUB_GAP       = 2;      // gap between completed rings in a sub-stack
const MAX_STACK_H   = 40;     // max scene units for full stack
const EXPAND_FRAMES = 30;
const ARC_TUBE      = 0.35;   // slightly thicker than ring tube for visibility
const ARC_SEGMENTS  = 64;

const CATEGORIES = [
  { key: 'temporal',    label: 'Temporal',    threshold: 12, unit: 'months' },
  { key: 'relational',  label: 'Relational',  threshold: 5,  unit: 'entries', minMonths: 2 },
  { key: 'directional', label: 'Directional', threshold: 3,  unit: 'months' },
  { key: 'thematic',    label: 'Thematic',    threshold: 4,  unit: 'months' },
  { key: 'inflection',  label: 'Inflection',  threshold: 6,  unit: 'months' },
  { key: 'resolution',  label: 'Resolution',  threshold: 3,  unit: 'months' },
];

// ── State ────────────────────────────────────────────────────────────────────
let stackGroup      = null;   // THREE.Group holding everything
let collapsedRing   = null;
// Each entry: { mesh, arcMesh, category, completedRings: [{mesh, analysis}], _computing }
let categoryRings   = [];
let expanded        = false;
let animFrame       = 0;
let animating       = false;
let animDirection   = 1;      // 1 = expanding, -1 = collapsing
let baseY           = 0;
let completedAnalyses = [];
let currentEntries    = [];

// Callbacks set by consumer
let onTriggerAnalyze = null;  // (category) => void
let onViewAnalysis   = null;  // (analysis) => void

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTorus(radius, tube, color, emissiveIntensity = 0.15) {
  const geo = new THREE.TorusGeometry(radius, tube, 16, 64);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity,
    roughness: 0.6,
    metalness: 0.2,
  });
  mat.clippingPlanes = []; // opt out of global section-cut clip plane
  return new THREE.Mesh(geo, mat);
}

/** Create a partial torus arc from 0 to `fraction` of full circle. */
function makeArc(radius, tube, fraction) {
  if (fraction <= 0) return null;
  const arc = Math.min(fraction, 1) * Math.PI * 2;
  const geo = new THREE.TorusGeometry(radius, tube, 12, ARC_SEGMENTS, arc);
  const mat = new THREE.MeshStandardMaterial({
    color: AMBER,
    emissive: AMBER,
    emissiveIntensity: 0.4,
    roughness: 0.4,
    metalness: 0.3,
  });
  mat.clippingPlanes = []; // opt out of global section-cut clip plane
  const mesh = new THREE.Mesh(geo, mat);
  // Rotate so arc starts at "12 o'clock"
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function makeCompletedRingMesh(category, tube) {
  const mesh = makeTorus(RING_RADIUS, tube, AMBER, 0.5);
  mesh.rotation.x = Math.PI / 2;
  mesh.userData.category = category;
  mesh.userData.isCompletedRing = true;
  return mesh;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ── Category Progress ────────────────────────────────────────────────────────

/**
 * Compute progress toward a category's analysis threshold.
 * @returns {{ count: number, threshold: number, percent: number }}
 */
export function getCategoryProgress(category, entries) {
  const cat = CATEGORIES.find(c => c.key === category);
  if (!cat) return { count: 0, threshold: 1, percent: 0 };

  if (cat.unit === 'months') {
    // Count distinct months with at least one entry
    const months = new Set();
    for (const e of entries) {
      months.add(e.entry_date.slice(0, 7)); // YYYY-MM
    }
    const count = months.size;
    return { count, threshold: cat.threshold, percent: Math.min(count / cat.threshold, 1) };
  }

  // unit === 'entries'
  const count = entries.length;
  let percent = Math.min(count / cat.threshold, 1);

  // Also require minMonths if specified
  if (cat.minMonths) {
    const months = new Set();
    for (const e of entries) months.add(e.entry_date.slice(0, 7));
    if (months.size < cat.minMonths) {
      percent = Math.min(percent, (months.size / cat.minMonths));
    }
  }

  return { count, threshold: cat.threshold, percent };
}

// ── Build Ring Stack ─────────────────────────────────────────────────────────

/** Build the active (incomplete/available) ring for a category. */
function buildActiveRing(cat, progress) {
  const isAvailable = progress.percent >= 1;
  const color = isAvailable ? AVAILABLE_CLR : DIM_COLOR;
  const emissive = isAvailable ? 0.4 : 0.1;
  const mesh = makeTorus(RING_RADIUS, RING_TUBE, color, emissive);
  mesh.rotation.x = Math.PI / 2; // lay flat
  mesh.userData.category = cat.key;

  // Progress arc (only for incomplete rings)
  let arcMesh = null;
  if (progress.percent > 0) {
    arcMesh = makeArc(RING_RADIUS, ARC_TUBE, progress.percent);
    if (arcMesh) {
      arcMesh.userData.category = cat.key;
    }
  }

  return { mesh, arcMesh };
}

/**
 * Compute the Y height of a category's sub-stack (completed rings only).
 */
function _subStackHeight(ring) {
  const n = ring.completedRings.length;
  if (n === 0) return 0;
  return n * SUB_GAP;
}

function positionExpandedRings() {
  // Sort: incomplete at top, categories with completedRings below
  const sorted = [...categoryRings];
  sorted.sort((a, b) => {
    const aHas = a.completedRings.length > 0 ? 1 : 0;
    const bHas = b.completedRings.length > 0 ? 1 : 0;
    if (aHas !== bHas) return aHas - bHas; // incomplete first
    return 0;
  });

  // Calculate total height needed: each category takes STACK_GAP + its sub-stack
  let totalHeight = 0;
  for (let i = 0; i < sorted.length; i++) {
    totalHeight += STACK_GAP + _subStackHeight(sorted[i]);
  }

  // Compress if needed
  const scale = totalHeight > MAX_STACK_H ? MAX_STACK_H / totalHeight : 1;

  let currentY = baseY;
  for (let i = 0; i < sorted.length; i++) {
    const ring = sorted[i];
    currentY -= STACK_GAP * scale;
    ring._targetY = currentY;
    ring._sortIndex = i;

    // Position completed rings below the active ring
    const subH = _subStackHeight(ring);
    for (let j = 0; j < ring.completedRings.length; j++) {
      // Most recent completed ring is last in array, position it closest to active
      const cr = ring.completedRings[ring.completedRings.length - 1 - j];
      cr._targetY = currentY - (j + 1) * SUB_GAP * scale;
    }
    currentY -= subH * scale;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the ring stack above the spiral.
 * @param {number} spiralTopY - Y coordinate of spiral top
 * @param {Array} analyses - completed analyses from database
 * @param {Array} entries - all user entries
 */
export function initRingStack(spiralTopY, analyses, entries, callbacks = {}) {
  baseY = spiralTopY + 20;
  completedAnalyses = analyses || [];
  currentEntries = entries || [];
  onTriggerAnalyze = callbacks.onTriggerAnalyze || null;
  onViewAnalysis = callbacks.onViewAnalysis || null;

  // Clean up previous if re-initializing
  if (stackGroup) {
    scene.remove(stackGroup);
    stackGroup = null;
  }

  stackGroup = new THREE.Group();
  stackGroup.visible = true;

  // Collapsed ring
  collapsedRing = makeTorus(RING_RADIUS, RING_TUBE, AMBER, 0.15);
  collapsedRing.rotation.x = Math.PI / 2;
  collapsedRing.position.y = baseY;
  collapsedRing.userData.isCollapsedRing = true;
  stackGroup.add(collapsedRing);

  // Build category rings (initially hidden)
  categoryRings = [];
  for (const cat of CATEGORIES) {
    const progress = getCategoryProgress(cat.key, currentEntries);

    // Build active ring (always shows current progress state)
    const { mesh, arcMesh } = buildActiveRing(cat, progress);
    mesh.visible = false;
    mesh.position.y = baseY;
    stackGroup.add(mesh);

    if (arcMesh) {
      arcMesh.visible = false;
      arcMesh.position.y = baseY;
      stackGroup.add(arcMesh);
    }

    // Build completed rings sub-stack from existing analyses
    const catAnalyses = completedAnalyses.filter(a => a.category === cat.key);
    const completedRings = [];
    for (let i = 0; i < catAnalyses.length; i++) {
      const isNewest = i === catAnalyses.length - 1;
      const tube = isNewest ? RING_TUBE : RING_TUBE * 0.6;
      const crMesh = makeCompletedRingMesh(cat.key, tube);
      crMesh.visible = false;
      crMesh.position.y = baseY;
      stackGroup.add(crMesh);
      completedRings.push({ mesh: crMesh, analysis: catAnalyses[i], _targetY: baseY });
    }

    categoryRings.push({
      mesh, arcMesh, category: cat, completedRings, _computing: false,
    });
  }

  positionExpandedRings();
  scene.add(stackGroup);
}

/** Expand the ring stack — animate category rings into view. */
export function expandStack() {
  if (expanded || animating) return;
  animating = true;
  animDirection = 1;
  animFrame = 0;
  expanded = false; // will be set true when animation completes

  collapsedRing.visible = false;
  for (const ring of categoryRings) {
    ring.mesh.visible = true;
    ring.mesh.position.y = baseY;
    if (ring.arcMesh) {
      ring.arcMesh.visible = true;
      ring.arcMesh.position.y = baseY;
    }
    for (const cr of ring.completedRings) {
      cr.mesh.visible = true;
      cr.mesh.position.y = baseY;
    }
  }
}

/** Collapse the ring stack — animate back to single ring. */
export function collapseStack() {
  if (!expanded || animating) return;
  animating = true;
  animDirection = -1;
  animFrame = 0;
}

/** Call each frame to advance expand/collapse animation and pulsate computing rings. */
export function updateRingStack(time) {
  if (!stackGroup) return;

  // Expand/collapse animation
  if (animating) {
    animFrame++;
    const t = Math.min(animFrame / EXPAND_FRAMES, 1);
    const eased = easeInOut(t);
    const progress = animDirection === 1 ? eased : 1 - eased;

    for (const ring of categoryRings) {
      const targetY = ring._targetY || (baseY - STACK_GAP);
      const y = baseY + (targetY - baseY) * progress;
      ring.mesh.position.y = y;
      if (ring.arcMesh) ring.arcMesh.position.y = y;

      for (const cr of ring.completedRings) {
        const crTarget = cr._targetY || (baseY - STACK_GAP);
        cr.mesh.position.y = baseY + (crTarget - baseY) * progress;
      }
    }

    if (t >= 1) {
      animating = false;
      if (animDirection === 1) {
        expanded = true;
      } else {
        expanded = false;
        collapsedRing.visible = true;
        for (const ring of categoryRings) {
          ring.mesh.visible = false;
          if (ring.arcMesh) ring.arcMesh.visible = false;
          for (const cr of ring.completedRings) cr.mesh.visible = false;
        }
      }
    }
  }

  // Pulsate computing rings
  if (expanded) {
    for (const ring of categoryRings) {
      if (ring._computing) {
        const scale = 1 + 0.08 * Math.sin((time || performance.now() / 1000) * 4);
        ring.mesh.scale.set(scale, scale, scale);
      }
    }
  }
}

/** Update progress arcs when entries change. */
export function updateProgress(entries) {
  currentEntries = entries;
  for (const ring of categoryRings) {
    // Skip categories that have completed rings and are not currently incomplete
    const progress = getCategoryProgress(ring.category.key, entries);

    // Remove old arc
    if (ring.arcMesh) {
      stackGroup.remove(ring.arcMesh);
      ring.arcMesh.geometry.dispose();
      ring.arcMesh.material.dispose();
      ring.arcMesh = null;
    }

    // Create new arc
    if (progress.percent > 0) {
      ring.arcMesh = makeArc(RING_RADIUS, ARC_TUBE, progress.percent);
      if (ring.arcMesh) {
        ring.arcMesh.position.y = ring.mesh.position.y;
        ring.arcMesh.visible = ring.mesh.visible;
        ring.arcMesh.userData.category = ring.category.key;
        stackGroup.add(ring.arcMesh);
      }
    }

    // Update ring color: available (white) when threshold met
    if (progress.percent >= 1) {
      ring.mesh.material.color.setHex(AVAILABLE_CLR);
      ring.mesh.material.emissive.setHex(AVAILABLE_CLR);
      ring.mesh.material.emissiveIntensity = 0.4;
    }
  }
}

/** Mark a category as completed with an analysis result. */
export function addCompletedRing(analysis) {
  completedAnalyses.push(analysis);
  const ring = categoryRings.find(r => r.category.key === analysis.category);
  if (!ring) return;

  ring._computing = false;
  ring.mesh.scale.set(1, 1, 1);

  // Compress all existing completed rings to 60% tube radius
  for (const cr of ring.completedRings) {
    const oldGeo = cr.mesh.geometry;
    cr.mesh.geometry = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE * 0.6, 16, 64);
    oldGeo.dispose();
  }

  // Push new completed ring at full tube size
  const crMesh = makeCompletedRingMesh(analysis.category, RING_TUBE);
  crMesh.visible = ring.mesh.visible;
  crMesh.position.y = ring.mesh.position.y;
  stackGroup.add(crMesh);
  ring.completedRings.push({ mesh: crMesh, analysis, _targetY: baseY });

  // Reset active ring to available/incomplete appearance
  const progress = getCategoryProgress(ring.category.key, currentEntries);
  const isAvailable = progress.percent >= 1;
  const color = isAvailable ? AVAILABLE_CLR : DIM_COLOR;
  const emissive = isAvailable ? 0.4 : 0.1;
  ring.mesh.material.color.setHex(color);
  ring.mesh.material.emissive.setHex(color);
  ring.mesh.material.emissiveIntensity = emissive;

  positionExpandedRings();

  // Snap completed rings to their new target positions if expanded
  if (expanded) {
    for (const cr of ring.completedRings) {
      cr.mesh.position.y = cr._targetY;
    }
  }
}

/** Set a ring to computing state (pulsating). */
export function setRingComputing(category, computing = true) {
  const ring = categoryRings.find(r => r.category.key === category);
  if (ring) ring._computing = computing;
}

/** Get all meshes for raycasting (collapsed, active, and completed rings). */
export function getRingMeshes() {
  const meshes = [];
  if (collapsedRing && collapsedRing.visible) meshes.push(collapsedRing);
  for (const ring of categoryRings) {
    if (ring.mesh.visible) meshes.push(ring.mesh);
    for (const cr of ring.completedRings) {
      if (cr.mesh.visible) meshes.push(cr.mesh);
    }
  }
  return meshes;
}

/**
 * Handle a click intersection on a ring mesh.
 * Returns true if the click was consumed.
 */
export function handleRingClick(mesh) {
  // Collapsed ring → expand
  if (mesh.userData.isCollapsedRing) {
    expandStack();
    return true;
  }

  // Check completed ring sub-stacks first
  if (mesh.userData.isCompletedRing) {
    const category = mesh.userData.category;
    const ring = categoryRings.find(r => r.category.key === category);
    if (ring) {
      const cr = ring.completedRings.find(c => c.mesh === mesh);
      if (cr && cr.analysis && onViewAnalysis) {
        onViewAnalysis(cr.analysis);
        return true;
      }
    }
  }

  // Category active ring
  const category = mesh.userData.category;
  if (!category) return false;

  const ring = categoryRings.find(r => r.category.key === category);
  if (!ring) return false;

  // Check if available (threshold met)
  const progress = getCategoryProgress(category, currentEntries);
  if (progress.percent >= 1) {
    // Available → trigger analyze
    if (onTriggerAnalyze) onTriggerAnalyze(category);
    return true;
  }

  // Incomplete — no action
  return true; // still consume click
}

/** Whether the stack is currently expanded. */
export function isExpanded() { return expanded; }

/** Get the stack group for visibility toggling by view mode. */
export function getStackGroup() { return stackGroup; }

/** Get list of category definitions. */
export function getCategories() { return CATEGORIES; }

/** Get the world-space position of a category ring (for panel placement). */
export function getRingPosition(category) {
  const ring = categoryRings.find(r => r.category.key === category);
  if (!ring) return new THREE.Vector3(0, baseY, 0);
  return new THREE.Vector3(0, ring.mesh.position.y, 0);
}

/** Get all completed analyses. */
export function getCompletedAnalyses() {
  return completedAnalyses;
}
