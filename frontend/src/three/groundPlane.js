import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

/**
 * Custom Reflector shader with animated ripple distortion.
 * Inherits the standard ReflectorShader structure (color, tDiffuse, textureMatrix)
 * and adds time-based UV perturbation to simulate a gently rippling surface.
 */
const RippleReflectorShader = {
  name: 'RippleReflectorShader',

  uniforms: {
    color:            { value: null },
    tDiffuse:         { value: null },
    textureMatrix:    { value: null },
    uTime:            { value: 0.0  },
    uRippleScale:     { value: 0.4  }, // spatial frequency (world units)
    uRippleStrength:  { value: 0.002 }, // UV distortion amplitude
    uRippleSpeed:     { value: 3  }, // animation speed (units/sec)
  },

  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorldPos;

    #include <common>
    #include <logdepthbuf_pars_vertex>

    void main() {
      vUv       = textureMatrix * vec4(position, 1.0);
      vWorldPos = (modelMatrix  * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,

  fragmentShader: /* glsl */`
    uniform vec3        color;
    uniform sampler2D   tDiffuse;
    uniform float       uTime;
    uniform float       uRippleScale;
    uniform float       uRippleStrength;
    uniform float       uRippleSpeed;
    varying vec4 vUv;
    varying vec3 vWorldPos;

    #include <logdepthbuf_pars_fragment>

    float blendOverlay(float base, float blend) {
      return (base < 0.5
        ? (2.0 * base * blend)
        : (1.0 - 2.0 * (1.0 - base) * (1.0 - blend)));
    }
    vec3 blendOverlay(vec3 base, vec3 blend) {
      return vec3(
        blendOverlay(base.r, blend.r),
        blendOverlay(base.g, blend.g),
        blendOverlay(base.b, blend.b)
      );
    }

    void main() {
      #include <logdepthbuf_fragment>

      // Two overlapping sine waves in X and Z for an organic ripple pattern
      float t   = uTime * uRippleSpeed;
      float wave = sin(vWorldPos.x * uRippleScale + t) *
                   cos(vWorldPos.z * uRippleScale * 0.7 + t * 0.85);

      // Scale distortion by vUv.w so it remains correct after perspective divide
      vec4 distortedUv  = vUv;
      distortedUv.xy   += wave * uRippleStrength * vUv.w;

      vec4 base = texture2DProj(tDiffuse, distortedUv);
      gl_FragColor = vec4(blendOverlay(base.rgb, color), 1.0);

      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

/**
 * Builds a reflective, gently rippling ground plane at Y=0.
 * Returns the Reflector mesh. Call updateGroundTime(t) each frame to animate.
 */
export function buildGroundPlane() {
  const geometry = new THREE.PlaneGeometry(10000, 10000);
  const ground = new Reflector(geometry, {
    clipBias:      0.001,
    textureWidth:  512,
    textureHeight: 512,
    color:         0x555555,
    shader:        RippleReflectorShader,
  });

  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.renderOrder = -1;
  ground.material.depthWrite = false;

  return ground;
}

/** Call once per frame to drive the ripple animation. */
export function updateGroundTime(ground) {
  if (ground?.material?.uniforms?.uTime !== undefined) {
    ground.material.uniforms.uTime.value = performance.now() * 0.001;
  }
}
