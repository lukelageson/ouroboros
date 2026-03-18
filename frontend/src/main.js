import * as THREE from 'three';
import {
  initRenderer, registerFrameCallback, registerPostRenderCallback,
  webgl, camera, controls, scene, getActiveCamera,
} from './three/renderer.js';
import { initScene }                           from './three/scene.js';
import {
  updateRibbonLabels, updateRibbonResolution,
} from './three/ribbon.js';
import {
  updateSpiralVisibility, updateSpiralResolution, updateSpiralLineWidth,
} from './three/spiralGeometry.js';
import {
  setViewMode, advanceTransition,
  isPlanMode, isDetailMode, getCurrentMode,
  setPlanTargetY,
  applyDetailZoom,
  worldToDetailScreen, getDetailCropScale,
  moveDetailCamera,
  onResizeDetailView,
} from './three/cameraController.js';
import { dateToPosition, dateToAngle } from './three/spiralMath.js';
import {
  initSectionCut,
  showSectionCutSlider,
  hideSectionCutSlider,
  getSectionCutY,
  setSectionCutY,
  getSectionCutDate,
  getFloorDate,
} from './three/sectionCut.js';
import {
  initViewCube, updateViewCube, renderViewCube, isInCubeArea,
} from './three/viewCube.js';
import * as api from './api.js';
import { initBeads, addBead, getAllBeadMeshes } from './three/beads.js';
import {
  initEmptyBeads, showEmptyBeadsNearMouse,
  getEmptyBeadMesh, getEmptyBeadDate, removeEmptyBeadInstance,
  setHoveredEmptyBead, isEmptyBeadVisible,
} from './three/emptyBeads.js';
import { toggleColorMode, initColorModeToggle } from './three/colorMode.js';
import { setPanelViewMode }                     from './three/panelManager.js';
import { openReadOverlay, closeReadOverlay }    from './three/popups/readOverlay.js';
import {
  openCreatePanel, closeCreatePanel, isCreatePanelOpen,
} from './three/popups/createPanel.js';
import {
  initTodaysBubble, dismissTodaysBubble,
  getTodayBubbleMesh, getTodayBubblePos,
} from './three/todaysBubble.js';
import { getBeadMesh } from './three/beads.js';
import {
  updateDetailLabels, clearDetailLabels,
} from './three/popups/detailLabels.js';
import {
  initRadialDateLine, updateRadialDateLine,
  getSelectedDayOfYear, setRadialDateLineVisible, onDateLineChange,
  setLoadedEntries,
} from './three/radialDateLine.js';
import {
  initEntryColumn, updateEntryColumn, showEntryColumn, hideEntryColumn,
} from './ui/entryColumn.js';

// ── Init ──────────────────────────────────────────────────────────────────────
initRenderer();
const {
  ribbonGroup, arcSegments, dividerObjects, labels,
  spiralGroup, spiralSegments,
  spiralTopY, birthday, today, ground,
} = initScene();

let ribbonVisible = true;

let _lastResizeW = window.innerWidth;
let _lastResizeH = window.innerHeight;

window.addEventListener('resize', () => {
  const oldW = _lastResizeW;
  const oldH = _lastResizeH;
  _lastResizeW = window.innerWidth;
  _lastResizeH = window.innerHeight;

  if (spiralSegments.length) updateSpiralResolution(spiralSegments);
  updateRibbonResolution(arcSegments, dividerObjects);
  onResizeDetailView(oldW, oldH);
});

const todayPos = dateToPosition(today, birthday);

initSectionCut(spiralTopY, birthday);
hideSectionCutSlider();

initRadialDateLine(spiralTopY, birthday);
initEntryColumn();
onDateLineChange((doy) => {
  updateEntryColumn(doy, getSectionCutDate(), loadedEntries, birthday);
});

// ── Detail focus date (tracks the spiral point at the center of detail view) ──
let _detailFocusDate = null;

// ── View Cube ─────────────────────────────────────────────────────────────────
initViewCube(webgl, camera, controls, (mode) => {
  const effectiveTop = Math.min(spiralTopY, getSectionCutY());
  if (mode === 'detail') {
    setSectionCutY(spiralTopY);
    _detailFocusDate = new Date();
    let detailFocusPos = todayPos;
    if (loadedEntries && loadedEntries.length > 0) {
      const latest = loadedEntries.reduce((a, b) =>
        new Date(a.entry_date) > new Date(b.entry_date) ? a : b
      );
      _detailFocusDate = new Date(latest.entry_date);
      detailFocusPos = dateToPosition(_detailFocusDate, birthday);
    }
    setViewMode('detail', spiralTopY, { todayPos: detailFocusPos });
  } else {
    _detailFocusDate = null;
    setViewMode(mode, effectiveTop);
  }
});

