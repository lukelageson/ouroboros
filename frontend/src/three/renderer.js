import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { positionPanelFacingCamera } from './panelManager.js';

const container = document.getElementById('app');

// WebGL renderer
const webgl = new THREE.WebGLRenderer({ antialias: true });
webgl.setSize(window.innerWidth, window.innerHeight);
webgl.setPixelRatio(window.devicePixelRatio);
container.appendChild(webgl.domElement);

// CSS3D renderer
const css3d = new CSS3DRenderer();
css3d.setSize(window.innerWidth, window.innerHeight);
css3d.domElement.style.position = 'absolute';
css3d.domElement.style.top = '0';
css3d.domElement.style.left = '0';
css3d.domElement.style.pointerEvents = 'none';
container.appendChild(css3d.domElement);

// Camera — Plan View default: looking straight down
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 80, 0);
camera.lookAt(0, 0, 0);

// Scenes
const scene = new THREE.Scene();
const css3dScene = new THREE.Scene();

// Orbit controls — attach to WebGL canvas so mouse events work
const controls = new OrbitControls(camera, webgl.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Panel tracking: array of { panel, anchorPosition }
const activePanels = [];

export function registerPanel(panel, anchorPosition) {
  activePanels.push({ panel, anchorPosition });
}

// Resize handler
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  webgl.setSize(w, h);
  css3d.setSize(w, h);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Update panel positions each frame
  for (const { panel, anchorPosition } of activePanels) {
    positionPanelFacingCamera(panel, anchorPosition, camera);
  }

  webgl.render(scene, camera);
  css3d.render(css3dScene, camera);
}

export function initRenderer() {
  animate();
}

export { webgl, css3d, camera, scene, css3dScene };
