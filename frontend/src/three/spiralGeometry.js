import * as THREE from 'three';
import { dateToPosition } from './spiralMath.js';

// Reference to the compiled shader — updated by onBeforeCompile, read by updateSpiralMaterial.
let spiralShader = null;

/** Switch the spiral into detail-mode edge-fade around targetY. */
export function updateSpiralDetailMode(targetY) {
  if (spiralShader) {
    spiralShader.uniforms.uDetailMode.value    = 1.0;
    spiralShader.uniforms.uDetailTargetY.value = targetY;
  }
}

/** Clear detail-mode edge-fade. */
export function clearSpiralDetailMode() {
  if (spiralShader) spiralShader.uniforms.uDetailMode.value = 0.0;
}

/**
 * Builds the spiral mesh from birthday to today.
 * spiralTopY is passed so the plan-view Y-fade uniform is correctly scaled.
 */
export function buildSpiral(birthday, today, spiralTopY) {
  const b = new Date(birthday);
  const t = new Date(today);
  const totalMs = t - b;
  const numPoints = 2000;

  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints;
    const date = new Date(b.getTime() + fraction * totalMs);
    points.push(dateToPosition(date, birthday));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, numPoints, 0.15, 8, false);

  // Warm white — replaces the previous amber/orange
  const material = new THREE.MeshStandardMaterial({
    color:             0xfff5e6, // warm white
    emissive:          0xffecd4, // soft warm emissive
    emissiveIntensity: 0.35,
    metalness:         0.3,
    roughness:         0.55,
    transparent:       true,    // required for alpha fade in plan view
  });

  // Inject a world-Y varying and a plan-mode alpha fade into the standard shader.
  // uPlanMode 0→normal, 1→fade older coils to ~10% at Y=0.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSpiralTopY    = { value: spiralTopY };
    shader.uniforms.uPlanMode      = { value: 0.0 };
    shader.uniforms.uDetailMode    = { value: 0.0 };
    shader.uniforms.uDetailTargetY = { value: 0.0 };
    spiralShader = shader;

    // Vertex: pass world Y to fragment shader
    shader.vertexShader = 'varying float vWorldY;\n' +
      shader.vertexShader.replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
         vWorldY = (modelMatrix * vec4(position, 1.0)).y;`
      );

    // Fragment: plan-mode fade + detail-mode edge softening
    shader.fragmentShader =
      `uniform float uSpiralTopY;
       uniform float uPlanMode;
       uniform float uDetailMode;
       uniform float uDetailTargetY;
       varying float vWorldY;\n` +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         if (uPlanMode > 0.5) {
           float yFade = clamp(vWorldY / uSpiralTopY, 0.0, 1.0);
           gl_FragColor.a *= mix(0.1, 1.0, yFade);
         }
         if (uDetailMode > 0.5) {
           float lowerY = uDetailTargetY - 8.0;
           float lowerFade = smoothstep(lowerY, lowerY + 2.5, vWorldY);
           gl_FragColor.a *= lowerFade;
         }`
      );
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

/**
 * Call once per frame to toggle the plan-view Y-fade on the spiral.
 * planMode — true while in (or transitioning to) plan view.
 */
export function updateSpiralMaterial(planMode) {
  if (spiralShader) {
    spiralShader.uniforms.uPlanMode.value = planMode ? 1.0 : 0.0;
  }
}
