import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

/**
 * Custom shader: multiply-tint (not blendOverlay), animated ripple
 * distortion, and multi-tap blur for a natural reflective-water look.
 */
const RippleReflectorShader = {
  name: 'RippleReflectorShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorldPos;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4( position, 1.0 );
      vWorldPos = (modelMatrix * vec4( position, 1.0 )).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec4 vUv;
    varying vec3 vWorldPos;
    #include <logdepthbuf_pars_fragment>

    void main() {
      #include <logdepthbuf_fragment>

      // Ripple distortion based on world position
      float ripple1 = sin(vWorldPos.x * 0.06 + time * 0.8) * cos(vWorldPos.z * 0.04 + time * 0.6);
      float ripple2 = sin(vWorldPos.x * 0.10 - time * 0.5) * cos(vWorldPos.z * 0.08 + time * 0.9);
      vec2 distortion = vec2(ripple1 + ripple2, ripple1 - ripple2) * 0.004;

      // Multi-tap blur (5 samples)
      float blurSize = 0.002;
      vec4 vUvDistorted = vUv;
      vUvDistorted.xy += distortion * vUv.w;

      vec4 acc = texture2DProj( tDiffuse, vUvDistorted );
      acc += texture2DProj( tDiffuse, vUvDistorted + vec4( blurSize,  0.0, 0.0, 0.0) * vUv.w );
      acc += texture2DProj( tDiffuse, vUvDistorted + vec4(-blurSize,  0.0, 0.0, 0.0) * vUv.w );
      acc += texture2DProj( tDiffuse, vUvDistorted + vec4( 0.0,  blurSize, 0.0, 0.0) * vUv.w );
      acc += texture2DProj( tDiffuse, vUvDistorted + vec4( 0.0, -blurSize, 0.0, 0.0) * vUv.w );
      acc /= 5.0;

      gl_FragColor = vec4( acc.rgb * color, 1.0 );

      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

/**
 * Builds a reflective ground plane at Y=0 using Reflector for real-time
 * reflections of all scene objects (spiral, beads, etc.).
 * Large size (10000x10000) combined with scene fog creates infinite appearance.
 */
export function buildGroundPlane() {
  const geometry = new THREE.PlaneGeometry(10000, 10000);

  // Half-resolution render target for natural softness
  const scale = 0.5;
  const ground = new Reflector(geometry, {
    color: new THREE.Color(0x887060),
    textureWidth: Math.floor(window.innerWidth * window.devicePixelRatio * scale),
    textureHeight: Math.floor(window.innerHeight * window.devicePixelRatio * scale),
    shader: RippleReflectorShader,
  });

  // Animate the ripple time uniform
  const clock = new THREE.Clock();
  const origOnBeforeRender = ground.onBeforeRender.bind(ground);
  ground.onBeforeRender = function (renderer, scene, camera) {
    // Update ripple time
    ground.material.uniforms.time.value = clock.getElapsedTime();

    // Disable fog during the reflection render pass
    const savedFog = scene.fog;
    scene.fog = null;
    origOnBeforeRender(renderer, scene, camera);
    scene.fog = savedFog;
  };

  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;

  return ground;
}