// ── Ground reflection: exclude dense empty beads from the Reflector render ────
if (ground && ground.onBeforeRender) {
  const _origGroundBeforeRender = ground.onBeforeRender;
  ground.onBeforeRender = function (renderer, scn, cam, geo, mat, grp) {
    const emptyMesh = getEmptyBeadMesh();
    const wasVisible = emptyMesh?.visible;
    if (emptyMesh) emptyMesh.visible = false;
    _origGroundBeforeRender.call(this, renderer, scn, cam, geo, mat, grp);
    if (emptyMesh && wasVisible !== undefined) emptyMesh.visible = wasVisible;
  };
}

// ── Frame callbacks ───────────────────────────────────────────────────────────
registerFrameCallback(() => {
  advanceTransition();
  updateViewCube();

  const mode = getCurrentMode();
  if (mode === 'perspective' || mode === 'plan' || mode === 'detail') {
    showSectionCutSlider();
  } else {
    hideSectionCutSlider();
  }

  if (mode === 'plan') setPlanTargetY(getSectionCutY());

  if (mode === 'detail') {
    if (ground) ground.visible = false;
    updateDetailLabels(loadedEntries, birthday, camera, controls.target.y, true);
  } else {
    clearDetailLabels();
    if (ground) ground.visible = (mode === 'perspective');
  }

  setPanelViewMode(mode || 'perspective');

  const inPlan = mode === 'plan';
  setRadialDateLineVisible(inPlan);
  if (inPlan) {
    updateRadialDateLine(getSectionCutDate());
    showEntryColumn();
    updateEntryColumn(getSelectedDayOfYear(), getSectionCutDate(), loadedEntries, birthday);
  } else {
    hideEntryColumn();
  }
});

registerFrameCallback((cam) => {
  const mode        = getCurrentMode();
  const ceilingDate = getSectionCutDate();
  const floorDate   = isDetailMode() ? getFloorDate() : null;

  if (spiralSegments.length) {
    updateSpiralVisibility(spiralSegments, ceilingDate, floorDate, isPlanMode());
    const camHDist = Math.sqrt(cam.position.x ** 2 + cam.position.z ** 2);
    updateSpiralLineWidth(spiralSegments, camHDist, mode);
  }

  updateRibbonLabels(
    labels, dividerObjects, ribbonGroup,
    cam, ribbonVisible,
    isPlanMode(), spiralTopY, getSectionCutY(), isDetailMode(),
    arcSegments, ceilingDate, floorDate
  );
});

registerPostRenderCallback(() => {
  renderViewCube();
});

// ── Start in Perspective View ──────────────────────────────────────────────────
setViewMode('perspective', spiralTopY);

// ── Click detection ───────────────────────────────────────────────────────────
const canvas = document.querySelector('canvas');
const clickRaycaster = new THREE.Raycaster();
const clickMouse     = new THREE.Vector2();
let   clickDownPos   = null;

canvas.addEventListener('mousedown', (e) => {
  clickDownPos = { x: e.clientX, y: e.clientY };

  if (getCurrentMode() === 'detail' && !isCreatePanelOpen()) {
    _isDetailPanning  = true;
    _panDownX         = e.clientX;
    _panDownY         = e.clientY;
  }
});

