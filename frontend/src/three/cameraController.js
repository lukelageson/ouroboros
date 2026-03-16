import * as THREE from 'three';
import { camera, controls } from './renderer.js';

const TRANSITION_FRAMES = 60;

// ── Plan / Detail view ──────────────────────────────────────────────────────
const PLAN_H        = 180;
const SPIRAL_RADIUS = 40;
const PLAN_FOV      = THREE.MathUtils.radToDeg(
  2 * Math.atan(SPIRAL_RADIUS / (PLAN_H * 0.9))
); // ≈ 28° — outermost coil fills ~90 % of screen height

// Detail View initial zoom: 50% of full frame = 2× zoom
const DETAIL_ENTRY_CROP_FRACTION = 0.5;
// Min crop = 5% of full frame (20× zoom)
const DETAIL_MIN_CROP_FRACTION   = 0.05;

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ── Camera transition state ─────────────────────────────────────────────────
const state = {
  viewMode:   null,
  targetMode: null,
  active:     false,
  frame:      0,
  spiralTopY: 0,

  fromPos:    new THREE.Vector3(),
  fromTarget: new THREE.Vector3(),
  toPos:      new THREE.Vector3(),
  toTarget:   new THREE.Vector3(),
  fromUp:     new THREE.Vector3(),
  toUp:       new THREE.Vector3(),
  fovStart:   60,
  fovTarget:  60,
};

