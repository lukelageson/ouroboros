/**
 * viewCube.js
 *
 * Interactive orientation cube in the bottom-right corner.
 * - Faces   → plan view      (hover shows "PLAN" label)
 * - Edges   → perspective    (hover shows "PERSPECTIVE" label, edges glow amber)
 * - Corners → detail view    (hover shows "DETAIL" label, corner dot enlarges)
 *
 * Hit priority: corners first → UV-proximity edge check → face center.
 * DOM label appears to the left of the cube on hover.
 */

import * as THREE from 'three';

// ── Layout ───────────────────────────────────────────────────────────────────
const CUBE_PX     = 100;
const CUBE_MARGIN = 24;   // inset from window edges (aligned with slider)
const EDGE_UV_THR = 0.18; // UV proximity to face edge → counts as edge hit

// ── Colors ───────────────────────────────────────────────────────────────────
const BASE_HEX  = 0x1a1008;
const AMBER_HEX = 0xf5a623;

// ── Module state ─────────────────────────────────────────────────────────────
let renderer, mainCamera, mainControls;
let cubeScene, cubeCamera;
let cubeMesh;           // Box — face + edge detection via UV
let edgeLines;          // LineSegments — visual edge glow
let cornerMeshes = [];  // 8 SphereGeometry meshes at cube corners
let faceMat;
let edgeMat;
let raycaster, mouseVec;
let hoveredType   = null;  // 'face' | 'edge' | 'corner' | null
let hoveredCorner = -1;
let labelEl       = null;
let onModeFn;

// ── Viewport ─────────────────────────────────────────────────────────────────

function _viewport() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = w - CUBE_PX - CUBE_MARGIN;
  const y = CUBE_MARGIN;
  return {
    x, y, w: CUBE_PX, h: CUBE_PX,
    cssL: x,
    cssT: h - CUBE_PX - CUBE_MARGIN,
    cssW: CUBE_PX,
    cssH: CUBE_PX,
  };
}

export function isInCubeArea(clientX, clientY) {
  const vp = _viewport();
  return (
    clientX >= vp.cssL && clientX <= vp.cssL + vp.cssW &&
    clientY >= vp.cssT && clientY <= vp.cssT + vp.cssH
  );
}

// ── Hit testing ──────────────────────────────────────────────────────────────

function _hitTest(clientX, clientY) {
  const vp = _viewport();
  mouseVec.x =  ((clientX - vp.cssL) / vp.cssW) * 2 - 1;
  mouseVec.y = -((clientY - vp.cssT) / vp.cssH) * 2 + 1;
  raycaster.setFromCamera(mouseVec, cubeCamera);

  // 1. Corners first
  const cHits = raycaster.intersectObjects(cornerMeshes, false);
  if (cHits.length) {
    return { type: 'corner', cornerIdx: cornerMeshes.indexOf(cHits[0].object) };
  }

  // 2. Box face / edge via UV proximity
  const bHits = raycaster.intersectObject(cubeMesh, false);
  if (bHits.length) {
    const uv = bHits[0].uv;
    if (uv) {
      const nearEdge =
        uv.x < EDGE_UV_THR || uv.x > 1 - EDGE_UV_THR ||
        uv.y < EDGE_UV_THR || uv.y > 1 - EDGE_UV_THR;
      return { type: nearEdge ? 'edge' : 'face' };
    }
    return { type: 'face' };
  }

  return null;
}

// ── Visual hover state ────────────────────────────────────────────────────────

const TYPE_LABEL = { face: 'PLAN', edge: 'PERSPECTIVE', corner: 'DETAIL' };

