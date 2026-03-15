/**
 * analysisRings.js — Collapsed/expanded ring stack for analysis categories.
 *
 * One collapsed ring floats above the spiral. Click to expand into 6 category
 * rings with progress arcs, state coloring, and click handlers.
 */

import * as THREE from 'three';
import { scene } from './renderer.js';

// ── Constants ────────────────────────────────────────────────────────────────
const RING_RADIUS   = 12;
const RING_TUBE     = 0.3;
const AMBER         = 0xf5a623;
const DIM_COLOR     = 0x3d2e1e;
const STACK_GAP     = 5;      // gap between rings when expanded
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
let categoryRings   = [];     // { mesh, arcMesh, category, completed, analysis }
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
  const mesh = new THREE.Mesh(geo, mat);
  // Rotate so arc starts at "12 o'clock"
  mesh.rotation.x = Math.PI / 2;
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

function buildCategoryRing(cat, progress, isCompleted, analysis) {
  const color = isCompleted ? AMBER : DIM_COLOR;
  const emissive = isCompleted ? 0.5 : 0.1;
  const mesh = makeTorus(RING_RADIUS, RING_TUBE, color, emissive);
  mesh.rotation.x = Math.PI / 2; // lay flat
  mesh.userData.category = cat.key;

  // Progress arc (only for incomplete rings)
  let arcMesh = null;
  if (!isCompleted && progress.percent > 0) {
    arcMesh = makeArc(RING_RADIUS, ARC_TUBE, progress.percent);
    if (arcMesh) {
      arcMesh.userData.category = cat.key;
    }
  }

  return { mesh, arcMesh, category: cat, completed: isCompleted, analysis };
}

function positionExpandedRings() {
  // Uncompleted rings at top, completed below
  const sorted = [...categoryRings];
  sorted.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return 0;
  });

  const n = sorted.length;
  // Compress if needed to fit MAX_STACK_H
  const idealHeight = (n - 1) * STACK_GAP;
  const effectiveGap = idealHeight > MAX_STACK_H ? MAX_STACK_H / (n - 1) : STACK_GAP;

  for (let i = 0; i < n; i++) {
    const ring = sorted[i];
    ring._targetY = baseY - (i + 1) * effectiveGap;
    ring._sortIndex = i;
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
    const completedAnalysis = completedAnalyses.find(a => a.category === cat.key);
    const isCompleted = !!completedAnalysis;

    const ring = buildCategoryRing(cat, progress, isCompleted, completedAnalysis || null);
    ring.mesh.visible = false;
    ring.mesh.position.y = baseY; // start at collapsed position
    stackGroup.add(ring.mesh);

    if (ring.arcMesh) {
      ring.arcMesh.visible = false;
      ring.arcMesh.position.y = baseY;
      stackGroup.add(ring.arcMesh);
    }

    categoryRings.push(ring);
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
    if (ring.completed) continue;
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

    // Update ring color if threshold now met
    if (progress.percent >= 1) {
      ring.mesh.material.color.setHex(AMBER);
      ring.mesh.material.emissive.setHex(AMBER);
      ring.mesh.material.emissiveIntensity = 0.3;
    }
  }
}

/** Mark a category as completed with an analysis result. */
export function addCompletedRing(analysis) {
  completedAnalyses.push(analysis);
  const ring = categoryRings.find(r => r.category.key === analysis.category);
  if (!ring) return;

  ring.completed = true;
  ring.analysis = analysis;
  ring._computing = false;

  // Update appearance to completed (glowing amber)
  ring.mesh.material.color.setHex(AMBER);
  ring.mesh.material.emissive.setHex(AMBER);
  ring.mesh.material.emissiveIntensity = 0.5;
  ring.mesh.scale.set(1, 1, 1);

  // Remove progress arc — no longer needed
  if (ring.arcMesh) {
    stackGroup.remove(ring.arcMesh);
    ring.arcMesh.geometry.dispose();
    ring.arcMesh.material.dispose();
    ring.arcMesh = null;
  }

  positionExpandedRings();
}

/** Set a ring to computing state (pulsating). */
export function setRingComputing(category, computing = true) {
  const ring = categoryRings.find(r => r.category.key === category);
  if (ring) ring._computing = computing;
}

/** Get all meshes for raycasting. */
export function getRingMeshes() {
  const meshes = [];
  if (collapsedRing && collapsedRing.visible) meshes.push(collapsedRing);
  for (const ring of categoryRings) {
    if (ring.mesh.visible) meshes.push(ring.mesh);
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

  // Category ring
  const category = mesh.userData.category;
  if (!category) return false;

  const ring = categoryRings.find(r => r.category.key === category);
  if (!ring) return false;

  if (ring.completed && ring.analysis) {
    // Completed → view analysis
    if (onViewAnalysis) onViewAnalysis(ring.analysis);
    return true;
  }

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
