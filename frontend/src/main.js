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

// ── Keyboard: ribbon toggle only ────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    ribbonVisible = !ribbonVisible;
    ribbonMesh.visible = ribbonVisible;
  }
});
