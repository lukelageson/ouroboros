/**
 * readOverlay.js — Type A popup: read-only overlay for a filled bead.
 *
 * Displays entry content, date, color swatch, mood, and milestone label
 * as a CSS3DObject positioned above the bead.
 */

import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { css3dScene, registerPanel, unregisterPanel } from '../renderer.js';

let activeOverlay = null;

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function formatDate(isoDate) {
  const d = new Date(isoDate);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/**
 * Open a read overlay above a bead.
 * @param {object} entry       the journal entry object
 * @param {THREE.Vector3} pos  world-space bead position
 */
export function openReadOverlay(entry, pos) {
  closeReadOverlay();

  const div = document.createElement('div');
  Object.assign(div.style, {
    background:   'rgba(20, 12, 4, 0.92)',
    border:       '1px solid rgba(245, 166, 35, 0.4)',
    color:        '#fff5e6',
    padding:      '18px 20px',
    borderRadius: '10px',
    width:        '260px',
    fontFamily:   'monospace',
    fontSize:     '13px',
    lineHeight:   '1.5',
    pointerEvents:'none',
  });

  // Date
  const dateEl = document.createElement('div');
  dateEl.textContent = formatDate(entry.entry_date);
  Object.assign(dateEl.style, {
    fontSize:      '11px',
    letterSpacing: '1px',
    color:         'rgba(245, 166, 35, 0.7)',
    marginBottom:  '8px',
    textTransform: 'uppercase',
  });
  div.appendChild(dateEl);

  // Milestone label
  if (entry.is_milestone && entry.milestone_label) {
    const msEl = document.createElement('div');
    msEl.textContent = entry.milestone_label;
    Object.assign(msEl.style, {
      fontSize:     '15px',
      fontWeight:   'bold',
      color:        '#f5a623',
      marginBottom: '6px',
    });
    div.appendChild(msEl);
  }

  // Content
  const contentEl = document.createElement('div');
  contentEl.textContent = entry.content;
  Object.assign(contentEl.style, { marginBottom: '10px' });
  div.appendChild(contentEl);

  // Bottom row: swatch + mood
  const row = document.createElement('div');
  Object.assign(row.style, {
    display:    'flex',
    alignItems: 'center',
    gap:        '10px',
  });

  // Color swatch
  const swatch = document.createElement('div');
  Object.assign(swatch.style, {
    width:        '14px',
    height:       '14px',
    borderRadius: '50%',
    background:   entry.color,
    border:       '1px solid rgba(255,255,255,0.2)',
    flexShrink:   '0',
  });
  row.appendChild(swatch);

  // Mood
  if (entry.mood) {
    const moodEl = document.createElement('div');
    moodEl.textContent = `Mood ${entry.mood}/5`;
    Object.assign(moodEl.style, {
      fontSize: '11px',
      color:    'rgba(255, 245, 230, 0.6)',
    });
    row.appendChild(moodEl);
  }

  div.appendChild(row);

  // Wrap in CSS3DObject
  const panel = new CSS3DObject(div);
  panel.scale.setScalar(0.05);

  // Position above the bead
  panel.position.copy(pos);
  panel.position.y += 3;

  css3dScene.add(panel);
  registerPanel(panel, pos);
  activeOverlay = panel;
}

/** Close the active read overlay. */
export function closeReadOverlay() {
  if (activeOverlay) {
    unregisterPanel(activeOverlay);
    css3dScene.remove(activeOverlay);
    activeOverlay = null;
  }
}
