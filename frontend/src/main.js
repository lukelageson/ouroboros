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
  worldToDetailScreen, getDetailCropCenterScreen, screenToWorldXZ,
  centerDetailViewOnScreen, instantCenterDetailViewOnScreen,
  onResizeDetailView,
} from './three/cameraController.js';
import { dateToPosition, angleToDate } from './three/spiralMath.js';
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
  setHoveredEmptyBead,
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
import {
  initRingStack, expandStack, collapseStack, updateRingStack,
  getRingMeshes, handleRingClick, isExpanded, getStackGroup,
  updateProgress, addCompletedRing, setRingComputing,
  getRingPosition, getCompletedAnalyses, setRingHover,
} from './three/analysisRings.js';
import { runParticleRain } from './three/particleRain.js';
import { getBeadMesh } from './three/beads.js';
import {
  enterAnalysisViewingMode, exitAnalysisViewingMode,
  isInAnalysisViewingMode, getGlowingMeshes, getCurrentAnalysis,
  applyBelongingIndicators,
} from './three/analysisViewingMode.js';
import { showAnnotation, hideAnnotation }   from './three/popups/analysisAnnotation.js';
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

// ── Init ────────────────────────────────────────────────────────────────────
initRenderer();
const {
  ribbonGroup, arcSegments, dividerObjects, labels,
  spiralGroup, spiralSegments,
  spiralTopY, birthday, today, ground,
} = initScene();

let ribbonVisible = true;

// Update LineMaterial resolution on resize so line widths stay correct in pixels
let _lastResizeW = window.innerWidth;
let _lastResizeH = window.innerHeight;

window.addEventListener('resize', () => {
  const oldW = _lastResizeW;
  const oldH = _lastResizeH;
  _lastResizeW = window.innerWidth;
  _lastResizeH = window.innerHeight;

  updateSpiralResolution(spiralSegments);
  updateRibbonResolution(arcSegments, dividerObjects);
  onResizeDetailView(oldW, oldH);
});

// Compute today's position on the spiral for the initial detail-view pan
const todayPos = dateToPosition(today, birthday);

// Section cut slider UI
initSectionCut(spiralTopY, birthday);
hideSectionCutSlider(); // hidden until perspective view is active

// Radial date line + entry column (Plan View only)
initRadialDateLine(spiralTopY, birthday);
initEntryColumn();
onDateLineChange((doy) => {
  updateEntryColumn(doy, getSectionCutDate(), loadedEntries, birthday);
});

// ── View Cube ───────────────────────────────────────────────────────────────
initViewCube(webgl, camera, controls, (mode) => {
  const effectiveTop = Math.min(spiralTopY, getSectionCutY());
  if (mode === 'detail') {
    setSectionCutY(spiralTopY); // reset ceiling to today on entry
    // Center detail view on most recent entry bead (fallback to today)
    let detailFocusPos = todayPos;
    if (loadedEntries && loadedEntries.length > 0) {
      const latest = loadedEntries.reduce((a, b) =>
        new Date(a.entry_date) > new Date(b.entry_date) ? a : b
      );
      detailFocusPos = dateToPosition(new Date(latest.entry_date), birthday);
    }
    setViewMode('detail', spiralTopY, { todayPos: detailFocusPos });
  } else {
    setViewMode(mode, effectiveTop);
  }
});

