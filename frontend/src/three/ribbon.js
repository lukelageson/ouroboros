import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { dateToAngle, dateToPosition } from './spiralMath.js';

const DAYS_IN_YEAR = 365.25;
const MS_PER_DAY = 86400000;
const RIBBON_RADIUS = 42; // spiral radius (40) + 2
const RIBBON_WIDTH = 4.5; // width of the flat ribbon strip

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Position on the ribbon's outer edge for a given date.
 */
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
 * Builds the ribbon mesh (flat strip along outer edge of spiral)
 * and CSS3D labels at month/year boundaries.
 */
export function buildRibbon(birthday, today) {
  const b = new Date(birthday);
  const t = new Date(today);
  const totalMs = t - b;
  const numSegments = 2000;

  // --- Ribbon geometry: two rows of vertices forming a flat strip ---
  const innerVerts = [];
  const outerVerts = [];

  for (let i = 0; i <= numSegments; i++) {
    const fraction = i / numSegments;
    const date = new Date(b.getTime() + fraction * totalMs);
    const angle = dateToAngle(date);
    const yearsElapsed = (date - b) / (DAYS_IN_YEAR * MS_PER_DAY);
    const y = yearsElapsed * 8;

    // Inner edge (closer to spiral center)
    const rInner = RIBBON_RADIUS - RIBBON_WIDTH / 2;
    innerVerts.push(
      rInner * Math.cos(angle),
      y,
      rInner * Math.sin(angle)
    );

    // Outer edge
    const rOuter = RIBBON_RADIUS + RIBBON_WIDTH / 2;
    outerVerts.push(
      rOuter * Math.cos(angle),
      y,
      rOuter * Math.sin(angle)
    );
  }

  // Build indexed triangle strip from inner/outer rows
  const positions = [];
  const indices = [];

  for (let i = 0; i <= numSegments; i++) {
    const ix = i * 3;
    // vertex 2*i = inner, vertex 2*i+1 = outer
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

  const material = new THREE.MeshBasicMaterial({
    color: 0xfff5e6,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: true, // write depth so divider lines behind ribbon are occluded
  });

  const ribbonMesh = new THREE.Mesh(geometry, material);

  // --- Month divider lines and labels ---
  const labels = [];
  const dividerPoints = [];

  // Find first month boundary after birthday
  let cursor = new Date(b.getFullYear(), b.getMonth() + 1, 1);

  while (cursor <= t) {
    const month = cursor.getMonth();
    const year = cursor.getFullYear();
    const isYearBoundary = month === 0;
    const angle = dateToAngle(cursor);
    const yearsElapsed = (cursor - b) / (DAYS_IN_YEAR * MS_PER_DAY);
    const y = yearsElapsed * 8;

    // Divider line: radial segment across the ribbon width
    const rInner = RIBBON_RADIUS - RIBBON_WIDTH / 2;
    const rOuter = RIBBON_RADIUS + RIBBON_WIDTH / 2;
    dividerPoints.push(
      new THREE.Vector3(rInner * Math.cos(angle), y, rInner * Math.sin(angle)),
      new THREE.Vector3(rOuter * Math.cos(angle), y, rOuter * Math.sin(angle))
    );

    // Label — positioned on the ribbon, oriented to face radially outward
    const pos = ribbonPosition(cursor, birthday);

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

    // Orient label to lie flat on the ribbon surface:
    // - Face normal points up (Y) so text is readable from above, like printed on the ribbon
    // - Text right direction = tangent along spiral
    // - Text up direction = radially outward (away from center)
    const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const yUp = new THREE.Vector3(0, 1, 0);

    // makeBasis(right, up, normal): right=tangent, up=outward, normal=Y
    const m = new THREE.Matrix4();
    m.makeBasis(tangent, outward, yUp);
    label.quaternion.setFromRotationMatrix(m);

    // Store the angle for far-side culling
    label.userData.angle = angle;
    labels.push(label);

    // Advance to next month
    cursor = new Date(year, month + 1, 1);
  }

  // Build divider line segments
  const dividerGeometry = new THREE.BufferGeometry().setFromPoints(dividerPoints);
  const dividerMaterial = new THREE.LineBasicMaterial({
    color: 0xfff5e6,
    transparent: true,
    opacity: 0.15,
  });
  const dividerLines = new THREE.LineSegments(dividerGeometry, dividerMaterial);

  return { ribbonMesh, dividerLines, labels };
}

/**
 * Hide labels on the far side of the spiral (facing away from camera).
 * Respects the ribbonVisible flag from the R key toggle.
 */
export function updateRibbonLabels(labels, camera, ribbonVisible) {
  const camAngle = Math.atan2(camera.position.z, camera.position.x);

  for (const label of labels) {
    if (!ribbonVisible) {
      label.visible = false;
      continue;
    }

    const labelAngle = label.userData.angle;

    // Angular difference, wrapped to [-π, π]
    let diff = labelAngle - camAngle;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;

    // Hide if on the far side (more than 90° from camera's view)
    label.visible = Math.abs(diff) < Math.PI / 2;
  }
}
