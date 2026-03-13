import * as THREE from 'three';
import { camera, controls } from './renderer.js';

const TRANSITION_FRAMES = 60;

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

const state = {
  viewMode: null,      // mode that is fully active (null during initial transition)
  targetMode: null,    // mode being transitioned to
  active: false,
  frame: 0,
  fromPos:    new THREE.Vector3(),
  fromTarget: new THREE.Vector3(),
  toPos:      new THREE.Vector3(),
  toTarget:   new THREE.Vector3(),
};

function posForMode(mode, spiralTopY) {
  if (mode === 'plan') {
    return {
      pos:    new THREE.Vector3(0, spiralTopY + 40, 0),
      target: new THREE.Vector3(0, spiralTopY, 0),
    };
  }
  // perspective
  return {
    pos:    new THREE.Vector3(0, spiralTopY + 30, spiralTopY + 60),
    target: new THREE.Vector3(0, spiralTopY / 2, 0),
  };
}

/**
 * Begin a smooth camera transition to the given view mode.
 * Disables orbit controls for the duration; re-enables for perspective only.
 */
export function setViewMode(mode, spiralTopY) {
  const { pos, target } = posForMode(mode, spiralTopY);

  state.fromPos.copy(camera.position);
  state.fromTarget.copy(controls.target);
  state.toPos.copy(pos);
  state.toTarget.copy(target);
  state.frame = 0;
  state.active = true;
  state.targetMode = mode;

  // Disable orbit controls for the duration of the transition
  controls.enabled = false;

  // Set camera.up for the destination mode before lookAt is called.
  // Plan view looks straight down (-Y), so up must be a horizontal vector.
  if (mode === 'plan') {
    camera.up.set(0, 0, -1);
  } else {
    camera.up.set(0, 1, 0);
  }
}

/** Returns the fully-settled view mode (null while transitioning). */
export function getCurrentMode() {
  return state.viewMode;
}

/**
 * Advance the camera transition by one frame.
 * Must be called once per animation frame (via registerFrameCallback).
 * Runs AFTER controls.update() so the final position is what gets rendered.
 */
export function advanceTransition() {
  if (!state.active) return;

  state.frame++;
  const t = Math.min(state.frame / TRANSITION_FRAMES, 1);
  const eased = easeInOut(t);

  camera.position.lerpVectors(state.fromPos, state.toPos, eased);
  controls.target.lerpVectors(state.fromTarget, state.toTarget, eased);
  camera.lookAt(controls.target);

  if (state.frame >= TRANSITION_FRAMES) {
    state.active = false;
    state.viewMode = state.targetMode;
    // Perspective: restore user orbit; Plan: stay locked
    controls.enabled = state.targetMode !== 'plan';
  }
}
