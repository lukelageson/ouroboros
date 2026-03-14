import { initRenderer, registerFrameCallback } from './three/renderer.js';
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

// ── Frame callbacks ─────────────────────────────────────────────────────────
registerFrameCallback(() => {
  advanceTransition();
  updateSpiralMaterial(isPlanMode());

  // Show / hide section-cut slider based on settled view mode
  const mode = getCurrentMode();
  if (mode === 'perspective') showSectionCutSlider();
  else                        hideSectionCutSlider();
});

registerFrameCallback((camera) => {
  updateRibbonLabels(
    labels, dividerObjects, ribbonMesh,
    camera, ribbonVisible,
    isPlanMode(), spiralTopY
  );
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

// ── Keyboard controls ────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.key === '1') {
    setViewMode('plan', spiralTopY);
  }
  if (e.key === '2') {
    setViewMode('perspective', spiralTopY);
  }
  if (e.key === '3') {
    // Reset pan to today, then enter detail view
    panDate = new Date(today);
    setViewMode('detail', spiralTopY, { panPos: todayPos });
  }
  if (e.key === 'r' || e.key === 'R') {
    ribbonVisible = !ribbonVisible;
    ribbonMesh.visible = ribbonVisible;
  }
});
