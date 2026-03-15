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
import { webgl, scene } from './renderer.js';
import { dateToPosition } from './spiralMath.js';

const DAYS_IN_YEAR = 365.25;
const MS_PER_DAY   = 86400000;

// Slider sits between the mood button bottom (~52px) and the view cube top (~124px from bottom).
// These constants keep the slider flush with those two landmarks.
const SLIDER_TOP    = '60px';   // just below the 20px+32px mood button
const SLIDER_BOTTOM = '132px';  // 24px margin + 100px cube + 8px gap
const SLIDER_RIGHT  = '24px';   // same right edge as view cube
const SLIDER_WIDTH  = '100px';  // same width as view cube

let clipPlane        = null;
let detailUpperPlane = null; // detail view: y <= targetY + 5
let detailLowerPlane = null; // detail view: y >= targetY - 8
let birthdayDate    = null;
let sliderEl        = null;
let trackEl         = null;
let handleEl        = null;
let yearLabelEl     = null;
let capMesh         = null;   // end-cap disc at cut position
let _spiralTopY     = 0;

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
  _buildEndCap(spiralTopY);
}

/** Update the clip-plane height, year label, and end-cap position. */
export function setSectionCutY(y) {
  if (!clipPlane) return;
  clipPlane.constant = y;
  _updateYearLabel(y);
  _updateEndCap(y);
}

/** Get the current clip-plane Y value. */
export function getSectionCutY() {
  return clipPlane ? clipPlane.constant : _spiralTopY;
}

/**
 * Replace the global clip planes with a tight two-plane window around targetY.
 * Shows: targetY - 8  <=  y  <=  targetY + 5
 * Called each frame while in detail mode.
 * @param {number} targetY  world-Y of the spiral point the camera is centred on
 */
export function setDetailClipWindow(targetY) {
  const upperY = targetY + 5;
  const lowerY = targetY - 8;
  if (!detailUpperPlane) {
    detailUpperPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0),  upperY);
    detailLowerPlane = new THREE.Plane(new THREE.Vector3(0,  1, 0), -lowerY);
    webgl.clippingPlanes = [detailUpperPlane, detailLowerPlane];
  } else {
    detailUpperPlane.constant =  upperY;
    detailLowerPlane.constant = -lowerY;
  }
}

/** Restore the global section-cut plane (call when leaving detail view). */
export function clearDetailClipWindow() {
  if (detailUpperPlane || detailLowerPlane) {
    webgl.clippingPlanes = clipPlane ? [clipPlane] : [];
    detailUpperPlane = null;
    detailLowerPlane = null;
  }
}

export function showSectionCutSlider() {
  if (sliderEl) sliderEl.style.display = 'flex';
  if (capMesh)  capMesh.visible = true;
}

export function hideSectionCutSlider() {
  if (sliderEl) sliderEl.style.display = 'none';
  if (capMesh)  capMesh.visible = false;
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
 * frac = 0 → handle at top  → clipY = spiralTopY (all visible, no cut)
 * frac = 1 → handle at bottom → clipY = 0 (only ground visible)
 */
function _applyFraction(frac, spiralTopY) {
  handleEl.style.top    = `${frac * 100}%`;
  yearLabelEl.style.top = `${frac * 100}%`;
  const clipY = spiralTopY * (1 - frac);
  setSectionCutY(clipY);
}
