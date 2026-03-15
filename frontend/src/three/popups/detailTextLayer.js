/**
 * detailTextLayer.js — Detail View text labels for beads.
 *
 * When the view mode is 'detail', renders a CSS3DObject for every bead
 * within the current clip window showing entry date + truncated content.
 * Non-interactive (pointerEvents: none). Clicking a bead still opens
 * the full Type A overlay as normal.
 *
 * Labels are laid flat on the ground plane (rotation.x = -π/2) so they
 * read correctly when the camera is looking down.
 */

import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { css3dScene } from '../renderer.js';
import { dateToPosition } from '../spiralMath.js';

const MONTH_NAMES = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

const MAX_CONTENT = 120;

// Quaternion for laying a CSS3DObject flat on the ground plane.
// Rotates the div from the XY plane into the XZ plane so it faces upward.
const FLAT_QUAT = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0), -Math.PI / 2
);

// All active detail labels: { entryId, panel, y }
let activeLabels = [];
let allEntries = [];
let birthdayDate = null;

/**
 * Initialize with entries and birthday. Call once after entries load.
 */
export function initDetailTextLayer(entries, birthday) {
  allEntries = entries;
  birthdayDate = new Date(birthday);
}

/**
 * Called each frame from the detail-view frame callback.
 * Shows labels for beads within the clip window, hides all when not in detail.
 *
 * @param {number} targetY   the detail-view camera target Y
 * @param {string} viewMode  current view mode
 */
export function updateDetailTextLayer(targetY, viewMode) {
  if (viewMode !== 'detail') {
    _hideAll();
    return;
  }

  const lowerY = targetY - 8;
  const upperY = targetY + 5;

  // Determine which entries are in the window
  const visible = new Set();
  for (const entry of allEntries) {
    const pos = dateToPosition(new Date(entry.entry_date), birthdayDate);
    if (pos.y >= lowerY && pos.y <= upperY) {
      visible.add(entry.id);
    }
  }

  // Remove labels no longer in window
  for (let i = activeLabels.length - 1; i >= 0; i--) {
    if (!visible.has(activeLabels[i].entryId)) {
      css3dScene.remove(activeLabels[i].panel);
      activeLabels.splice(i, 1);
    }
  }

  // Add labels for newly visible entries
  const existingIds = new Set(activeLabels.map(l => l.entryId));
  for (const entry of allEntries) {
    if (!visible.has(entry.id) || existingIds.has(entry.id)) continue;
    const label = _createLabel(entry);
    if (label) activeLabels.push(label);
  }
}

/**
 * Notify the detail text layer that the entries array has changed
 * (e.g. after creating a new entry).
 */
export function refreshDetailEntries(entries) {
  allEntries = entries;
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _hideAll() {
  for (const label of activeLabels) {
    css3dScene.remove(label.panel);
  }
  activeLabels = [];
}

function _formatDate(isoDate) {
  const d = new Date(isoDate);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function _truncate(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max) + '\u2026';
}

function _createLabel(entry) {
  if (!birthdayDate) return null;

  const pos = dateToPosition(new Date(entry.entry_date), birthdayDate);

  const div = document.createElement('div');
  Object.assign(div.style, {
    background:    'rgba(20, 12, 4, 0.85)',
    border:        '1px solid rgba(245, 166, 35, 0.25)',
    color:         '#fff5e6',
    padding:       '8px 10px',
    borderRadius:  '6px',
    width:         '200px',
    fontFamily:    'monospace',
    fontSize:      '10px',
    lineHeight:    '1.4',
    pointerEvents: 'none',
  });

  // Date line
  const dateEl = document.createElement('div');
  dateEl.textContent = _formatDate(entry.entry_date);
  Object.assign(dateEl.style, {
    fontSize:      '9px',
    letterSpacing: '1px',
    color:         'rgba(245, 166, 35, 0.6)',
    marginBottom:  '4px',
    textTransform: 'uppercase',
  });
  div.appendChild(dateEl);

  // Truncated content
  const contentEl = document.createElement('div');
  contentEl.textContent = _truncate(entry.content, MAX_CONTENT);
  Object.assign(contentEl.style, {
    color:    'rgba(255, 245, 230, 0.85)',
    fontSize: '10px',
  });
  div.appendChild(contentEl);

  // Wrap in CSS3DObject
  const panel = new CSS3DObject(div);

  // Lay flat on the ground plane so text is readable from above
  panel.quaternion.copy(FLAT_QUAT);
  panel.scale.setScalar(0.025);

  // Position at the bead, slightly above and offset radially outward
  panel.position.copy(pos);
  panel.position.y += 0.3;

  // Offset outward from spiral axis so label doesn't overlap the bead
  const radialDir = new THREE.Vector3(pos.x, 0, pos.z).normalize();
  panel.position.addScaledVector(radialDir, 3.0);

  css3dScene.add(panel);

  return { entryId: entry.id, panel, y: pos.y };
}
