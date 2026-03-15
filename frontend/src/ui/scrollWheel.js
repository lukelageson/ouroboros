/**
 * scrollWheel.js — Watch-face-style radial scroll picker.
 *
 * Each drum shows a column of values arranged on a virtual cylinder.
 * The selected value sits at center, neighbours fade and curve away.
 * Scroll or drag to rotate. Returns current value on change.
 */

const ITEM_HEIGHT  = 42;   // px per slot
const VISIBLE      = 5;    // total visible items (2 above, center, 2 below)
const HALF_VISIBLE = Math.floor(VISIBLE / 2);
const FRICTION     = 0.92;
const SNAP_SPEED   = 0.15;

/**
 * Create a single scroll drum.
 * @param {HTMLElement} container — parent element to append into
 * @param {string[]} items — display labels
 * @param {number} initialIndex — starting selected index
 * @param {(index: number) => void} onChange
 * @returns {{ getIndex: () => number, setIndex: (i: number) => void, el: HTMLElement }}
 */
export function createDrum(container, items, initialIndex, onChange) {
  const drum = document.createElement('div');
  drum.className = 'scroll-drum';
  drum.style.cssText = `
    position: relative;
    width: 100%;
    height: ${ITEM_HEIGHT * VISIBLE}px;
    overflow: hidden;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
  `;

  // Highlight band at center
  const band = document.createElement('div');
  band.style.cssText = `
    position: absolute;
    top: ${ITEM_HEIGHT * HALF_VISIBLE}px;
    left: 0; right: 0;
    height: ${ITEM_HEIGHT}px;
    border-top: 1px solid rgba(245, 166, 35, 0.4);
    border-bottom: 1px solid rgba(245, 166, 35, 0.4);
    pointer-events: none;
    z-index: 2;
  `;
  drum.appendChild(band);

  // Inner track — moves up/down
  const track = document.createElement('div');
  track.style.cssText = `
    position: absolute;
    left: 0; right: 0;
    will-change: transform;
  `;

  // Build item elements
  const itemEls = [];
  for (let i = 0; i < items.length; i++) {
    const el = document.createElement('div');
    el.style.cssText = `
      height: ${ITEM_HEIGHT}px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: monospace;
      font-size: 22px;
      color: #fff5e6;
      transition: none;
      white-space: nowrap;
    `;
    el.textContent = items[i];
    track.appendChild(el);
    itemEls.push(el);
  }
  drum.appendChild(track);
  container.appendChild(drum);

  // ── State ──
  let offset = -initialIndex * ITEM_HEIGHT;  // px offset of track
  let velocity = 0;
  let dragging = false;
  let lastY = 0;
  let lastTime = 0;
  let animId = null;
  let currentIndex = initialIndex;

  function clampOffset(o) {
    const min = -(items.length - 1) * ITEM_HEIGHT;
    return Math.max(min, Math.min(0, o));
  }

  function render() {
    const translateY = offset + HALF_VISIBLE * ITEM_HEIGHT;
    track.style.transform = `translateY(${translateY}px)`;

    // Compute which index is centered
    const rawIdx = -offset / ITEM_HEIGHT;
    const snappedIdx = Math.round(rawIdx);

    // Style items based on distance from center
    for (let i = 0; i < itemEls.length; i++) {
      const dist = Math.abs(i - rawIdx);
      const opacity = Math.max(0, 1 - dist * 0.35);
      const scale = Math.max(0.7, 1 - dist * 0.08);
      itemEls[i].style.opacity = opacity;
      itemEls[i].style.transform = `scale(${scale})`;
    }

    const newIdx = Math.max(0, Math.min(items.length - 1, snappedIdx));
    if (newIdx !== currentIndex) {
      currentIndex = newIdx;
      onChange(currentIndex);
    }
  }

  function animate() {
    if (dragging) {
      render();
      animId = requestAnimationFrame(animate);
      return;
    }

    // Apply friction
    velocity *= FRICTION;

    // If slow enough, snap to nearest
    if (Math.abs(velocity) < 0.5) {
      const targetIdx = Math.round(-offset / ITEM_HEIGHT);
      const targetOffset = -targetIdx * ITEM_HEIGHT;
      offset += (targetOffset - offset) * SNAP_SPEED;

      if (Math.abs(targetOffset - offset) < 0.3) {
        offset = targetOffset;
        render();
        return; // stop animating
      }
    } else {
      offset = clampOffset(offset + velocity);
    }

    render();
    animId = requestAnimationFrame(animate);
  }

  function startAnim() {
    if (animId) return;
    animId = requestAnimationFrame(animate);
  }

  function stopAnim() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  // ── Pointer events ──
  function onDown(e) {
    dragging = true;
    velocity = 0;
    lastY = e.clientY || e.touches[0].clientY;
    lastTime = Date.now();
    drum.style.cursor = 'grabbing';
    stopAnim();
    startAnim();
    e.preventDefault();
  }

  function onMove(e) {
    if (!dragging) return;
    const y = e.clientY || (e.touches && e.touches[0].clientY) || lastY;
    const dt = Date.now() - lastTime;
    const dy = y - lastY;
    if (dt > 0) velocity = dy;
    offset = clampOffset(offset + dy);
    lastY = y;
    lastTime = Date.now();
    e.preventDefault();
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    drum.style.cursor = 'grab';
    startAnim();
  }

  drum.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  drum.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);

  // Mouse wheel
  drum.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ITEM_HEIGHT : ITEM_HEIGHT;
    offset = clampOffset(offset + delta);
    velocity = 0;
    stopAnim();
    startAnim();
  }, { passive: false });

  // Initial render
  offset = clampOffset(-initialIndex * ITEM_HEIGHT);
  render();

  return {
    getIndex: () => currentIndex,
    setIndex: (i) => {
      offset = clampOffset(-i * ITEM_HEIGHT);
      velocity = 0;
      stopAnim();
      render();
      currentIndex = i;
    },
    el: drum,
  };
}

