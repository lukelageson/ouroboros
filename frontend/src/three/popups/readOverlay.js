/**
 * readOverlay.js — Type A popup: read-only overlay for a filled bead.
 *
 * Displays entry content, date, color swatch, mood, and milestone label
 * as a fixed-position DOM element sized to the viewport (not 3D space).
 * Positioned near the bead's screen projection, clamped to the viewport.
 */

import { getActiveCamera } from '../renderer.js';

let activeOverlay = null;

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const POPUP_W = 280;
const POPUP_OFFSET = 24; // px gap from the bead screen position

function formatDate(isoDate) {
  const d = new Date(isoDate);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Project a THREE.Vector3 world position to CSS pixel coords. */
function _projectToScreen(worldPos) {
  const cam = getActiveCamera();
  const v = worldPos.clone().project(cam);
  return {
    x: Math.round((v.x + 1) * 0.5 * window.innerWidth),
    y: Math.round((-v.y + 1) * 0.5 * window.innerHeight),
  };
}

/**
 * Open a read overlay near a bead.
 * @param {object} entry       the journal entry object
 * @param {THREE.Vector3} pos  world-space bead position
 */
export function openReadOverlay(entry, pos) {
  closeReadOverlay();

  const screen = _projectToScreen(pos);

  const div = document.createElement('div');
  Object.assign(div.style, {
    position:     'fixed',
    width:        `${POPUP_W}px`,
    background:   'rgba(20, 12, 4, 0.92)',
    border:       '1px solid rgba(245, 166, 35, 0.4)',
    color:        '#fff5e6',
    padding:      '18px 20px',
    borderRadius: '10px',
    fontFamily:   'monospace',
    fontSize:     '13px',
    lineHeight:   '1.5',
    pointerEvents:'none',
    zIndex:       '150',
    boxSizing:    'border-box',
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
  document.getElementById('app').appendChild(div);

  // Position after appending so we can measure height
  requestAnimationFrame(() => {
    const popupH = div.offsetHeight || 140;
    const margin = 12; // keep inside viewport

    // Try right of bead first, then left
    let left = screen.x + POPUP_OFFSET;
    if (left + POPUP_W > window.innerWidth - margin) {
      left = screen.x - POPUP_W - POPUP_OFFSET;
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - POPUP_W - margin));

    // Vertically centered on the bead, clamped to viewport
    let top = screen.y - popupH / 2;
    top = Math.max(margin, Math.min(top, window.innerHeight - popupH - margin));

    div.style.left = `${left}px`;
    div.style.top  = `${top}px`;
  });

  activeOverlay = div;
}

/** Close the active read overlay. */
export function closeReadOverlay() {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}
