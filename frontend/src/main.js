import * as THREE from 'three';
import {
  initRenderer, registerFrameCallback, registerPostRenderCallback,
  webgl, camera, controls, scene,
} from './three/renderer.js';
import { initScene }                           from './three/scene.js';
import { updateRibbonLabels }                  from './three/ribbon.js';
import {
  setViewMode, advanceTransition,
  isPlanMode, isDetailMode, getCurrentMode,
  panDetailView,
} from './three/cameraController.js';
import { updateSpiralMaterial } from './three/spiralGeometry.js';
import { dateToPosition }       from './three/spiralMath.js';
import {
  initSectionCut,
  showSectionCutSlider,
  hideSectionCutSlider,
} from './three/sectionCut.js';
import {
  initViewCube, updateViewCube, renderViewCube, isInCubeArea,
} from './three/viewCube.js';
import * as api from './api.js';
import { initBeads } from './three/beads.js';
import { initEmptyBeads, showEmptyBeadsNearMouse } from './three/emptyBeads.js';
import { toggleColorMode, initColorModeToggle } from './three/colorMode.js';

// ── Init ────────────────────────────────────────────────────────────────────
initRenderer();
const {
  ribbonMesh, dividerObjects, labels,
  spiralTopY, spiral,
  birthday, today,
} = initScene();

let ribbonVisible = true;

// Compute today's position on the spiral for the initial detail-view pan
const todayPos = dateToPosition(today, birthday);

// Section cut: global clip plane + slider UI
initSectionCut(spiralTopY, birthday);
hideSectionCutSlider(); // hidden until perspective view is active

// ── View Cube ───────────────────────────────────────────────────────────────
initViewCube(webgl, camera, controls, (mode) => {
  if (mode === 'detail') {
    panDate = new Date(today);
    setViewMode('detail', spiralTopY, { panPos: todayPos });
  } else {
    setViewMode(mode, spiralTopY);
  }
});

// ── Frame callbacks ─────────────────────────────────────────────────────────
registerFrameCallback(() => {
  advanceTransition();
  updateSpiralMaterial(isPlanMode());
  updateViewCube();

  // Show / hide section-cut slider based on settled view mode
  const mode = getCurrentMode();
  if (mode === 'perspective') showSectionCutSlider();
  else                        hideSectionCutSlider();
});

registerFrameCallback((cam) => {
  updateRibbonLabels(
    labels, dividerObjects, ribbonMesh,
    cam, ribbonVisible,
    isPlanMode(), spiralTopY
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

// ── Surface-click navigation ────────────────────────────────────────────────
// Perspective view: click near spiral top → plan
// Plan view:        click near centre     → perspective

const surfaceRaycaster = new THREE.Raycaster();
const surfaceMouse     = new THREE.Vector2();
let   clickDownPos     = null;

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
  if (mode !== 'perspective' && mode !== 'plan') return;

  // Build NDC from click position
  surfaceMouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  surfaceMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  surfaceRaycaster.setFromCamera(surfaceMouse, camera);

  const hits = surfaceRaycaster.intersectObject(spiral, false);

  if (mode === 'perspective' && hits.length && hits[0].point.y > spiralTopY - 16) {
    // Clicked near the top of the spiral → switch to plan
    setViewMode('plan', spiralTopY);
  } else if (mode === 'plan') {
    // Click inside the spiral hole (near viewport centre) → perspective
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    if (Math.hypot(e.clientX - cx, e.clientY - cy) < 150) {
      setViewMode('perspective', spiralTopY);
    }
  }
});

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
