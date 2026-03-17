import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { dateToPosition } from './spiralMath.js';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Build weekly Line2 segments from birthday to today.
 * Each segment covers one week, sampled with 10 evenly-spaced points for smooth curvature.
 *
 * Returns { group: THREE.Group, segments: Array<{ line, startDate, endDate }> }
 */
export function buildSpiralSegments(birthday, today) {
  const b = new Date(birthday);
  const t = new Date(today);

  const group    = new THREE.Group();
  const segments = [];

  const resolution = new THREE.Vector2(
    window.innerWidth  * window.devicePixelRatio,
    window.innerHeight * window.devicePixelRatio
  );

  let startDate = new Date(b);
  while (startDate < t) {
    const endMs   = Math.min(startDate.getTime() + MS_PER_WEEK, t.getTime());
    const endDate = new Date(endMs);
    const spanMs  = endDate - startDate;

    // 10 evenly spaced points along the week arc
    const positions = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const frac = i / N;
      const date = new Date(startDate.getTime() + frac * spanMs);
      const pos  = dateToPosition(date, birthday);
      positions.push(pos.x, pos.y, pos.z);
    }

    const geo = new LineGeometry();
    geo.setPositions(positions);

    const mat = new LineMaterial({
      color:       0xffe4b5,
      linewidth:   2,         // pixels
      resolution,
      transparent: true,
      opacity:     1.0,
    });

    const line = new Line2(geo, mat);
    line.computeLineDistances();

    group.add(line);
    segments.push({ line, startDate: new Date(startDate), endDate: new Date(endDate) });

    startDate = endDate;
  }

  return { group, segments };
}

/**
 * Show/hide each spiral segment based on the visible date range.
 *
 * @param {Array}    segments    from buildSpiralSegments
 * @param {Date}     ceilingDate upper bound (inclusive)
 * @param {Date|null} floorDate  lower bound; null = no floor (show all history up to ceiling)
 * @param {boolean}  planMode    true = apply linear opacity fade from ceiling → old
 */
export function updateSpiralVisibility(segments, ceilingDate, floorDate = null, planMode = false) {
  // Collect indices of visible segments first (for fade range)
  let firstVisibleIdx = -1;
  let lastVisibleIdx  = -1;
  for (let i = 0; i < segments.length; i++) {
    const { startDate, endDate } = segments[i];
    if (endDate > ceilingDate) continue;
    if (floorDate !== null && startDate < floorDate) continue;
    if (firstVisibleIdx === -1) firstVisibleIdx = i;
    lastVisibleIdx = i;
  }

  for (let i = 0; i < segments.length; i++) {
    const { line, startDate, endDate } = segments[i];

    if (endDate > ceilingDate || (floorDate !== null && startDate < floorDate)) {
      line.visible = false;
      continue;
    }
    line.visible = true;

    if (planMode && firstVisibleIdx !== -1) {
      // Linear fade: index at ceiling = opacity 1.0, first visible = opacity 0.15
      const range = lastVisibleIdx - firstVisibleIdx;
      const t     = range > 0 ? (i - firstVisibleIdx) / range : 1;
      line.material.opacity = 0.15 + t * (1.0 - 0.15);
    } else {
      line.material.opacity = 1.0;
    }
  }
}

/**
 * Update spiral linewidth based on camera horizontal distance and view mode.
 * - perspective: scales from 3px (close) to 1px (far)
 * - plan / detail: fixed 1px
 */
export function updateSpiralLineWidth(segments, camHDist, mode) {
  const lw = (mode === 'plan' || mode === 'detail')
    ? 1
    : Math.max(1, Math.min(3, 120 / camHDist));
  for (const { line } of segments) {
    line.material.linewidth = lw;
  }
}

/**
 * Update LineMaterial resolution on window resize for all segments.
 */
export function updateSpiralResolution(segments) {
  const resolution = new THREE.Vector2(
    window.innerWidth  * window.devicePixelRatio,
    window.innerHeight * window.devicePixelRatio
  );
  for (const { line } of segments) {
    line.material.resolution.copy(resolution);
  }
}
