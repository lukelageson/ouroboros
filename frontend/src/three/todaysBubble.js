/**
 * todaysBubble.js — Normal-sized amber bead with radiating spokes for today.
 *
 * If no entry exists for today, places a glowing bead (same size as filled
 * beads) with 8 short line segments radiating outward and opens the create
 * panel. The bead is selectable via raycasting.
 */

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { scene } from './renderer.js';
import { dateToPosition } from './spiralMath.js';
import { openCreatePanel } from './popups/createPanel.js';

const BEAD_R    = 0.55;  // match filled beads
const SPOKE_LEN = 2.2;
const SPOKE_N   = 8;
const COLOR     = 0xf5a623;

let _group          = null;
let _beadMesh       = null;
let _bubblePos      = null;
let _onEntryCreated = null;

/**
 * Check if today has an entry. If not, place the bead marker and open the
 * create panel.
 *
 * @param {Date}     birthday
 * @param {object[]} entries   loaded entries
 * @param {function} onSubmit  callback(data)
 */
export function initTodaysBubble(birthday, entries, onSubmit) {
  const todayISO = new Date().toISOString().slice(0, 10);

  const hasToday = entries.some(
    e => new Date(e.entry_date).toISOString().slice(0, 10) === todayISO
  );
  if (hasToday) return;

  _bubblePos = dateToPosition(new Date(todayISO), birthday);

  _group = new THREE.Group();
  _group.position.copy(_bubblePos);

  // ── Bead sphere ───────────────────────────────────────────────────────────
  const geo = new THREE.SphereGeometry(BEAD_R, 16, 10);
  const mat = new THREE.MeshStandardMaterial({
    color:             COLOR,
    emissive:          COLOR,
    emissiveIntensity: 0.6,
    metalness:         0.3,
    roughness:         0.45,
  });
  _beadMesh = new THREE.Mesh(geo, mat);
  _beadMesh.userData.isTodayBubble = true;
  _group.add(_beadMesh);

  // ── Radiating spokes ──────────────────────────────────────────────────────
  const res = new THREE.Vector2(
    window.innerWidth  * window.devicePixelRatio,
    window.innerHeight * window.devicePixelRatio
  );
  const spokeMat = new LineMaterial({
    color:       COLOR,
    linewidth:   1.5,
    transparent: true,
    opacity:     0.55,
    resolution:  res,
  });

  for (let i = 0; i < SPOKE_N; i++) {
    const angle = (i / SPOKE_N) * Math.PI * 2;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    const spokeGeo = new LineGeometry();
    spokeGeo.setPositions([
      x * BEAD_R * 1.4, 0, z * BEAD_R * 1.4,
      x * (BEAD_R + SPOKE_LEN), 0, z * (BEAD_R + SPOKE_LEN),
    ]);
    const spoke = new Line2(spokeGeo, spokeMat.clone());
    spoke.computeLineDistances();
    _group.add(spoke);
  }

  scene.add(_group);

  // ── Open create panel ─────────────────────────────────────────────────────
  _onEntryCreated = onSubmit;
  openCreatePanel(todayISO, _bubblePos, (data) => {
    dismissTodaysBubble();
    if (_onEntryCreated) _onEntryCreated(data);
  });
}

/** Remove the bead and spokes. */
export function dismissTodaysBubble() {
  if (_group) {
    scene.remove(_group);
    _group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    _group = null;
    _beadMesh = null;
  }
  _bubblePos      = null;
  _onEntryCreated = null;
}

/** Returns the bead mesh for raycasting (null if dismissed). */
export function getTodayBubbleMesh() {
  return _beadMesh;
}

/** Returns the world position of the bubble (null if dismissed). */
export function getTodayBubblePos() {
  return _bubblePos;
}