// ── Frame callbacks ─────────────────────────────────────────────────────────
registerFrameCallback(() => {
  advanceTransition();
  updateViewCube();

  // Slider: show in perspective, plan, and detail
  const mode = getCurrentMode();
  if (mode === 'perspective' || mode === 'plan' || mode === 'detail') {
    showSectionCutSlider();
  } else {
    hideSectionCutSlider();
  }

  // Plan view: track section cut live
  if (mode === 'plan') setPlanTargetY(getSectionCutY());

  // Detail view: entry labels
  if (mode === 'detail') {
    if (ground) ground.visible = false;

    // Entry text labels at high zoom
    updateDetailLabels(loadedEntries, birthday, camera, controls.target.y, true);
  } else {
    clearDetailLabels();
    if (ground) ground.visible = (mode === 'perspective');
  }

  // Tell panelManager the settled view mode so it scales/orients popups correctly
  setPanelViewMode(mode || 'perspective');

  // Ring stack: only visible in perspective view, animate each frame
  const ringGroup = getStackGroup();
  if (ringGroup) {
    ringGroup.visible = (mode === 'perspective');
  }
  updateRingStack(performance.now() / 1000);

  // Radial date line + entry column: Plan View only
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
  const floorDate   = (mode === 'detail') ? getFloorDate() : null;

  // Spiral segment visibility (date-based + plan-mode opacity fade)
  updateSpiralVisibility(spiralSegments, ceilingDate, floorDate, isPlanMode());

  // Spiral linewidth: scale with zoom in perspective, thin in plan/detail
  const camHDist = Math.sqrt(cam.position.x ** 2 + cam.position.z ** 2);
  updateSpiralLineWidth(spiralSegments, camHDist, mode);

  // Ribbon: arc segments + labels + dividers
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

// ── Start in Perspective View ────────────────────────────────────────────────
setViewMode('perspective', spiralTopY);

// ── Click detection (beads + surface navigation) ────────────────────────────
const canvas = document.querySelector('canvas');
const clickRaycaster = new THREE.Raycaster();
const clickMouse     = new THREE.Vector2();
let   clickDownPos   = null;

// ── Ring hover detection ────────────────────────────────────────────────────
const ringHoverRaycaster = new THREE.Raycaster();
const ringHoverMouse = new THREE.Vector2();

canvas.addEventListener('mousemove', (e) => {
  // Check for ring hovers with distance threshold (hover radius)
  const mode = getCurrentMode();
  if (mode === 'perspective') {
    const ringMeshes = getRingMeshes();
    if (ringMeshes.length) {
      ringHoverMouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      ringHoverMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      const activeCam = getActiveCamera();
      ringHoverRaycaster.setFromCamera(ringHoverMouse, activeCam);
      ringHoverRaycaster.params.Points.threshold = 2;  // hover radius: 2 units

      const ringHits = ringHoverRaycaster.intersectObjects(ringMeshes, false);
      setRingHover(ringHits.length > 0 ? ringHits[0].object : null);
    } else {
      setRingHover(null);
    }
  } else {
    setRingHover(null);
  }
});

canvas.addEventListener('mousedown', (e) => {
  clickDownPos = { x: e.clientX, y: e.clientY };

  if (getCurrentMode() === 'detail' && !isCreatePanelOpen()) {
    _isDetailPanning  = true;
    _panDownX         = e.clientX;
    _panDownY         = e.clientY;
    _panStartCenter   = getDetailCropCenterScreen();
    // Derive the current focus date from the crop center's world angle
    const { x: wx, z: wz } = screenToWorldXZ(_panStartCenter.x, _panStartCenter.y);
    _panFocusDate = angleToDate(Math.atan2(wz, wx), getSectionCutDate());
  }
});

canvas.addEventListener('click', (e) => {
  // Ignore drags (moved > 5 px)
  if (clickDownPos &&
      Math.hypot(e.clientX - clickDownPos.x, e.clientY - clickDownPos.y) > 5) return;

  // Ignore clicks in the view-cube area
  if (isInCubeArea(e.clientX, e.clientY)) return;

  const mode = getCurrentMode();
  if (mode !== 'perspective' && mode !== 'plan' && mode !== 'detail') return;

  // Build NDC from click position
  clickMouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  clickMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  const activeCam = getActiveCamera();
  clickRaycaster.setFromCamera(clickMouse, activeCam);

  // ── 0. Check analysis rings (perspective only) ──────────────────────
  if (mode === 'perspective') {
    const ringMeshes = getRingMeshes();
    if (ringMeshes.length) {
      const ringHits = clickRaycaster.intersectObjects(ringMeshes, false);
      if (ringHits.length) {
        if (handleRingClick(ringHits[0].object)) return;
      }
    }

    // Click outside expanded stack → collapse
    if (isExpanded()) {
      collapseStack();
      return;
    }
  }

  // ── 1. Check filled beads ────────────────────────────────────────────
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

  // ── 2. Check today's bubble ───────────────────────────────────────────
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
          updateProgress(loadedEntries);
          dismissTodaysBubble();
          closeCreatePanel();
        } catch (err) {
          console.error('Failed to create entry:', err);
        }
      });
      return;
    }
  }

  // ── 3. Check empty beads (InstancedMesh) ─────────────────────────────
  const emptyMesh = getEmptyBeadMesh();
  if (emptyMesh) {
    const emptyHits = clickRaycaster.intersectObject(emptyMesh, false);
    if (emptyHits.length) {
      const instId = emptyHits[0].instanceId;
      // Perspective view: only allow if camera close enough
      if (mode === 'perspective') {
        const camDist = Math.sqrt(activeCam.position.x ** 2 + activeCam.position.z ** 2);
        if (camDist > 60) { /* too far — fall through to surface nav */ }
        else {
          _openCreateForInstance(instId);
          return;
        }
      } else if (mode === 'plan' || mode === 'detail') {
        _openCreateForInstance(instId);
        return;
      }
    }
  }

  // ── 3. Close any open overlay/panel on empty click ───────────────────
  closeReadOverlay();
  closeCreatePanel();
  if (isInAnalysisViewingMode()) {
    hideAnnotation();
    exitAnalysisViewingMode();
    return;
  }

  // ── 4. View mode navigation ───────────────────────────────────────────
  const effectiveTop = Math.min(spiralTopY, getSectionCutY());
  if (mode === 'plan') {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    if (Math.hypot(e.clientX - cx, e.clientY - cy) < 150) {
      setViewMode('perspective', effectiveTop);
    }
  }
});

