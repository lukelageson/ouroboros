/**
 * viewCube.js
 *
 * A small orientation cube rendered in the bottom-right corner of the viewport.
 * Mirrors the main camera's quaternion so the user always knows which way is
 * "plan" (top) vs "perspective" (front).  Clicking a labelled face triggers
 * the corresponding setViewMode().
 *
 * Rendered via setViewport / setScissor — no DOM elements at all.
 */

import * as THREE from 'three';

// ── Layout ──────────────────────────────────────────────────────────────────
const CUBE_PX     = 100;   // viewport square, CSS px
const CUBE_MARGIN = 24;    // inset from window edges

// ── Colours ─────────────────────────────────────────────────────────────────
const BASE   = '#1a1008';
const AMBER  = '#f5a623';
const EDGE   = 'rgba(245, 166, 35, 0.3)';

// ── Face mapping ────────────────────────────────────────────────────────────
// Three.js BoxGeometry materialIndex order: +X, –X, +Y, –Y, +Z, –Z
const FACES = [
  { label: 'DETAIL', mode: 'detail'      },  // 0  +X  right
  { label: '',       mode: 'detail'      },  // 1  –X  left
  { label: 'PLAN',   mode: 'plan'        },  // 2  +Y  top
  { label: '',       mode: null          },  // 3  –Y  bottom (no-op)
  { label: 'PERSP',  mode: 'perspective' },  // 4  +Z  front
  { label: '',       mode: 'detail'      },  // 5  –Z  back
];

// ── Module state ────────────────────────────────────────────────────────────
let renderer, mainCamera, mainControls;
let cubeScene, cubeCamera, cubeMesh;
let materials  = [];
let raycaster, mouseVec;
let hoveredIdx = -1;
let onModeFn;          // callback(mode) provided by main.js

// ── Canvas texture factory ──────────────────────────────────────────────────

