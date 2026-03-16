/**
 * entryColumn.js
 *
 * A fixed-position CSS overlay (left side) showing journal entries for the
 * selected day-of-year across all visible years. Only visible in Plan View.
 *
 * Updated in real time when the radial date line is dragged or the section
 * cut slider moves.
 */

const DAYS_IN_YEAR = 365.25;
const MS_PER_DAY   = 86400000;

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

let _containerEl = null;

function _getOrCreate() {
  if (_containerEl) return _containerEl;

  _containerEl = document.createElement('div');
  Object.assign(_containerEl.style, {
    position:   'fixed',
    left:       '24px',
    top:        '60px',
    bottom:     '132px',
    width:      '300px',
    overflowY:  'auto',
    background: 'rgba(20, 12, 4, 0.92)',
    border:     '1px solid rgba(245, 166, 35, 0.3)',
    borderRadius: '8px',
    padding:    '16px',
    fontFamily: 'monospace',
    color:      '#fff5e6',
    zIndex:     '100',
    boxSizing:  'border-box',
    display:    'none',
    pointerEvents: 'auto',
  });

  document.getElementById('app').appendChild(_containerEl);
  return _containerEl;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function initEntryColumn() {
  _getOrCreate();
}

/**
 * Rebuild the column content for a selected day-of-year.
 *
 * @param {number}   dayOfYear    0–364 float (spiral angle → calendar position)
 * @param {Date}     ceilingDate  upper visible bound (from section cut)
 * @param {Array}    entries      all loaded entries
 * @param {Date}     birthday     user's birthday (defines earliest year)
 */
export function updateEntryColumn(dayOfYear, ceilingDate, entries, birthday) {
  const el = _getOrCreate();
  if (el.style.display === 'none') return; // only update when visible

  const startYear = new Date(birthday).getFullYear();
  const endYear   = ceilingDate.getFullYear();
  const ceilISO   = ceilingDate.toISOString().slice(0, 10);
  const doy       = Math.round(dayOfYear);

  // Build a lookup: ISO date → entry
  const entryByDate = new Map();
  for (const e of entries) entryByDate.set(e.entry_date, e);

  const cards = [];
  for (let yr = endYear; yr >= startYear; yr--) {
    // Compute the calendar date in this year for the given day-of-year
    const jan1       = new Date(yr, 0, 1);
    const targetDate = new Date(jan1.getTime() + doy * MS_PER_DAY);
    const targetISO  = targetDate.toISOString().slice(0, 10);

    if (targetISO > ceilISO) continue; // above the ceiling

    // Check exact date, then ±1 day tolerance
    let entry = entryByDate.get(targetISO);
    if (!entry) {
      const prevISO = new Date(targetDate.getTime() - MS_PER_DAY).toISOString().slice(0, 10);
      const nextISO = new Date(targetDate.getTime() + MS_PER_DAY).toISOString().slice(0, 10);
      entry = entryByDate.get(prevISO) || entryByDate.get(nextISO);
    }

    if (entry) {
      cards.push({ entry, year: yr, date: targetDate });
    }
  }

  el.innerHTML = '';

  if (cards.length === 0) {
    const empty = document.createElement('div');
    Object.assign(empty.style, {
      fontSize: '11px',
      color:    'rgba(255, 245, 230, 0.35)',
      textAlign: 'center',
      marginTop: '16px',
      letterSpacing: '1px',
    });
    empty.textContent = 'No entries on this date';
    el.appendChild(empty);
    return;
  }

  for (const { entry, year, date } of cards) {
    const card = document.createElement('div');
    Object.assign(card.style, {
      marginBottom: '16px',
      paddingBottom: '12px',
      borderBottom: '1px solid rgba(255,245,230,0.06)',
    });

    // Year header
    const yearEl = document.createElement('div');
    Object.assign(yearEl.style, {
      fontSize:      '16px',
      color:         '#f5a623',
      letterSpacing: '2px',
      marginBottom:  '4px',
    });
    yearEl.textContent = String(year);
    card.appendChild(yearEl);

    // Date row: "MARCH 15, 2024" + color swatch
    const dateRow = document.createElement('div');
    Object.assign(dateRow.style, {
      display:       'flex',
      alignItems:    'center',
      gap:           '6px',
      marginBottom:  '6px',
    });

    const dateEl = document.createElement('div');
    Object.assign(dateEl.style, {
      fontSize:      '10px',
      color:         'rgba(245, 166, 35, 0.6)',
      letterSpacing: '1px',
      textTransform: 'uppercase',
    });
    dateEl.textContent = `${MONTH_NAMES_FULL[date.getMonth()]} ${date.getDate()}, ${year}`;

    const swatch = document.createElement('div');
    Object.assign(swatch.style, {
      width:        '12px',
      height:       '12px',
      borderRadius: '50%',
      background:   entry.color || '#f5a623',
      flexShrink:   '0',
    });

    dateRow.appendChild(dateEl);
    dateRow.appendChild(swatch);
    card.appendChild(dateRow);

    // Content (truncated to 120 chars)
    const contentEl = document.createElement('div');
    Object.assign(contentEl.style, {
      fontSize:   '12px',
      color:      'rgba(255, 245, 230, 0.85)',
      lineHeight: '1.5',
      marginBottom: entry.mood ? '4px' : '0',
    });
    const text = entry.content || '';
    contentEl.textContent = text.length > 120 ? text.slice(0, 120) + '…' : text;
    card.appendChild(contentEl);

    // Mood
    if (entry.mood) {
      const moodEl = document.createElement('div');
      Object.assign(moodEl.style, {
        fontSize:      '10px',
        color:         'rgba(255, 245, 230, 0.5)',
        letterSpacing: '0.5px',
      });
      moodEl.textContent = `Mood ${entry.mood}/5`;
      card.appendChild(moodEl);
    }

    el.appendChild(card);
  }
}

export function showEntryColumn() {
  const el = _getOrCreate();
  el.style.display = 'block';
}

export function hideEntryColumn() {
  const el = _getOrCreate();
  el.style.display = 'none';
}