// ── Detail-view crop pan state ────────────────────────────────────────────────

let _isDetailPanning  = false;
let _panDownX         = 0;
let _panDownY         = 0;
let _panStartCenter   = null; // { x, y } screen pos of focused point at drag start
let _panFocusDate     = null; // current continuous focus date during drag

/**
 * Snap the detail-view crop to the bead closest to where the pan gesture aimed.
 * @param {number} totalDx  total horizontal drag (positive = dragged right)
 * @param {number} totalDy  total vertical drag (positive = dragged down)
 */

/** Helper: open the create panel for a given empty-bead instance. */
function _openCreateForInstance(instanceId) {
  const dateISO = getEmptyBeadDate(instanceId);
  if (!dateISO) return;
  const pos = dateToPosition(new Date(dateISO), birthday);
  closeReadOverlay();
  openCreatePanel(dateISO, pos, async (data) => {
    try {
      const newEntry = await api.createEntry(data);
      loadedEntries.push(newEntry);
      addBead(newEntry, birthday, true);
      removeEmptyBeadInstance(instanceId);
      updateProgress(loadedEntries);
      closeCreatePanel();
    } catch (err) {
      console.error('Failed to create entry:', err);
    }
  });
}

// ── Brief floating message ──────────────────────────────────────────────────
function _showBriefMessage(text) {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: '200',
    fontFamily: 'monospace',
    fontSize: '14px',
    letterSpacing: '2px',
    color: '#f5a623',
    background: 'rgba(26,16,8,0.9)',
    border: '1px solid rgba(245,166,35,0.3)',
    borderRadius: '6px',
    padding: '16px 28px',
    pointerEvents: 'none',
    opacity: '1',
    transition: 'opacity 0.5s ease',
  });
  el.textContent = text;
  document.getElementById('app').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, 2500);
  setTimeout(() => { el.remove(); }, 3000);
}

