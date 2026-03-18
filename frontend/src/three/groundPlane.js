import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

/**
 * Builds a reflective ground plane at Y=0 using Three.js Reflector.
 * Reflects filled beads as subtle colored glimmers on a dark polished floor.
 * Empty beads (Points) are excluded from the reflection in main.js to prevent
 * the dense dot cloud from overwhelming the reflection.
 */
export function buildGroundPlane() {
  const geometry = new THREE.PlaneGeometry(10000, 10000);
  const ground = new Reflector(geometry, {
    clipBias:      0.001,
    textureWidth:  1024,
    textureHeight: 1024,
    color:         0x444444,
  });

  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.renderOrder = -1;
  ground.material.depthWrite = false;

  return ground;
}
