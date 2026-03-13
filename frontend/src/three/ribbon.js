import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { dateToAngle } from './spiralMath.js';

const DAYS_IN_YEAR = 365.25;
const MS_PER_DAY = 86400000;
const RIBBON_RADIUS = 42; // spiral radius (40) + 2
const RIBBON_WIDTH = 4.5;

// Visibility thresholds
const HEIGHT_RADIUS = 80;    // world-unit half-height of visible ribbon window around camera Y
const ZOOM_THRESHOLD = 120;  // max camera horizontal distance from origin before ribbon hides

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function ribbonPosition(date, birthday) {
  const d = new Date(date);
  const b = new Date(birthday);
  const yearsElapsed = (d - b) / (DAYS_IN_YEAR * MS_PER_DAY);
  const angle = dateToAngle(date);
  const x = RIBBON_RADIUS * Math.cos(angle);
  const z = RIBBON_RADIUS * Math.sin(angle);
  const y = yearsElapsed * 8;
  return new THREE.Vector3(x, y, z);
}

/**
 * Builds the ribbon mesh, individual divider line objects, and CSS3D labels.
 */
export function buildRibbon(birthday, today) {
  const b = new Date(birthday);
  const t = new Date(today);
  const totalMs = t - b;
  const numSegments = 2000;

  // --- Ribbon geometry ---
  const innerVerts = [];
  const outerVerts = [];

  for (let i = 0; i <= numSegments; i++) {
    const fraction = i / numSegments;
    const date = new Date(b.getTime() + fraction * totalMs);
    const angle = dateToAngle(date);
    const yearsElapsed = (date - b) / (DAYS_IN_YEAR * MS_PER_DAY);
    const y = yearsElapsed * 8;

    const rInner = RIBBON_RADIUS - RIBBON_WIDTH / 2;
    innerVerts.push(rInner * Math.cos(angle), y, rInner * Math.sin(angle));

    const rOuter = RIBBON_RADIUS + RIBBON_WIDTH / 2;
    outerVerts.push(rOuter * Math.cos(angle), y, rOuter * Math.sin(angle));
  }

  const positions = [];
  const indices = [];

  for (let i = 0; i <= numSegments; i++) {
    const ix = i * 3;
    positions.push(innerVerts[ix], innerVerts[ix + 1], innerVerts[ix + 2]);
    positions.push(outerVerts[ix], outerVerts[ix + 1], outerVerts[ix + 2]);
  }

  for (let i = 0; i < numSegments; i++) {
    const a = i * 2;
    const bIdx = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, bIdx, c);
    indices.push(bIdx, d, c);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // ShaderMaterial: fades ribbon by height-proximity and zoom-distance
  const ribbonMaterial = new THREE.ShaderMaterial({
    uniforms: {
      baseColor:      { value: new THREE.Color(0xfff5e6) },
      baseOpacity:    { value: 0.12 },
      cameraY:        { value: 0 },
      cameraHDist:    { value: 0 },
      heightRadius:   { value: HEIGHT_RADIUS },
      zoomThreshold:  { value: ZOOM_THRESHOLD },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3  baseColor;
      uniform float baseOpacity;
      uniform float cameraY;
      uniform float cameraHDist;
      uniform float heightRadius;
      uniform float zoomThreshold;
      varying vec3  vWorldPos;
      void main() {
        float yDist  = abs(vWorldPos.y - cameraY);
        float yAlpha = 1.0 - smoothstep(heightRadius * 0.6, heightRadius, yDist);
        float zAlpha = 1.0 - smoothstep(zoomThreshold * 0.7, zoomThreshold, cameraHDist);
        float alpha  = baseOpacity * yAlpha * zAlpha;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(baseColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const ribbonMesh = new THREE.Mesh(geometry, ribbonMaterial);

  // --- Individual divider line objects and labels ---
  const labels = [];
  const dividerObjects = [];

  // Shared Line2 material — 3× thickness (LineBasicMaterial linewidth is ignored on WebGL)
  const dividerMaterial = new LineMaterial({
    color: 0xfff5e6,
    transparent: true,
    opacity: 0.15,
    linewidth: 3, // pixels
    resolution: new THREE.Vector2(window.innerWidth * window.devicePixelRatio, window.innerHeight * window.devicePixelRatio),
  });

  let cursor = new Date(b.getFullYear(), b.getMonth() + 1, 1);

  while (cursor <= t) {
    const month = cursor.getMonth();
    const year = cursor.getFullYear();
    const isYearBoundary = month === 0;
    const angle = dateToAngle(cursor);
    const yearsElapsed = (cursor - b) / (DAYS_IN_YEAR * MS_PER_DAY);
    const y = yearsElapsed * 8;

    // One Line2 per divider — enables per-segment angular + height culling
    const rInner = RIBBON_RADIUS - RIBBON_WIDTH / 2;
    const rOuter = RIBBON_RADIUS + RIBBON_WIDTH / 2;
    const segGeo = new LineGeometry();
    segGeo.setPositions([
      rInner * Math.cos(angle), y, rInner * Math.sin(angle),
      rOuter * Math.cos(angle), y, rOuter * Math.sin(angle),
    ]);
    const seg = new Line2(segGeo, dividerMaterial);
    seg.computeLineDistances();
    seg.userData.angle = angle;
    seg.userData.y = y;
    dividerObjects.push(seg);

    // Label — placed at midpoint of month segment (half-month after boundary)
    const nextCursor = new Date(year, month + 1, 1);
    const midDate = new Date((cursor.getTime() + nextCursor.getTime()) / 2);
    const midAngle = dateToAngle(midDate);
    const pos = ribbonPosition(midDate, birthday);

    const div = document.createElement('div');
    div.style.fontFamily = 'sans-serif';
    div.style.pointerEvents = 'none';
    div.style.whiteSpace = 'nowrap';

    if (isYearBoundary) {
      div.textContent = String(year);
      div.style.fontSize = '13px';
      div.style.color = 'rgba(255,245,230,0.9)';
    } else {
      div.textContent = MONTH_NAMES[month].toUpperCase();
      div.style.fontSize = '50px';
      div.style.color = 'rgba(255,245,230,0.12)';
    }

    const label = new CSS3DObject(div);
    label.position.copy(pos);
    label.scale.setScalar(0.05);

    // 180° in-plane rotation so text reads from outside the spiral.
    // Flip both tangent (right) and outward (up); normal (yUp) stays.
    const tangent = new THREE.Vector3(Math.sin(midAngle), 0, -Math.cos(midAngle));
    const outward = new THREE.Vector3(-Math.cos(midAngle), 0, -Math.sin(midAngle));
    const yUp = new THREE.Vector3(0, 1, 0);

    const m = new THREE.Matrix4();
    m.makeBasis(tangent, outward, yUp);
    label.quaternion.setFromRotationMatrix(m);

    label.userData.angle = midAngle;
    label.userData.y = pos.y;
    labels.push(label);

    cursor = nextCursor;
  }

  return { ribbonMesh, dividerObjects, labels };
}

/**
 * Per-frame update: culls labels and divider segments by angular position,
 * height proximity to camera, and zoom distance. Updates ribbon shader uniforms.
 */
export function updateRibbonLabels(labels, dividerObjects, ribbonMesh, camera, ribbonVisible) {
  const camAngle = Math.atan2(camera.position.z, camera.position.x);
  const camHDist = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
  const camY = camera.position.y;
  const zoomed = camHDist < ZOOM_THRESHOLD;

  // Update ribbon shader uniforms for height + zoom fade
  const u = ribbonMesh.material.uniforms;
  u.cameraY.value = camY;
  u.cameraHDist.value = camHDist;

  for (const label of labels) {
    if (!ribbonVisible || !zoomed || Math.abs(label.userData.y - camY) > HEIGHT_RADIUS) {
      label.visible = false;
      continue;
    }
    let diff = label.userData.angle - camAngle;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    label.visible = Math.abs(diff) < Math.PI / 2;
  }

  for (const seg of dividerObjects) {
    if (!ribbonVisible || !zoomed || Math.abs(seg.userData.y - camY) > HEIGHT_RADIUS) {
      seg.visible = false;
      continue;
    }
    let diff = seg.userData.angle - camAngle;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    seg.visible = Math.abs(diff) < Math.PI / 2;
  }
}