// ── Run Again handler ────────────────────────────────────────────────────────
async function _triggerRunAgain(category) {
  setRingComputing(category, true);

  try {
    const result = await api.analyze({ category });
    setRingComputing(category, false);

    if (result.insufficient) {
      _showBriefMessage(result.reason || 'Not enough data yet');
      return;
    }

    addCompletedRing(result);

    const targetPositions = [];
    const targetMeshes = [];
    if (result.entry_ids && result.entry_ids.length) {
      for (const entryId of result.entry_ids) {
        const mesh = getBeadMesh(entryId);
        if (mesh) {
          targetPositions.push(mesh.position.clone());
          targetMeshes.push(mesh);
        }
      }
    }

    const sourcePos = new THREE.Vector3(0, spiralTopY + 20, 0);
    runParticleRain(sourcePos, targetPositions, targetMeshes, () => {
      const ringPos = getRingPosition(category);
      enterAnalysisViewingMode(
        result, getAllBeadMeshes(), ringPos, _triggerRunAgain
      );
    });
  } catch (err) {
    console.error('[ring] Run Again failed:', err);
    setRingComputing(category, false);
    _showBriefMessage('Analysis failed — please try again');
  }
}

// ── Empty-bead hover reveal ─────────────────────────────────────────────────
let lastMouseEvent = null;

window.addEventListener('mousemove', (e) => {
  lastMouseEvent = e;
  if (_isDetailPanning && _panStartCenter) {
    // Virtual target: where the focus would be after a free pan
    const totalDx  = e.clientX - _panDownX;
    const totalDy  = e.clientY - _panDownY;
    const targetCX = _panStartCenter.x - totalDx;
    const targetCY = _panStartCenter.y - totalDy;

    // Unproject to world XZ, derive angle, convert to a continuous date
    const { x: wx, z: wz } = screenToWorldXZ(targetCX, targetCY);
    const angle   = Math.atan2(wz, wx);
    const focusDate = _panFocusDate || getSectionCutDate();
    const newDate = angleToDate(angle, focusDate);
    if (newDate) {
      _panFocusDate = newDate;
      const pos = dateToPosition(newDate, birthday);
      const { x: sx, y: sy } = worldToDetailScreen(pos);
      instantCenterDetailViewOnScreen(sx, sy);
    }
  }
});

window.addEventListener('mouseup', () => {
  _isDetailPanning = false;
  _panStartCenter  = null;
  _panFocusDate    = null;
});

registerFrameCallback((cam) => {
  const mode = getCurrentMode();
  showEmptyBeadsNearMouse(lastMouseEvent, cam, mode, getSectionCutDate(), getFloorDate());
});

// ── Bead visibility: date-based section cut + detail window ──────────────────
registerFrameCallback(() => {
  const mode = getCurrentMode();
  if (mode !== 'perspective' && mode !== 'plan' && mode !== 'detail') return;

  const ceilingDate = getSectionCutDate();

  if (mode === 'detail') {
    const floorDate = getFloorDate();
    for (const mesh of getAllBeadMeshes()) {
      const d = mesh.userData.entryDate;
      mesh.visible = d <= ceilingDate && d >= floorDate;
    }
    return;
  }

  // Perspective / plan: visible if entry date is on or before the ceiling date
  for (const mesh of getAllBeadMeshes()) {
    mesh.visible = mesh.userData.entryDate <= ceilingDate;
  }
});

// ── Bead hover highlighting ──────────────────────────────────────────────────
const hoverRaycaster = new THREE.Raycaster();
hoverRaycaster.params.Points = { threshold: 2 };
hoverRaycaster.params.Mesh   = { threshold: 0.8 };
const hoverMouse     = new THREE.Vector2();
let   _hoveredBeadMesh       = null;
let   _hoveredBeadScreenPos  = null; // for sticky hover

/** Project a world position to CSS pixel coords (for sticky hover). */
function _worldToScreen(worldPos) {
  const v = worldPos.clone().project(getActiveCamera());
  return {
    x: (v.x + 1) * 0.5 * window.innerWidth,
    y: (-v.y + 1) * 0.5 * window.innerHeight,
  };
}