canvas.addEventListener('click', (e) => {
  if (clickDownPos &&
      Math.hypot(e.clientX - clickDownPos.x, e.clientY - clickDownPos.y) > 5) return;
  if (isInCubeArea(e.clientX, e.clientY)) return;

  const mode = getCurrentMode();
  if (mode !== 'perspective' && mode !== 'plan' && mode !== 'detail') return;

  clickMouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  clickMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  const activeCam = getActiveCamera();
  clickRaycaster.setFromCamera(clickMouse, activeCam);

  // ── 1. Filled beads ──────────────────────────────────────────────────
  const beadMeshes = getAllBeadMeshes();
  if (beadMeshes.length) {
    const beadHits = clickRaycaster.intersectObjects(beadMeshes, false);
    if (beadHits.length) {
      const mesh  = beadHits[0].object;
      const entry = loadedEntries.find(en => en.id === mesh.userData.entryId);
      if (entry) {
        closeCreatePanel();
        closeReadOverlay();
        openReadOverlay(entry, mesh.position);
        return;
      }
    }
  }

  // ── 2. Today's bubble ─────────────────────────────────────────────────
  const todayMesh = getTodayBubbleMesh();
  if (todayMesh) {
    const todayHits = clickRaycaster.intersectObject(todayMesh, false);
    if (todayHits.length) {
      const todayISO = new Date().toISOString().slice(0, 10);
      closeReadOverlay();
      openCreatePanel(todayISO, getTodayBubblePos(), async (data) => {
        try {
          const newEntry = await api.createEntry(data);
          loadedEntries.push(newEntry);
          addBead(newEntry, birthday, true);
          dismissTodaysBubble();
          closeCreatePanel();
        } catch (err) {
          console.error('Failed to create entry:', err);
        }
      });
      return;
    }
  }

  // ── 3. Empty beads (Points) ──────────────────────────────────────────
  const emptyMesh = getEmptyBeadMesh();
  if (emptyMesh) {
    clickRaycaster.params.Points.threshold = 0.8;
    const emptyHits = clickRaycaster.intersectObject(emptyMesh, false);
    if (emptyHits.length && isEmptyBeadVisible(emptyHits[0].index)) {
      const instId = emptyHits[0].index;
      if (mode === 'perspective') {
        const camDist = Math.sqrt(activeCam.position.x ** 2 + activeCam.position.z ** 2);
        if (camDist <= 60) {
          _openCreateForInstance(instId);
          return;
        }
      } else if (mode === 'plan' || mode === 'detail') {
        _openCreateForInstance(instId);
        return;
      }
    }
  }

  // ── 4. Close overlays on empty click ─────────────────────────────────
  closeReadOverlay();
  closeCreatePanel();

  // ── 5. View mode nav ──────────────────────────────────────────────────
  const effectiveTop = Math.min(spiralTopY, getSectionCutY());
  if (mode === 'plan') {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    if (Math.hypot(e.clientX - cx, e.clientY - cy) < 150) {
      setViewMode('perspective', effectiveTop);
    }
  }
});

// ── Detail-view spiral-tangent pan ───────────────────────────────────────────
let _isDetailPanning  = false;
let _panDownX         = 0;
let _panDownY         = 0;

function _openCreateForInstance(pointIndex) {
  const dateISO = getEmptyBeadDate(pointIndex);
  if (!dateISO) return;
  const pos = dateToPosition(new Date(dateISO), birthday);
  closeReadOverlay();
  openCreatePanel(dateISO, pos, async (data) => {
    try {
      const newEntry = await api.createEntry(data);
      loadedEntries.push(newEntry);
      addBead(newEntry, birthday, true);
      removeEmptyBeadInstance(pointIndex);
      closeCreatePanel();
    } catch (err) {
      console.error('Failed to create entry:', err);
    }
  });
}

// ── Mouse ─────────────────────────────────────────────────────────────────────
let lastMouseEvent = null;

window.addEventListener('mousemove', (e) => {
  lastMouseEvent = e;
  if (_isDetailPanning && _detailFocusDate) {
    // Incremental mouse delta in screen pixels
    const sdx = e.clientX - _panDownX;
    const sdy = e.clientY - _panDownY;
    _panDownX = e.clientX;
    _panDownY = e.clientY;

    // Compute tangent direction in full-frame pixels via two nearby points
    const MS_PER_DAY = 86400000;
    const prevPos = dateToPosition(new Date(_detailFocusDate.getTime() - MS_PER_DAY), birthday);
    const nextPos = dateToPosition(new Date(_detailFocusDate.getTime() + MS_PER_DAY), birthday);
    const pScreen = worldToDetailScreen(prevPos);
    const nScreen = worldToDetailScreen(nextPos);

    const tFFx = nScreen.x - pScreen.x;
    const tFFy = nScreen.y - pScreen.y;
    const tFFlen = Math.sqrt(tFFx * tFFx + tFFy * tFFy);

    if (tFFlen > 0.001) {
      const tNormX = tFFx / tFFlen;
      const tNormY = tFFy / tFFlen;

      // Scale screen-pixel delta to full-frame-pixel delta for 1:1 speed
      const scale = getDetailCropScale();
      const ffDx = sdx * scale.x;
      const ffDy = sdy * scale.y;

      // Project onto tangent and convert to days
      const projected = ffDx * tNormX + ffDy * tNormY;
      const pixelsPerDay = tFFlen / 2;
      const daysDelta = -projected / pixelsPerDay;

      _detailFocusDate = new Date(_detailFocusDate.getTime() + daysDelta * MS_PER_DAY);

      // Move camera above the new focus position
      const newPos = dateToPosition(_detailFocusDate, birthday);
      moveDetailCamera(newPos.x, newPos.z);
    }
  }
});

