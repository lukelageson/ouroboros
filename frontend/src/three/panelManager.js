import * as THREE from 'three';

const _camDir      = new THREE.Vector3();
const _toAnchor    = new THREE.Vector3();
const _offset      = new THREE.Vector3();
const _yAxis       = new THREE.Vector3(0, 1, 0);
const _yQuat       = new THREE.Quaternion();
const _detailQuat  = new THREE.Quaternion();
const _planQuat    = new THREE.Quaternion().setFromAxisAngle(
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
    // Plan view: lay panel flat facing up, always horizontal
    panel.quaternion.copy(_planQuat);
    panel.scale.setScalar(BASE_SCALE * 3);
  } else if (_viewMode === 'detail') {
    // Flat like plan view, but rotated around world-Y so text top faces the camera.
    // Uses quaternion composition to avoid Euler gimbal issues:
    //   _planQuat  = Rx(-90°)  →  lies flat, text-top points to world -Z
    //   _yQuat     = Ry(α+π)   →  spins text-top toward camera horizontal dir
    const dx = camera.position.x - panel.position.x;
    const dz = camera.position.z - panel.position.z;
    _yQuat.setFromAxisAngle(_yAxis, Math.atan2(dx, dz) + Math.PI);
    _detailQuat.multiplyQuaternions(_yQuat, _planQuat);
    panel.quaternion.copy(_detailQuat);
    panel.scale.setScalar(BASE_SCALE * 3);
  } else {
    // Perspective view: full billboard toward camera
    panel.lookAt(camera.position);
    panel.scale.setScalar(BASE_SCALE);
  }
}
