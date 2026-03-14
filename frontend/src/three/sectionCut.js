/**
 * sectionCut.js
 *
 * Creates a WebGL clipping plane that hides the upper portion of the spiral
 * (recent years) and a minimal CSS overlay slider to control it.
 *
 * Clip plane: THREE.Plane(normal=(0,-1,0), constant=clipY)
 *   – Shows fragments where  y ≤ clipY
 *   – Default clipY = spiralTopY  →  nothing clipped, full spiral visible
 *   – Moving slider down  →  clipY decreases  →  recent years hidden
 *   – Ground plane at y=0 always satisfies 0 ≤ clipY  →  always visible
 */

import * as THREE from 'three';
import { webgl } from './renderer.js';

const DAYS_IN_YEAR = 365.25;
const MS_PER_DAY   = 86400000;

let clipPlane    = null;
let birthdayDate = null;
let sliderEl     = null;
let labelEl      = null;
let trackEl      = null;
let handleEl     = null;
let _spiralTopY  = 0;

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Create the clip plane, attach it to the WebGL renderer, and build the
 * slider UI.  Must be called after initRenderer().
 *
 * @param {number} spiralTopY  – world-Y of the topmost coil
 * @param {Date}   birthday    – used to compute the year label
 */
export function initSectionCut(spiralTopY, birthday) {
  _spiralTopY  = spiralTopY;
  birthdayDate = new Date(birthday);

  // Clip plane: normal (0,-1,0) → shows y ≤ constant.
  // Default constant = spiralTopY → nothing clipped.
  clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), spiralTopY);
  webgl.clippingPlanes = [clipPlane];

  _buildSliderUI(spiralTopY);
}

/** Update the clip-plane height and year label. */
export function setSectionCutY(y) {
  if (!clipPlane) return;
  clipPlane.constant = y;

  if (birthdayDate && labelEl) {
    const yearsElapsed = y / 8;
    const cutDate = new Date(
      birthdayDate.getTime() + yearsElapsed * DAYS_IN_YEAR * MS_PER_DAY
    );
    labelEl.textContent = `Section Cut: ${cutDate.getFullYear()}`;
  }
}

export function showSectionCutSlider() {
  if (sliderEl) sliderEl.style.display = 'flex';
}

export function hideSectionCutSlider() {
  if (sliderEl) sliderEl.style.display = 'none';
}

// ── Slider UI ───────────────────────────────────────────────────────────────

function _buildSliderUI(spiralTopY) {
  // Outer container — fixed on right side of viewport
  sliderEl = document.createElement('div');
  Object.assign(sliderEl.style, {
    position:      'fixed',
    right:         '36px',
    top:           '12%',
    height:        '76%',
    width:         '36px',
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           '10px',
    zIndex:        '100',
    userSelect:    'none',
    pointerEvents: 'auto',
  });

  // "SECTION CUT" heading (rotated to read upward along the track)
  const heading = document.createElement('div');
  Object.assign(heading.style, {
    color:         'rgba(255,245,230,0.45)',
    fontFamily:    'sans-serif',
    fontSize:      '9px',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    writingMode:   'vertical-rl',
    transform:     'rotate(180deg)',
    pointerEvents: 'none',
  });
  heading.textContent = 'Section Cut';

  // Year label below heading
  labelEl = document.createElement('div');
  Object.assign(labelEl.style, {
    color:         'rgba(255,245,230,0.75)',
    fontFamily:    'sans-serif',
    fontSize:      '10px',
    letterSpacing: '1px',
    writingMode:   'vertical-rl',
    transform:     'rotate(180deg)',
    pointerEvents: 'none',
  });
  // Initial label: no cut yet, show the top year
  const today = new Date();
  labelEl.textContent = `Section Cut: ${today.getFullYear()}`;

  // Vertical track
  trackEl = document.createElement('div');
  Object.assign(trackEl.style, {
    flex:           '1',
    width:          '2px',
    background:     'rgba(255,245,230,0.2)',
    borderRadius:   '1px',
    position:       'relative',
    cursor:         'pointer',
  });

  // Draggable handle — starts at top (no cut)
  handleEl = document.createElement('div');
  Object.assign(handleEl.style, {
    position:        'absolute',
    width:           '14px',
    height:          '14px',
    background:      'rgba(255,245,230,0.85)',
    borderRadius:    '50%',
    left:            '50%',
    top:             '0%',
    transform:       'translate(-50%, -50%)',
    cursor:          'grab',
    boxShadow:       '0 0 6px rgba(255,245,230,0.4)',
  });

  trackEl.appendChild(handleEl);
  sliderEl.appendChild(heading);
  sliderEl.appendChild(labelEl);
  sliderEl.appendChild(trackEl);
  document.getElementById('app').appendChild(sliderEl);

  _initDrag(spiralTopY);
}

function _initDrag(spiralTopY) {
  let dragging  = false;
  let startClientY = 0;
  let startTopFrac = 0; // 0 = top of track, 1 = bottom

  handleEl.addEventListener('mousedown', (e) => {
    dragging      = true;
    startClientY  = e.clientY;
    startTopFrac  = parseFloat(handleEl.style.top) / 100 || 0;
    handleEl.style.cursor = 'grabbing';
    e.preventDefault();
    e.stopPropagation();
  });

  // Also allow clicking anywhere on the track to jump handle there
  trackEl.addEventListener('mousedown', (e) => {
    if (e.target === handleEl) return;
    const rect = trackEl.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    _applyFraction(frac, spiralTopY);
    dragging     = true;
    startClientY = e.clientY;
    startTopFrac = frac;
    handleEl.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect    = trackEl.getBoundingClientRect();
    const dy      = e.clientY - startClientY;
    const newFrac = Math.max(0, Math.min(1, startTopFrac + dy / rect.height));
    _applyFraction(newFrac, spiralTopY);
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    if (handleEl) handleEl.style.cursor = 'grab';
  });
}

/**
 * frac = 0 → handle at top  → clipY = spiralTopY (all visible, no cut)
 * frac = 1 → handle at bottom → clipY = 0 (only ground visible)
 */
function _applyFraction(frac, spiralTopY) {
  handleEl.style.top = `${frac * 100}%`;
  const clipY = spiralTopY * (1 - frac);
  setSectionCutY(clipY);
}
