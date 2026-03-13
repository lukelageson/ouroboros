import { initRenderer, registerFrameCallback } from './three/renderer.js';
import { initScene } from './three/scene.js';
import { updateRibbonLabels } from './three/ribbon.js';
import { setViewMode, advanceTransition } from './three/cameraController.js';

initRenderer();
const { ribbonMesh, dividerObjects, labels, spiralTopY } = initScene();

let ribbonVisible = true;

// Camera transition — advances each frame (runs after controls.update)
registerFrameCallback(() => {
  advanceTransition();
});

// Ribbon visibility — culling + shader uniforms each frame
registerFrameCallback((camera) => {
  updateRibbonLabels(labels, dividerObjects, ribbonMesh, camera, ribbonVisible);
});

// Start in Plan View
setViewMode('plan', spiralTopY);

// Keyboard controls
window.addEventListener('keydown', (e) => {
  if (e.key === '1') setViewMode('plan', spiralTopY);
  if (e.key === '2') setViewMode('perspective', spiralTopY);
  if (e.key === 'r' || e.key === 'R') {
    ribbonVisible = !ribbonVisible;
    ribbonMesh.visible = ribbonVisible;
    // labels and dividerObjects handled per-frame in updateRibbonLabels
  }
});
