/**
 * onboarding.js — Birthday animation + milestone prompts for new users.
 * Full-screen Three.js scene: spiral grows as user types birth year.
 * Camera starts low near ground, rises with the spiral.
 */

import * as THREE from 'three';
import { dateToPosition, dateToAngle } from './three/spiralMath.js';
import * as api from './api.js';

// ── Auth gate: must be logged in, must NOT have birthday set ────────────────
let currentUser = null;

(async () => {
  try {
    currentUser = await api.me();
    if (currentUser.birthday) {
      // Already onboarded — go straight to app
      window.location.href = '/app.html';
      return;
    }
  } catch {
    window.location.href = '/';
    return;
  }
  initScene();
})();

// ── Constants ────────────────────────────────────────────────────────────────
const DAYS_IN_YEAR = 365.25;
const MS_PER_DAY = 86400000;

// ── Three.js setup ──────────────────────────────────────────────────────────
let renderer, scene, camera;
let spiralMesh = null;
let groundMesh = null;
let rotationAngle = 0;
let currentBirthday = null;
let spiralTopY = 0;

function initScene() {
  const container = document.getElementById('scene');

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0e0a06');
  scene.fog = new THREE.FogExp2(0x0e0a06, 0.0018);

  camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  // Start camera low, looking up
  camera.position.set(0, 8, 90);
  camera.lookAt(0, 8, 0);

  // Lighting
  scene.add(new THREE.AmbientLight(0xffe8c0, 0.35));
  const dir = new THREE.DirectionalLight(0xffe8c0, 1.0);
  dir.position.set(50, 350, 30);
  scene.add(dir);

  // Ground plane — simple reflective disc
  buildGround();

  // Start animation loop
  animate();

  // Setup input handlers
  setupBirthdayInput();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ── Ground plane (simplified — starfield-tinted mirror) ─────────────────────
function buildGround() {
  const geo = new THREE.PlaneGeometry(4000, 4000);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x110d08,
    emissive: 0x0a0806,
    emissiveIntensity: 0.3,
    metalness: 0.9,
    roughness: 0.3,
    transparent: true,
    opacity: 0.6,
  });
  groundMesh = new THREE.Mesh(geo, mat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = 0;
  scene.add(groundMesh);
}

// ── Spiral builder ──────────────────────────────────────────────────────────
function rebuildSpiral(birthYear) {
  const today = new Date();
  const birthday = new Date(birthYear, 0, 1); // Jan 1 of birth year

  if (birthday >= today) return;

  currentBirthday = birthday;
  const totalMs = today - birthday;
  spiralTopY = (totalMs / (DAYS_IN_YEAR * MS_PER_DAY)) * 8;

  // Remove old spiral
  if (spiralMesh) {
    scene.remove(spiralMesh);
    spiralMesh.geometry.dispose();
    spiralMesh.material.dispose();
    spiralMesh = null;
  }

  // Build new spiral
  const numPoints = 2000;
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints;
    const date = new Date(birthday.getTime() + fraction * totalMs);
    points.push(dateToPosition(date, birthday));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeo = new THREE.TubeGeometry(curve, numPoints, 0.15, 8, false);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0xfff5e6,
    emissive: 0xffecd4,
    emissiveIntensity: 0.35,
    metalness: 0.3,
    roughness: 0.55,
  });

  spiralMesh = new THREE.Mesh(tubeGeo, tubeMat);
  scene.add(spiralMesh);
}

// ── Animation loop ──────────────────────────────────────────────────────────
const ROTATION_SPEED = 0.15;

function animate() {
  requestAnimationFrame(animate);

  rotationAngle += ROTATION_SPEED * (1 / 60);
  const radius = 90;

  // Camera Y rises with spiral — stays at ~40% height for nice view
  const camY = spiralTopY > 0 ? Math.max(8, spiralTopY * 0.4) : 8;

  camera.position.x = radius * Math.sin(rotationAngle);
  camera.position.z = radius * Math.cos(rotationAngle);
  camera.position.y = camY;
  camera.lookAt(0, camY, 0);

  renderer.render(scene, camera);
}

// ── Birthday input ──────────────────────────────────────────────────────────
let debounceTimer = null;