function makeTexture(label, hovered) {
  const c   = document.createElement('canvas');
  c.width   = 128;
  c.height  = 128;
  const ctx = c.getContext('2d');

  // Fill
  ctx.fillStyle = hovered ? AMBER : BASE;
  ctx.fillRect(0, 0, 128, 128);

  // Edge highlight
  ctx.strokeStyle = hovered ? BASE : EDGE;
  ctx.lineWidth   = 3;
  ctx.strokeRect(2, 2, 124, 124);

  // Label
  if (label) {
    ctx.fillStyle    = hovered ? BASE : AMBER;
    ctx.font         = 'bold 22px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, 64);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

// ── Hover helpers ───────────────────────────────────────────────────────────

function setHovered(idx) {
  if (idx === hoveredIdx) return;

  // un-hover previous
  if (hoveredIdx >= 0) {
    const old = FACES[hoveredIdx];
    materials[hoveredIdx].map.dispose();
    materials[hoveredIdx].map         = makeTexture(old.label, false);
    materials[hoveredIdx].needsUpdate = true;
  }

  hoveredIdx = idx;

  // hover new
  if (idx >= 0) {
    const cur = FACES[idx];
    materials[idx].map.dispose();
    materials[idx].map         = makeTexture(cur.label, true);
    materials[idx].needsUpdate = true;
  }
}

// ── Viewport helpers ────────────────────────────────────────────────────────

function viewport() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Three.js setViewport/setScissor use CSS px (auto-scaled by DPR internally)
  const x = w - CUBE_PX - CUBE_MARGIN;
  const y = CUBE_MARGIN;   // WebGL Y=0 is bottom of canvas

  return {
    x, y, w: CUBE_PX, h: CUBE_PX,
    // CSS coords for mouse hit-testing (Y=0 is top of window)
    cssL: x,
    cssT: h - CUBE_PX - CUBE_MARGIN,
    cssW: CUBE_PX,
    cssH: CUBE_PX,
  };
}

/** True when (clientX, clientY) lands inside the cube viewport. */
export function isInCubeArea(clientX, clientY) {
  const vp = viewport();
  return (
    clientX >= vp.cssL && clientX <= vp.cssL + vp.cssW &&
    clientY >= vp.cssT && clientY <= vp.cssT + vp.cssH
  );
}

function hitTest(clientX, clientY) {
  const vp = viewport();
  mouseVec.x =  ((clientX - vp.cssL) / vp.cssW) * 2 - 1;
  mouseVec.y = -((clientY - vp.cssT) / vp.cssH) * 2 + 1;
  raycaster.setFromCamera(mouseVec, cubeCamera);
  const hits = raycaster.intersectObject(cubeMesh);
  if (hits.length) return Math.floor(hits[0].faceIndex / 2);
  return -1;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the view-cube scene.
 *
 * @param {THREE.WebGLRenderer} webgl
 * @param {THREE.PerspectiveCamera} cam       main scene camera
 * @param {OrbitControls}          ctrl       main orbit controls
 * @param {function(string)}       onMode     callback when a face is clicked
 */
export function initViewCube(webgl, cam, ctrl, onMode) {
  renderer     = webgl;
  mainCamera   = cam;
  mainControls = ctrl;
  onModeFn     = onMode;

  // ── Scene ──────────────────────────────────────────────────────────────
  cubeScene  = new THREE.Scene();
  cubeCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

  // Even lighting so every face is visible
  cubeScene.add(new THREE.AmbientLight(0xffffff, 1));

  // ── Cube mesh (6 canvas-textured faces) ────────────────────────────────
  materials = FACES.map(f =>
    new THREE.MeshBasicMaterial({ map: makeTexture(f.label, false) })
  );
  cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials);
  cubeScene.add(cubeMesh);

  // ── Raycaster ──────────────────────────────────────────────────────────
  raycaster = new THREE.Raycaster();
  mouseVec  = new THREE.Vector2();

  // ── Mouse events ───────────────────────────────────────────────────────
  window.addEventListener('mousemove', (e) => {
    if (!isInCubeArea(e.clientX, e.clientY)) {
      setHovered(-1);
      document.body.style.cursor = '';
      return;
    }
    const fi = hitTest(e.clientX, e.clientY);
    setHovered(fi);
    document.body.style.cursor =
      fi >= 0 && FACES[fi].mode ? 'pointer' : '';
  });

  window.addEventListener('click', (e) => {
    if (!isInCubeArea(e.clientX, e.clientY)) return;
    const fi = hitTest(e.clientX, e.clientY);
    if (fi >= 0 && FACES[fi].mode) {
      onModeFn(FACES[fi].mode);
    }
  });
}

/**
 * Sync cube-camera orientation to the main camera.
 * Call once per frame (via registerFrameCallback).
 */
export function updateViewCube() {
  if (!cubeCamera || !mainCamera) return;
  const dir = new THREE.Vector3()
    .subVectors(mainCamera.position, mainControls.target)
    .normalize()
    .multiplyScalar(2.5);
  cubeCamera.position.copy(dir);
  cubeCamera.up.copy(mainCamera.up);
  cubeCamera.lookAt(0, 0, 0);
}

/**
 * Render the view cube in the bottom-right viewport.
 * Call AFTER the main scene render (via registerPostRenderCallback).
 */
export function renderViewCube() {
  if (!renderer || !cubeScene || !cubeCamera) return;

  const vp = viewport();

  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;

  renderer.setScissorTest(true);
  renderer.setViewport(vp.x, vp.y, vp.w, vp.h);
  renderer.setScissor(vp.x, vp.y, vp.w, vp.h);

  // Clear colour + depth in the cube region so it draws on top
  renderer.setClearColor(0x0a0a0a, 1);
  renderer.clear(true, true, false);

  renderer.render(cubeScene, cubeCamera);

  // Restore
  renderer.autoClear = prevAutoClear;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
}
