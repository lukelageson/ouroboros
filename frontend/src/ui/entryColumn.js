/**
 * entryColumn.js
 *
 * A fixed-position CSS overlay (left side) showing journal entries for the
 * selected day-of-year across all visible years. Only visible in Plan View.
 *
 * Layout: large day header ("FEBRUARY 16") at the top, then a scrollable
 * list of cards — one per matching entry — showing year, color swatch,
 * mood, and entry text.
 */

const DAYS_IN_YEAR = 365;
const MS_PER_DAY   = 86400000;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MOOD_LABELS = ['', '●●●●●', '●●●●○', '●●●○○', '●●○○○', '●○○○○'];

let _containerEl = null;
let _headerEl    = null;
let _listEl      = null;

function _getOrCreate() {
  if (_containerEl) return _containerEl;

  _containerEl = document.createElement('div');
  Object.assign(_containerEl.style, {
    position:      'fixed',
    left:          '24px',
    top:           '60px',
    bottom:        '132px',
    width:         '280px',
    display:       'none',
    flexDirection: 'column',
    background:    'rgba(14, 8, 4, 0.94)',
    border:        '1px solid rgba(245, 166, 35, 0.25)',
    borderRadius:  '8px',
    fontFamily:    'monospace',
    color:         '#fff5e6',
    zIndex:        '100',
    boxSizing:     'border-box',
    pointerEvents: 'auto',
    overflow:      'hidden',
  });

  // ── Sticky day header ─────────────────────────────────────────────────
  _headerEl = document.createElement('div');
  Object.assign(_headerEl.style, {
    padding:       '18px 18px 14px',
    borderBottom:  '1px solid rgba(245, 166, 35, 0.2)',
    flexShrink:    '0',
  });

  const dayLabel = document.createElement('div');
  Object.assign(dayLabel.style, {
    fontSize:      '22px',
    fontWeight:    '700',
    letterSpacing: '3px',
    color:         '#f5a623',
    textTransform: 'uppercase',
    lineHeight:    '1.1',
  });
  dayLabel.id = 'entry-col-day';
  _headerEl.appendChild(dayLabel);

  _containerEl.appendChild(_headerEl);

  // ── Scrollable card list ──────────────────────────────────────────────
  _listEl = document.createElement('div');
  Object.assign(_listEl.style, {
    overflowY:  'auto',
    flex:       '1',
    padding:    '12px 18px 16px',
  });
  _containerEl.appendChild(_listEl);

  document.getElementById('app').appendChild(_containerEl);
  return _containerEl;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function initEntryColumn() {
  _getOrCreate();
}

/**
 * Rebuild the column for a selected day-of-year.
 *
 * @param {number}  dayOfYear   0–364 float
 * @param {Date}    ceilingDate upper visible bound
 * @param {Array}   entries     loaded entries
 * @param {Date}    birthday    user birthday
 */
export function updateEntryColumn(dayOfYear, ceilingDate, entries, birthday) {
  const el = _getOrCreate();
  if (el.style.display === 'none') return;

  const startYear = new Date(birthday).getFullYear();
  const endYear   = ceilingDate.getFullYear();
  const ceilISO   = ceilingDate.toISOString().slice(0, 10);
  const doy       = Math.round(dayOfYear);

  // Derive a representative calendar date for the day header (use current year)
  const refYear    = new Date().getFullYear();
  const refJan1    = new Date(refYear, 0, 1);
  const refDate    = new Date(refJan1.getTime() + doy * MS_PER_DAY);
  const dayLabel   = document.getElementById('entry-col-day');
  if (dayLabel) {
    dayLabel.textContent =
      `${MONTH_NAMES[refDate.getMonth()].toUpperCase()} ${refDate.getDate()}`;
  }

  // Build ISO→entry lookup (normalize entry_date)
  const entryByDate = new Map();
  for (const e of entries) {
    const iso = new Date(e.entry_date).toISOString().slice(0, 10);
    entryByDate.set(iso, e);
  }

  // Collect matching entries across years
  const cards = [];
  for (let yr = endYear; yr >= startYear; yr--) {
    const jan1       = new Date(yr, 0, 1);
    const targetDate = new Date(jan1.getTime() + doy * MS_PER_DAY);
    const targetISO  = targetDate.toISOString().slice(0, 10);
    if (targetISO > ceilISO) continue;

    let entry = entryByDate.get(targetISO);
    if (!entry) {
      const prev = new Date(targetDate.getTime() - MS_PER_DAY).toISOString().slice(0, 10);
      const next = new Date(targetDate.getTime() + MS_PER_DAY).toISOString().slice(0, 10);
      entry = entryByDate.get(prev) || entryByDate.get(next);
    }
    if (entry) cards.push({ entry, year: yr });
  }

  // Rebuild list
  _listEl.innerHTML = '';

  if (cards.length === 0) {
    const empty = document.createElement('div');
    Object.assign(empty.style, {
      fontSize:      '11px',
      color:         'rgba(255,245,230,0.3)',
      textAlign:     'center',
      marginTop:     '20px',
      letterSpacing: '1px',
    });
    empty.textContent = 'No entries on this date';
    _listEl.appendChild(empty);
    return;
  }

  for (const { entry, year } of cards) {
    const card = document.createElement('div');
    Object.assign(card.style, {
      marginBottom:  '14px',
      paddingBottom: '14px',
      borderBottom:  '1px solid rgba(255,245,230,0.06)',
    });

    // ── Row 1: year + color swatch ────────────────────────────────────
    const row1 = document.createElement('div');
    Object.assign(row1.style, {
      display:       'flex',
      alignItems:    'center',
      gap:           '8px',
      marginBottom:  '6px',
    });

    const yearEl = document.createElement('div');
    Object.assign(yearEl.style, {
      fontSize:      '18px',
      fontWeight:    '700',
      letterSpacing: '2px',
      color:         '#f5a623',
      lineHeight:    '1',
    });
    yearEl.textContent = String(year);

    const swatch = document.createElement('div');
    Object.assign(swatch.style, {
      width:        '10px',
      height:       '10px',
      borderRadius: '50%',
      background:   entry.color || '#f5a623',
      flexShrink:   '0',
      marginTop:    '1px',
    });

    row1.appendChild(yearEl);
    row1.appendChild(swatch);

    // Mood dots if present
    if (entry.mood) {
      const moodEl = document.createElement('div');
      Object.assign(moodEl.style, {
        fontSize:    '9px',
        color:       'rgba(245,166,35,0.55)',
        letterSpacing: '1px',
        marginLeft:  'auto',
      });
      moodEl.textContent = MOOD_LABELS[entry.mood] || '';
      row1.appendChild(moodEl);
    }

    card.appendChild(row1);

    // ── Row 2: entry text ─────────────────────────────────────────────
    const textEl = document.createElement('div');
    Object.assign(textEl.style, {
      fontSize:   '12px',
      color:      'rgba(255,245,230,0.82)',
      lineHeight: '1.55',
    });
    const text = entry.content || '';
    textEl.textContent = text.length > 140 ? text.slice(0, 140) + '…' : text;
    card.appendChild(textEl);

    _listEl.appendChild(card);
  }
}

export function showEntryColumn() {
  const el = _getOrCreate();
  el.style.display = 'flex';
}

export function hideEntryColumn() {
  const el = _getOrCreate();
  el.style.display = 'none';
}
