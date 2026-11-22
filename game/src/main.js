// Palkon Auto, Stage A: boot and the one loop. The player walks Solmar on
// foot (WASD + mouse, Shift to run) between its seven districts, under three
// lighting presets (1 midday, 2 sunset, 3 night). The crowd and the traffic
// advance in fixed 1/60 s steps; the renderer paints what is there.
//
// ?seed=N fixes the city and the crowd. ?shot=day|sunset|night (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { createRenderer, PRESETS } from './gl.js';
import { buildCity, CITY } from './city.js';
import { createCrowd } from './people.js';
import { createHUD } from './hud.js';
import { SHOTS, lookAtYawPitch } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const EYE_HEIGHT = 1.7;
const WALK_SPEED = 9;
const RUN_SPEED = 18;
const PLAYER_RADIUS = 0.6;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261122;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const errorsEl = document.getElementById('errors');
const reportedErrors = [];

function reportError(message) {
  reportedErrors.push(message);
  errorsEl.textContent = reportedErrors.join('\n');
  document.title = `ERROR: ${message}`;
}

window.addEventListener('error', (event) => reportError(String(event.message || event.error)));
window.addEventListener('unhandledrejection', (event) => reportError(String(event.reason)));

function announce(message) {
  status.textContent = message;
}

const city = buildCity(seed);
const crowd = createCrowd(city, seed);
const hud = createHUD(city);
let renderer;
try {
  renderer = createRenderer(canvas);
} catch (err) {
  reportError(err.message);
  throw err;
}
renderer.setStatic(city.staticArrays);

const player = {
  x: city.spawn.x,
  z: city.spawn.z,
  yaw: city.spawn.yaw,
  pitch: 0,
};
let presetName = 'day';
let started = false;
let shotMode = false;
let shotPainted = 0;

const keys = new Set();
let dragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

function setPreset(name) {
  if (!PRESETS[name]) return;
  presetName = name;
}

function collide(x, z) {
  if (x < CITY.x0 + 20 || x > CITY.x1 - 20 || z < CITY.z0 + 20 || z > CITY.z1 - 20) return true;
  if (x < -1545) return true; // the sea
  for (const c of city.colliders) {
    if (
      x + PLAYER_RADIUS > c.x0 && x - PLAYER_RADIUS < c.x1 &&
      z + PLAYER_RADIUS > c.z0 && z - PLAYER_RADIUS < c.z1
    ) return true;
  }
  return false;
}

function movePlayer(dx, dz) {
  const nx = player.x + dx;
  if (!collide(nx, player.z)) player.x = nx;
  const nz = player.z + dz;
  if (!collide(player.x, nz)) player.z = nz;
}

function stepPlayer(dt) {
  let forward = 0;
  let strafe = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
  if (forward === 0 && strafe === 0) return;
  const len = Math.hypot(forward, strafe);
  forward /= len;
  strafe /= len;
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? RUN_SPEED : WALK_SPEED;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  const dx = (sin * forward + cos * strafe) * speed * dt;
  const dz = (-cos * forward + sin * strafe) * speed * dt;
  movePlayer(dx, dz);
}

function nearestLamps(camX, camZ) {
  const scored = city.lamps.map((lamp) => {
    const dx = lamp.x - camX;
    const dz = lamp.z - camZ;
    return { lamp, d2: dx * dx + dz * dz };
  });
  scored.sort((a, b) => a.d2 - b.d2);
  return scored.slice(0, 6).map(({ lamp }) => ({
    x: lamp.x, y: 6, z: lamp.z + 1.1, radius: 26, color: [1.0, 0.72, 0.38],
  }));
}

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

function renderFrame(time) {
  const preset = PRESETS[presetName];
  const camPos = [player.x, EYE_HEIGHT, player.z];
  // In shot mode the camera is a fixed cinematic pose, not the player's eyes.
  const camera = shotMode
    ? { pos: shotCamera.pos, yaw: shotCamera.yaw, pitch: shotCamera.pitch, fov: 70 }
    : { pos: camPos, yaw: player.yaw, pitch: player.pitch, fov: 70 };
  renderer.setDynamic(crowd.buildMesh());
  renderer.render({
    camera,
    preset,
    time,
    lights: nearestLamps(camera.pos[0], camera.pos[2]),
  });
  hud.update(shotMode ? { x: shotCamera.pos[0], z: shotCamera.pos[2], yaw: shotCamera.yaw } : player, preset.label);
}

let shotCamera = null;
function stageShot(name) {
  const shot = SHOTS[name] || SHOTS.day;
  setPreset(shot.preset);
  const { yaw, pitch } = lookAtYawPitch(shot.camera.pos, shot.camera.target);
  shotCamera = { pos: shot.camera.pos, yaw, pitch };
  shotMode = true;
  hud.hideTitle();
  // Let the crowd walk a few seconds in so the frame has life in it.
  for (let i = 0; i < 8 / STEP; i += 1) crowd.update(STEP);
  announce(`Palkon Auto. ${PRESETS[shot.preset].label}.`);
  function paint() {
    renderFrame(8);
    shotPainted += 1;
    if (shotPainted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      document.title = 'READY';
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  hud.showTitle();
  announce('Palkon Auto. Click to start. Walk with W A S D, look with the mouse, keys 1 2 3 change the light.');
  let accumulator = 0;
  let last = performance.now();
  let elapsed = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    elapsed += dt;
    if (!started) {
      // The title screen is the live city, slowly panning.
      player.yaw += dt * 0.04;
    } else {
      accumulator += dt;
      while (accumulator >= STEP) {
        stepPlayer(STEP);
        crowd.update(STEP);
        accumulator -= STEP;
      }
    }
    renderFrame(elapsed);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (event) => {
  if (event.key === '1') setPreset('day');
  else if (event.key === '2') setPreset('sunset');
  else if (event.key === '3') setPreset('night');
  else if ((event.key === 'Enter' || event.key === ' ') && !started && !shotMode) {
    started = true;
    hud.hideTitle();
    announce('Playing. Explore Solmar.');
  }
  keys.add(event.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
  if (!started && !shotMode) {
    started = true;
    hud.hideTitle();
    announce('Playing. Explore Solmar.');
  }
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const dx = event.clientX - lastMouseX;
  const dy = event.clientY - lastMouseY;
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
  if (shotMode) return;
  player.yaw -= dx * 0.004;
  player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - dy * 0.004));
});
canvas.addEventListener('pointerup', () => {
  dragging = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) keys.clear();
});

if (shotName) stageShot(shotName);
else runGame();
