/**
 * detailLabels.js — Entry-text labels for high-zoom detail view.
 *
 * Shows a small truncated-text label next to each visible bead when the
 * camera is zoomed in below ZOOM_THRESHOLD world units above the target.
 * Uses a DOM element pool to avoid creating/destroying elements every frame.
 */

import { dateToPosition } from '../spiralMath.js';

const ZOOM_THRESHOLD = 40; // world-unit camera height — labels appear below this
const MAX_CHARS = 80;

let _pool = []; // { el, used }

function _getOrCreateEl() {
  for (const item of _pool) {
    if (!item.used) { item.used = true; return item.el; }
  }
  const el = document.createElement('div');
  Object.assign(el.style, {
    position:      'fixed',
    zIndex:        '80',
    fontFamily:    'monospace',
    fontSize:      '11px',
    lineHeight:    '1.4',
    maxWidth:      '200px',
    color:         'rgba(255,245,230,0.85)',
    pointerEvents: 'none',
    background:    'rgba(13,8,4,0.75)',
    padding:       '4px 7px',
    borderRadius:  '4px',
    borderLeft:    '2px solid #f5a623',
    display:       'none',
  });
  document.getElementById('app').appendChild(el);
  _pool.push({ el, used: true });
  return el;
}

/**
 * Call each frame when in detail mode.
 * @param {object[]} entries   loaded journal entries
 * @param {Date}     birthday  user birthday
 * @param {THREE.Camera} camera
 * @param {number}   targetY  controls.target.y (ceiling date)
 * @param {boolean}  isDetail true when in detail mode
 */
export function updateDetailLabels(entries, birthday, camera, targetY, isDetail) {
  for (const item of _pool) item.used = false;

  const camHeight = camera.position.y - targetY;
  if (!isDetail || camHeight > ZOOM_THRESHOLD || !entries.length) {
    for (const item of _pool) item.el.style.display = 'none';
    return;
  }

  const cutY   = targetY;
  const floorY = cutY - 8;
  const margin = 10;

  for (const entry of entries) {
    const pos = dateToPosition(new Date(entry.entry_date), birthday);
    if (pos.y < floorY || pos.y > cutY) continue;

    const v  = pos.clone().project(camera);
    const sx = Math.round((v.x + 1) * 0.5 * window.innerWidth);
    const sy = Math.round((-v.y + 1) * 0.5 * window.innerHeight);

    // Skip if bead is off-screen
    if (sx < margin || sx > window.innerWidth - margin ||
        sy < margin || sy > window.innerHeight - margin) continue;

    const el = _getOrCreateEl();
    el.style.display    = 'block';
    el.style.left       = `${sx + 14}px`;
    el.style.top        = `${sy - 8}px`;
    el.style.borderLeft = `2px solid ${entry.color || '#f5a623'}`;
    el.textContent      = entry.content.length > MAX_CHARS
      ? entry.content.slice(0, MAX_CHARS) + '\u2026'
      : entry.content;
  }

  for (const item of _pool) {
    if (!item.used) item.el.style.display = 'none';
  }
}

/** Hide all labels immediately (call when leaving detail mode). */
export function clearDetailLabels() {
  for (const item of _pool) item.el.style.display = 'none';
}
