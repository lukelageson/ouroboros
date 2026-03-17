import * as THREE from 'three';
import { camera, controls } from './renderer.js';

const TRANSITION_FRAMES = 60;

// ── Plan / Detail view ──────────────────────────────────────────────────────
const PLAN_H        = 200;
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

  // Saved perspective camera state for round-tripping plan → perspective
  _savedPerspectivePos:    null,
  _savedPerspectiveTarget: null,
  _savedPerspectiveFov:    null,
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
    // Save current perspective camera state before entering plan
    if (state.viewMode !== 'plan' && state.viewMode !== 'detail') {
      state._savedPerspectivePos    = camera.position.clone();
      state._savedPerspectiveTarget = controls.target.clone();
      state._savedPerspectiveFov    = camera.fov;
    }

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
    if (state.viewMode === 'plan' && state._savedPerspectivePos) {
      state.toPos.copy(state._savedPerspectivePos);
      state.toTarget.copy(state._savedPerspectiveTarget);
      state.fovTarget = state._savedPerspectiveFov;
    } else {
      state.toPos.set(0, spiralTopY + 30, spiralTopY + 60);
      state.toTarget.set(0, spiralTopY / 2, 0);
      state.fovTarget = 60;
    }
    state.toUp.set(0, 1, 0);

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

  // Scale factor: positive delta = zoom out (natural scroll-down = zoom out)
  const factor   = 1 + delta;
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
 * Project a world position to full-frame screen pixel coordinates,
 * temporarily ignoring the current view offset (so the result is in the
 * full 0→innerWidth / 0→innerHeight coordinate space).
 */
export function worldToDetailScreen(worldPos) {
  // Temporarily clear view offset so project() returns full-frame NDC
  const v = camera.view ? { ...camera.view } : null;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  const ndc = worldPos.clone().project(camera);
  if (v) {
    camera.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
    camera.updateProjectionMatrix();
  }
  return {
    x: (ndc.x + 1) * 0.5 * window.innerWidth,
    y: (-ndc.y + 1) * 0.5 * window.innerHeight,
  };
}

/**
 * Unproject a full-frame screen position to world XZ, intersecting the
 * horizontal plane at the camera's look-at Y (the current spiral level).
 * Temporarily clears view offset so the result is in true world space.
 */
export function screenToWorldXZ(screenX, screenY) {
  const v = camera.view ? { ...camera.view } : null;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();

  const ndc = new THREE.Vector2(
    (screenX / window.innerWidth)  *  2 - 1,
    (screenY / window.innerHeight) * -2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);

  // Intersect with horizontal plane Y = controls.target.y (the spiral focus level)
  const planeY = controls.target.y;
  const origin = raycaster.ray.origin;
  const dir    = raycaster.ray.direction;
  const t      = (planeY - origin.y) / dir.y;
  const result = { x: origin.x + t * dir.x, z: origin.z + t * dir.z };

  if (v) {
    camera.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
    camera.updateProjectionMatrix();
  }
  return result;
}

/** Returns the current crop center in full-frame pixel coordinates. */
export function getDetailCropCenterScreen() {
  return {
    x: crop.offsetX + crop.cropW / 2,
    y: crop.offsetY + crop.cropH / 2,
  };
}

/**
 * Animate the crop to center on the given full-frame screen position,
 * keeping the current crop size unchanged.
 */
export function centerDetailViewOnScreen(screenX, screenY) {
  if (state.viewMode !== 'detail' && state.targetMode !== 'detail') return;
  const targetOffX = Math.max(0, Math.min(screenX - crop.cropW / 2, window.innerWidth  - crop.cropW));
  const targetOffY = Math.max(0, Math.min(screenY - crop.cropH / 2, window.innerHeight - crop.cropH));
  _startCropAnimation(targetOffX, targetOffY, crop.cropW, crop.cropH);
}

/**
 * Instantly (no animation) center the crop on the given full-frame screen position.
 * Used during live drag so the view updates each frame without queuing animations.
 */
export function instantCenterDetailViewOnScreen(screenX, screenY) {
  if (state.viewMode !== 'detail' && state.targetMode !== 'detail') return;
  crop.animating = false;
  crop.offsetX = Math.max(0, Math.min(screenX - crop.cropW / 2, window.innerWidth  - crop.cropW));
  crop.offsetY = Math.max(0, Math.min(screenY - crop.cropH / 2, window.innerHeight - crop.cropH));
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
      camera.fov = state.fovTarget;
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
