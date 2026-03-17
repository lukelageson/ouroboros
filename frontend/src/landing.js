/**
 * landing.js — Standalone Three.js scene for the Ouroboros landing page.
 * Demo spiral with hardcoded birthday (40 years ago) and seeded entries.
 * Auto-rotates in perspective view. No backend calls except auth.
 */

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { dateToPosition, dateToAngle } from './three/spiralMath.js';
import * as api from './api.js';

// ── Scene setup ──────────────────────────────────────────────────────────────

const container = document.getElementById('landing');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0e0a06');
scene.fog = new THREE.FogExp2(0x0e0a06, 0.0018);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(0, 140, 110);
camera.lookAt(0, 140, 0);

// Lighting
scene.add(new THREE.AmbientLight(0xffe8c0, 0.35));
const dir = new THREE.DirectionalLight(0xffe8c0, 1.0);
dir.position.set(50, 350, 30);
scene.add(dir);

// ── Demo spiral ──────────────────────────────────────────────────────────────

const DAYS_IN_YEAR = 365;
const MS_PER_DAY = 86400000;
const today = new Date();
const birthday = new Date(today.getFullYear() - 40, today.getMonth(), today.getDate());
const totalMs = today - birthday;
const spiralTopY = (totalMs / (DAYS_IN_YEAR * MS_PER_DAY)) * 8;

// Build weekly Line2 segments (same approach as main app)
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const dpr = window.devicePixelRatio;
const spiralResolution = new THREE.Vector2(
  window.innerWidth * dpr,
  window.innerHeight * dpr
);

let segStart = new Date(birthday);
while (segStart < today) {
  const segEndMs = Math.min(segStart.getTime() + MS_PER_WEEK, today.getTime());
  const segEnd   = new Date(segEndMs);
  const spanMs   = segEnd - segStart;

  const positions = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const frac = i / N;
    const date = new Date(segStart.getTime() + frac * spanMs);
    const pos  = dateToPosition(date, birthday);
    positions.push(pos.x, pos.y, pos.z);
  }

  const geo = new LineGeometry();
  geo.setPositions(positions);

  const mat = new LineMaterial({
    color:       0xffe4b5,
    linewidth:   2,
    resolution:  spiralResolution,
    transparent: true,
    opacity:     1.0,
  });

  const line = new Line2(geo, mat);
  line.computeLineDistances();
  scene.add(line);

  segStart = segEnd;
}

// ── Demo beads ───────────────────────────────────────────────────────────────

const demoEntries = [
  { yearsAgo: 38, color: '#e74c3c' },  // early childhood
  { yearsAgo: 30, color: '#3498db' },  // age 10
  { yearsAgo: 22, color: '#2ecc71' },  // age 18
  { yearsAgo: 15, color: '#f39c12' },  // age 25
  { yearsAgo: 5,  color: '#9b59b6' },  // age 35
  { yearsAgo: 0.5, color: '#e67e22' }, // recent
];

const beadGeo = new THREE.SphereGeometry(0.45, 16, 12);

for (const entry of demoEntries) {
  const date = new Date(today.getTime() - entry.yearsAgo * DAYS_IN_YEAR * MS_PER_DAY);
  const pos = dateToPosition(date, birthday);
  const color = new THREE.Color(entry.color);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.3,
    metalness: 0.25,
    roughness: 0.5,
  });
  const mesh = new THREE.Mesh(beadGeo, mat);
  mesh.position.copy(pos);
  scene.add(mesh);
}

// ── Pivot for rotation ───────────────────────────────────────────────────────

// We rotate the camera around the spiral's center by using a pivot group
const pivot = new THREE.Group();
pivot.position.set(0, 0, 0);
scene.add(pivot);

// ── Animation loop ───────────────────────────────────────────────────────────

const ROTATION_SPEED = 0.15; // radians per second
let rotationAngle = 0;

function animate() {
  requestAnimationFrame(animate);

  rotationAngle += ROTATION_SPEED * (1 / 60);
  const radius = 110;
  const camY = 140;
  camera.position.x = radius * Math.sin(rotationAngle);
  camera.position.z = radius * Math.cos(rotationAngle);
  camera.position.y = camY;
  camera.lookAt(0, camY, 0);

  renderer.render(scene, camera);
}

animate();

// ── Resize ───────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  spiralResolution.set(window.innerWidth * window.devicePixelRatio, window.innerHeight * window.devicePixelRatio);
});

// ── Auth UI ──────────────────────────────────────────────────────────────────

const btnRegister = document.getElementById('btn-register');
const btnLogin = document.getElementById('btn-login');
const formContainer = document.getElementById('auth-form-container');
const form = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmit = document.getElementById('auth-submit');
const authError = document.getElementById('auth-error');
const authBack = document.getElementById('auth-back');

let isRegisterMode = false;

function showForm(registerMode) {
  isRegisterMode = registerMode;
  authTitle.textContent = registerMode ? 'REGISTER' : 'LOG IN';
  authSubmit.textContent = registerMode ? 'REGISTER' : 'LOG IN';
  authError.textContent = '';
  authEmail.value = '';
  authPassword.value = '';
  formContainer.classList.add('visible');
}

btnRegister.addEventListener('click', () => showForm(true));
btnLogin.addEventListener('click', () => showForm(false));

authBack.addEventListener('click', () => {
  formContainer.classList.remove('visible');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';

  try {
    if (isRegisterMode) {
      await api.register({
        email: authEmail.value,
        password: authPassword.value,
      });
      await api.login({
        email: authEmail.value,
        password: authPassword.value,
      });
      window.location.href = '/onboarding.html';
      return;
    }
    await api.login({
      email: authEmail.value,
      password: authPassword.value,
    });
    window.location.href = '/app.html';
  } catch (err) {
    authError.textContent = err.body?.error || err.message;
  }
});

// If already logged in, redirect to app
(async () => {
  try {
    await api.me();
    window.location.href = '/app.html';
  } catch { /* not logged in — stay on landing */ }
})();
