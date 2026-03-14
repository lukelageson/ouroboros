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

  // ShaderMaterial: fades ribbon by height-proximity and zoom-distance.
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
      #include <clipping_planes_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vec4 worldPos   = modelMatrix    * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }
    `,
    fragmentShader: `
      #include <clipping_planes_pars_fragment>
      uniform vec3  baseColor;
      uniform float baseOpacity;
      uniform float cameraY;
      uniform float cameraHDist;
      uniform float heightRadius;
      uniform float zoomThreshold;
      varying vec3  vWorldPos;
      void main() {
        #include <clipping_planes_fragment>
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
    const midDate    = new Date((cursor.getTime() + nextCursor.getTime()) / 2);
    const midAngle   = dateToAngle(midDate);
    const pos        = ribbonPosition(midDate, birthday);

    // Shared orientation matrix (reads from outside the spiral)
    const tangent = new THREE.Vector3(Math.sin(midAngle), 0, -Math.cos(midAngle));
    const outward = new THREE.Vector3(-Math.cos(midAngle), 0, -Math.sin(midAngle));
    const yUp     = new THREE.Vector3(0, 1, 0);
    const rotMat  = new THREE.Matrix4().makeBasis(tangent, outward, yUp);

    function makeLabel(text, fontSize, color, isYearBnd) {
      const div = document.createElement('div');
      div.textContent = text;
      div.style.fontFamily   = 'sans-serif';
      div.style.pointerEvents = 'none';
      div.style.whiteSpace   = 'nowrap';
      div.style.fontSize     = fontSize;
      div.style.color        = color;

      const lbl = new CSS3DObject(div);
      lbl.position.copy(pos);
      lbl.scale.setScalar(0.05);
      lbl.quaternion.setFromRotationMatrix(rotMat);
      lbl.userData.angle          = midAngle;
      lbl.userData.y              = pos.y;
      lbl.userData.month          = month; // 0–11, used for plan-view deduplication
      lbl.userData.isYearBoundary = isYearBnd;
      return lbl;
    }

    // Always create a month-abbreviation label (never hidden by isYearBoundary filter)
    labels.push(makeLabel(MONTH_NAMES[month].toUpperCase(), '50px', 'rgba(255,245,230,0.12)', false));

    // For January boundaries also create a year-number label (hidden in plan view)
    if (isYearBoundary) {
      labels.push(makeLabel(String(year), '13px', 'rgba(255,245,230,0.9)', true));
    }

    cursor = nextCursor;
  }

  return { ribbonMesh, dividerObjects, labels };
}

/**
 * Per-frame update: culls labels and divider segments by angular position,
 * height proximity to camera, and zoom distance. Updates ribbon shader uniforms.
 *
 * planMode    — true while in (or transitioning to) plan view.
 *               Removes angular + height culling; shows only the current year's coil.
 * spiralTopY  — Y coordinate of the topmost coil; used to anchor plan-view visibility.
 */
export function updateRibbonLabels(labels, dividerObjects, ribbonMesh, camera, ribbonVisible, planMode, spiralTopY) {
  const u = ribbonMesh.material.uniforms;

  if (planMode) {
    // Tight ribbon shader window: one year centred just below the top coil.
    // heightRadius=6 → fully visible from spiralTopY-7.6 to spiralTopY+0.4; fades beyond.
    u.cameraY.value      = spiralTopY - 4;
    u.cameraHDist.value  = 0;
    u.heightRadius.value = 6;

    // Deduplicate month labels: keep only the MOST RECENT label for each month (0–11).
    // This eliminates the double-March problem and guarantees exactly 12 visible labels.
    // Year-boundary labels (year numbers) are always hidden in plan view.
    const latestByMonth = new Map(); // month → label with highest y
    for (const label of labels) {
      if (label.userData.isYearBoundary) continue;
      const m = label.userData.month;
      if (!latestByMonth.has(m) || label.userData.y > latestByMonth.get(m).userData.y) {
        latestByMonth.set(m, label);
      }
    }
    const latestSet = new Set(latestByMonth.values());

    for (const label of labels) {
      label.visible = ribbonVisible && latestSet.has(label);
    }
    for (const seg of dividerObjects) {
      seg.visible = ribbonVisible && seg.userData.y >= spiralTopY - 8;
    }

  } else {
    // Perspective mode: full proximity + angular culling
    const camAngle = Math.atan2(camera.position.z, camera.position.x);
    const camHDist = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
    const camY     = camera.position.y;
    const zoomed   = camHDist < ZOOM_THRESHOLD;

    u.cameraY.value      = camY;
    u.cameraHDist.value  = camHDist;
    u.heightRadius.value = HEIGHT_RADIUS;

    for (const label of labels) {
      if (!ribbonVisible || !zoomed || Math.abs(label.userData.y - camY) > HEIGHT_RADIUS) {
        label.visible = false;
        continue;
      }
      let diff = label.userData.angle - camAngle;
      if (diff > Math.PI)  diff -= 2 * Math.PI;
      if (diff < -Math.PI) diff += 2 * Math.PI;
      label.visible = Math.abs(diff) < Math.PI / 2;
    }

    for (const seg of dividerObjects) {
      if (!ribbonVisible || !zoomed || Math.abs(seg.userData.y - camY) > HEIGHT_RADIUS) {
        seg.visible = false;
        continue;
      }
      let diff = seg.userData.angle - camAngle;
      if (diff > Math.PI)  diff -= 2 * Math.PI;
      if (diff < -Math.PI) diff += 2 * Math.PI;
      seg.visible = Math.abs(diff) < Math.PI / 2;
    }
  }
}
