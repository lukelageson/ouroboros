import { initRenderer, registerFrameCallback } from './three/renderer.js';
import { initScene } from './three/scene.js';
import { updateRibbonLabels } from './three/ribbon.js';

initRenderer();
const { ribbonMesh, dividerObjects, labels } = initScene();

let ribbonVisible = true;

// Update ribbon visibility each frame (culling + shader uniforms)
registerFrameCallback((camera) => {
  updateRibbonLabels(labels, dividerObjects, ribbonMesh, camera, ribbonVisible);
});

// R key toggles ribbon mesh and all ribbon elements
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    ribbonVisible = !ribbonVisible;
    ribbonMesh.visible = ribbonVisible;
    // labels and dividerObjects handled per-frame in updateRibbonLabels
  }
});