window.addEventListener('mouseup', () => {
  _isDetailPanning = false;
});

registerFrameCallback((cam) => {
  const mode = getCurrentMode();
  showEmptyBeadsNearMouse(lastMouseEvent, cam, mode, getSectionCutDate(), getFloorDate());
});

// ── Bead visibility ───────────────────────────────────────────────────────────
registerFrameCallback(() => {
  const mode = getCurrentMode();
  if (mode !== 'perspective' && mode !== 'plan' && mode !== 'detail') return;

  const ceilingDate = getSectionCutDate();
  // Dim beads in perspective view (hover callback overrides for the hovered bead)
  const baseEmissive = mode === 'perspective' ? 0.15 : 0.3;

  if (mode === 'detail') {
    const floorDate = getFloorDate();
    for (const mesh of getAllBeadMeshes()) {
      const d = mesh.userData.entryDate;
      mesh.visible = d <= ceilingDate && d >= floorDate;
      mesh.material.emissiveIntensity = baseEmissive;
    }
    return;
  }

  for (const mesh of getAllBeadMeshes()) {
    mesh.visible = mesh.userData.entryDate <= ceilingDate;
    mesh.material.emissiveIntensity = baseEmissive;
  }
});

// ── Bead hover ────────────────────────────────────────────────────────────────
const hoverRaycaster = new THREE.Raycaster();
hoverRaycaster.params.Points = { threshold: 0.8 };
hoverRaycaster.params.Mesh   = { threshold: 0.8 };
const hoverMouse     = new THREE.Vector2();
let   _hoveredBeadMesh       = null;
let   _hoveredBeadScreenPos  = null;

function _worldToScreen(worldPos) {
  const v = worldPos.clone().project(getActiveCamera());
  return {
    x: (v.x + 1) * 0.5 * window.innerWidth,
    y: (-v.y + 1) * 0.5 * window.innerHeight,
  };
}

registerFrameCallback((cam) => {
  if (!lastMouseEvent) return;

  if (_hoveredBeadMesh && !_hoveredBeadMesh.visible) {
    _hoveredBeadMesh.material.emissiveIntensity = 0.3;
    _hoveredBeadMesh.scale.setScalar(1.0);
    _hoveredBeadMesh = null;
    _hoveredBeadScreenPos = null;
  }

  hoverMouse.x =  (lastMouseEvent.clientX / window.innerWidth)  * 2 - 1;
  hoverMouse.y = -(lastMouseEvent.clientY / window.innerHeight) * 2 + 1;
  hoverRaycaster.setFromCamera(hoverMouse, cam);

  const beadMeshes = getAllBeadMeshes().filter(m => m.visible);
  const beadHits   = hoverRaycaster.intersectObjects(beadMeshes, false);
  const newHovered = beadHits.length ? beadHits[0].object : null;

  if (newHovered) {
    if (_hoveredBeadMesh !== newHovered) {
      if (_hoveredBeadMesh) {
        _hoveredBeadMesh.material.emissiveIntensity = 0.3;
        _hoveredBeadMesh.scale.setScalar(1.0);
      }
      newHovered.material.emissiveIntensity = 0.85;
      newHovered.scale.setScalar(1.2);
      _hoveredBeadMesh = newHovered;

      if (getCurrentMode() === 'detail') {
        const entry = loadedEntries.find(en => en.id === newHovered.userData.entryId);
        if (entry) openReadOverlay(entry, newHovered.position);
      }
    }
    _hoveredBeadScreenPos = _worldToScreen(_hoveredBeadMesh.position);
  } else if (_hoveredBeadMesh) {
    const sp = _hoveredBeadScreenPos;
    const tooFar = !sp ||
      Math.hypot(lastMouseEvent.clientX - sp.x, lastMouseEvent.clientY - sp.y) > 5;
    if (tooFar) {
      _hoveredBeadMesh.material.emissiveIntensity = 0.3;
      _hoveredBeadMesh.scale.setScalar(1.0);
      _hoveredBeadMesh = null;
      _hoveredBeadScreenPos = null;
      if (getCurrentMode() === 'detail') closeReadOverlay();
    }
  }

  // Empty beads hover
  const emptyMesh = getEmptyBeadMesh();
  let newHoveredEmptyId = -1;
  if (emptyMesh && !_hoveredBeadMesh) {
    hoverRaycaster.params.Points.threshold = 0.8;
    const emptyHits = hoverRaycaster.intersectObject(emptyMesh, false);
    if (emptyHits.length && isEmptyBeadVisible(emptyHits[0].index)) newHoveredEmptyId = emptyHits[0].index;
  }
  setHoveredEmptyBead(newHoveredEmptyId);
});

