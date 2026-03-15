/**
 * analysisViewingMode.js — Enter/exit viewing mode for completed analyses.
 *
 * When active: related beads glow at full intensity, non-related beads dim,
 * analysis description panel appears near the triggering ring, and a
 * Run Again button is shown.
 */

import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { css3dScene, registerPanel, unregisterPanel } from './renderer.js';

// ── Constants ────────────────────────────────────────────────────────────────
const AMBER           = 0xf5a623;
const GLOW_INTENSITY  = 0.7;   // full glow in viewing mode
const DIM_INTENSITY   = 0.1;   // dimmed beads
const BELONG_INTENSITY = 0.15; // subtle belonging indicator after exit
const AMBER_COLOR     = new THREE.Color(AMBER);

// ── State ────────────────────────────────────────────────────────────────────
let _active           = false;
let _currentAnalysis  = null;
let _relatedMeshes    = [];     // meshes for entry_ids in the analysis
let _allBeadMeshes    = [];     // all bead meshes in scene
let _savedMaterials   = new Map(); // mesh → { emissive, emissiveIntensity }
let _descriptionPanel = null;
let _runAgainPanel    = null;
let _panelAnchor      = null;   // THREE.Vector3 for panel positioning
let _onRunAgain       = null;   // callback: (category) => void

// Track all entry IDs that belong to any analysis (persists across mode exits)
const _belongingEntryIds = new Set();

// ── Helpers ──────────────────────────────────────────────────────────────────

function _saveMaterial(mesh) {
  if (_savedMaterials.has(mesh)) return;
  _savedMaterials.set(mesh, {
    emissive: mesh.material.emissive.clone(),
    emissiveIntensity: mesh.material.emissiveIntensity,
  });
}

function _restoreMaterial(mesh) {
  const saved = _savedMaterials.get(mesh);
  if (!saved) return;
  mesh.material.emissive.copy(saved.emissive);
  mesh.material.emissiveIntensity = saved.emissiveIntensity;
  _savedMaterials.delete(mesh);
}

function _createDescriptionPanel(analysis, anchor) {
  const div = document.createElement('div');
  Object.assign(div.style, {
    background:   'rgba(20, 12, 4, 0.94)',
    border:       '1px solid rgba(245, 166, 35, 0.4)',
    color:        '#fff5e6',
    padding:      '20px 22px',
    borderRadius: '10px',
    width:        '300px',
    fontFamily:   'monospace',
    fontSize:     '13px',
    lineHeight:   '1.6',
    pointerEvents:'none',
  });

  // Category label
  const catEl = document.createElement('div');
  catEl.textContent = (analysis.category || '').toUpperCase();
  Object.assign(catEl.style, {
    fontSize:      '11px',
    letterSpacing: '2px',
    color:         '#f5a623',
    marginBottom:  '6px',
    fontWeight:    'bold',
  });
  div.appendChild(catEl);

  // Summary
  const summaryEl = document.createElement('div');
  summaryEl.textContent = analysis.summary || '';
  Object.assign(summaryEl.style, {
    fontSize:     '14px',
    fontWeight:   'bold',
    color:        '#fff5e6',
    marginBottom: '10px',
  });
  div.appendChild(summaryEl);

  // Description
  const descEl = document.createElement('div');
  descEl.textContent = analysis.description || '';
  Object.assign(descEl.style, {
    color:        'rgba(255, 245, 230, 0.8)',
    marginBottom: '10px',
    whiteSpace:   'pre-wrap',
  });
  div.appendChild(descEl);

  // Entry count
  const countEl = document.createElement('div');
  const n = analysis.entry_ids ? analysis.entry_ids.length : 0;
  countEl.textContent = `${n} related ${n === 1 ? 'entry' : 'entries'}`;
  Object.assign(countEl.style, {
    fontSize: '11px',
    color:    'rgba(245, 166, 35, 0.6)',
  });
  div.appendChild(countEl);

  const panel = new CSS3DObject(div);
  panel.position.copy(anchor);
  panel.position.y += 5;
  panel.position.x += 15;

  css3dScene.add(panel);
  registerPanel(panel, anchor);
  return panel;
}

function _createRunAgainButton(anchor, onClick) {
  const div = document.createElement('div');
  Object.assign(div.style, {
    background:   'rgba(245, 166, 35, 0.15)',
    border:       '1px solid rgba(245, 166, 35, 0.5)',
    color:        '#f5a623',
    padding:      '8px 18px',
    borderRadius: '6px',
    fontFamily:   'monospace',
    fontSize:     '12px',
    letterSpacing:'2px',
    fontWeight:   'bold',
    cursor:       'pointer',
    pointerEvents:'auto',
    textAlign:    'center',
    userSelect:   'none',
  });
  div.textContent = 'RUN AGAIN';

  div.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onClick) onClick();
  });

  div.addEventListener('mouseenter', () => {
    div.style.background = 'rgba(245, 166, 35, 0.3)';
  });
  div.addEventListener('mouseleave', () => {
    div.style.background = 'rgba(245, 166, 35, 0.15)';
  });

  const panel = new CSS3DObject(div);
  panel.position.copy(anchor);
  panel.position.y += 2;
  panel.position.x += 15;

  css3dScene.add(panel);
  registerPanel(panel, anchor);
  return panel;
}

