import * as THREE from 'three';
import {
  initRenderer, registerFrameCallback, registerPostRenderCallback,
  webgl, camera, controls, scene, getActiveCamera,
} from './three/renderer.js';
import { initScene }                           from './three/scene.js';
import { updateRibbonLabels }                  from './three/ribbon.js';
import {
  setViewMode, advanceTransition,
  isPlanMode, isDetailMode, getCurrentMode,
  panDetailView, setPlanTargetY,
} from './three/cameraController.js';
import {
  updateSpiralMaterial, updateSpiralDetailMode, clearSpiralDetailMode,
} from './three/spiralGeometry.js';
import { dateToPosition }       from './three/spiralMath.js';
import {
  initSectionCut,
  showSectionCutSlider,
  hideSectionCutSlider,
  getSectionCutY,
  setDetailClipWindow,
  clearDetailClipWindow,
} from './three/sectionCut.js';
import {
  initViewCube, updateViewCube, renderViewCube, isInCubeArea,
} from './three/viewCube.js';
import * as api from './api.js';
import { initBeads, addBead, getAllBeadMeshes } from './three/beads.js';
import {
  initEmptyBeads, showEmptyBeadsNearMouse,
  getEmptyBeadMesh, getEmptyBeadDate, removeEmptyBeadInstance,
} from './three/emptyBeads.js';
import { toggleColorMode, initColorModeToggle } from './three/colorMode.js';
import { setPanelViewMode }                     from './three/panelManager.js';
import { openReadOverlay, closeReadOverlay }    from './three/popups/readOverlay.js';
import {
  openCreatePanel, closeCreatePanel, isCreatePanelOpen,
} from './three/popups/createPanel.js';

// ── Init ────────────────────────────────────────────────────────────────────
initRenderer();
const {
  ribbonMesh, dividerObjects, labels,
  spiralTopY, spiral,
  birthday, today, ground,
} = initScene();

let ribbonVisible = true;

// Compute today's position on the spiral for the initial detail-view pan
const todayPos = dateToPosition(today, birthday);

// Section cut: global clip plane + slider UI
initSectionCut(spiralTopY, birthday);
hideSectionCutSlider(); // hidden until perspective view is active

// ── View Cube ───────────────────────────────────────────────────────────────
initViewCube(webgl, camera, controls, (mode) => {
  const effectiveTop = Math.min(spiralTopY, getSectionCutY());
  if (mode === 'detail') {
    panDate = new Date(today);
    setViewMode('detail', effectiveTop, { panPos: todayPos });
  } else {
    setViewMode(mode, effectiveTop);
  }
});

// ── Frame callbacks ─────────────────────────────────────────────────────────
registerFrameCallback(() => {
  advanceTransition();
  updateSpiralMaterial(isPlanMode());
  updateViewCube();

  // Show section cut slider in perspective and plan views
  const mode = getCurrentMode();
  if (mode === 'perspective' || mode === 'plan') showSectionCutSlider();
  else                                           hideSectionCutSlider();

  // Plan view: track section cut live
  if (mode === 'plan') setPlanTargetY(getSectionCutY());

  // Detail view: two-plane clip window + spiral edge fade + year indicator
  if (mode === 'detail') {
    const detailTargetY = getActiveCamera().position.y - 15;
    setDetailClipWindow(detailTargetY);
    updateSpiralDetailMode(detailTargetY);
    _updateDetailYearIndicator(detailTargetY);
    if (ground) ground.visible = false;
  } else {
    clearDetailClipWindow();
    clearSpiralDetailMode();
    _hideDetailYearIndicator();
    if (ground) ground.visible = true;
  }

  // Tell panelManager the settled view mode so it scales/orients popups correctly
  setPanelViewMode(mode || 'perspective');
});

registerFrameCallback((cam) => {
  updateRibbonLabels(
    labels, dividerObjects, ribbonMesh,
    cam, ribbonVisible,
    isPlanMode(), spiralTopY, getSectionCutY(), isDetailMode()
  );
});

registerPostRenderCallback(() => {
  renderViewCube();
});

// ── Start in Plan View ───────────────────────────────────────────────────────
setViewMode('plan', spiralTopY);

// ── Detail-view panning ──────────────────────────────────────────────────────
let panDragging = false;
let panLastX    = 0;
let panDate     = new Date(today); // current pan position as a Date

const DAYS_PER_PX = 0.5; // 1 px drag ≈ 0.5 days along the spiral

const canvas = document.querySelector('canvas');

canvas.addEventListener('mousedown', (e) => {
  if (getCurrentMode() === 'detail') {
    panDragging = true;
    panLastX    = e.clientX;
    canvas.style.cursor = 'grabbing';
    e.stopPropagation(); // don't let OrbitControls intercept
  }
});

