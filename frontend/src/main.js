import * as THREE from 'three';
import {
  initRenderer, registerFrameCallback, registerPostRenderCallback,
  webgl, camera, controls, scene, getActiveCamera,
} from './three/renderer.js';
import { initScene }                           from './three/scene.js';
import { updateRibbonLabels }                  from './three/ribbon.js';
import {
  setViewMode, advanceTransition,
  isPlanMode, isDetailMode, getCurrentMode,
  panDetailView, setPlanTargetY, setDetailZoom,
} from './three/cameraController.js';
import {
  updateSpiralMaterial, updateSpiralDetailMode, clearSpiralDetailMode,
  setSpiralSectionCutY,
} from './three/spiralGeometry.js';
import { dateToPosition }       from './three/spiralMath.js';
import {
  initSectionCut,
  showSectionCutSlider,
  hideSectionCutSlider,
  getSectionCutY,
  setDetailClipWindow,
  clearDetailClipWindow,
  setSliderDetailMode,
  syncSliderToPanDate,
  setSliderPosition,
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
  openReadOverlay2D, closeReadOverlay2D,
} from './three/popups/readOverlay2D.js';
import {
  openCreatePanel, closeCreatePanel, isCreatePanelOpen,
} from './three/popups/createPanel.js';
import {
  initTodaysBubble, dismissTodaysBubble,
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
import { showAnnotation, hideAnnotation } from './three/popups/analysisAnnotation.js';
import {
  initDetailTextLayer, updateDetailTextLayer, refreshDetailEntries,
} from './three/popups/detailTextLayer.js';

// ── Init ────────────────────────────────────────────────────────────────────
initRenderer();
const {
  ribbonMesh, dividerObjects, labels,
  spiralTopY, spiral,
  birthday, today, ground,
} = initScene();

let ribbonVisible = true;
let _prevMode = null;

// Compute today's position on the spiral for the initial detail-view pan
const todayPos = dateToPosition(today, birthday);

// Section cut: global clip plane + slider UI
initSectionCut(spiralTopY, birthday);
hideSectionCutSlider(); // hidden until perspective view is active

// ── View Cube ───────────────────────────────────────────────────────────────
initViewCube(webgl, camera, controls, (mode) => {
  const effectiveTop = Math.min(spiralTopY, getSectionCutY());
  if (mode === 'detail') {
    panDate = new Date(today);
    setViewMode('detail', effectiveTop, { panPos: todayPos });
  } else {
    closeReadOverlay2D();
    setViewMode(mode, effectiveTop);
  }
});

// ── Frame callbacks ─────────────────────────────────────────────────────────
registerFrameCallback(() => {
  advanceTransition();
  updateSpiralMaterial(isPlanMode());
  updateViewCube();

  // Slider: show in perspective, plan, and detail; detail mode uses pan callback
  const mode = getCurrentMode();
  if (mode === 'perspective' || mode === 'plan' || mode === 'detail') {
    showSectionCutSlider();
  } else {
    hideSectionCutSlider();
  }

  // On mode transition, wire/unwire slider detail zoom mode
  if (mode !== _prevMode) {
    _prevMode = mode;
    if (mode === 'detail') {
      // Slider controls zoom in detail view (frac: 0=zoomed in, 1=zoomed out)
      setSliderDetailMode(true, (frac) => {
        const heightAboveSpiral = 2 + frac * 48;  // 2-50 range (increased zoom range)
        setDetailZoom(heightAboveSpiral);
      }, null, 0);
      // Set slider to mid-point for detail mode
      setSliderPosition(0.5);
    } else {
      setSliderDetailMode(false, null, null, 0);
    }
  }

  // Plan view: track section cut live
  if (mode === 'plan') setPlanTargetY(getSectionCutY());

  // Detail view: spiral edge fade + year indicator (clip window now shader-based)
  if (mode === 'detail') {
    const detailTargetY = getActiveCamera().position.y - 15;
    setDetailClipWindow(detailTargetY);
    updateSpiralDetailMode(detailTargetY);
    setSpiralSectionCutY(9999); // disable section cut in detail mode
    _updateDetailYearIndicator(detailTargetY);
    updateDetailTextLayer(detailTargetY, 'detail');
    if (ground) ground.visible = false;
  } else {
    updateDetailTextLayer(0, mode || 'perspective');
    clearDetailClipWindow();
    clearSpiralDetailMode();
    setSpiralSectionCutY(getSectionCutY()); // apply section cut in perspective/plan
    _hideDetailYearIndicator();
    if (ground) ground.visible = true;
  }

  // Tell panelManager the settled view mode so it scales/orients popups correctly
  setPanelViewMode(mode || 'perspective');

  // Ring stack: only visible in perspective view, animate each frame
  const ringGroup = getStackGroup();
  if (ringGroup) {
    ringGroup.visible = (mode === 'perspective');
  }
  updateRingStack(performance.now() / 1000);
});

registerFrameCallback((cam) => {
  updateRibbonLabels(
    labels, dividerObjects, ribbonMesh,
    cam, ribbonVisible,
    isPlanMode(), spiralTopY, getSectionCutY(), isDetailMode()
  );
});

registerPostRenderCallback(() => {
  renderViewCube();
});

// ── Start in Perspective View ────────────────────────────────────────────────
setViewMode('perspective', spiralTopY);

// ── Detail-view panning ──────────────────────────────────────────────────────
let panDragging = false;
let panLastX    = 0;
let panDate     = new Date(today); // current pan position as a Date

const DAYS_PER_PX = 0.5; // 1 px drag ≈ 0.5 days along the spiral

const canvas = document.querySelector('canvas');

canvas.addEventListener('mousedown', (e) => {
  if (getCurrentMode() === 'detail') {
    panDragging = true;
    panLastX    = e.clientX;
    canvas.style.cursor = 'grabbing';
    e.stopPropagation(); // don't let OrbitControls intercept
  }
});

window.addEventListener('mousemove', (e) => {
  if (!panDragging || getCurrentMode() !== 'detail') return;
  const dx = e.clientX - panLastX;
  panDate   = new Date(panDate.getTime() + dx * DAYS_PER_PX * 86400000);
  if (panDate > today)    panDate = new Date(today);
  if (panDate < birthday) panDate = new Date(birthday);
  panDetailView(dateToPosition(panDate, birthday));
  // Note: slider is reserved for zoom control in detail mode, not date display
  panLastX = e.clientX;
});

window.addEventListener('mouseup', () => {
  if (panDragging) {
    panDragging = false;
    canvas.style.cursor = '';
  }
});

// ── Click detection (beads + surface navigation) ────────────────────────────
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
        if (mode === 'detail') {
          openReadOverlay2D(entry);
        } else {
          openReadOverlay(entry, mesh.position);
        }
        return;
      }
    }
  }

  // ── 2. Check empty beads (InstancedMesh) ─────────────────────────────
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
  closeReadOverlay2D();
  closeCreatePanel();
  if (isInAnalysisViewingMode()) {
    hideAnnotation();
    exitAnalysisViewingMode();
    return;
  }

  // ── 4. Surface-click navigation (legacy) ─────────────────────────────
  const spiralHits = clickRaycaster.intersectObject(spiral, false);

  const effectiveTop = Math.min(spiralTopY, getSectionCutY());
  if (mode === 'perspective' && spiralHits.length && spiralHits[0].point.y > effectiveTop - 16) {
    closeReadOverlay2D();
    setViewMode('plan', effectiveTop);
  } else if (mode === 'plan') {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    if (Math.hypot(e.clientX - cx, e.clientY - cy) < 150) {
      closeReadOverlay2D();
      setViewMode('perspective', effectiveTop);
    }
  }
});

