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
 *
 * UI layout: right-aligned column (right: 24px, width: 100px) matching
 * the view cube, positioned between the mood button (top) and the cube
 * (bottom).  Slider spans the full available vertical space.  A year
 * label floats to the left of the handle and tracks its position.
 *
 * An end-cap disc is placed at the spiral path position of the current
 * cut Y to give the appearance of a clean perpendicular cut.
 */

import * as THREE from 'three';
import { scene } from './renderer.js';
import { dateToPosition } from './spiralMath.js';
import { setDetailCeiling, setDetailCenter } from './cameraController.js';

const DAYS_IN_YEAR = 365.25;
const MS_PER_DAY   = 86400000;

// Slider sits between the mood button bottom (~52px) and the view cube top (~124px from bottom).
// These constants keep the slider flush with those two landmarks.
const SLIDER_TOP    = '60px';   // just below the 20px+32px mood button
const SLIDER_BOTTOM = '132px';  // 24px margin + 100px cube + 8px gap
const SLIDER_RIGHT  = '24px';   // same right edge as view cube
const SLIDER_WIDTH  = '100px';  // same width as view cube

let _clipY          = 0;
let birthdayDate    = null;
let sliderEl        = null;
let trackEl         = null;
let handleEl        = null;
let yearLabelEl     = null;
let capMesh         = null;   // end-cap disc at cut position
let _spiralTopY     = 0;
let _tickYs         = [];     // year-boundary Y values for snapping

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
  _clipY       = spiralTopY; // default: no cut

  _computeYearTicks();
  _buildSliderUI(spiralTopY);
  _buildEndCap(spiralTopY);
}

/**
 * Pre-compute the Y values for "today's month/day in each year from birthday to today".
 * The slider snaps to these values so it always lands on a whole year.
 */
function _computeYearTicks() {
  _tickYs = [];
  const todayNow = new Date();
  const startYear = birthdayDate.getFullYear();
  const endYear   = todayNow.getFullYear();
  for (let yr = startYear; yr <= endYear; yr++) {
    const tickDate = new Date(yr, todayNow.getMonth(), todayNow.getDate());
    if (tickDate < birthdayDate || tickDate > todayNow) continue;
    const pos = dateToPosition(tickDate, birthdayDate);
    _tickYs.push(pos.y);
  }
}

function _snapToNearestTick(y) {
  if (!_tickYs.length) return y;
  let best = _tickYs[0], bestDist = Infinity;
  for (const ty of _tickYs) {
    const d = Math.abs(ty - y);
    if (d < bestDist) { bestDist = d; best = ty; }
  }
  return best;
}

/** Update the section cut Y, year label, and end-cap position. */
export function setSectionCutY(y) {
  _clipY = y;
  _updateYearLabel(y);
  _updateEndCap(y);
}

/** Get the current section cut Y value. */
export function getSectionCutY() {
  return _clipY;
}


export function showSectionCutSlider() {
  if (sliderEl) sliderEl.style.display = 'flex';
  if (capMesh)  capMesh.visible = true;
}

export function hideSectionCutSlider() {
  if (sliderEl) sliderEl.style.display = 'none';
  if (capMesh)  capMesh.visible = false;
}

/** Set slider handle to a specific fraction (0-1). */
export function setSliderPosition(frac) {
  const clampedFrac = Math.max(0, Math.min(1, frac));
  if (handleEl) handleEl.style.top = `${clampedFrac * 100}%`;
  if (yearLabelEl) yearLabelEl.style.top = `${clampedFrac * 100}%`;
}

// ── End-cap disc ─────────────────────────────────────────────────────────────

function _buildEndCap(spiralTopY) {
  // Small horizontal disc that caps the open end of the clipped spiral tube.
  const capGeo = new THREE.CircleGeometry(0.2, 12);
  const capMat = new THREE.MeshStandardMaterial({
    color:             0xfff5e6,
    emissive:          0xffecd4,
    emissiveIntensity: 0.35,
    metalness:         0.3,
    roughness:         0.55,
    side:              THREE.DoubleSide,
    transparent:       true,
  });
  capMesh = new THREE.Mesh(capGeo, capMat);
  capMesh.rotation.x = -Math.PI / 2; // lay flat in XZ plane
  capMesh.renderOrder = 1;
  capMesh.material.depthTest = false;
  capMesh.visible = false; // hidden until slider is shown
  scene.add(capMesh);
  _updateEndCap(spiralTopY);
}