window.addEventListener('mousemove', (e) => {
  if (!panDragging || getCurrentMode() !== 'detail') return;
  const dx = e.clientX - panLastX;
  panDate   = new Date(panDate.getTime() + dx * DAYS_PER_PX * 86400000);
  if (panDate > today)    panDate = new Date(today);
  if (panDate < birthday) panDate = new Date(birthday);
  panDetailView(dateToPosition(panDate, birthday));
  panLastX = e.clientX;
});

window.addEventListener('mouseup', () => {
  if (panDragging) {
    panDragging = false;
    canvas.style.cursor = '';
  }
});

// ── Click detection (beads + surface navigation) ────────────────────────────
const clickRaycaster = new THREE.Raycaster();
const clickMouse     = new THREE.Vector2();
let   clickDownPos   = null;

canvas.addEventListener('mousedown', (e) => {
  clickDownPos = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('click', (e) => {
  // Ignore drags (moved > 5 px)
  if (clickDownPos &&
      Math.hypot(e.clientX - clickDownPos.x, e.clientY - clickDownPos.y) > 5) return;

  // Ignore clicks in the view-cube area
  if (isInCubeArea(e.clientX, e.clientY)) return;

  const mode = getCurrentMode();
  if (mode !== 'perspective' && mode !== 'plan' && mode !== 'detail') return;

  // Build NDC from click position
  clickMouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  clickMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  const activeCam = getActiveCamera();
  clickRaycaster.setFromCamera(clickMouse, activeCam);

  // ── 1. Check filled beads ────────────────────────────────────────────
  const beadMeshes = getAllBeadMeshes();
  if (beadMeshes.length) {
    const beadHits = clickRaycaster.intersectObjects(beadMeshes, false);
    if (beadHits.length) {
      const mesh  = beadHits[0].object;
      const entry = loadedEntries.find(en => en.id === mesh.userData.entryId);
      if (entry) {
        closeCreatePanel();
        openReadOverlay(entry, mesh.position);
        return;
      }
    }
  }

  // ── 2. Check empty beads (InstancedMesh) ─────────────────────────────
  const emptyMesh = getEmptyBeadMesh();
  if (emptyMesh) {
    const emptyHits = clickRaycaster.intersectObject(emptyMesh, false);
    if (emptyHits.length) {
      const instId = emptyHits[0].instanceId;
      // Perspective view: only allow if camera close enough
      if (mode === 'perspective') {
        const camDist = Math.sqrt(activeCam.position.x ** 2 + activeCam.position.z ** 2);
        if (camDist > 60) { /* too far — fall through to surface nav */ }
        else {
          _openCreateForInstance(instId);
          return;
        }
      } else {
        // Plan view: always allow
        _openCreateForInstance(instId);
        return;
      }
    }
  }

  // ── 3. Close any open overlay/panel on empty click ───────────────────
  closeReadOverlay();
  closeCreatePanel();

  // ── 4. Surface-click navigation (legacy) ─────────────────────────────
  const spiralHits = clickRaycaster.intersectObject(spiral, false);

  const effectiveTop = Math.min(spiralTopY, getSectionCutY());
  if (mode === 'perspective' && spiralHits.length && spiralHits[0].point.y > effectiveTop - 16) {
    setViewMode('plan', effectiveTop);
  } else if (mode === 'plan') {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    if (Math.hypot(e.clientX - cx, e.clientY - cy) < 150) {
      setViewMode('perspective', effectiveTop);
    }
  }
});

// ── Detail-view year indicator ───────────────────────────────────────────────
let _yearIndicatorEl = null;

function _getOrCreateYearIndicator() {
  if (_yearIndicatorEl) return _yearIndicatorEl;
  _yearIndicatorEl = document.createElement('div');
  Object.assign(_yearIndicatorEl.style, {
    position:      'fixed',
    bottom:        '24px',
    left:          '50%',
    transform:     'translateX(-50%)',
    zIndex:        '100',
    fontFamily:    'monospace',
    fontSize:      '13px',
    letterSpacing: '3px',
    color:         'rgba(255,245,230,0.7)',
    pointerEvents: 'none',
    display:       'none',
  });
  document.getElementById('app').appendChild(_yearIndicatorEl);
  return _yearIndicatorEl;
}

function _updateDetailYearIndicator(targetY) {
  const el = _getOrCreateYearIndicator();
  const yearsElapsed = targetY / 8;
  const DAYS_IN_YEAR = 365.25;
  const MS_PER_DAY   = 86400000;
  const d = new Date(birthday.getTime() + yearsElapsed * DAYS_IN_YEAR * MS_PER_DAY);
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  el.textContent = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  el.style.display = 'block';
}

function _hideDetailYearIndicator() {
  if (_yearIndicatorEl) _yearIndicatorEl.style.display = 'none';
}

/** Helper: open the create panel for a given empty-bead instance. */
function _openCreateForInstance(instanceId) {
  const dateISO = getEmptyBeadDate(instanceId);
  if (!dateISO) return;
  const pos = dateToPosition(new Date(dateISO), birthday);
  closeReadOverlay();
  openCreatePanel(dateISO, pos, async (data) => {
    try {
      const newEntry = await api.createEntry(data);
      loadedEntries.push(newEntry);
      addBead(newEntry, birthday);
      removeEmptyBeadInstance(instanceId);
      closeCreatePanel();
    } catch (err) {
      console.error('Failed to create entry:', err);
    }
  });
}

// ── Empty-bead hover reveal ─────────────────────────────────────────────────
let lastMouseEvent = null;

window.addEventListener('mousemove', (e) => {
  lastMouseEvent = e;
});

registerFrameCallback((cam) => {
  const mode = getCurrentMode();
  showEmptyBeadsNearMouse(lastMouseEvent, cam, mode);
});

// ── Keyboard: ribbon toggle only ────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    ribbonVisible = !ribbonVisible;
    ribbonMesh.visible = ribbonVisible;
  }
});

