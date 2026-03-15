import * as THREE from 'three';

const _camDir = new THREE.Vector3();
const _toAnchor = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _planQuat = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0), -Math.PI / 2
); // face upward, text reads toward -Z (north-up)

const BASE_SCALE = 0.05;

// Set by main.js each frame so we know the settled view mode
let _viewMode = 'perspective';
export function setPanelViewMode(mode) { _viewMode = mode; }

/**
 * Positions a CSS3D panel so it always faces the camera and stays on the
 * camera-facing side of the anchor point.
 *
 * In plan view: panel laid flat (horizontal), 3x scale for readability.
 * In perspective/detail view: panel bills toward camera, normal scale.
 */
export function positionPanelFacingCamera(panel, anchorPosition, camera) {
  camera.getWorldDirection(_camDir);
  const isPlanLike = _viewMode === 'plan';

  // Direction from anchor to camera
  _toAnchor.subVectors(camera.position, anchorPosition).normalize();

  // Offset panel toward camera from anchor
  const dot = _camDir.dot(_toAnchor.clone().negate());
  const offsetDist = dot < 0 ? 20 : 2;
  _offset.copy(_toAnchor).multiplyScalar(offsetDist);

  panel.position.copy(anchorPosition).add(_offset);

  if (isPlanLike) {
    // Plan / detail view: lay panel flat facing up, always horizontal
    panel.quaternion.copy(_planQuat);
    panel.scale.setScalar(BASE_SCALE * 3);
  } else {
    // Perspective view: face the camera
    panel.lookAt(camera.position);
    panel.scale.setScalar(BASE_SCALE);
  }
}
