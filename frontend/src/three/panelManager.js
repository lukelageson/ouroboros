import * as THREE from 'three';

const _camDir = new THREE.Vector3();
const _toAnchor = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _planQuat = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0), -Math.PI / 2
); // face upward, text reads toward -Z (north-up)

const BASE_SCALE = 0.05;

/**
 * Positions a CSS3D panel so it always faces the camera and stays on the
 * camera-facing side of the anchor point. If the panel would end up behind
 * geometry (dot product between camera direction and anchor-to-camera is
 * negative), it offsets 20 units toward the camera.
 *
 * In plan view (camera looking straight down), panels are pinned horizontal
 * and scaled up for readability.
 */
export function positionPanelFacingCamera(panel, anchorPosition, camera) {
  // Detect plan view: camera's forward direction is nearly straight down
  camera.getWorldDirection(_camDir);
  const isPlanLike = _camDir.y < -0.95;

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
