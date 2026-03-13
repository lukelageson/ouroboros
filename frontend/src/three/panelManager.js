import * as THREE from 'three';

const _camDir = new THREE.Vector3();
const _toAnchor = new THREE.Vector3();
const _offset = new THREE.Vector3();

/**
 * Positions a CSS3D panel so it always faces the camera and stays on the
 * camera-facing side of the anchor point. If the panel would end up behind
 * geometry (dot product between camera direction and anchor-to-camera is
 * negative), it offsets 20 units toward the camera.
 */
export function positionPanelFacingCamera(panel, anchorPosition, camera) {
  // Direction from anchor to camera
  _toAnchor.subVectors(camera.position, anchorPosition).normalize();

  // Camera's forward direction (what it's looking at)
  camera.getWorldDirection(_camDir);

  // Dot product: if anchor is behind the camera, skip repositioning
  const dot = _camDir.dot(_toAnchor.clone().negate());

  // Offset panel toward camera from anchor
  const offsetDist = dot < 0 ? 20 : 2;
  _offset.copy(_toAnchor).multiplyScalar(offsetDist);

  panel.position.copy(anchorPosition).add(_offset);

  // Make panel face the camera
  panel.lookAt(camera.position);
}
