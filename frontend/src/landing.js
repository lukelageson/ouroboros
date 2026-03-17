/**
 * landing.js — Standalone Three.js scene for the Ouroboros landing page.
 * Demo spiral with hardcoded birthday (40 years ago) and seeded entries.
 * Auto-rotates in perspective view. No backend calls except auth.
 *
 * Spiral rendered as white dot Points cloud with sizeAttenuation: true,
 * matching the main app's perspective view exactly.
 */

import * as THREE from 'three';
import { dateToPosition, dateToAngle } from './three/spiralMath.js';
import * as api from './api.js';

// ── Scene setup ──────────────────────────────────────────────────────────────

const container = document.getElementById('landing');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#000000');
scene.fog = new THREE.FogExp2(0x000000, 0.0015);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(0, 140, 110);
camera.lookAt(0, 140, 0);

// Lighting — match main app
scene.add(new THREE.AmbientLight(0xffe8c0, 0.3));
const dir = new THREE.DirectionalLight(0xffe8c0, 1.2);
dir.position.set(50, 350, 30);
scene.add(dir);

// ── Demo dot cloud ───────────────────────────────────────────────────────────

const DAYS_IN_YEAR = 365;
const MS_PER_DAY = 86400000;
const today = new Date();
const birthday = new Date(today.getFullYear() - 40, today.getMonth(), today.getDate());

// Generate one point per day
const bday = new Date(birthday);
bday.setHours(0, 0, 0, 0);
const todayClean = new Date(today);
todayClean.setHours(0, 0, 0, 0);
const positions = [];
const cur = new Date(bday);
while (cur <= todayClean) {
  if (!(cur.getMonth() === 1 && cur.getDate() === 29)) {
    const pos = dateToPosition(new Date(cur), bday);
    positions.push(pos.x, pos.y, pos.z);
  }
  cur.setTime(cur.getTime() + MS_PER_DAY);
}

const dotGeo = new THREE.BufferGeometry();
dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

// Same shader as main app emptyBeads.js — sizeAttenuation: true
const dotMat = new THREE.ShaderMaterial({
  uniforms: {
    color: { value: new THREE.Color(0xffffff) },
    size:  { value: 4 },
  },
  vertexShader: `
    uniform float size;
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 color;
    void main() {
      vec2 center = gl_PointCoord - vec2(0.5);
      if (length(center) > 0.5) discard;
      gl_FragColor = vec4(color, 0.5);
    }
  `,
  transparent: true,
  depthWrite: false,
});

const dotCloud = new THREE.Points(dotGeo, dotMat);
scene.add(dotCloud);

// ── Demo beads ───────────────────────────────────────────────────────────────

const demoEntries = [
  { yearsAgo: 38, color: '#e74c3c' },
  { yearsAgo: 30, color: '#3498db' },
  { yearsAgo: 22, color: '#2ecc71' },
  { yearsAgo: 15, color: '#f39c12' },
  { yearsAgo: 5,  color: '#9b59b6' },
  { yearsAgo: 0.5, color: '#e67e22' },
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

// ── Animation loop ───────────────────────────────────────────────────────────

const ROTATION_SPEED = 0.15;
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