function setupBirthdayInput() {
  const input = document.getElementById('birth-year');
  const btnContinue = document.getElementById('btn-continue');

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const year = parseInt(input.value, 10);
      if (year >= 1920 && year <= 2007) {
        rebuildSpiral(year);
        btnContinue.classList.add('visible');
      } else {
        btnContinue.classList.remove('visible');
        // Clear spiral if invalid
        if (spiralMesh) {
          scene.remove(spiralMesh);
          spiralMesh.geometry.dispose();
          spiralMesh.material.dispose();
          spiralMesh = null;
          spiralTopY = 0;
        }
      }
    }, 300);
  });

  btnContinue.addEventListener('click', async () => {
    const year = parseInt(input.value, 10);
    if (year < 1920 || year > 2007) return;

    // Save birthday to server
    const birthdayStr = `${year}-01-01`;
    try {
      await api.updateBirthday({ birthday: birthdayStr });
    } catch (err) {
      console.error('Failed to save birthday:', err);
      return;
    }

    // Hide birthday prompt, show milestones
    document.getElementById('birthday-overlay').style.display = 'none';
    startMilestonePrompts(year);
  });
}

// ── Milestone prompts ───────────────────────────────────────────────────────
const MILESTONES = [
  {
    question: 'When did you graduate high school?',
    label: 'High school graduation',
    optional: false,
  },
  {
    question: 'When did you move out on your own for the first time?',
    label: 'Moved out on my own',
    optional: false,
  },
  {
    question: 'When did you start your current or most recent job?',
    label: 'Started current/recent job',
    optional: false,
  },
  {
    question: 'When did you begin a significant relationship?',
    label: 'Began a significant relationship',
    optional: true,
  },
  {
    question: 'When did you experience a major loss?',
    label: 'Experienced a major loss',
    optional: true,
  },
];

let milestoneIndex = 0;
const milestoneBeads = []; // track placed milestone beads for spiral display

function startMilestonePrompts(birthYear) {
  milestoneIndex = 0;

  const overlay = document.getElementById('milestone-overlay');
  const questionEl = document.getElementById('milestone-question');
  const dateInput = document.getElementById('milestone-date');
  const btnPlace = document.getElementById('btn-place');
  const btnSkip = document.getElementById('btn-skip');
  const btnGoToApp = document.getElementById('btn-go-to-app');

  function showPrompt(index) {
    if (index >= MILESTONES.length) {
      // All done — go to app
      goToApp();
      return;
    }

    const m = MILESTONES[index];
    questionEl.innerHTML = m.question +
      (m.optional ? '<br><span class="milestone-optional">Optional — skip if preferred</span>' : '');
    dateInput.value = '';
    overlay.classList.add('visible');

    // Show "Take me to the app" after first prompt
    if (index >= 1) {
      btnGoToApp.classList.add('visible');
    }
  }

  btnPlace.addEventListener('click', async () => {
    const dateVal = dateInput.value; // YYYY-MM format
    if (!dateVal) return;

    const m = MILESTONES[milestoneIndex];
    const entryDate = dateVal + '-15'; // mid-month

    try {
      const entry = await api.createEntry({
        content: m.label,
        color: '#f5a623',
        mood: null,
        entry_date: entryDate,
        is_milestone: true,
        milestone_label: m.label,
      });

      // Add milestone bead to the spiral scene
      addMilestoneBead(entry.entry_date);
    } catch (err) {
      console.error('Failed to create milestone entry:', err);
    }

    milestoneIndex++;
    showPrompt(milestoneIndex);
  });

  btnSkip.addEventListener('click', () => {
    milestoneIndex++;
    showPrompt(milestoneIndex);
  });

  btnGoToApp.addEventListener('click', () => {
    goToApp();
  });

  showPrompt(0);
}

function addMilestoneBead(entryDateStr) {
  if (!currentBirthday) return;

  const date = new Date(entryDateStr);
  const pos = dateToPosition(date, currentBirthday);

  const beadGeo = new THREE.SphereGeometry(0.55, 16, 12);
  const color = new THREE.Color('#f5a623');
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.4,
    metalness: 0.25,
    roughness: 0.5,
  });

  const mesh = new THREE.Mesh(beadGeo, mat);
  mesh.position.copy(pos);
  scene.add(mesh);
  milestoneBeads.push(mesh);
}

function goToApp() {
  window.location.href = '/app.html';
}
