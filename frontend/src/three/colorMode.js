/**
 * colorMode.js — toggle bead colours between entry colour and mood scale.
 */

import * as THREE from 'three';
import { getBeadMesh } from './beads.js';

const MOOD_COLORS = {
  1: '#c0392b',   // red
  2: '#e67e22',   // orange
  3: '#6b5a47',   // neutral
  4: '#7dbb6e',   // light green
  5: '#27ae60',   // green
};
const NO_MOOD = '#3d2e1e';

let currentMode = 'category'; // 'category' | 'mood'
let toggleEl    = null;

// ── Public API ──────────────────────────────────────────────────────────────

/** Restore every bead to its entry.color. */
export function setCategoryMode(entries) {
  currentMode = 'category';
  for (const entry of entries) {
    const mesh = getBeadMesh(entry.id);
    if (!mesh) continue;
    const c = new THREE.Color(entry.color);
    mesh.material.color.copy(c);
    mesh.material.emissive.copy(c);
  }
  _updateLabel();
}

/** Recolour every bead by its mood value. */
export function setMoodMode(entries) {
  currentMode = 'mood';
  for (const entry of entries) {
    const mesh = getBeadMesh(entry.id);
    if (!mesh) continue;
    const hex = entry.mood ? MOOD_COLORS[entry.mood] : NO_MOOD;
    const c   = new THREE.Color(hex);
    mesh.material.color.copy(c);
    mesh.material.emissive.copy(c);
  }
  _updateLabel();
}

/** Toggle between category and mood mode. Returns the new mode name. */
export function toggleColorMode(entries) {
  if (currentMode === 'category') {
    setMoodMode(entries);
  } else {
    setCategoryMode(entries);
  }
  return currentMode;
}

/** Get the current mode string. */
export function getColorMode() {
  return currentMode;
}

// ── Toggle button (DOM overlay) ─────────────────────────────────────────────

/**
 * Build a small toggle button in the upper-right corner.
 * @param {function} onClick  callback invoked when the button is clicked
 */
export function initColorModeToggle(onClick) {
  toggleEl = document.createElement('div');
  Object.assign(toggleEl.style, {
    position:       'fixed',
    top:            '20px',
    right:          '20px',
    zIndex:         '100',
    padding:        '6px 14px',
    fontFamily:     'monospace',
    fontSize:       '11px',
    letterSpacing:  '2px',
    textTransform:  'uppercase',
    color:          '#f5a623',
    background:     'rgba(26, 16, 8, 0.7)',
    border:         '1px solid rgba(245, 166, 35, 0.3)',
    borderRadius:   '4px',
    cursor:         'pointer',
    userSelect:     'none',
    pointerEvents:  'auto',
  });

  _updateLabel();
  toggleEl.addEventListener('click', onClick);
  document.getElementById('app').appendChild(toggleEl);
}

function _updateLabel() {
  if (!toggleEl) return;
  toggleEl.textContent = currentMode === 'category' ? 'MOOD' : 'CATEGORY';
}