registerFrameCallback((cam) => {
  // Skip when analysis viewing mode has its own hover logic
  if (isInAnalysisViewingMode()) return;
  if (!lastMouseEvent) return;

  // Release hover immediately if the bead became invisible
  if (_hoveredBeadMesh && !_hoveredBeadMesh.visible) {
    _hoveredBeadMesh.material.emissiveIntensity = 0.3;
    _hoveredBeadMesh.scale.setScalar(1.0);
    _hoveredBeadMesh = null;
    _hoveredBeadScreenPos = null;
  }

  hoverMouse.x =  (lastMouseEvent.clientX / window.innerWidth)  * 2 - 1;
  hoverMouse.y = -(lastMouseEvent.clientY / window.innerHeight) * 2 + 1;
  hoverRaycaster.setFromCamera(hoverMouse, cam);

  // ── Filled beads ─────────────────────────────────────────────────────
  const beadMeshes = getAllBeadMeshes().filter(m => m.visible);
  const beadHits   = hoverRaycaster.intersectObjects(beadMeshes, false);
  const newHovered = beadHits.length ? beadHits[0].object : null;

  if (newHovered) {
    // Ray hit a bead — switch if it's a different one
    if (_hoveredBeadMesh !== newHovered) {
      if (_hoveredBeadMesh) {
        _hoveredBeadMesh.material.emissiveIntensity = 0.3;
        _hoveredBeadMesh.scale.setScalar(1.0);
      }
      newHovered.material.emissiveIntensity = 0.85;
      newHovered.scale.setScalar(1.2);
      _hoveredBeadMesh = newHovered;

      // In detail view, show the entry as a hover tooltip
      if (getCurrentMode() === 'detail') {
        const entry = loadedEntries.find(en => en.id === newHovered.userData.entryId);
        if (entry) openReadOverlay(entry, newHovered.position);
      }
    }
    // Keep screen projection up to date (camera may move)
    _hoveredBeadScreenPos = _worldToScreen(_hoveredBeadMesh.position);
  } else if (_hoveredBeadMesh) {
    // No ray hit — only un-hover if mouse moved > 5 px from bead's screen position
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

  // ── Empty beads (only when no filled bead is hovered) ────────────────
  const emptyMesh = getEmptyBeadMesh();
  let newHoveredEmptyId = -1;
  if (emptyMesh && !_hoveredBeadMesh) {
    const emptyHits = hoverRaycaster.intersectObject(emptyMesh, false);
    if (emptyHits.length) newHoveredEmptyId = emptyHits[0].instanceId;
  }
  setHoveredEmptyBead(newHoveredEmptyId);
});

registerFrameCallback((cam) => {
  if (!isInAnalysisViewingMode() || !lastMouseEvent) return;

  hoverMouse.x =  (lastMouseEvent.clientX / window.innerWidth)  * 2 - 1;
  hoverMouse.y = -(lastMouseEvent.clientY / window.innerHeight) * 2 + 1;
  hoverRaycaster.setFromCamera(hoverMouse, cam);

  const glowing = getGlowingMeshes();
  if (!glowing.length) { hideAnnotation(); return; }

  const hits = hoverRaycaster.intersectObjects(glowing, false);
  if (hits.length) {
    const mesh = hits[0].object;
    const entryId = mesh.userData.entryId;
    const entry = loadedEntries.find(e => e.id === entryId);
    if (entry) {
      const analysis = getCurrentAnalysis();
      const role = _deriveAnalysisRole(analysis, entry);
      showAnnotation(entry, role, mesh.position);
    }
  } else {
    hideAnnotation();
  }
});

/**
 * Derive an analysis role for a bead: first sentence of description
 * mentioning a date or 'entry', fallback to generic text.
 */
function _deriveAnalysisRole(analysis, entry) {
  if (!analysis || !analysis.description) return 'Related to this pattern';
  const sentences = analysis.description.split(/(?<=[.!?])\s+/);
  const datePart = entry.entry_date; // "YYYY-MM-DD"
  for (const s of sentences) {
    const lower = s.toLowerCase();
    if (lower.includes('entry') || lower.includes(datePart)) {
      return s.trim();
    }
  }
  return sentences[0] ? sentences[0].trim() : 'Related to this pattern';
}

// ── Logout button ────────────────────────────────────────────────────────────
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

// ── Detail-view scroll zoom ──────────────────────────────────────────────────
canvas.addEventListener('wheel', (e) => {
  if (getCurrentMode() !== 'detail') return;
  e.preventDefault();
  // delta > 0 = scroll down = zoom in (shrink crop); always pivot on crop center (bead)
  const zoomDelta = e.deltaY / 500;
  const cropCenter = getDetailCropCenterScreen();
  applyDetailZoom(zoomDelta, cropCenter.x, cropCenter.y);
}, { passive: false });

// ── Keyboard: ribbon toggle only ────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    ribbonVisible = !ribbonVisible;
    ribbonGroup.visible = ribbonVisible;
  }
});