function _applyHover(result) {
  const type = result ? result.type : null;
  const cIdx = result ? (result.cornerIdx ?? -1) : -1;

  if (type === hoveredType && cIdx === hoveredCorner) return;

  // Reset previous corner
  if (hoveredCorner >= 0 && cornerMeshes[hoveredCorner]) {
    cornerMeshes[hoveredCorner].scale.setScalar(1.0);
    cornerMeshes[hoveredCorner].material.emissiveIntensity = 0.25;
  }

  hoveredType   = type;
  hoveredCorner = cIdx;

  // Face box
  faceMat.color.set(type === 'face' ? AMBER_HEX : BASE_HEX);
  faceMat.opacity = type === 'face' ? 0.55 : 0;  // fully transparent when not hovered

  // Edge lines
  edgeMat.color.set(type === 'edge' ? AMBER_HEX : 0xfff5e6);
  edgeMat.opacity = type === 'edge' ? 0.9 : 0.3;

  // Corner dot
  if (cIdx >= 0 && cornerMeshes[cIdx]) {
    cornerMeshes[cIdx].scale.setScalar(1.6);
    cornerMeshes[cIdx].material.emissiveIntensity = 1.0;
  }

  // DOM label
  if (labelEl) {
    if (type) {
      labelEl.textContent   = TYPE_LABEL[type];
      labelEl.style.display = 'block';
    } else {
      labelEl.style.display = 'none';
    }
  }

  document.body.style.cursor = type ? 'pointer' : '';
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initViewCube(webgl, cam, ctrl, onMode) {
  renderer     = webgl;
  mainCamera   = cam;
  mainControls = ctrl;
  onModeFn     = onMode;

  cubeScene  = new THREE.Scene();
  cubeCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  cubeScene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const dirLight = new THREE.DirectionalLight(0xffe8c0, 0.6);
  dirLight.position.set(3, 5, 3);
  cubeScene.add(dirLight);

  // ── Box faces ───────────────────────────────────────────────────────────
  faceMat  = new THREE.MeshBasicMaterial({
    color:      BASE_HEX,
    transparent: true,
    opacity:    0,   // transparent background
    depthWrite: false,
  });
  cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), faceMat);
  cubeScene.add(cubeMesh);

  // ── Edge lines (visual only) ────────────────────────────────────────────
  edgeMat   = new THREE.LineBasicMaterial({
    color:      0xfff5e6,
    transparent: true,
    opacity:    0.3,
  });
  edgeLines = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    edgeMat
  );
  cubeScene.add(edgeLines);

  // ── Corner dots ─────────────────────────────────────────────────────────
  const CORNER_POSITIONS = [
    [-0.5, -0.5, -0.5], [ 0.5, -0.5, -0.5],
    [-0.5,  0.5, -0.5], [ 0.5,  0.5, -0.5],
    [-0.5, -0.5,  0.5], [ 0.5, -0.5,  0.5],
    [-0.5,  0.5,  0.5], [ 0.5,  0.5,  0.5],
  ];
  const cornerGeo = new THREE.SphereGeometry(0.09, 8, 6);
  cornerMeshes = CORNER_POSITIONS.map(([x, y, z]) => {
    const mat  = new THREE.MeshStandardMaterial({
      color:             AMBER_HEX,
      emissive:          new THREE.Color(AMBER_HEX),
      emissiveIntensity: 0.25,
    });
    const mesh = new THREE.Mesh(cornerGeo, mat);
    mesh.position.set(x, y, z);
    cubeScene.add(mesh);
    return mesh;
  });

  // ── DOM label (left of cube) ────────────────────────────────────────────
  labelEl = document.createElement('div');
  Object.assign(labelEl.style, {
    position:      'fixed',
    right:         `${CUBE_MARGIN + CUBE_PX + 14}px`,
    bottom:        `${CUBE_MARGIN + Math.round(CUBE_PX / 2) - 7}px`,
    fontFamily:    'monospace',
    fontSize:      '10px',
    letterSpacing: '2px',
    color:         'rgba(245, 166, 35, 0.75)',
    pointerEvents: 'none',
    zIndex:        '200',
    display:       'none',
    textAlign:     'right',
    textTransform: 'uppercase',
    whiteSpace:    'nowrap',
  });
  document.body.appendChild(labelEl);

  // ── Raycaster ───────────────────────────────────────────────────────────
  raycaster = new THREE.Raycaster();
  mouseVec  = new THREE.Vector2();

  // ── Mouse events ────────────────────────────────────────────────────────
  window.addEventListener('mousemove', (e) => {
    if (!isInCubeArea(e.clientX, e.clientY)) {
      _applyHover(null);
      return;
    }
    _applyHover(_hitTest(e.clientX, e.clientY));
  });

  window.addEventListener('click', (e) => {
    if (!isInCubeArea(e.clientX, e.clientY)) return;
    const hit = _hitTest(e.clientX, e.clientY);
    if (!hit) return;
    const modeMap = { face: 'plan', edge: 'perspective', corner: 'detail' };
    const mode    = modeMap[hit.type];
    if (mode) onModeFn(mode);
  });
}

// ── Per-frame: sync cube camera to main camera ────────────────────────────────

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

// ── Post-render: draw cube in bottom-right scissor region ─────────────────────

export function renderViewCube() {
  if (!renderer || !cubeScene || !cubeCamera) return;

  const vp = _viewport();
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;

  renderer.setScissorTest(true);
  renderer.setViewport(vp.x, vp.y, vp.w, vp.h);
  renderer.setScissor(vp.x, vp.y, vp.w, vp.h);
  renderer.setClearColor(0x0a0a0a, 1);
  renderer.clear(true, true, false);
  renderer.render(cubeScene, cubeCamera);

  renderer.autoClear = prevAutoClear;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
}
