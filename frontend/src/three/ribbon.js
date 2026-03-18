import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { dateToAngle } from './spiralMath.js';

const DAYS_IN_YEAR  = 365;
const MS_PER_DAY    = 86400000;
const RIBBON_RADIUS = 42;
const RIBBON_WIDTH  = 4.5;

// Angular culling threshold for perspective mode labels/dividers
const ZOOM_THRESHOLD = 120;

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function _resolution() {
  return new THREE.Vector2(
    window.innerWidth  * window.devicePixelRatio,
    window.innerHeight * window.devicePixelRatio
  );
}

function ribbonPosition(date, birthday) {
  const d = new Date(date);
  const b = new Date(birthday);
  const yearsElapsed = (d - b) / (DAYS_IN_YEAR * MS_PER_DAY);
  const angle = dateToAngle(date);
  return new THREE.Vector3(
    RIBBON_RADIUS * Math.cos(angle),
    yearsElapsed * 8,
    RIBBON_RADIUS * Math.sin(angle)
  );
}

/**
 * Build the ribbon as monthly arc Line2 segments, plus dividers and CSS3D labels.
 *
 * Returns { group, arcSegments, dividerObjects, labels }
 *   group        — THREE.Group containing all inner/outer arc lines + mesh fills
 *   arcSegments  — Array<{ innerLine, outerLine, meshFill, startDate, endDate, year, month }>
 *   dividerObjects — Array of Line2 per month boundary
 *   labels       — Array of CSS3DObject (month abbreviations + year numbers)
 */