// ── Logout ────────────────────────────────────────────────────────────────────
(function _buildLogoutButton() {
  const btn = document.createElement('button');
  btn.textContent = 'LOG OUT';
  Object.assign(btn.style, {
    position:      'fixed',
    bottom:        '8px',
    right:         '24px',
    width:         '100px',
    padding:       '5px 0',
    background:    'transparent',
    border:        '1px solid rgba(245,166,35,0.25)',
    borderRadius:  '4px',
    color:         'rgba(245,166,35,0.5)',
    fontFamily:    'monospace',
    fontSize:      '10px',
    letterSpacing: '1.5px',
    cursor:        'pointer',
    zIndex:        '100',
    pointerEvents: 'auto',
    transition:    'color 150ms ease, border-color 150ms ease',
  });
  btn.addEventListener('mouseenter', () => {
    btn.style.color       = 'rgba(245,166,35,0.9)';
    btn.style.borderColor = 'rgba(245,166,35,0.6)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.color       = 'rgba(245,166,35,0.5)';
    btn.style.borderColor = 'rgba(245,166,35,0.25)';
  });
  btn.addEventListener('click', async () => {
    try { await api.logout(); } catch { /* ignore */ }
    window.location.href = '/';
  });
  document.getElementById('app').appendChild(btn);
})();

// ── Detail zoom ─────────────────────────────────────────────────────────────────
canvas.addEventListener('wheel', (e) => {
  if (getCurrentMode() !== 'detail') return;
  e.preventDefault();
  applyDetailZoom(e.deltaY / 500);
}, { passive: false });

// ── Keyboard ──────────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    ribbonVisible = !ribbonVisible;
    ribbonGroup.visible = ribbonVisible;
  }
});

// ── Auth + entry loading ──────────────────────────────────────────────────────

let loadedEntries = [];

async function loadEntries() {
  loadedEntries = await api.getEntries();
  setLoadedEntries(loadedEntries);
  initBeads(loadedEntries, birthday);

  const filledDates = loadedEntries.map(e => e.entry_date);
  initEmptyBeads(birthday, filledDates);

  initColorModeToggle(() => toggleColorMode(loadedEntries));

  // Analysis rings intentionally hidden — feature not yet complete
  // TODO: re-enable initRingStack when analysis ring interaction is fully implemented

  initTodaysBubble(birthday, loadedEntries, async (data) => {
    try {
      const newEntry = await api.createEntry(data);
      loadedEntries.push(newEntry);
      addBead(newEntry, birthday, true);
      const emptyMesh = getEmptyBeadMesh();
      if (emptyMesh) {
        const todayISO = new Date().toISOString().slice(0, 10);
        for (let i = 0; i < emptyMesh.geometry.attributes.position.count; i++) {
          if (getEmptyBeadDate(i) === todayISO) {
            removeEmptyBeadInstance(i);
            break;
          }
        }
      }
      closeCreatePanel();
    } catch (err) {
      console.error('Failed to create entry from today\'s bubble:', err);
    }
  });
}

(async () => {
  try {
    const user = await api.me();
    if (!user.birthday) {
      window.location.href = '/onboarding.html';
      return;
    }
    await loadEntries();
  } catch (err) {
    if (err.status === 401) {
      window.location.href = '/';
    }
  }
})();
