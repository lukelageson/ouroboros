/**
 * radialDateLine.js
 *
 * A yellow radial line in Plan View that marks a specific day-of-year angle.
 * Dragging the handle sphere rotates the line and updates the entry comparison column.
 *
 * The line extends from origin outward to RIBBON_RADIUS + RIBBON_WIDTH (~46.5 units)
 * at Y = ceiling date Y altitude. The handle sphere sits at the outer end.
 */

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { scene } from './renderer.js';
import { getActiveCamera } from './renderer.js';
import { dateToAngle } from './spiralMath.js';

const DAYS_IN_YEAR     = 365;
const MS_PER_DAY       = 86400000;
const SPRING_EQUINOX_DAY = 79;
const LINE_LENGTH      = 46.5; // RIBBON_RADIUS + RIBBON_WIDTH
const LINE_COLOR       = 0xf5a623; // amber yellow
const HANDLE_RADIUS    = 1;

let _group           = null;
let _line            = null;
let _lineGeo         = null;
let _handleSphere    = null;
let _ceilingY        = 0;
let _currentAngle    = 0;
let _selectedDOY     = 0;  // day-of-year, 0–364
let _birthdayDate    = null;
let _dragging        = false;
let _changeCallbacks = [];
let _loadedEntries   = [];

// Reusable temporaries
const _raycaster = new THREE.Raycaster();
const _mouse     = new THREE.Vector2();
const _planePlane = new THREE.Plane();
const _dragTarget = new THREE.Vector3();

// ── Helpers ──────────────────────────────────────────────────────────────────

function _angleToDayOfYear(angle) {
  const norm            = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const daysSinceSpring = norm / (2 * Math.PI) * DAYS_IN_YEAR;
  return (daysSinceSpring + SPRING_EQUINOX_DAY + DAYS_IN_YEAR) % DAYS_IN_YEAR;
}

function _updateGeometry() {
  const cx = LINE_LENGTH * Math.cos(_currentAngle);
  const cz = LINE_LENGTH * Math.sin(_currentAngle);
  _lineGeo.setPositions([0, _ceilingY, 0, cx, _ceilingY, cz]);
  _line.computeLineDistances();
  _handleSphere.position.set(cx, _ceilingY, cz);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {number} ceilingY  initial Y altitude of the section cut
 * @param {Date}   birthday  used to map Y↔date when slider moves
 */
export function initRadialDateLine(ceilingY, birthday) {
  _ceilingY     = ceilingY;
  _birthdayDate = new Date(birthday);

  // Default angle: today's day-of-year angle
  const today = new Date();
  _currentAngle = dateToAngle(today);
  _selectedDOY  = _angleToDayOfYear(_currentAngle);

  _group = new THREE.Group();
  _group.visible = false; // hidden until Plan View

  // Line
  _lineGeo = new LineGeometry();
  const lineMat = new LineMaterial({
    color:      LINE_COLOR,
    linewidth:  2,
    resolution: new THREE.Vector2(
      window.innerWidth  * window.devicePixelRatio,
      window.innerHeight * window.devicePixelRatio
    ),
    transparent: true,
    opacity:     0.85,
  });
  _line = new Line2(_lineGeo, lineMat);
  _group.add(_line);

  // Handle sphere
  const handleGeo = new THREE.SphereGeometry(HANDLE_RADIUS, 12, 8);
  const handleMat = new THREE.MeshStandardMaterial({
    color:             LINE_COLOR,
    emissive:          LINE_COLOR,
    emissiveIntensity: 0.4,
    metalness:         0.3,
    roughness:         0.4,
  });
  _handleSphere = new THREE.Mesh(handleGeo, handleMat);
  _group.add(_handleSphere);

  _updateGeometry();
  scene.add(_group);

  _attachDragHandlers();
}

function _attachDragHandlers() {
  const canvas = document.querySelector('canvas');
  if (!canvas) return;

  canvas.addEventListener('mousedown', (e) => {
    if (!_group.visible) return;

    _mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    _mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    _raycaster.setFromCamera(_mouse, getActiveCamera());

    const hits = _raycaster.intersectObject(_handleSphere, false);
    if (hits.length > 0) {
      _dragging = true;
      e.stopPropagation();
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!_dragging) return;

    _mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    _mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    _raycaster.setFromCamera(_mouse, getActiveCamera());

    // Intersect with the horizontal plane at Y = _ceilingY
    _planePlane.set(new THREE.Vector3(0, 1, 0), -_ceilingY);
    const hit = _raycaster.ray.intersectPlane(_planePlane, _dragTarget);
    if (hit) {
      _currentAngle = Math.atan2(_dragTarget.z, _dragTarget.x);
      _selectedDOY  = _angleToDayOfYear(_currentAngle);

      // Snap to nearest loaded entry within 5 days
      if (_loadedEntries.length) {
        let bestEntry = null;
        let bestDist  = 5; // days threshold
        for (const e of _loadedEntries) {
          const d = new Date(e.entry_date);
          const jan1 = new Date(d.getFullYear(), 0, 1);
          let entryDOY = (d - jan1) / (MS_PER_DAY);
          // Adjust for leap year (mirror spiralMath._dayOfYear)
          const isLeap = (yr => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0)(d.getFullYear());
          if (isLeap && d.getMonth() >= 2) entryDOY -= 1;
          // Wrap-around distance on [0, DAYS_IN_YEAR)
          let dist = Math.abs(entryDOY - _selectedDOY);
          if (dist > DAYS_IN_YEAR / 2) dist = DAYS_IN_YEAR - dist;
          if (dist < bestDist) { bestDist = dist; bestEntry = { doy: entryDOY }; }
        }
        if (bestEntry) {
          _selectedDOY  = bestEntry.doy;
          const daysSinceSpring = (_selectedDOY - SPRING_EQUINOX_DAY + DAYS_IN_YEAR) % DAYS_IN_YEAR;
          _currentAngle = (daysSinceSpring / DAYS_IN_YEAR) * 2 * Math.PI;
        }
      }

      _updateGeometry();
      for (const cb of _changeCallbacks) cb(_selectedDOY);
    }
  });

  window.addEventListener('mouseup', () => {
    _dragging = false;
  });

  // Update resolution on resize
  window.addEventListener('resize', () => {
    if (_line) {
      _line.material.resolution.set(
        window.innerWidth  * window.devicePixelRatio,
        window.innerHeight * window.devicePixelRatio
      );
    }
  });
}

/**
 * Reposition the line to the new ceiling Y altitude.
 * Call whenever the section cut slider moves (in Plan View).
 */
export function updateRadialDateLine(ceilingDate) {
  if (!_group || !_birthdayDate) return;
  const yearsElapsed = (ceilingDate - _birthdayDate) / (DAYS_IN_YEAR * MS_PER_DAY);
  _ceilingY = yearsElapsed * 8;
  _updateGeometry();
}

/** Returns the currently selected day-of-year (0–364, float). */
export function getSelectedDayOfYear() {
  return _selectedDOY;
}

/** Show or hide the radial date line group. */
export function setRadialDateLineVisible(visible) {
  if (_group) _group.visible = visible;
}

/**
 * Register a callback that fires whenever the radial line angle changes.
 * Callback receives the new day-of-year (float).
 */
export function onDateLineChange(callback) {
  _changeCallbacks.push(callback);
}

/**
 * Provide the loaded entries array so the drag handler can snap to them.
 */
export function setLoadedEntries(entries) {
  _loadedEntries = entries || [];
}