/**
 * Build a year picker (single drum).
 * @param {HTMLElement} container
 * @param {number} minYear
 * @param {number} maxYear
 * @param {number} initialYear
 * @param {(year: number) => void} onChange
 */
export function createYearPicker(container, minYear, maxYear, initialYear, onChange) {
  const years = [];
  for (let y = minYear; y <= maxYear; y++) years.push(String(y));
  const initIdx = Math.max(0, initialYear - minYear);

  const drum = createDrum(container, years, initIdx, (idx) => {
    onChange(minYear + idx);
  });

  return {
    getYear: () => minYear + drum.getIndex(),
    setYear: (y) => drum.setIndex(y - minYear),
    el: drum.el,
  };
}

/**
 * Build a month+year picker (two drums side-by-side).
 * @param {HTMLElement} container
 * @param {(monthStr: string) => void} onChange — called with "YYYY-MM" string
 */
export function createMonthYearPicker(container, onChange) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    display: flex;
    gap: 8px;
    width: 100%;
  `;
  container.appendChild(wrapper);

  const monthCol = document.createElement('div');
  monthCol.style.cssText = 'flex: 1;';
  const yearCol = document.createElement('div');
  yearCol.style.cssText = 'flex: 1;';
  wrapper.appendChild(monthCol);
  wrapper.appendChild(yearCol);

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const now = new Date();
  const curMonth = now.getMonth();
  const curYear = now.getFullYear();

  let selectedMonth = curMonth;
  let selectedYear = curYear;

  function emitChange() {
    const mm = String(selectedMonth + 1).padStart(2, '0');
    onChange(`${selectedYear}-${mm}`);
  }

  const monthDrum = createDrum(monthCol, MONTHS, curMonth, (idx) => {
    selectedMonth = idx;
    emitChange();
  });

  const minYear = 1940;
  const maxYear = curYear;
  const years = [];
  for (let y = minYear; y <= maxYear; y++) years.push(String(y));

  const yearDrum = createDrum(yearCol, years, curYear - minYear, (idx) => {
    selectedYear = minYear + idx;
    emitChange();
  });

  return {
    getValue: () => {
      const mm = String(selectedMonth + 1).padStart(2, '0');
      return `${selectedYear}-${mm}`;
    },
    wrapper,
  };
}
