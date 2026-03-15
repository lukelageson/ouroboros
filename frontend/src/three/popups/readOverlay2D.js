/**
 * readOverlay2D.js — Detail View Type A popup.
 *
 * A fixed 2D HTML panel anchored at the bottom-center of the viewport.
 * Used exclusively when the current view mode is 'detail'; all other
 * modes use the existing readOverlay.js CSS3DObject approach.
 */

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

let _panel       = null;
let _docListener = null;

function _formatDate(isoDate) {
  const d = new Date(isoDate);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/**
 * Open the 2D detail-view overlay for a journal entry.
 * @param {object} entry  the journal entry object
 */
export function openReadOverlay2D(entry) {
  closeReadOverlay2D();

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position:     'fixed',
    bottom:       '32px',
    left:         '50%',
    transform:    'translateX(-50%) translateY(8px)',
    maxWidth:     '420px',
    width:        '90vw',
    background:   'rgba(20, 12, 4, 0.95)',
    border:       '1px solid rgba(245, 166, 35, 0.4)',
    color:        '#fff5e6',
    borderRadius: '10px',
    padding:      '20px 24px',
    fontFamily:   'monospace',
    fontSize:     '13px',
    lineHeight:   '1.6',
    pointerEvents:'auto',
    zIndex:       '200',
    opacity:      '0',
    transition:   'opacity 200ms ease, transform 200ms ease',
    boxSizing:    'border-box',
  });

  // Close button (×) top-right
  const closeBtn = document.createElement('button');
  Object.assign(closeBtn.style, {
    position:   'absolute',
    top:        '12px',
    right:      '16px',
    background: 'none',
    border:     'none',
    color:      '#f5a623',
    fontSize:   '20px',
    cursor:     'pointer',
    padding:    '0',
    lineHeight: '1',
    fontFamily: 'monospace',
  });
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeReadOverlay2D();
  });
  panel.appendChild(closeBtn);

  // Date — uppercase amber small label
  const dateEl = document.createElement('div');
  dateEl.textContent = _formatDate(entry.entry_date).toUpperCase();
  Object.assign(dateEl.style, {
    fontSize:      '11px',
    letterSpacing: '1px',
    color:         'rgba(245, 166, 35, 0.7)',
    marginBottom:  '8px',
  });
  panel.appendChild(dateEl);

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
    panel.appendChild(msEl);
  }

  // Full entry content (no truncation)
  const contentEl = document.createElement('div');
  contentEl.textContent = entry.content;
  Object.assign(contentEl.style, { marginBottom: '12px' });
  panel.appendChild(contentEl);

  // Bottom row: color swatch + mood value
  const row = document.createElement('div');
  Object.assign(row.style, {
    display:    'flex',
    alignItems: 'center',
    gap:        '10px',
  });

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

  if (entry.mood) {
    const moodEl = document.createElement('div');
    moodEl.textContent = `Mood ${entry.mood}/5`;
    Object.assign(moodEl.style, {
      fontSize: '11px',
      color:    'rgba(255, 245, 230, 0.6)',
    });
    row.appendChild(moodEl);
  }

  panel.appendChild(row);
  document.getElementById('app').appendChild(panel);
  _panel = panel;

  // Animate in on next tick
  requestAnimationFrame(() => {
    panel.style.opacity   = '1';
    panel.style.transform = 'translateX(-50%) translateY(0)';
  });

  // Click-outside closes the panel (deferred so this click doesn't immediately fire it)
  _docListener = (e) => {
    if (_panel && !_panel.contains(e.target)) closeReadOverlay2D();
  };
  setTimeout(() => document.addEventListener('click', _docListener), 0);
}

/** Close and remove the 2D overlay. Safe to call when nothing is open. */
export function closeReadOverlay2D() {
  if (_panel) {
    _panel.remove();
    _panel = null;
  }
  if (_docListener) {
    document.removeEventListener('click', _docListener);
    _docListener = null;
  }
}

/** True when the 2D overlay is currently displayed. */
export function isReadOverlay2DOpen() {
  return _panel !== null;
}