// ── Auth gate + entry loading ───────────────────────────────────────────────

let loadedEntries = [];

async function loadEntries() {
  loadedEntries = await api.getEntries();
  initBeads(loadedEntries, birthday);

  // Empty beads for all unfilled dates
  const filledDates = loadedEntries.map(e => e.entry_date);
  initEmptyBeads(birthday, filledDates);

  // Mood / Category toggle
  initColorModeToggle(() => toggleColorMode(loadedEntries));
}

function buildLoginForm() {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '1000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.85)',
  });

  const form = document.createElement('form');
  Object.assign(form.style, {
    display: 'flex', flexDirection: 'column', gap: '12px',
    padding: '32px', background: '#1a1008', borderRadius: '8px',
    border: '1px solid rgba(245,166,35,0.3)', minWidth: '280px',
    fontFamily: 'monospace', color: '#f5a623',
  });

  const title = document.createElement('div');
  title.textContent = 'OUROBOROS';
  Object.assign(title.style, {
    fontSize: '18px', fontWeight: 'bold', textAlign: 'center',
    letterSpacing: '4px', marginBottom: '8px',
  });

  const emailInput    = document.createElement('input');
  const passwordInput  = document.createElement('input');
  const birthdayInput  = document.createElement('input');
  const submitBtn      = document.createElement('button');
  const toggleLink     = document.createElement('a');
  const errorDiv       = document.createElement('div');

  for (const input of [emailInput, passwordInput, birthdayInput]) {
    Object.assign(input.style, {
      padding: '8px 12px', background: '#0d0804', border: '1px solid rgba(245,166,35,0.3)',
      borderRadius: '4px', color: '#fff5e6', fontFamily: 'monospace', fontSize: '14px',
    });
  }
  emailInput.type = 'email';       emailInput.placeholder = 'Email';
  passwordInput.type = 'password'; passwordInput.placeholder = 'Password';
  birthdayInput.type = 'date';     birthdayInput.placeholder = 'Birthday';
  birthdayInput.style.display = 'none'; // hidden until register mode

  Object.assign(submitBtn.style, {
    padding: '10px', background: '#f5a623', color: '#1a1008',
    border: 'none', borderRadius: '4px', fontFamily: 'monospace',
    fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', letterSpacing: '2px',
  });
  submitBtn.textContent = 'LOGIN';

  Object.assign(toggleLink.style, {
    color: 'rgba(245,166,35,0.6)', fontSize: '12px', textAlign: 'center',
    cursor: 'pointer', textDecoration: 'underline',
  });
  toggleLink.textContent = 'Need an account? Register';

  Object.assign(errorDiv.style, {
    color: '#ff6b6b', fontSize: '12px', textAlign: 'center', minHeight: '16px',
  });

  let isRegister = false;
  toggleLink.addEventListener('click', () => {
    isRegister = !isRegister;
    birthdayInput.style.display = isRegister ? 'block' : 'none';
    submitBtn.textContent       = isRegister ? 'REGISTER' : 'LOGIN';
    toggleLink.textContent      = isRegister
      ? 'Already have an account? Login'
      : 'Need an account? Register';
    errorDiv.textContent = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.textContent = '';
    try {
      if (isRegister) {
        await api.register({
          email: emailInput.value,
          password: passwordInput.value,
          birthday: birthdayInput.value,
        });
      }
      await api.login({
        email: emailInput.value,
        password: passwordInput.value,
      });
      overlay.remove();
      await loadEntries();
    } catch (err) {
      errorDiv.textContent = err.body?.error || err.message;
    }
  });

  form.append(title, emailInput, passwordInput, birthdayInput, submitBtn, errorDiv, toggleLink);
  overlay.appendChild(form);
  document.body.appendChild(overlay);
}

// Check session on load
(async () => {
  try {
    await api.me();
    await loadEntries();
  } catch (err) {
    if (err.status === 401) {
      buildLoginForm();
    }
  }
})();