export function buildRibbon(birthday, today) {
  const b = new Date(birthday);
  const t = new Date(today);

  const group       = new THREE.Group();
  const arcSegments = [];

  const res    = _resolution();
  const rInner = RIBBON_RADIUS - RIBBON_WIDTH / 2;
  const rOuter = RIBBON_RADIUS + RIBBON_WIDTH / 2;

  // Shared arc material (cloned per segment so opacity can vary if needed)
  const arcMatBase = new LineMaterial({
    color:       0xffe4b5,
    linewidth:   1,
    transparent: true,
    opacity:     0.12,
    resolution:  res,
  });

  // Mesh fill material (shared, semi-transparent)
  const fillMat = new THREE.MeshBasicMaterial({
    color:       0xffe4b5,
    transparent: true,
    opacity:     0.2,
    side:        THREE.DoubleSide,
    depthWrite:  false,
    fog:         false,
  });

  // Monthly arc segments — start from birthday's month
  let cursor = new Date(b.getFullYear(), b.getMonth(), 1);
  while (cursor <= t) {
    const year      = cursor.getFullYear();
    const month     = cursor.getMonth();
    const nextMonth = new Date(year, month + 1, 1);

    const monthStart = new Date(Math.max(cursor.getTime(), b.getTime()));
    const monthEnd   = new Date(Math.min(nextMonth.getTime(), t.getTime()));

    if (monthStart < monthEnd) {
      const spanMs = monthEnd - monthStart;
      const N = 20;
      const innerPositions = [];
      const outerPositions = [];
      const innerPts = [];
      const outerPts = [];

      for (let i = 0; i <= N; i++) {
        const frac  = i / N;
        const date  = new Date(monthStart.getTime() + frac * spanMs);
        const angle = dateToAngle(date);
        const ye    = (date - b) / (DAYS_IN_YEAR * MS_PER_DAY);
        const y     = ye * 8;
        const ix = rInner * Math.cos(angle);
        const iz = rInner * Math.sin(angle);
        const ox = rOuter * Math.cos(angle);
        const oz = rOuter * Math.sin(angle);
        innerPositions.push(ix, y, iz);
        outerPositions.push(ox, y, oz);
        innerPts.push(new THREE.Vector3(ix, y, iz));
        outerPts.push(new THREE.Vector3(ox, y, oz));
      }

      const innerGeo = new LineGeometry(); innerGeo.setPositions(innerPositions);
      const outerGeo = new LineGeometry(); outerGeo.setPositions(outerPositions);

      const innerLine = new Line2(innerGeo, arcMatBase.clone());
      const outerLine = new Line2(outerGeo, arcMatBase.clone());
      innerLine.computeLineDistances();
      outerLine.computeLineDistances();

      // Triangle strip mesh fill between inner and outer arcs
      const fillGeo = new THREE.BufferGeometry();
      const verts = [];
      for (let i = 0; i <= N; i++) {
        verts.push(innerPts[i].x, innerPts[i].y, innerPts[i].z);
        verts.push(outerPts[i].x, outerPts[i].y, outerPts[i].z);
      }
      const indices = [];
      for (let i = 0; i < N; i++) {
        const a = i * 2, b2 = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
        indices.push(a, b2, c, b2, d, c);
      }
      fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      fillGeo.setIndex(indices);
      fillGeo.computeVertexNormals();

      const meshFill = new THREE.Mesh(fillGeo, fillMat.clone());

      group.add(innerLine);
      group.add(outerLine);
      group.add(meshFill);

      // Precompute midpoint Y for perspective-mode proximity culling
      const midMs = (monthStart.getTime() + monthEnd.getTime()) / 2;
      const midYearsElapsed = (midMs - birthday.getTime()) / (DAYS_IN_YEAR * MS_PER_DAY);
      const midY = midYearsElapsed * 8;

      arcSegments.push({
        innerLine, outerLine, meshFill,
        startDate: new Date(monthStart),
        endDate:   new Date(monthEnd),
        year, month, midY,
      });
    }

    cursor = nextMonth;
  }

  // ── Dividers and labels ──────────────────────────────────────────────────

  const labels         = [];
  const dividerObjects = [];

  const dividerMaterial = new LineMaterial({
    color:       0xffe4b5,
    transparent: true,
    opacity:     0.15,
    linewidth:   3,
    resolution:  res,
  });

  let divCursor = new Date(b.getFullYear(), b.getMonth() + 1, 1);
  while (divCursor <= t) {
    const month         = divCursor.getMonth();
    const year          = divCursor.getFullYear();
    const isYearBound   = month === 0;
    const angle         = dateToAngle(divCursor);
    const yearsElapsed  = (divCursor - b) / (DAYS_IN_YEAR * MS_PER_DAY);
    const y             = yearsElapsed * 8;

    // Line2 divider (radial line across ribbon width)
    const segGeo = new LineGeometry();
    segGeo.setPositions([
      rInner * Math.cos(angle), y, rInner * Math.sin(angle),
      rOuter * Math.cos(angle), y, rOuter * Math.sin(angle),
    ]);
    const seg = new Line2(segGeo, dividerMaterial);
    seg.computeLineDistances();
    seg.userData.angle = angle;
    seg.userData.y     = y;
    seg.userData.date  = new Date(divCursor);
    dividerObjects.push(seg);

    // Label placed at midpoint of the following month
    const nextDivCursor = new Date(year, month + 1, 1);
    const midDate  = new Date((divCursor.getTime() + nextDivCursor.getTime()) / 2);
    const midAngle = dateToAngle(midDate);
    const pos      = ribbonPosition(midDate, birthday);

    const tangent = new THREE.Vector3( Math.sin(midAngle), 0, -Math.cos(midAngle));
    const outward = new THREE.Vector3(-Math.cos(midAngle), 0, -Math.sin(midAngle));
    const yUp     = new THREE.Vector3(0, 1, 0);
    const rotMat  = new THREE.Matrix4().makeBasis(tangent, outward, yUp);

    function makeLabel(text, fontSize, color, isYearBnd) {
      const div = document.createElement('div');
      div.textContent       = text;
      div.style.fontFamily  = 'sans-serif';
      div.style.pointerEvents = 'none';
      div.style.whiteSpace  = 'nowrap';
      div.style.fontSize    = fontSize;
      div.style.color       = color;

      const lbl = new CSS3DObject(div);
      lbl.position.copy(pos);
      lbl.scale.setScalar(0.05);
      lbl.quaternion.setFromRotationMatrix(rotMat);
      lbl.userData.angle          = midAngle;
      lbl.userData.y              = pos.y;
      lbl.userData.month          = month;
      lbl.userData.isYearBoundary = isYearBnd;
      lbl.userData.date           = new Date(divCursor);
      return lbl;
    }

    labels.push(makeLabel(MONTH_NAMES[month].toUpperCase(), '50px', 'rgba(255,228,181,0.4)', false));
    if (isYearBound) {
      labels.push(makeLabel(String(year), '13px', 'rgba(255,228,181,0.9)', true));
    }

    divCursor = nextDivCursor;
  }

  return { group, arcSegments, dividerObjects, labels };
}