function _removePanel(panel) {
  if (!panel) return;
  unregisterPanel(panel);
  css3dScene.remove(panel);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Enter analysis viewing mode.
 * @param {object} analysis - { id, category, summary, description, entry_ids, run_at }
 * @param {THREE.Mesh[]} allBeadMeshes - every bead mesh in the scene
 * @param {THREE.Vector3} ringPosition - position of the triggering ring (for panel placement)
 * @param {Function} onRunAgainCb - called with (category) when Run Again is clicked
 */
export function enterAnalysisViewingMode(analysis, allBeadMeshes, ringPosition, onRunAgainCb) {
  // If already viewing a different analysis, exit first
  if (_active) exitAnalysisViewingMode();

  _active = true;
  _currentAnalysis = analysis;
  _allBeadMeshes = allBeadMeshes;
  _onRunAgain = onRunAgainCb || null;

  const relatedIds = new Set(analysis.entry_ids || []);

  // Track belonging
  for (const id of relatedIds) _belongingEntryIds.add(id);

  // Separate related from non-related
  _relatedMeshes = [];
  _savedMaterials.clear();

  for (const mesh of allBeadMeshes) {
    _saveMaterial(mesh);
    const entryId = mesh.userData.entryId;

    if (relatedIds.has(entryId)) {
      // Related → full amber glow
      _relatedMeshes.push(mesh);
      mesh.material.emissive.copy(AMBER_COLOR);
      mesh.material.emissiveIntensity = GLOW_INTENSITY;
    } else {
      // Non-related → dim
      mesh.material.emissiveIntensity = DIM_INTENSITY;
    }
  }

  // Show analysis description panel
  _panelAnchor = ringPosition.clone();
  _descriptionPanel = _createDescriptionPanel(analysis, _panelAnchor);

  // Show Run Again button
  _runAgainPanel = _createRunAgainButton(_panelAnchor, () => {
    const cat = _currentAnalysis ? _currentAnalysis.category : null;
    exitAnalysisViewingMode();
    if (_onRunAgain && cat) _onRunAgain(cat);
  });

  console.log('[viewMode] Entered analysis viewing mode:', analysis.category);
}

/**
 * Exit analysis viewing mode — restore beads, remove panels.
 */
export function exitAnalysisViewingMode() {
  if (!_active) return;

  // Restore bead materials, but keep belonging indicator for analyzed beads
  for (const mesh of _allBeadMeshes) {
    _restoreMaterial(mesh);

    // Apply belonging indicator if this bead belongs to any analysis
    const entryId = mesh.userData.entryId;
    if (_belongingEntryIds.has(entryId)) {
      mesh.material.emissive.copy(AMBER_COLOR);
      mesh.material.emissiveIntensity = BELONG_INTENSITY;
    }
  }

  // Remove panels
  _removePanel(_descriptionPanel);
  _removePanel(_runAgainPanel);
  _descriptionPanel = null;
  _runAgainPanel = null;

  _active = false;
  _currentAnalysis = null;
  _relatedMeshes = [];
  _allBeadMeshes = [];
  _savedMaterials.clear();
  _panelAnchor = null;

  console.log('[viewMode] Exited analysis viewing mode');
}

/**
 * Whether viewing mode is currently active.
 */
export function isInAnalysisViewingMode() {
  return _active;
}

/**
 * Get the meshes that are glowing (related to current analysis).
 * Used by main.js for hover raycasting.
 */
export function getGlowingMeshes() {
  return _active ? _relatedMeshes : [];
}

/**
 * Get the current analysis object (for annotation lookup).
 */
export function getCurrentAnalysis() {
  return _currentAnalysis;
}

/**
 * Apply belonging indicator to beads on app init.
 * Call this after loading analyses to mark beads that belong to any analysis.
 * @param {Array} analyses - all completed analyses
 * @param {THREE.Mesh[]} allBeadMeshes - all bead meshes
 */
export function applyBelongingIndicators(analyses, allBeadMeshes) {
  // Collect all entry IDs across all analyses
  for (const analysis of analyses) {
    if (analysis.entry_ids) {
      for (const id of analysis.entry_ids) {
        _belongingEntryIds.add(id);
      }
    }
  }

  // Apply faint amber emissive to belonging beads
  for (const mesh of allBeadMeshes) {
    const entryId = mesh.userData.entryId;
    if (_belongingEntryIds.has(entryId)) {
      mesh.material.emissive.copy(AMBER_COLOR);
      mesh.material.emissiveIntensity = BELONG_INTENSITY;
    }
  }
}
