import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { positionPanelFacingCamera } from './panelManager.js';

const container = document.getElementById('app');

// WebGL renderer
const webgl = new THREE.WebGLRenderer({ antialias: true });
webgl.setSize(window.innerWidth, window.innerHeight);
webgl.setPixelRatio(window.devicePixelRatio);
webgl.localClippingEnabled = true; // required for per-material clipping planes
container.appendChild(webgl.domElement);

// CSS3D renderer
const css3d = new CSS3DRenderer();
css3d.setSize(window.innerWidth, window.innerHeight);
css3d.domElement.style.position = 'absolute';
css3d.domElement.style.top = '0';
css3d.domElement.style.left = '0';
css3d.domElement.style.pointerEvents = 'none';
container.appendChild(css3d.domElement);

// Camera — Perspective view to see spiral in 3D
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(0, 60, 80);
camera.lookAt(0, 160, 0);

// Orthographic camera — plan view (no vanishing point, infinite focal length)
// Spiral radius = 40; ORTHO_VIEW_SIZE adds comfortable padding beyond the outermost coil
const ORTHO_VIEW_SIZE = 55;
const orthoCamera = new THREE.OrthographicCamera(
  -ORTHO_VIEW_SIZE * (window.innerWidth / window.innerHeight),
   ORTHO_VIEW_SIZE * (window.innerWidth / window.innerHeight),
   ORTHO_VIEW_SIZE,
  -ORTHO_VIEW_SIZE,
  0.1,
  4000
);
orthoCamera.up.set(0, 0, -1); // north-up when looking straight down -Y

// Active camera — swapped between perspective and orthographic on mode change
let activeCamera = camera;

export function setActiveCamera(cam) {
  activeCamera = cam;
  controls.object = cam;
  controls.update();
}

export function getActiveCamera() { return activeCamera; }

// Scenes
const scene = new THREE.Scene();
const css3dScene = new THREE.Scene();

// Orbit controls — attach to WebGL canvas so mouse events work
const controls = new OrbitControls(camera, webgl.domElement);
controls.target.set(0, 160, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2; // prevent camera from going below ground
controls.maxDistance = 500; // limit zoom out
controls.zoomToCursor = true; // zoom towards mouse position

// Per-frame callbacks (e.g. ribbon label billboarding)
const frameCallbacks = [];

export function registerFrameCallback(fn) {
  frameCallbacks.push(fn);
}

// Panel tracking: array of { panel, anchorPosition }
const activePanels = [];

export function registerPanel(panel, anchorPosition) {
  activePanels.push({ panel, anchorPosition });
}

// Resize handler
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;

  camera.aspect = aspect;
  camera.updateProjectionMatrix();

  orthoCamera.left   = -ORTHO_VIEW_SIZE * aspect;
  orthoCamera.right  =  ORTHO_VIEW_SIZE * aspect;
  orthoCamera.updateProjectionMatrix();

  webgl.setSize(w, h);
  css3d.setSize(w, h);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Clamp camera above ground plane (zoomToCursor can push it below)
  if (camera.position.y < 1) camera.position.y = 1;

  // Update panel positions each frame
  for (const { panel, anchorPosition } of activePanels) {
    positionPanelFacingCamera(panel, anchorPosition, activeCamera);
  }

  // Run registered frame callbacks
  for (const fn of frameCallbacks) {
    fn(activeCamera);
  }

  webgl.render(scene, activeCamera);
  css3d.render(css3dScene, activeCamera);
}

export function initRenderer() {
  animate();
}

export { webgl, css3d, camera, orthoCamera, scene, css3dScene, controls };