/**
 * Per-frame update: show/hide arc segments, dividers, and labels based on
 * date range. Labels facing the camera are preserved (angular culling).
 *
 * @param {object}   ribbon        { group, arcSegments, dividerObjects, labels }
 * @param {THREE.Camera} camera    active camera
 * @param {boolean}  ribbonVisible R-key toggle
 * @param {boolean}  planMode      true while in/transitioning to plan view
 * @param {Date}     ceilingDate   upper date bound
 * @param {boolean}  detailMode    true while in/transitioning to detail view
 * @param {Date|null} floorDate    lower bound (detail view only)
 */
export function updateRibbonLabels(
  labels, dividerObjects, ribbonOrMesh,
  camera, ribbonVisible,
  planMode, spiralTopY, clipY, detailMode = false,
  arcSegments = null, ceilingDate = null, floorDate = null
) {
  // Support both old API (ribbonMesh with uniforms) and new API (arcSegments).
  const hasUniforms = ribbonOrMesh?.material?.uniforms;

  if (hasUniforms) {
    const u = ribbonOrMesh.material.uniforms;
    if (planMode || detailMode) {
      u.cameraY.value      = clipY - 4;
      u.cameraHDist.value  = 0;
      u.heightRadius.value = 6;
      u.sectionCutY.value  = clipY;
      u.lowerCutY.value    = -9999;
    } else {
      const camHDist = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
      u.cameraY.value      = camera.position.y;
      u.cameraHDist.value  = camHDist;
      u.heightRadius.value = 80;
      u.sectionCutY.value  = clipY;
      u.lowerCutY.value    = -9999;
    }
  }

  // ── Arc segment visibility (new path) ──────────────────────────────────
  if (arcSegments && ceilingDate) {
    const ceil  = ceilingDate;

    if (planMode) {
      // Plan mode: show 1 year back from ceiling, full circle (no angular culling)
      const floorDate1yr = new Date(ceil);
      floorDate1yr.setFullYear(floorDate1yr.getFullYear() - 1);

      for (const seg of arcSegments) {
        const inRange = seg.endDate <= ceil && seg.endDate > floorDate1yr;
        seg.innerLine.visible = ribbonVisible && inRange;
        seg.outerLine.visible = ribbonVisible && inRange;
        if (seg.meshFill) seg.meshFill.visible = ribbonVisible && inRange;
      }
    } else if (detailMode) {
      const floor = floorDate || null;
      for (const seg of arcSegments) {
        let vis = seg.endDate <= ceil;
        if (floor) vis = vis && seg.startDate >= floor;
        seg.innerLine.visible = ribbonVisible && vis;
        seg.outerLine.visible = ribbonVisible && vis;
        if (seg.meshFill) seg.meshFill.visible = ribbonVisible && vis;
      }
    } else {
      // Perspective mode: disk-shaped culling volume around camera
      // Tight Y range (~2.5 years) + narrow angular cone = only nearby segments
      const camAngle = Math.atan2(camera.position.z, camera.position.x);
      const camHDist = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
      const camY     = camera.position.y;
      const zoomed   = camHDist < ZOOM_THRESHOLD;

      // Disk parameters scale with zoom: tighter when farther, wider when closer
      const zoomFactor = zoomed ? Math.max(0.1, camHDist / ZOOM_THRESHOLD) : 1;
      const yRadius    = 20 / zoomFactor;  // ±20 units at threshold, wider when closer
      const angleCone  = (Math.PI / 3) / zoomFactor; // ±60° at threshold, wider when closer
      // Cap maximums so it doesn't get too wide
      const yMax       = Math.min(yRadius, 40);
      const angleMax   = Math.min(angleCone, Math.PI / 2);

      for (const seg of arcSegments) {
        if (!ribbonVisible || !zoomed) {
          seg.innerLine.visible = false;
          seg.outerLine.visible = false;
          if (seg.meshFill) seg.meshFill.visible = false;
          continue;
        }
        if (seg.endDate > ceilingDate) {
          seg.innerLine.visible = false;
          seg.outerLine.visible = false;
          if (seg.meshFill) seg.meshFill.visible = false;
          continue;
        }
        // Y-proximity: tight disk — only show segments near camera's Y
        if (Math.abs(seg.midY - camY) > yMax) {
          seg.innerLine.visible = false;
          seg.outerLine.visible = false;
          if (seg.meshFill) seg.meshFill.visible = false;
          continue;
        }
        // Angular culling: narrow cone in front of camera
        const midAngle = dateToAngle(new Date((seg.startDate.getTime() + seg.endDate.getTime()) / 2));
        let diff = midAngle - camAngle;
        if (diff >  Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        const inFront = Math.abs(diff) < angleMax;
        seg.innerLine.visible = inFront;
        seg.outerLine.visible = inFront;
        if (seg.meshFill) seg.meshFill.visible = inFront;
      }
    }
  }

  // ── Label and divider visibility ───────────────────────────────────────
  if (planMode || detailMode) {
    const ceil  = ceilingDate ? ceilingDate.toISOString().slice(0, 10) : null;
    const floor = floorDate   ? floorDate.toISOString().slice(0, 10)   : null;

    // In plan mode, only show 1 year back
    let planFloor = null;
    if (planMode && ceilingDate) {
      const pf = new Date(ceilingDate);
      pf.setFullYear(pf.getFullYear() - 1);
      planFloor = pf.toISOString().slice(0, 10);
    }

    // Deduplicate month labels: keep the most recent per-month label at/below ceiling
    const latestByMonth = new Map();
    for (const label of labels) {
      if (label.userData.isYearBoundary) continue;
      if (ceil && label.userData.date?.toISOString().slice(0, 10) > ceil) continue;
      const effectiveFloor = planFloor || floor;
      if (effectiveFloor && label.userData.date?.toISOString().slice(0, 10) < effectiveFloor) continue;
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
      const segDateISO = seg.userData.date?.toISOString().slice(0, 10);
      let vis = true;
      if (ceil  && segDateISO > ceil)  vis = false;
      const effectiveFloor = planFloor || floor;
      if (effectiveFloor && segDateISO < effectiveFloor) vis = false;
      if (!seg.userData.date) {
        vis = seg.userData.y >= clipY - 8 && seg.userData.y <= clipY + 0.5;
      }
      seg.visible = ribbonVisible && vis;
    }

  } else {
    // Perspective mode: disk-shaped culling matching arc segment logic
    const camAngle = Math.atan2(camera.position.z, camera.position.x);
    const camHDist = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
    const camY     = camera.position.y;
    const zoomed   = camHDist < ZOOM_THRESHOLD;
    const ceil     = ceilingDate ? ceilingDate.toISOString().slice(0, 10) : null;

    const zoomFactor = zoomed ? Math.max(0.1, camHDist / ZOOM_THRESHOLD) : 1;
    const yMax       = Math.min(20 / zoomFactor, 40);
    const angleMax   = Math.min((Math.PI / 3) / zoomFactor, Math.PI / 2);

    for (const label of labels) {
      if (!ribbonVisible || !zoomed) { label.visible = false; continue; }
      if (label.userData.isYearBoundary) { label.visible = false; continue; }
      const lDate = label.userData.date?.toISOString().slice(0, 10);
      if (ceil && lDate && lDate > ceil) { label.visible = false; continue; }
      if (Math.abs(label.userData.y - camY) > yMax) { label.visible = false; continue; }
      let diff = label.userData.angle - camAngle;
      if (diff >  Math.PI) diff -= 2 * Math.PI;
      if (diff < -Math.PI) diff += 2 * Math.PI;
      label.visible = Math.abs(diff) < angleMax;
    }

    for (const seg of dividerObjects) {
      if (!ribbonVisible || !zoomed) { seg.visible = false; continue; }
      const sDate = seg.userData.date?.toISOString().slice(0, 10);
      if (ceil && sDate && sDate > ceil) { seg.visible = false; continue; }
      if (Math.abs(seg.userData.y - camY) > yMax) { seg.visible = false; continue; }
      let diff = seg.userData.angle - camAngle;
      if (diff >  Math.PI) diff -= 2 * Math.PI;
      if (diff < -Math.PI) diff += 2 * Math.PI;
      seg.visible = Math.abs(diff) < angleMax;
    }
  }
}

/**
 * Update LineMaterial resolution on window resize for all ribbon lines.
 */
export function updateRibbonResolution(arcSegments, dividerObjects) {
  const res = new THREE.Vector2(
    window.innerWidth  * window.devicePixelRatio,
    window.innerHeight * window.devicePixelRatio
  );
  for (const seg of arcSegments) {
    seg.innerLine.material.resolution.copy(res);
    seg.outerLine.material.resolution.copy(res);
  }
  for (const div of dividerObjects) {
    div.material.resolution.copy(res);
  }
}
