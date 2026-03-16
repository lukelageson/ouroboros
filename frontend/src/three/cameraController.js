import * as THREE from 'three';
import { camera, controls } from './renderer.js';

const TRANSITION_FRAMES = 60;

// ── Plan / Detail view ──────────────────────────────────────────────────────
const PLAN_H      = 180;
const SPIRAL_RADIUS = 40;
const PLAN_FOV    = THREE.MathUtils.radToDeg(
  2 * Math.atan(SPIRAL_RADIUS / (PLAN_H * 0.9))
); // ≈ 28° — outermost coil fills ~90 % of screen height

// ───────────────────────────────────────────────────────────────────────────

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

const state = {
  viewMode:   null,   // fully-settled mode (null before first setViewMode)
  targetMode: null,   // mode being transitioned toward
  active:     false,
  frame:      0,
  spiralTopY: 0,

  // Camera position / target lerp
  fromPos:    new THREE.Vector3(),
  fromTarget: new THREE.Vector3(),
  toPos:      new THREE.Vector3(),
  toTarget:   new THREE.Vector3(),

  // Camera up-vector lerp (prevents gimbal lock when looking straight down)
  fromUp: new THREE.Vector3(),
  toUp:   new THREE.Vector3(),

  // FOV lerp — smoothly changes lens length during transition
  fovStart:  60,
  fovTarget: 60,
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Begin a smooth transition to the given view mode.
 *
 * 'plan'        → overhead telephoto; ring fills the frame; controls locked.
 * 'detail'      → same as plan but targeting today's spiral position.
 *                 Pass { todayPos: THREE.Vector3 } in options.
 * 'perspective' → FOV-60 side view; orbit controls re-enabled.
 */
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

  } else if (mode === 'detail') {
    const p = options.todayPos || new THREE.Vector3(0, spiralTopY, 0);
    state.toPos.set(p.x, p.y + PLAN_H, p.z);
    state.toTarget.set(p.x, p.y, p.z);
    state.toUp.set(0, 0, -1);
    state.fovTarget = PLAN_FOV;

  } else { // 'perspective'
    state.toPos.set(0, spiralTopY + 30, spiralTopY + 60);
    state.toTarget.set(0, spiralTopY / 2, 0);
    state.toUp.set(0, 1, 0);
    state.fovTarget = 60;
  }
}

/**
 * Immediately move the plan-view camera to orbit the given Y coordinate.
 * Used to track the section cut slider live while in settled plan mode.
 */
export function setPlanTargetY(clipY) {
  if (state.viewMode !== 'plan') return;
  camera.position.set(0, clipY + PLAN_H, 0);
  controls.target.set(0, clipY, 0);
  camera.lookAt(controls.target);
}

/**
 * Move the detail-view camera ceiling to a new Y.
 * The camera height above target is preserved so zoom is maintained.
 * No-op when not in (or transitioning to) detail mode.
 */
export function setDetailCeiling(cutY) {
  if (state.targetMode !== 'detail' && state.viewMode !== 'detail') return;
  const oldTargetY = controls.target.y;
  const delta = cutY - oldTargetY;
  controls.target.y = cutY;
  camera.position.y += delta; // maintain zoom height above target
  camera.lookAt(controls.target);
}

/** True while in (or transitioning to) plan mode — used by ribbon + spiral fade. */
export function isPlanMode()   { return state.targetMode === 'plan';   }

/** True while in (or transitioning to) detail mode. */
export function isDetailMode() { return state.targetMode === 'detail'; }

/**
 * Snap the detail-view camera center (XZ) to a spiral position.
 * Called each frame to lock camera to spiral path, and on pan release to snap.
 */
export function setDetailCenter(pos) {
  if (state.targetMode !== 'detail' && state.viewMode !== 'detail') return;
  controls.target.x = pos.x;
  controls.target.z = pos.z;
  camera.position.x = pos.x;
  camera.position.z = pos.z;
}

/** Returns the fully-settled view mode (null before any mode is set). */
export function getCurrentMode() { return state.viewMode; }

/**
 * Advance the camera transition by one frame.
 * Call via registerFrameCallback — runs after controls.update() so it wins.
 */
export function advanceTransition() {
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
      controls.enabled = true;
      controls.enableRotate = true;
      controls.enablePan    = true;
      controls.maxPolarAngle = Math.PI / 2;
      controls.minPolarAngle = 0;
    } else if (state.targetMode === 'detail') {
      controls.enabled      = true;
      controls.enableRotate = false;
      controls.enablePan    = false;
      controls.maxPolarAngle = 0;
      controls.minPolarAngle = 0;
    }
    // Plan: controls stay disabled
  }
}
