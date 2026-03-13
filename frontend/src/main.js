import { initRenderer, registerFrameCallback, scene, css3dScene } from './three/renderer.js';
import { initScene } from './three/scene.js';
import { updateRibbonLabels } from './three/ribbon.js';

initRenderer();
const { ribbonMesh, labels } = initScene();

// Billboard ribbon labels each frame
registerFrameCallback((camera) => {
  updateRibbonLabels(labels, camera);
});

// R key toggles ribbon and labels visibility
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    const visible = !ribbonMesh.visible;
    ribbonMesh.visible = visible;
    for (const label of labels) {
      label.visible = visible;
    }
  }
});
