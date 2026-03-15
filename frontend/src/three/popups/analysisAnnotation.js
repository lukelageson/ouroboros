/**
 * analysisAnnotation.js — Type C popup: annotation for a glowing bead
 * in analysis viewing mode.
 *
 * Shows why a bead was included in the analysis (analysisRole).
 * Small CSS3DObject, max 180px wide, appears on hover.
 */

import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { css3dScene, registerPanel, unregisterPanel } from '../renderer.js';

let _activeAnnotation = null;
let _activeEntryId    = null; // track which bead is annotated to avoid re-creating

/**
 * Show an annotation popup above a glowing bead.
 * @param {object} entry - the journal entry object
 * @param {string} analysisRole - why this bead was included
 * @param {THREE.Vector3} position - world-space bead position
 */
export function showAnnotation(entry, analysisRole, position) {
  // Don't re-create if already showing for this entry
  if (_activeEntryId === entry.id) return;

  hideAnnotation();

  const div = document.createElement('div');
  Object.assign(div.style, {
    background:   'rgba(20, 12, 4, 0.92)',
    border:       '1px solid rgba(245, 166, 35, 0.35)',
    color:        '#fff5e6',
    padding:      '10px 12px',
    borderRadius: '8px',
    maxWidth:     '180px',
    fontFamily:   'monospace',
    fontSize:     '11px',
    lineHeight:   '1.45',
    pointerEvents:'none',
  });

  // Date line
  const dateEl = document.createElement('div');
  const d = new Date(entry.entry_date);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  dateEl.textContent = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  Object.assign(dateEl.style, {
    fontSize:      '10px',
    letterSpacing: '1px',
    color:         'rgba(245, 166, 35, 0.6)',
    marginBottom:  '4px',
    textTransform: 'uppercase',
  });
  div.appendChild(dateEl);

  // Role text
  const roleEl = document.createElement('div');
  roleEl.textContent = analysisRole;
  Object.assign(roleEl.style, {
    color: 'rgba(255, 245, 230, 0.85)',
  });
  div.appendChild(roleEl);

  const panel = new CSS3DObject(div);
  panel.position.copy(position);
  panel.position.y += 2;

  css3dScene.add(panel);
  registerPanel(panel, position);

  _activeAnnotation = panel;
  _activeEntryId = entry.id;
}

/**
 * Hide the active annotation popup.
 */
export function hideAnnotation() {
  if (_activeAnnotation) {
    unregisterPanel(_activeAnnotation);
    css3dScene.remove(_activeAnnotation);
    _activeAnnotation = null;
    _activeEntryId = null;
  }
}
