import * as THREE from 'three';

/**
 * Builds a simple dark ground plane at Y=0.
 * Large size (10000x10000) combined with scene fog creates infinite appearance.
 * No reflections — keeps the scene clean and avoids depth conflicts with Points.
 */
export function buildGroundPlane() {
  const geometry = new THREE.PlaneGeometry(10000, 10000);
  const material = new THREE.MeshStandardMaterial({
    color:     0x110a06,
    metalness: 0.1,
    roughness: 0.95,
  });

  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;

  return ground;
}