// ── Detail-view year indicator ───────────────────────────────────────────────
let _yearIndicatorEl = null;

function _getOrCreateYearIndicator() {
  if (_yearIndicatorEl) return _yearIndicatorEl;
  _yearIndicatorEl = document.createElement('div');
  Object.assign(_yearIndicatorEl.style, {
    position:      'fixed',
    bottom:        '24px',
    left:          '50%',
    transform:     'translateX(-50%)',
    zIndex:        '100',
    fontFamily:    'monospace',
    fontSize:      '13px',
    letterSpacing: '3px',
    color:         'rgba(255,245,230,0.7)',
    pointerEvents: 'none',
    display:       'none',
  });
  document.getElementById('app').appendChild(_yearIndicatorEl);
  return _yearIndicatorEl;
}

function _updateDetailYearIndicator(targetY) {
  const el = _getOrCreateYearIndicator();
  const yearsElapsed = targetY / 8;
  const DAYS_IN_YEAR = 365.25;
  const MS_PER_DAY   = 86400000;
  const d = new Date(birthday.getTime() + yearsElapsed * DAYS_IN_YEAR * MS_PER_DAY);
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  el.textContent = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  el.style.display = 'block';
}

function _hideDetailYearIndicator() {
  if (_yearIndicatorEl) _yearIndicatorEl.style.display = 'none';
}

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
      refreshDetailEntries(loadedEntries);
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
});

registerFrameCallback((cam) => {
  const mode = getCurrentMode();
  showEmptyBeadsNearMouse(lastMouseEvent, cam, mode, getSectionCutY());
});

// ── Bead visibility: section cut (perspective/plan) + detail window ──────────
registerFrameCallback(() => {
  const mode = getCurrentMode();

  if (mode === 'detail') {
    const detailTargetY = getActiveCamera().position.y - 15;
    for (const mesh of getAllBeadMeshes()) {
      const dy = mesh.position.y - detailTargetY;
      mesh.visible = dy >= -8 && dy <= 5;
    }
    return;
  }

  if (mode !== 'perspective' && mode !== 'plan') return;

  // Hide any bead whose top extends above the section cut
  const clipY = getSectionCutY();
  const nocut = clipY >= spiralTopY - 0.1; // slider at top = no cut

  for (const mesh of getAllBeadMeshes()) {
    if (nocut) {
      mesh.visible = true;
    } else {
      const r = mesh.userData.isMilestone ? 0.825 : 0.45;
      mesh.visible = mesh.position.y + r < clipY;
    }
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

// ── Keyboard: ribbon toggle only ────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    ribbonVisible = !ribbonVisible;
    ribbonMesh.visible = ribbonVisible;
  }
});

// ── Auth gate + entry loading ───────────────────────────────────────────────

let loadedEntries = [];

async function loadEntries() {
  loadedEntries = await api.getEntries();
  initBeads(loadedEntries, birthday);
  initDetailTextLayer(loadedEntries, birthday);

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
      refreshDetailEntries(loadedEntries);
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