// ── Crop (setViewOffset) state ──────────────────────────────────────────────
const crop = {
  // Current settled values (used while in Detail View)
  offsetX: 0,
  offsetY: 0,
  cropW:   0,
  cropH:   0,

  // Animation
  animating:     false,
  frame:         0,
  fromOffX:      0, fromOffY: 0, fromW: 0, fromH: 0,
  toOffX:        0, toOffY:   0, toW:   0, toH:   0,
  onComplete:    null, // callback when crop animation finishes
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp the crop rectangle so it stays within the full image bounds. */
function _clampCrop() {
  const fullW = window.innerWidth;
  const fullH = window.innerHeight;
  crop.cropW = Math.max(fullW * DETAIL_MIN_CROP_FRACTION, Math.min(crop.cropW, fullW));
  crop.cropH = Math.max(fullH * DETAIL_MIN_CROP_FRACTION, Math.min(crop.cropH, fullH));
  crop.offsetX = Math.max(0, Math.min(crop.offsetX, fullW - crop.cropW));
  crop.offsetY = Math.max(0, Math.min(crop.offsetY, fullH - crop.cropH));
}

function _applyCrop() {
  _clampCrop();
  camera.setViewOffset(
    window.innerWidth, window.innerHeight,
    crop.offsetX, crop.offsetY,
    crop.cropW, crop.cropH
  );
}

/**
 * Compute the screen-space center of todayPos using the final Plan View camera.
 * Returns { screenX, screenY } in pixel coordinates.
 */
function _todayScreenPos(todayPos) {
  // Create a temporary camera at the plan-view endpoint
  const tmpCam = camera.clone();
  tmpCam.position.set(0, state.spiralTopY + PLAN_H, 0);
  tmpCam.up.set(0, 0, -1);
  tmpCam.lookAt(0, state.spiralTopY, 0);
  tmpCam.fov = PLAN_FOV;
  tmpCam.aspect = window.innerWidth / window.innerHeight;
  tmpCam.updateProjectionMatrix();

  const ndc = todayPos.clone().project(tmpCam);
  return {
    screenX: (ndc.x + 1) * 0.5 * window.innerWidth,
    screenY: (-ndc.y + 1) * 0.5 * window.innerHeight,
  };
}

/** Start an animated crop transition. */
function _startCropAnimation(toOffX, toOffY, toW, toH, onComplete = null) {
  crop.animating  = true;
  crop.frame      = 0;
  crop.fromOffX   = crop.offsetX;
  crop.fromOffY   = crop.offsetY;
  crop.fromW      = crop.cropW || window.innerWidth;
  crop.fromH      = crop.cropH || window.innerHeight;
  crop.toOffX     = toOffX;
  crop.toOffY     = toOffY;
  crop.toW        = toW;
  crop.toH        = toH;
  crop.onComplete = onComplete;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function setViewMode(mode, spiralTopY, options = {}) {
  state.spiralTopY = spiralTopY;
  state.frame      = 0;
  state.active     = true;
  state.targetMode = mode;

  state.fromPos.copy(camera.position);
  state.fromTarget.copy(controls.target);
  state.fromUp.copy(camera.up);
  state.fovStart = camera.fov;

  controls.enabled = false;

  if (mode === 'plan') {
    state.toPos.set(0, spiralTopY + PLAN_H, 0);
    state.toTarget.set(0, spiralTopY, 0);
    state.toUp.set(0, 0, -1);
    state.fovTarget = PLAN_FOV;

    // Clear any active crop when entering Plan View
    if (crop.animating || crop.cropW > 0) {
      camera.clearViewOffset();
      crop.animating = false;
      crop.cropW = 0;
      crop.cropH = 0;
    }

  } else if (mode === 'detail') {
    const todayPos = options.todayPos || new THREE.Vector3(0, spiralTopY, 0);

    // Camera: animate to the same overhead position as Plan View
    state.toPos.set(0, spiralTopY + PLAN_H, 0);
    state.toTarget.set(0, spiralTopY, 0);
    state.toUp.set(0, 0, -1);
    state.fovTarget = PLAN_FOV;

    // Crop: start from full frame, animate to target crop centered on today
    const fullW = window.innerWidth;
    const fullH = window.innerHeight;
    const { screenX, screenY } = _todayScreenPos(todayPos);

    const targetCropW = fullW * DETAIL_ENTRY_CROP_FRACTION;
    const targetCropH = fullH * DETAIL_ENTRY_CROP_FRACTION;
    const targetOffX  = Math.max(0, Math.min(screenX - targetCropW / 2, fullW - targetCropW));
    const targetOffY  = Math.max(0, Math.min(screenY - targetCropH / 2, fullH - targetCropH));

    // Initialize crop to full frame so the first call to _applyCrop is a no-op
    crop.offsetX = 0; crop.offsetY = 0;
    crop.cropW   = fullW; crop.cropH = fullH;

    _startCropAnimation(targetOffX, targetOffY, targetCropW, targetCropH);

  } else { // 'perspective'
    state.toPos.set(0, spiralTopY + 30, spiralTopY + 60);
    state.toTarget.set(0, spiralTopY / 2, 0);
    state.toUp.set(0, 1, 0);
    state.fovTarget = 60;

    // If exiting Detail View, animate crop back to full first (simultaneously with camera move)
    if (state.viewMode === 'detail' || state.targetMode === 'detail') {
      _startCropAnimation(0, 0, window.innerWidth, window.innerHeight, () => {
        camera.clearViewOffset();
        crop.cropW = 0;
      });
    }
  }
}

/** Immediately move the plan-view camera to orbit the given Y coordinate. */
export function setPlanTargetY(clipY) {
  if (state.viewMode !== 'plan') return;
  camera.position.set(0, clipY + PLAN_H, 0);
  controls.target.set(0, clipY, 0);
  camera.lookAt(controls.target);
}

/** Move the detail-view camera ceiling to a new Y (no-op in new architecture). */
export function setDetailCeiling(cutY) {
  // Detail View now uses setViewOffset; ceiling is managed by sectionCut date visibility
}

/** True while in (or transitioning to) plan mode. */
export function isPlanMode()   { return state.targetMode === 'plan';   }

/** True while in (or transitioning to) detail mode. */
export function isDetailMode() { return state.targetMode === 'detail'; }

/** Returns the fully-settled view mode. */
export function getCurrentMode() { return state.viewMode; }

/**
 * Apply a zoom step to the Detail View crop.
 * delta > 0 = zoom in (shrink crop), delta < 0 = zoom out (grow crop).
 *
 * @param {number} delta    pixels or normalized zoom units (use e.deltaY / 500)
 * @param {number} pivotX   screen X to zoom toward (defaults to center)
 * @param {number} pivotY   screen Y to zoom toward (defaults to center)
 */
export function applyDetailZoom(delta, pivotX, pivotY) {
  if (state.viewMode !== 'detail' && state.targetMode !== 'detail') return;
  if (crop.animating) return; // don't interrupt entry animation

  const fullW = window.innerWidth;
  const fullH = window.innerHeight;

  const pX = pivotX ?? (crop.offsetX + crop.cropW / 2);
  const pY = pivotY ?? (crop.offsetY + crop.cropH / 2);

  // Scale factor: positive delta = zoom in
  const factor   = 1 - delta;
  const newCropW = crop.cropW * factor;
  const newCropH = crop.cropH * factor;

  // Adjust offset so the pivot point stays fixed
  const newOffX  = pX - (pX - crop.offsetX) * (newCropW / crop.cropW);
  const newOffY  = pY - (pY - crop.offsetY) * (newCropH / crop.cropH);

  crop.cropW   = newCropW;
  crop.cropH   = newCropH;
  crop.offsetX = newOffX;
  crop.offsetY = newOffY;

  _applyCrop();
}

/**
 * Apply a pan to the Detail View crop.
 * @param {number} dx  mouse delta X in pixels (right = positive screen = negative world)
 * @param {number} dy  mouse delta Y in pixels
 */
export function applyDetailPan(dx, dy) {
  if (state.viewMode !== 'detail' && state.targetMode !== 'detail') return;
  if (crop.animating) return;

  // Panning the crop: moving mouse right shows what's to the right → increase offsetX
  crop.offsetX += dx;
  crop.offsetY += dy;

  _applyCrop();
}

/**
 * Get the world position corresponding to the center of the Detail View crop.
 * Used to update the year indicator.
 * Returns the controls.target position (the spiral altitude at the ceiling).
 */
export function getDetailCenterY() {
  return controls.target.y;
}

/**
 * Handle window resize while in Detail View: scale the crop proportionally.
 */
export function onResizeDetailView(oldW, oldH) {
  if ((state.viewMode !== 'detail' && state.targetMode !== 'detail') || crop.cropW === 0) return;

  const newW = window.innerWidth;
  const newH = window.innerHeight;

  crop.offsetX = (crop.offsetX / oldW) * newW;
  crop.offsetY = (crop.offsetY / oldH) * newH;
  crop.cropW   = (crop.cropW   / oldW) * newW;
  crop.cropH   = (crop.cropH   / oldH) * newH;

  _applyCrop();
}

/**
 * Advance the camera transition and crop animation by one frame.
 * Call from registerFrameCallback each frame.
 */
export function advanceTransition() {
  // ── Crop animation ───────────────────────────────────────────────────
  if (crop.animating) {
    crop.frame++;
    const t     = Math.min(crop.frame / TRANSITION_FRAMES, 1);
    const eased = easeInOut(t);

    crop.offsetX = crop.fromOffX + (crop.toOffX - crop.fromOffX) * eased;
    crop.offsetY = crop.fromOffY + (crop.toOffY - crop.fromOffY) * eased;
    crop.cropW   = crop.fromW   + (crop.toW   - crop.fromW)   * eased;
    crop.cropH   = crop.fromH   + (crop.toH   - crop.fromH)   * eased;

    camera.setViewOffset(
      window.innerWidth, window.innerHeight,
      crop.offsetX, crop.offsetY, crop.cropW, crop.cropH
    );

    if (t >= 1) {
      crop.animating = false;
      if (crop.onComplete) { crop.onComplete(); crop.onComplete = null; }
    }
  }

  // ── Camera position transition ───────────────────────────────────────
  if (!state.active) return;

  state.frame++;
  const t     = Math.min(state.frame / TRANSITION_FRAMES, 1);
  const eased = easeInOut(t);

  camera.position.lerpVectors(state.fromPos, state.toPos, eased);
  controls.target.lerpVectors(state.fromTarget, state.toTarget, eased);
  camera.up.lerpVectors(state.fromUp, state.toUp, eased).normalize();

  camera.fov = state.fovStart + (state.fovTarget - state.fovStart) * eased;
  camera.updateProjectionMatrix();

  camera.lookAt(controls.target);

  if (state.frame >= TRANSITION_FRAMES) {
    state.active   = false;
    state.viewMode = state.targetMode;

    if (state.targetMode === 'perspective') {
      camera.fov = 60;
      camera.updateProjectionMatrix();
      controls.enabled      = true;
      controls.enableRotate = true;
      controls.enablePan    = true;
      controls.maxPolarAngle = Math.PI / 2;
      controls.minPolarAngle = 0;
    } else if (state.targetMode === 'detail') {
      // OrbitControls fully disabled — zoom/pan handled by applyDetailZoom/Pan
      controls.enabled = false;
    }
    // Plan: controls stay disabled
  }
}
