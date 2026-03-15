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

    // Clamp panel Z so it doesn't extend past the visible frustum.
    // In plan view the camera looks straight down; frustum half-extent in Z
    // is tan(fov/2) * cameraHeight. Leave 12-unit margin for panel content.
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const dist = camera.position.y - panel.position.y;
    const halfZ = Math.tan(halfFov) * dist - 12;
    const camZ = camera.position.z;
    panel.position.z = Math.max(panel.position.z, camZ - halfZ);
    panel.position.z = Math.min(panel.position.z, camZ + halfZ);

    // Same for X axis
    const aspect = camera.aspect || 1;
    const halfX = halfZ * aspect - 12;
    const camX = camera.position.x;
    panel.position.x = Math.max(panel.position.x, camX - halfX);
    panel.position.x = Math.min(panel.position.x, camX + halfX);
  } else if (_viewMode === 'detail') {
    // Detail view: billboard toward camera (same as perspective) but larger
    panel.lookAt(camera.position);
    panel.scale.setScalar(BASE_SCALE * 3);
  } else {
    // Perspective view: full billboard toward camera
    panel.lookAt(camera.position);
    panel.scale.setScalar(BASE_SCALE);
  }
}
