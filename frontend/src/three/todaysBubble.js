/**
 * todaysBubble.js — Amber glow marker + auto-open create panel for today's date.
 *
 * On login, if no entry exists for today, places a glowing amber sphere
 * and PointLight at today's spiral position and opens the create panel.
 * After the entry is created, the glow fades and the bubble is dismissed.
 */

import * as THREE from 'three';
import { scene } from './renderer.js';
import { dateToPosition } from './spiralMath.js';
import { openCreatePanel } from './popups/createPanel.js';

let glowSphere = null;
let glowLight  = null;
let bubblePos  = null;
let _onEntryCreated = null;

/**
 * Check if today has an entry. If not, place the glow marker and open the create panel.
 *
 * @param {Date}     birthday   user's birthday (spiral origin)
 * @param {object[]} entries    loaded entry objects with entry_date fields
 * @param {function} onSubmit   callback(data) — should create entry, add bead, etc.
 */
export function initTodaysBubble(birthday, entries, onSubmit) {
  const todayISO = new Date().toISOString().slice(0, 10);

  // Don't show if today already has an entry
  const hasToday = entries.some(
    e => new Date(e.entry_date).toISOString().slice(0, 10) === todayISO
  );
  if (hasToday) return;

  bubblePos = dateToPosition(new Date(todayISO), birthday);

  // ── Glow sphere ──────────────────────────────────────────────────────────
  const geo = new THREE.SphereGeometry(1.5, 24, 16);
  const mat = new THREE.MeshStandardMaterial({
    color:             0x000000,
    emissive:          0xf5a623,
    emissiveIntensity: 0.6,
    transparent:       true,
    opacity:           0.4,
    depthWrite:        false,
  });
  glowSphere = new THREE.Mesh(geo, mat);
  glowSphere.position.copy(bubblePos);
  scene.add(glowSphere);

  // ── Point light ──────────────────────────────────────────────────────────
  glowLight = new THREE.PointLight(0xf5a623, 1.5, 15);
  glowLight.position.copy(bubblePos);
  scene.add(glowLight);

  // ── Open create panel ────────────────────────────────────────────────────
  _onEntryCreated = onSubmit;
  openCreatePanel(todayISO, bubblePos, (data) => {
    // Dismiss glow, then forward to caller
    dismissTodaysBubble();
    if (_onEntryCreated) _onEntryCreated(data);
  });
}

/**
 * Remove the glow sphere and point light.
 */
export function dismissTodaysBubble() {
  if (glowSphere) {
    scene.remove(glowSphere);
    glowSphere.geometry.dispose();
    glowSphere.material.dispose();
    glowSphere = null;
  }
  if (glowLight) {
    scene.remove(glowLight);
    glowLight.dispose();
    glowLight = null;
  }
  bubblePos = null;
  _onEntryCreated = null;
}
