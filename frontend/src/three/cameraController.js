import * as THREE from 'three';
import { camera, controls } from './renderer.js';

const TRANSITION_FRAMES = 60;

// ── Plan / Detail view ──────────────────────────────────────────────────────
const PLAN_H               = 200;
const PLAN_VISIBLE_RADIUS  = 48; // ribbon outer edge + handle sphere radius
const PLAN_FOV             = THREE.MathUtils.radToDeg(
  2 * Math.atan(PLAN_VISIBLE_RADIUS / (PLAN_H * 0.9))
); // ~30° — leaves ~10% margin around the handle sphere

// Detail View initial zoom: 50% of full frame = 2× zoom
const DETAIL_ENTRY_CROP_FRACTION = 0.5;
// Min crop = 5% of full frame (20× zoom)
const DETAIL_MIN_CROP_FRACTION   = 0.05;
// Max crop = 50% of full frame (2× zoom) — never see more than half the spiral
const DETAIL_MAX_CROP_FRACTION   = 0.5;

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

  // Detail view: world position to center crop on after transition settles
  _detailFocusPos: null,

  // Two-phase flag: set when perspective→detail phase 1 (move to plan) is running.
  // When phase 1 completes, advanceTransition triggers phase 2 (crop zoom).
  _pendingDetailAfterPlan: false,

  // Per-transition frame count override (e.g. 90 for plan/detail → perspective)
  _transitionFrames: TRANSITION_FRAMES,
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
  crop.cropW = Math.max(fullW * DETAIL_MIN_CROP_FRACTION, Math.min(crop.cropW, fullW * DETAIL_MAX_CROP_FRACTION));
  crop.cropH = Math.max(fullH * DETAIL_MIN_CROP_FRACTION, Math.min(crop.cropH, fullH * DETAIL_MAX_CROP_FRACTION));
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
    state._transitionFrames = 90;

    // Nudge fromUp away from exact (0,1,0) to avoid gimbal snap at the
    // (0,1,0) → (0,0,-1) singularity crossing during the slerp.
    if (Math.abs(state.fromUp.x) < 0.001 && Math.abs(state.fromUp.z) < 0.001) {
      state.fromUp.set(0, 1, -0.01).normalize();
    }

    // Clear any active crop when entering Plan View
    if (crop.animating || crop.cropW > 0) {
      camera.clearViewOffset();
      crop.animating = false;
      crop.cropW = 0;
      crop.cropH = 0;
    }

  } else if (mode === 'detail') {
    const todayPos = options.todayPos || new THREE.Vector3(0, spiralTopY, 0);

    // Save focus position for use in phase 2 / panning
    state._detailFocusPos = todayPos.clone();

    const fullW = window.innerWidth;
    const fullH = window.innerHeight;
    const targetCropW = fullW * DETAIL_ENTRY_CROP_FRACTION;
    const targetCropH = fullH * DETAIL_ENTRY_CROP_FRACTION;
    const targetOffX  = (fullW - targetCropW) / 2;
    const targetOffY  = (fullH - targetCropH) / 2;

    if (state.viewMode === 'plan') {
      // ── Plan → Detail: skip camera animation, only animate crop ──
      // Instantly reposition camera above focus point (plan is already overhead,
      // a straight-down lateral shift is nearly imperceptible at PLAN_H=200).
      camera.position.set(todayPos.x, spiralTopY + PLAN_H, todayPos.z);
      controls.target.set(todayPos.x, spiralTopY, todayPos.z);
      camera.up.set(0, 0, -1);
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();

      // Settle into detail view immediately — only the crop animates
      state.active = false;
      state.viewMode = 'detail';
      state._pendingDetailAfterPlan = false;
      controls.enabled = false;

      crop.offsetX = 0; crop.offsetY = 0;
      crop.cropW   = fullW; crop.cropH = fullH;
      _startCropAnimation(targetOffX, targetOffY, targetCropW, targetCropH);

    } else {
      // ── Perspective → Detail: two-phase transition ──
      // Phase 1: animate camera to plan overhead position (no plan UI shown).
      // Phase 2 (crop zoom) starts automatically in advanceTransition when phase 1 ends.
      state._pendingDetailAfterPlan = true;
      state._transitionFrames = TRANSITION_FRAMES;

      state.toPos.set(0, spiralTopY + PLAN_H, 0);
      state.toTarget.set(0, spiralTopY, 0);
      state.toUp.set(0, 0, -1);
      state.fovTarget = PLAN_FOV;

      // Hold crop at full frame during phase 1
      crop.offsetX = 0; crop.offsetY = 0;
      crop.cropW   = fullW; crop.cropH = fullH;
    }

  } else { // 'perspective'
    if (state.viewMode === 'plan' || state.viewMode === 'detail') {
      // Transition from overhead to perspective.
      // Prefer the saved perspective position; fall back to a natural angled default.
      if (state._savedPerspectivePos) {
        state.toPos.copy(state._savedPerspectivePos);
        state.toTarget.copy(state._savedPerspectiveTarget);
        state.fovTarget = state._savedPerspectiveFov;
      } else {
        const targetY = spiralTopY;
        state.toPos.set(0, targetY * 0.6, 80);
        state.toTarget.set(0, targetY * 0.4, 0);
        state.fovTarget = 60;
      }
      // Larger fromUp nudge (0.15 vs 0.01) gives a smoother slerp through the
      // (0,0,-1) → (0,1,0) singularity and prevents gimbal-lock-like snapping.
      state.fromUp.set(0, 0.15, -1).normalize();
      state._transitionFrames = 90;
    } else if (state._savedPerspectivePos) {
      state.toPos.copy(state._savedPerspectivePos);
      state.toTarget.copy(state._savedPerspectiveTarget);
      state.fovTarget = state._savedPerspectiveFov;
      state._transitionFrames = TRANSITION_FRAMES;
    } else {
      state.toPos.set(0, spiralTopY + 30, 60);
      state.toTarget.set(0, spiralTopY / 2, 0);
      state.fovTarget = 60;
      state._transitionFrames = TRANSITION_FRAMES;
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
 * delta > 0 = zoom out (shrink crop), delta < 0 = zoom in (grow crop).
 * Crop is always centered — panning is handled by camera movement.
 */
export function applyDetailZoom(delta) {
  if (state.viewMode !== 'detail' && state.targetMode !== 'detail') return;
  if (crop.animating) return; // don't interrupt entry animation

  const fullW = window.innerWidth;
  const fullH = window.innerHeight;

  const factor = 1 + delta;

  crop.cropW = Math.max(fullW * DETAIL_MIN_CROP_FRACTION,
               Math.min(crop.cropW * factor, fullW * DETAIL_MAX_CROP_FRACTION));
  crop.cropH = Math.max(fullH * DETAIL_MIN_CROP_FRACTION,
               Math.min(crop.cropH * factor, fullH * DETAIL_MAX_CROP_FRACTION));
  crop.offsetX = (fullW - crop.cropW) / 2;
  crop.offsetY = (fullH - crop.cropH) / 2;

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
 * Move the detail-view camera to be directly above a world XZ position.
 * Crop stays centered — this is how detail panning works (camera follows spiral).
 */
export function moveDetailCamera(worldX, worldZ) {
  if (state.viewMode !== 'detail' && state.targetMode !== 'detail') return;
  const y = state.spiralTopY;
  camera.position.set(worldX, y + PLAN_H, worldZ);
  controls.target.set(worldX, y, worldZ);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();

  const fullW = window.innerWidth;
  const fullH = window.innerHeight;
  crop.offsetX = (fullW - crop.cropW) / 2;
  crop.offsetY = (fullH - crop.cropH) / 2;
  _applyCrop();
}

/**
 * Returns the ratio of crop size to full frame size.
 * Used to convert screen-pixel deltas to full-frame-pixel deltas for 1:1 panning.
 */
export function getDetailCropScale() {
  if (crop.cropW === 0) return { x: 1, y: 1 };
  return {
    x: crop.cropW / window.innerWidth,
    y: crop.cropH / window.innerHeight,
  };
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

  const transFrames = state._transitionFrames || TRANSITION_FRAMES;

  state.frame++;
  const t     = Math.min(state.frame / transFrames, 1);
  const eased = easeInOut(t);

  camera.position.lerpVectors(state.fromPos, state.toPos, eased);
  controls.target.lerpVectors(state.fromTarget, state.toTarget, eased);
  camera.up.lerpVectors(state.fromUp, state.toUp, eased).normalize();

  camera.fov = state.fovStart + (state.fovTarget - state.fovStart) * eased;
  camera.updateProjectionMatrix();

  camera.lookAt(controls.target);

  if (state.frame >= transFrames) {
    state.active = false;

    if (state._pendingDetailAfterPlan) {
      // Phase 1 complete (camera is now at plan overhead position).
      // Start phase 2: snap camera above focus point, then animate crop in.
      state._pendingDetailAfterPlan = false;

      const fp = state._detailFocusPos;
      if (fp) {
        camera.position.set(fp.x, state.spiralTopY + PLAN_H, fp.z);
        controls.target.set(fp.x, state.spiralTopY, fp.z);
        camera.up.set(0, 0, -1);
        camera.lookAt(controls.target);
        camera.updateProjectionMatrix();
      }

      // Animate crop from full frame to centered zoom
      const fullW = window.innerWidth;
      const fullH = window.innerHeight;
      const targetCropW = fullW * DETAIL_ENTRY_CROP_FRACTION;
      const targetCropH = fullH * DETAIL_ENTRY_CROP_FRACTION;
      const targetOffX  = (fullW - targetCropW) / 2;
      const targetOffY  = (fullH - targetCropH) / 2;
      crop.offsetX = 0; crop.offsetY = 0;
      crop.cropW   = fullW; crop.cropH = fullH;
      _startCropAnimation(targetOffX, targetOffY, targetCropW, targetCropH);

      // Settle into detail mode now (plan UI will not appear — targetMode is 'detail')
      state.viewMode = 'detail';
      controls.enabled = false;
      return;
    }

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
      // OrbitControls fully disabled — zoom/pan handled by camera movement
      controls.enabled = false;

      // Ensure crop is centered (camera is already above the focus point)
      const fullW = window.innerWidth;
      const fullH = window.innerHeight;
      crop.offsetX = (fullW - crop.cropW) / 2;
      crop.offsetY = (fullH - crop.cropH) / 2;
      _applyCrop();
    }
    // Plan: controls stay disabled
  }
}
