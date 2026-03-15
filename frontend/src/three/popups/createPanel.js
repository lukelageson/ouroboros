/**
 * createPanel.js — Type B popup: create-entry panel for an empty bead.
 *
 * Shows a text area, color picker (14 circles), mood selector (1-5),
 * milestone toggle, and Place Bead / Cancel buttons.
 * The panel's DOM has pointer-events: auto so users can interact.
 */

import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { css3dScene, registerPanel, unregisterPanel } from '../renderer.js';

let activePanel = null;

const PALETTE = [
  '#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6',
  '#e91e8c','#ff6b35','#c0392b','#27ae60','#2980b9','#8e44ad','#f39c12',
];

/**
 * Open the create-entry panel for an empty date.
 * @param {string} dateISO          ISO date string (YYYY-MM-DD)
 * @param {THREE.Vector3} pos       world position of the empty bead
 * @param {function(object)} onSubmit  callback with entry data
 */
export function openCreatePanel(dateISO, pos, onSubmit) {
  closeCreatePanel();

  // ── State ──────────────────────────────────────────────────────────────
  let selectedColor = PALETTE[0];
  let selectedMood  = null;
  let isMilestone   = false;

  // ── Root div ───────────────────────────────────────────────────────────
  const div = document.createElement('div');
  Object.assign(div.style, {
    background:    'rgba(20, 12, 4, 0.95)',
    border:        '1px solid rgba(245, 166, 35, 0.4)',
    color:         '#fff5e6',
    padding:       '18px 20px',
    borderRadius:  '10px',
    width:         '280px',
    fontFamily:    'monospace',
    fontSize:      '12px',
    lineHeight:    '1.4',
    pointerEvents: 'auto',
  });

  // Prevent clicks inside the panel from propagating to the canvas
  div.addEventListener('mousedown', (e) => e.stopPropagation());
  div.addEventListener('click',     (e) => e.stopPropagation());

  // ── Date header ────────────────────────────────────────────────────────
  const header = document.createElement('div');
  const d = new Date(dateISO + 'T00:00:00');
  header.textContent = d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  Object.assign(header.style, {
    fontSize:      '11px',
    letterSpacing: '1px',
    color:         'rgba(245, 166, 35, 0.7)',
    marginBottom:  '10px',
    textTransform: 'uppercase',
  });
  div.appendChild(header);

  // ── Text area ──────────────────────────────────────────────────────────
  const textarea = document.createElement('textarea');
  textarea.placeholder = 'What happened today?';
  textarea.rows = 3;
  Object.assign(textarea.style, {
    width:        '100%',
    boxSizing:    'border-box',
    padding:      '8px',
    background:   '#0d0804',
    border:       '1px solid rgba(245, 166, 35, 0.3)',
    borderRadius: '4px',
    color:        '#fff5e6',
    fontFamily:   'monospace',
    fontSize:     '12px',
    resize:       'vertical',
    marginBottom: '10px',
  });
  div.appendChild(textarea);

  // ── Color picker ───────────────────────────────────────────────────────
  const colorLabel = document.createElement('div');
  colorLabel.textContent = 'COLOR';
  Object.assign(colorLabel.style, {
    fontSize: '10px', letterSpacing: '2px',
    color: 'rgba(245,166,35,0.5)', marginBottom: '6px',
  });
  div.appendChild(colorLabel);

  const colorRow = document.createElement('div');
  Object.assign(colorRow.style, {
    display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px',
  });

  const colorDots = [];
  for (const hex of PALETTE) {
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      width: '18px', height: '18px', borderRadius: '50%',
      background: hex, cursor: 'pointer',
      border: hex === selectedColor ? '2px solid #fff5e6' : '2px solid transparent',
      boxSizing: 'border-box',
    });
    dot.addEventListener('click', () => {
      selectedColor = hex;
      colorDots.forEach((d, i) => {
        d.style.border = PALETTE[i] === hex
          ? '2px solid #fff5e6' : '2px solid transparent';
      });
    });
    colorDots.push(dot);
    colorRow.appendChild(dot);
  }
  div.appendChild(colorRow);

  // ── Mood selector ──────────────────────────────────────────────────────
  const moodLabel = document.createElement('div');
  moodLabel.textContent = 'MOOD';
  Object.assign(moodLabel.style, {
    fontSize: '10px', letterSpacing: '2px',
    color: 'rgba(245,166,35,0.5)', marginBottom: '6px',
  });
  div.appendChild(moodLabel);

  const moodRow = document.createElement('div');
  Object.assign(moodRow.style, {
    display: 'flex', gap: '8px', marginBottom: '12px',
  });

  const MOOD_HEX = ['#c0392b','#e67e22','#6b5a47','#7dbb6e','#27ae60'];
  const moodDots = [];
  for (let m = 1; m <= 5; m++) {
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      width: '22px', height: '22px', borderRadius: '50%',
      background: MOOD_HEX[m - 1], cursor: 'pointer',
      border: '2px solid transparent', boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '10px', fontWeight: 'bold', color: '#fff5e6',
    });
    dot.textContent = m;
    dot.addEventListener('click', () => {
      if (selectedMood === m) {
        selectedMood = null;
        moodDots.forEach(d => d.style.border = '2px solid transparent');
      } else {
        selectedMood = m;
        moodDots.forEach((d, i) => {
          d.style.border = (i + 1) === m
            ? '2px solid #fff5e6' : '2px solid transparent';
        });
      }
    });
    moodDots.push(dot);
    moodRow.appendChild(dot);
  }
  div.appendChild(moodRow);

  // ── Milestone toggle ───────────────────────────────────────────────────
  const msRow = document.createElement('div');
  Object.assign(msRow.style, {
    display: 'flex', alignItems: 'center', gap: '8px',
    marginBottom: '14px', cursor: 'pointer',
  });

  const msCheck = document.createElement('div');
  Object.assign(msCheck.style, {
    width: '16px', height: '16px', borderRadius: '3px',
    border: '1px solid rgba(245,166,35,0.4)', background: '#0d0804',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '12px', color: '#f5a623',
  });

  const msLabel = document.createElement('div');
  msLabel.textContent = 'Milestone';
  Object.assign(msLabel.style, { fontSize: '11px', color: 'rgba(255,245,230,0.7)' });

  msRow.addEventListener('click', () => {
    isMilestone = !isMilestone;
    msCheck.textContent = isMilestone ? '\u2713' : '';
    msCheck.style.background = isMilestone ? 'rgba(245,166,35,0.15)' : '#0d0804';
  });
  msRow.appendChild(msCheck);
  msRow.appendChild(msLabel);
  div.appendChild(msRow);

  // ── Buttons ────────────────────────────────────────────────────────────
  const btnRow = document.createElement('div');
  Object.assign(btnRow.style, { display: 'flex', gap: '8px' });

  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'PLACE BEAD';
  Object.assign(submitBtn.style, {
    flex: '1', padding: '8px', background: '#f5a623', color: '#1a1008',
    border: 'none', borderRadius: '4px', fontFamily: 'monospace',
    fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
    letterSpacing: '1px',
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'CANCEL';
  Object.assign(cancelBtn.style, {
    padding: '8px 12px', background: 'transparent',
    color: 'rgba(245,166,35,0.6)', border: '1px solid rgba(245,166,35,0.2)',
    borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px',
    cursor: 'pointer', letterSpacing: '1px',
  });

  submitBtn.addEventListener('click', () => {
    const content = textarea.value.trim();
    if (!content) { textarea.style.borderColor = '#e74c3c'; return; }
    onSubmit({
      content,
      color:        selectedColor,
      mood:         selectedMood,
      entry_date:   dateISO,
      is_milestone: isMilestone,
    });
  });

  cancelBtn.addEventListener('click', () => closeCreatePanel());

  btnRow.appendChild(submitBtn);
  btnRow.appendChild(cancelBtn);
  div.appendChild(btnRow);

  // ── CSS3DObject ────────────────────────────────────────────────────────
  const panel = new CSS3DObject(div);
  panel.scale.setScalar(0.05);
  panel.position.copy(pos);
  panel.position.y += 3;

  css3dScene.add(panel);
  registerPanel(panel, pos);
  activePanel = panel;
}

/** Close the active create panel. */
export function closeCreatePanel() {
  if (activePanel) {
    unregisterPanel(activePanel);
    css3dScene.remove(activePanel);
    activePanel = null;
  }
}

/** Check if a create panel is currently open. */
export function isCreatePanelOpen() {
  return activePanel !== null;
}
