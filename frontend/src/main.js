import { initRenderer, registerFrameCallback } from './three/renderer.js';
import { initScene } from './three/scene.js';
import { updateRibbonLabels } from './three/ribbon.js';

initRenderer();
const { ribbonMesh, dividerLines, labels } = initScene();

let ribbonVisible = true;

// Update ribbon label visibility each frame (far-side culling + toggle)
registerFrameCallback((camera) => {
  updateRibbonLabels(labels, camera, ribbonVisible);
});

// R key toggles ribbon, dividers, and labels
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    ribbonVisible = !ribbonVisible;
    ribbonMesh.visible = ribbonVisible;
    dividerLines.visible = ribbonVisible;
    // labels are handled per-frame in updateRibbonLabels
  }
});