function _updateEndCap(y) {
  if (!capMesh || !birthdayDate) return;
  const yearsElapsed = y / 8;
  const cutDate = new Date(birthdayDate.getTime() + yearsElapsed * DAYS_IN_YEAR * MS_PER_DAY);
  const pos = dateToPosition(cutDate, birthdayDate);
  capMesh.position.set(pos.x, y, pos.z);
}

// ── Year label helper ────────────────────────────────────────────────────────

function _updateYearLabel(y) {
  if (!birthdayDate || !yearLabelEl) return;
  const yearsElapsed = y / 8;
  const cutDate = new Date(birthdayDate.getTime() + yearsElapsed * DAYS_IN_YEAR * MS_PER_DAY);
  yearLabelEl.textContent = cutDate.getFullYear();
}

// ── Slider UI ───────────────────────────────────────────────────────────────

function _buildSliderUI(spiralTopY) {
  // Outer container — fixed on right side, aligned with view cube
  sliderEl = document.createElement('div');
  Object.assign(sliderEl.style, {
    position:      'fixed',
    right:         SLIDER_RIGHT,
    top:           SLIDER_TOP,
    bottom:        SLIDER_BOTTOM,
    width:         SLIDER_WIDTH,
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    zIndex:        '100',
    userSelect:    'none',
    pointerEvents: 'auto',
    boxSizing:     'border-box',
  });

  // Vertical track — fills all available height
  trackEl = document.createElement('div');
  Object.assign(trackEl.style, {
    flex:         '1',
    width:        '2px',
    background:   'rgba(255,245,230,0.2)',
    borderRadius: '1px',
    position:     'relative',
    cursor:       'pointer',
  });

  // Draggable handle — starts at top (no cut)
  handleEl = document.createElement('div');
  Object.assign(handleEl.style, {
    position:    'absolute',
    width:       '14px',
    height:      '14px',
    background:  'rgba(255,245,230,0.85)',
    borderRadius:'50%',
    left:        '50%',
    top:         '0%',
    transform:   'translate(-50%, -50%)',
    cursor:      'grab',
    boxShadow:   '0 0 6px rgba(255,245,230,0.4)',
  });

  // Year label — floats to the left of the handle, tracks its Y position
  yearLabelEl = document.createElement('div');
  Object.assign(yearLabelEl.style, {
    position:      'absolute',
    right:         'calc(100% + 10px)',
    top:           '0%',
    transform:     'translateY(-50%)',
    color:         'rgba(255,245,230,0.75)',
    fontFamily:    'monospace',
    fontSize:      '11px',
    letterSpacing: '1px',
    whiteSpace:    'nowrap',
    pointerEvents: 'none',
  });
  // Initialize year label with the top-year (no cut)
  const today = new Date();
  yearLabelEl.textContent = today.getFullYear();

  trackEl.appendChild(handleEl);
  trackEl.appendChild(yearLabelEl);
  sliderEl.appendChild(trackEl);
  document.getElementById('app').appendChild(sliderEl);

  _initDrag(spiralTopY);
}

function _initDrag(spiralTopY) {
  let dragging    = false;
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
 * frac = 0 → handle at top    → clipY = spiralTopY (no cut / ceiling at today)
 * frac = 1 → handle at bottom → clipY = 0
 *
 * Snaps to the nearest whole-year tick so the slider always lands on a year.
 */
function _applyFraction(frac, spiralTopY) {
  const rawClipY   = spiralTopY * (1 - frac);
  const clipY      = _snapToNearestTick(rawClipY);
  const snappedFrac = 1 - clipY / spiralTopY;

  handleEl.style.top    = `${snappedFrac * 100}%`;
  yearLabelEl.style.top = `${snappedFrac * 100}%`;
  setSectionCutY(clipY);
  setDetailCeiling(clipY); // no-op when not in detail mode

  // Keep detail-view camera XZ on the spiral at the new date
  const yearsElapsed = clipY / 8;
  const cutDate = new Date(birthdayDate.getTime() + yearsElapsed * DAYS_IN_YEAR * MS_PER_DAY);
  setDetailCenter(dateToPosition(cutDate, birthdayDate)); // no-op when not in detail mode
}