// ── Auth gate + entry loading ───────────────────────────────────────────────

let loadedEntries = [];

async function loadEntries() {
  loadedEntries = await api.getEntries();
  setLoadedEntries(loadedEntries);
  initBeads(loadedEntries, birthday);

  // Empty beads for all unfilled dates
  const filledDates = loadedEntries.map(e => e.entry_date);
  initEmptyBeads(birthday, filledDates);

  // Mood / Category toggle
  initColorModeToggle(() => toggleColorMode(loadedEntries));

  // Analysis ring stack
  try {
    const analyses = await api.getAnalyses();
    initRingStack(spiralTopY, analyses, loadedEntries, {
      onTriggerAnalyze: async (category) => {
        // Ring enters computing state (pulsating)
        setRingComputing(category, true);

        try {
          const result = await api.analyze({ category });

          setRingComputing(category, false);

          // Insufficient data
          if (result.insufficient) {
            _showBriefMessage(result.reason || 'Not enough data yet');
            return;
          }

          // Success — mark ring completed
          addCompletedRing(result);

          // Gather target bead positions and meshes from entry_ids
          const targetPositions = [];
          const targetMeshes = [];
          if (result.entry_ids && result.entry_ids.length) {
            for (const entryId of result.entry_ids) {
              const mesh = getBeadMesh(entryId);
              if (mesh) {
                targetPositions.push(mesh.position.clone());
                targetMeshes.push(mesh);
              }
            }
          }

          // Ring position for particle source
          const ringGroup = getStackGroup();
          const ringY = ringGroup ? ringGroup.position.y + spiralTopY + 20 : spiralTopY + 20;
          const sourcePos = new THREE.Vector3(0, spiralTopY + 20, 0);

          // Run particle rain to target beads, then enter viewing mode
          runParticleRain(sourcePos, targetPositions, targetMeshes, () => {
            console.log('[ring] Analysis complete, beads glowing:', category);
            const ringPos = getRingPosition(category);
            enterAnalysisViewingMode(
              result, getAllBeadMeshes(), ringPos, _triggerRunAgain
            );
          });
        } catch (err) {
          console.error('[ring] Analyze failed:', err);
          setRingComputing(category, false);
          _showBriefMessage('Analysis failed — please try again');
        }
      },
      onViewAnalysis: (analysis) => {
        const ringPos = getRingPosition(analysis.category);
        enterAnalysisViewingMode(
          analysis, getAllBeadMeshes(), ringPos, _triggerRunAgain
        );
      },
    });
    // Apply belonging indicators to beads that are referenced by any analysis
    applyBelongingIndicators(analyses, getAllBeadMeshes());
  } catch (err) {
    console.error('Failed to load analyses:', err);
    // Initialize without completed analyses
    initRingStack(spiralTopY, [], loadedEntries);
  }

  // Today's bubble: amber glow + create panel if no entry for today
  initTodaysBubble(birthday, loadedEntries, async (data) => {
    try {
      const newEntry = await api.createEntry(data);
      loadedEntries.push(newEntry);
      addBead(newEntry, birthday, true);
      updateProgress(loadedEntries);
      // Find and hide the matching empty bead instance
      const emptyMesh = getEmptyBeadMesh();
      if (emptyMesh) {
        // Search for the instance matching today's date
        const todayISO = new Date().toISOString().slice(0, 10);
        // Walk empty bead dates to find the instance index
        for (let i = 0; i < emptyMesh.count; i++) {
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

function buildLoginForm() {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '1000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.85)',
  });

  const form = document.createElement('form');
  Object.assign(form.style, {
    display: 'flex', flexDirection: 'column', gap: '12px',
    padding: '32px', background: '#1a1008', borderRadius: '8px',
    border: '1px solid rgba(245,166,35,0.3)', minWidth: '280px',
    fontFamily: 'monospace', color: '#f5a623',
  });

  const title = document.createElement('div');
  title.textContent = 'OUROBOROS';
  Object.assign(title.style, {
    fontSize: '18px', fontWeight: 'bold', textAlign: 'center',
    letterSpacing: '4px', marginBottom: '8px',
  });

  const emailInput    = document.createElement('input');
  const passwordInput  = document.createElement('input');
  const birthdayInput  = document.createElement('input');
  const submitBtn      = document.createElement('button');
  const toggleLink     = document.createElement('a');
  const errorDiv       = document.createElement('div');

  for (const input of [emailInput, passwordInput, birthdayInput]) {
    Object.assign(input.style, {
      padding: '8px 12px', background: '#0d0804', border: '1px solid rgba(245,166,35,0.3)',
      borderRadius: '4px', color: '#fff5e6', fontFamily: 'monospace', fontSize: '14px',
    });
  }
  emailInput.type = 'email';       emailInput.placeholder = 'Email';
  passwordInput.type = 'password'; passwordInput.placeholder = 'Password';
  birthdayInput.type = 'date';     birthdayInput.placeholder = 'Birthday';
  birthdayInput.style.display = 'none'; // hidden until register mode

  Object.assign(submitBtn.style, {
    padding: '10px', background: '#f5a623', color: '#1a1008',
    border: 'none', borderRadius: '4px', fontFamily: 'monospace',
    fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', letterSpacing: '2px',
  });
  submitBtn.textContent = 'LOGIN';

  Object.assign(toggleLink.style, {
    color: 'rgba(245,166,35,0.6)', fontSize: '12px', textAlign: 'center',
    cursor: 'pointer', textDecoration: 'underline',
  });
  toggleLink.textContent = 'Need an account? Register';

  Object.assign(errorDiv.style, {
    color: '#ff6b6b', fontSize: '12px', textAlign: 'center', minHeight: '16px',
  });

  let isRegister = false;
  toggleLink.addEventListener('click', () => {
    isRegister = !isRegister;
    birthdayInput.style.display = isRegister ? 'block' : 'none';
    submitBtn.textContent       = isRegister ? 'REGISTER' : 'LOGIN';
    toggleLink.textContent      = isRegister
      ? 'Already have an account? Login'
      : 'Need an account? Register';
    errorDiv.textContent = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.textContent = '';
    try {
      if (isRegister) {
        await api.register({
          email: emailInput.value,
          password: passwordInput.value,
          birthday: birthdayInput.value,
        });
      }
      await api.login({
        email: emailInput.value,
        password: passwordInput.value,
      });
      overlay.remove();
      await loadEntries();
    } catch (err) {
      errorDiv.textContent = err.body?.error || err.message;
    }
  });

  form.append(title, emailInput, passwordInput, birthdayInput, submitBtn, errorDiv, toggleLink);
  overlay.appendChild(form);
  document.body.appendChild(overlay);
}

// Check session on load — redirect to landing if not authenticated
(async () => {
  try {
    const user = await api.me();
    // If user hasn't set birthday yet, redirect to onboarding
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
