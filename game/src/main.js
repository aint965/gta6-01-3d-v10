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
import { createCrowd, drawCar } from './people.js';
import { createHUD } from './hud.js';
import { SHOTS, lookAtYawPitch } from './shots.js';
import { MeshBuilder } from './mesh.js';
import { createVehicle, stepVehicle, speedKmh, headlightPositions, PROFILE_NAMES } from './vehicles.js';
import { createTraffic, signalState, SIGNAL_CYCLE } from './traffic.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const EYE_HEIGHT = 1.7;
const WALK_SPEED = 9;
const RUN_SPEED = 18;
const PLAYER_RADIUS = 0.6;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const testName = params.get('test');
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
const traffic = createTraffic(city, seed);
const hud = createHUD(city);
// Cars: architecture, street furniture, and the city edge. The on-foot
// player still uses city.colliders only; cars must also stop for lamps,
// trees and benches, and for the sea and the city edge.
const carColliders = city.colliders.concat(city.streetColliders, [
  { x0: -1560, z0: CITY.z0 - 40, x1: -1540, z1: CITY.z1 + 40 },
  { x0: CITY.x1 - 20, z0: CITY.z0 - 40, x1: CITY.x1 + 40, z1: CITY.z1 + 40 },
  { x0: CITY.x0 - 40, z0: CITY.z0 - 40, x1: CITY.x1 + 40, z1: CITY.z0 - 20 },
  { x0: CITY.x0 - 40, z0: CITY.z1 - 20, x1: CITY.x1 + 40, z1: CITY.z1 + 40 },
]);
const dynamicBuilder = new MeshBuilder();
// Every car the player can drive: the parked cars plus two starters by the
// spawn, so the first drive is a short walk away.
const drivableCars = city.parkedCars.map((c, i) => createVehicle(
  PROFILE_NAMES[i % PROFILE_NAMES.length], c.x, c.z, c.angle, c.color,
));
drivableCars.push(createVehicle('coupe', 0, 300, 0, [0.85, 0.35, 0.28]));
drivableCars.push(createVehicle('sedan', 240, 340, Math.PI, [0.22, 0.56, 0.6]));
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
// Driving state: 'foot' or 'drive', and the car being driven, if any.
let mode = 'foot';
let playerCar = null;
// Simulation time in seconds; the traffic signals run on it.
let simTime = 0;
// The headlight test overrides the light list for its two renders.
let lightOverride = null;

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

function nearestDrivable(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of drivableCars) {
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function enterCar() {
  const car = nearestDrivable(5);
  if (!car) return false;
  playerCar = car;
  mode = 'drive';
  car.headlights = presetName !== 'day';
  announce(`Driving. ${car.name}.`);
  return true;
}

function exitCar() {
  if (!playerCar) return;
  const car = playerCar;
  const fx = Math.sin(car.angle);
  const fz = Math.cos(car.angle);
  // Step out to the car's right side; fall back to the left, then behind.
  const spots = [
    [car.x + fz * 3, car.z - fx * 3],
    [car.x - fz * 3, car.z + fx * 3],
    [car.x - fx * 4, car.z - fz * 4],
  ];
  for (const [x, z] of spots) {
    if (!collide(x, z)) { player.x = x; player.z = z; break; }
  }
  player.yaw = Math.atan2(fx, -fz);
  car.speed = 0;
  car.headlights = false;
  playerCar = null;
  mode = 'foot';
  announce('On foot.');
}

function driveObstacles() {
  const obs = [];
  for (const car of drivableCars) {
    if (car !== playerCar) obs.push({ x: car.x, z: car.z, r: 2.6 });
  }
  for (const car of traffic.cars) obs.push({ x: car.x, z: car.z, r: 2.6 });
  return obs;
}

function stepDrive(dt) {
  if (!playerCar) return;
  // The car's angle grows toward +x when it faces +z, which is screen-left
  // in the chase cam, so the D key (turn right) maps to a negative steer.
  const input = {
    throttle: (keys.has('KeyW') || keys.has('ArrowUp')) ? 1 : 0,
    brake: (keys.has('KeyS') || keys.has('ArrowDown')) ? 1 : 0,
    reverse: 0,
    steer: ((keys.has('KeyA') || keys.has('ArrowLeft')) ? 1 : 0)
      - ((keys.has('KeyD') || keys.has('ArrowRight')) ? 1 : 0),
  };
  stepVehicle(playerCar, input, dt, carColliders, driveObstacles());
  playerCar.headlights = presetName !== 'day';
}

/** One fixed step of the whole world: the player, the crowd, the traffic. */
function simStep(dt) {
  if (mode === 'drive') stepDrive(dt);
  else stepPlayer(dt);
  crowd.update(dt);
  traffic.update(dt, simTime, playerCar);
  simTime += dt;
}

function driveInfo() {
  return {
    mode,
    speedKmh: playerCar ? speedKmh(playerCar) : 0,
    profile: playerCar ? playerCar.name : '',
    objective: mode === 'drive'
      ? `Drive the ${playerCar.name} — W/S drive, A/D steer, E to get out`
      : 'Explore Solmar — press E near a car to drive',
    traffic: traffic.cars.map((c) => ({ x: c.x, z: c.z })),
    parked: drivableCars.filter((c) => c !== playerCar).map((c) => ({ x: c.x, z: c.z })),
    signals: traffic.signals.map((s) => ({ x: s.x, z: s.z, state: signalState(s, simTime) })),
  };
}

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

function renderFrame(time) {
  const preset = PRESETS[presetName];
  // The dynamic mesh, rebuilt every frame: people, traffic, signals, and
  // every drivable car (so a car the player drove away is drawn once, where
  // it now is, with its headlights on if it is being driven at night).
  dynamicBuilder.reset();
  crowd.drawInto(dynamicBuilder);
  traffic.drawInto(dynamicBuilder, simTime, presetName !== 'day');
  for (const car of drivableCars) {
    drawCar(dynamicBuilder, car.x, car.z, car.angle, car.color, car.headlights);
  }
  renderer.setDynamic(dynamicBuilder.toArrays());
  let camera;
  if (shotMode) {
    // In shot mode the camera is a fixed cinematic pose, not the player's eyes.
    camera = { pos: shotCamera.pos, yaw: shotCamera.yaw, pitch: shotCamera.pitch, fov: 70 };
  } else if (mode === 'drive' && playerCar) {
    // Chase camera: behind the car, looking down the road. Pull it in
    // step by step if a building stands where it would sit.
    const fx = Math.sin(playerCar.angle);
    const fz = Math.cos(playerCar.angle);
    let dist = 13;
    let camPos = null;
    while (dist >= 3.5) {
      const px = playerCar.x - fx * dist;
      const pz = playerCar.z - fz * dist;
      const blocked = city.colliders.some((c) => px > c.x0 - 0.5 && px < c.x1 + 0.5 && pz > c.z0 - 0.5 && pz < c.z1 + 0.5);
      if (!blocked) { camPos = [px, 5.5, pz]; break; }
      dist -= 3;
    }
    if (!camPos) camPos = [playerCar.x - fx * 3.5, 5.5, playerCar.z - fz * 3.5];
    const look = lookAtYawPitch(camPos, [playerCar.x + fx * 8, 1.5, playerCar.z + fz * 8]);
    camera = { pos: camPos, yaw: look.yaw, pitch: look.pitch, fov: 70 };
  } else {
    camera = { pos: [player.x, EYE_HEIGHT, player.z], yaw: player.yaw, pitch: player.pitch, fov: 70 };
  }
  let lights;
  if (lightOverride !== null) {
    lights = lightOverride;
  } else {
    lights = [];
    if (mode === 'drive' && playerCar && presetName !== 'day') {
      lights.push(...headlightPositions(playerCar));
    }
    lights.push(...nearestLamps(camera.pos[0], camera.pos[2]).slice(0, 6 - lights.length));
  }
  renderer.render({
    camera,
    preset,
    time,
    lights,
  });
  const hudPlayer = mode === 'drive' && playerCar
    ? { x: playerCar.x, z: playerCar.z, yaw: Math.atan2(Math.sin(playerCar.angle), -Math.cos(playerCar.angle)) }
    : player;
  hud.update(hudPlayer, preset.label, driveInfo());
}

let shotCamera = null;
function stageShot(name) {
  const shot = SHOTS[name] || SHOTS.day;
  setPreset(shot.preset);
  const { yaw, pitch } = lookAtYawPitch(shot.camera.pos, shot.camera.target);
  shotCamera = { pos: shot.camera.pos, yaw, pitch };
  shotMode = true;
  hud.hideTitle();
  if (shot.signalRed !== undefined) {
    // Force that signal red at capture time: its phase at t=advance must
    // be mid-red (phase 16 of the cycle).
    const signal = traffic.signals[shot.signalRed];
    const advance = shot.advance ?? 8;
    signal.offset = (((16 - advance) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  }
  if (shot.car) {
    // The shot's car is a real drivable car, placed where the camera looks.
    const car = createVehicle(shot.car.profile, shot.car.x, shot.car.z, shot.car.angle, shot.car.color);
    drivableCars.push(car);
    playerCar = car;
    mode = 'drive';
    car.headlights = shot.preset !== 'day';
  }
  // Let the crowd and the traffic run a few seconds in so the frame has life in it.
  const advance = shot.advance ?? 8;
  for (let i = 0; i < advance / STEP; i += 1) simStep(STEP);
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
        simStep(STEP);
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
  } else if (event.code === 'KeyE' && started && !shotMode) {
    if (mode === 'drive') exitCar();
    else enterCar();
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

/** Project a world point to screen pixels, or null if it is behind the camera. */
function projectToScreen(camPos, yaw, pitch, point) {
  const fov = (70 * Math.PI) / 180;
  const aspect = canvas.width / canvas.height;
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  const sinP = Math.sin(pitch);
  const cosP = Math.cos(pitch);
  // Camera basis: forward, right, up.
  const f = [sinY * cosP, sinP, -cosY * cosP];
  const r = [cosY, 0, sinY];
  const u = [-sinY * sinP, cosP, cosY * sinP];
  const v = [point[0] - camPos[0], point[1] - camPos[1], point[2] - camPos[2]];
  const x = v[0] * r[0] + v[1] * r[1] + v[2] * r[2];
  const y = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
  const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
  if (z <= 0.1) return null;
  const t = Math.tan(fov / 2);
  const sx = Math.round((x / (z * t * aspect) + 1) * 0.5 * canvas.width);
  const sy = Math.round((1 - y / (z * t)) * 0.5 * canvas.height);
  return { x: sx, y: sy };
}

function readPatch(cx, cy, size) {
  const half = Math.floor(size / 2);
  const px = new Uint8Array(size * size * 4);
  renderer.gl.readPixels(cx - half, canvas.height - cy - half, size, size, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, px);
  return px;
}

function patchStats(px) {
  const n = px.length / 4;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
  return sum / n;
}

/** ?test=headlights — freeze a night scene and measure the headlight gain. */
function runHeadlightTest() {
  setPreset('night');
  started = true;
  hud.hideTitle();
  // The player sits in a sedan on the Glasspoint road, facing north, with
  // a white sedan parked 30 metres ahead in the open lane.
  player.x = 480;
  player.z = 20;
  player.yaw = 0;
  const car = createVehicle('sedan', 480, 0, Math.PI, [0.22, 0.56, 0.6]);
  drivableCars.push(car);
  playerCar = car;
  mode = 'drive';
  const parked = createVehicle('sedan', 480, -20, Math.PI, [0.92, 0.9, 0.85]);
  drivableCars.push(parked);
  // The camera looks north from 12 metres up so the three patches land on
  // separate rows of the frame.
  const camPos = [480, 12, 24];
  const { yaw, pitch } = lookAtYawPitch(camPos, [480, 0, -40]);
  // Asphalt in the beam, the car ahead's painted rear (its roof's top face
  // is edge-on from the chase camera and cannot be lit by a lamp-height
  // headlight, so the patch samples the painted rear face the roof crowns),
  // and asphalt past the beam.
  const patches = [
    { name: 'asphalt-in-beam', point: [480, 0.1, -10] },
    { name: 'painted-roof', point: [480, 0.3, -17.7] },
    { name: 'asphalt-outside-beam', point: [480, 0.1, -60] },
  ];
  const size = 16;
  const results = {};
  for (const pass of ['off', 'on']) {
    if (pass === 'off') {
      lightOverride = [];
      car.headlights = false;
    } else {
      lightOverride = headlightPositions(car);
      car.headlights = true;
    }
    renderer.setDynamic(new MeshBuilder().toArrays());
    dynamicBuilder.reset();
    crowd.drawInto(dynamicBuilder);
    traffic.drawInto(dynamicBuilder, simTime, true);
    for (const c of drivableCars) drawCar(dynamicBuilder, c.x, c.z, c.angle, c.color, c.headlights);
    renderer.setDynamic(dynamicBuilder.toArrays());
    renderer.render({
      camera: { pos: camPos, yaw, pitch, fov: 70 },
      preset: PRESETS.night,
      time: 8,
      lights: lightOverride,
    });
    for (const p of patches) {
      const s = projectToScreen(camPos, yaw, pitch, p.point);
      p.screen = s;
      p[pass] = s ? readPatch(s.x, s.y, size) : null;
    }
  }
  const lines = [];
  let passAll = true;
  for (const p of patches) {
    if (!p.off || !p.on) { lines.push(`${p.name}: OFF-SCREEN`); passAll = false; continue; }
    const meanOff = patchStats(p.off);
    const meanOn = patchStats(p.on);
    const gain = meanOn - meanOff;
    const n = p.off.length / 4;
    let over10 = 0;
    for (let i = 0; i < n; i += 1) {
      const d = ((p.on[i * 4] + p.on[i * 4 + 1] + p.on[i * 4 + 2]) - (p.off[i * 4] + p.off[i * 4 + 1] + p.off[i * 4 + 2])) / 3;
      if (d > 10) over10 += 1;
    }
    const pct = (100 * over10) / n;
    results[p.name] = { screen: p.screen, meanOff: +meanOff.toFixed(1), meanOn: +meanOn.toFixed(1), gain: +gain.toFixed(1), pctOver10: +pct.toFixed(1) };
    const lit = p.name !== 'asphalt-outside-beam';
    const ok = lit ? (gain >= 20 && pct >= 90) : Math.abs(gain) <= 1;
    if (!ok) passAll = false;
    lines.push(`${p.name}: screen (${p.screen.x},${p.screen.y}) mean ${meanOff.toFixed(1)} -> ${meanOn.toFixed(1)} gain ${gain.toFixed(1)} pct>10 ${pct.toFixed(1)}% ${ok ? 'OK' : 'FAIL'}`);
  }
  const summary = `HEADLIGHT-TEST ${passAll ? 'PASS' : 'FAIL'} | ${lines.join(' | ')}`;
  document.getElementById('status').textContent = summary;
  document.title = `TEST-DONE ${passAll ? 'PASS' : 'FAIL'}`;
  window.__testResult = { test: 'headlights', pass: passAll, patches: results, summary };
  window.__shotReady = true;
}

/** ?test=drive — scripted play-through: enter, drive, stop at a red, exit, re-enter. */
function runDriveTest() {
  setPreset('day');
  started = true;
  hud.hideTitle();
  const statusEl = document.getElementById('status');
  // The test runs synchronously (see the loop at the bottom): the headless
  // shell throttles requestAnimationFrame to a few frames, so a rAF-driven
  // test never finishes there. The simulation is pure JS and runs in well
  // under a second; one render at the end smoke-checks the chase camera.
  // A small autopilot: steer toward the waypoint, keep the speed low, brake
  // when close. Waypoints run down the Canal Ward road, east on the
  // Citrus road, then north on the Glasspoint road.
  const waypoints = [
    [0, 830],
    [470, 840],
    [480, 130],
  ];
  let wp = 0;
  let phase = 'enter';
  let phaseSteps = 0;
  let totalSteps = 0;
  let lastX = 0;
  let lastZ = 0;
  let distance = 0;
  let maxKmh = 0;
  let stoppedAtRed = false;
  let stoppedAtRedAt = null;
  let reverseMax = 0;
  let exitPos = null;
  let reenterProfile = null;
  const districts = new Set();
  const entered = [];
  const wpLog = [];
  let error = null;
  let blockInfo = 'none';
  let blockedTime = 0;
  let unsticks = 0;
  // The player stands beside the first starter car, on the road.
  player.x = 2;
  player.z = 296;
  player.yaw = 0;
  function autopilot(tx, tz) {
    const car = playerCar;
    const dx = tx - car.x;
    const dz = tz - car.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const steer = Math.max(-1, Math.min(1, diff * 2.5));
    keys.delete('KeyA');
    keys.delete('KeyD');
    if (steer > 0.05) keys.add('KeyA');
    else if (steer < -0.05) keys.add('KeyD');
    keys.delete('KeyW');
    keys.delete('KeyS');
    if (car.speed < 8) keys.add('KeyW');
    if (dist < 20 && car.speed > 6) keys.add('KeyS');
    return dist;
  }
  function finish() {
    keys.clear();
    const summary = `DRIVE-TEST ${error ? `FAIL ${error}` : 'PASS'} | entered ${entered.join(',')} | distance ${distance.toFixed(0)}m | maxSpeed ${maxKmh.toFixed(0)} km/h | districts ${[...districts].join('/')} | stoppedAtRed ${stoppedAtRed}${stoppedAtRedAt ? ` (${stoppedAtRedAt})` : ''} | reverse ${reverseMax.toFixed(1)} m/s | exit ${exitPos ? `(${exitPos[0].toFixed(0)},${exitPos[1].toFixed(0)})` : 'none'} | reentered ${reenterProfile || 'none'} | unsticks ${unsticks} | block ${blockInfo} | wp ${wp}/3 ${wpLog.map((w) => `#${w[0]}@${w[1]} (${w[2]},${w[3]})`).join(' ')} | final ${playerCar ? `(${playerCar.x.toFixed(0)},${playerCar.z.toFixed(0)})` : 'none'}`;
    statusEl.textContent = summary;
    document.title = `TEST-DONE ${error ? 'FAIL' : 'PASS'}`;
    window.__testResult = {
      test: 'drive', pass: !error, entered, distance: +distance.toFixed(1),
      maxKmh: +maxKmh.toFixed(1), districts: [...districts],
      stoppedAtRed, stoppedAtRedAt, reverseMax: +reverseMax.toFixed(2),
      exitPos, reenterProfile, error, summary,
    };
    window.__shotReady = true;
  }
  function step() {
    totalSteps += 1;
    if (totalSteps > 30000) { error = 'timeout'; return false; }
    if (phase !== 'enter' && playerCar) {
      const d = Math.hypot(playerCar.x - lastX, playerCar.z - lastZ);
      distance += d;
      lastX = playerCar.x;
      lastZ = playerCar.z;
      maxKmh = Math.max(maxKmh, speedKmh(playerCar));
      const distName = hud.districtAt(playerCar.x, playerCar.z);
      if (distName) districts.add(distName);
      // Watch for a traffic car stopped at a red signal: stopped, on a loop
      // with a non-green signal, within 25 arc units before its stop line.
      if (!stoppedAtRed) {
        for (const tc of traffic.cars) {
          if (tc.speed > 0.5) continue;
          const loop = traffic.loops[tc.loop];
          for (const sig of traffic.signals) {
            if (sig.loop !== tc.loop) continue;
            const st = signalState(sig, simTime);
            if (st !== 'red' && st !== 'allred' && st !== 'yellow') continue;
            const rel = (sig.arc - tc.d + loop.length) % loop.length;
            if (rel < 25) { stoppedAtRed = true; stoppedAtRedAt = `loop ${tc.loop} ${st}`; break; }
          }
          if (stoppedAtRed) break;
        }
      }
    }
    phaseSteps += 1;
    if (phase === 'enter') {
      if (enterCar()) {
        entered.push(playerCar.name);
        lastX = playerCar.x;
        lastZ = playerCar.z;
        phase = 'drive';
        phaseSteps = 0;
      } else if (phaseSteps > 60) { error = 'could not enter car'; return false; }
    } else if (phase === 'drive') {
      const [tx, tz] = waypoints[wp];
      const dist = autopilot(tx, tz);
      // If the car is blocked (a traffic car crossing its path, a deadlocked
      // yield), back up for a second and a half to let the traffic pass.
      if (playerCar.speed < 0.5 && dist > 10) {
        blockedTime += STEP;
        if (blockedTime > 2) {
          // Record what is actually in the way, for the report.
          let near = null;
          let nearD = 1e9;
          for (const tc of traffic.cars) {
            const d = Math.hypot(tc.x - playerCar.x, tc.z - playerCar.z);
            if (d < nearD) { nearD = d; near = tc; }
          }
          const sig = near ? traffic.signals.find((s) => s.loop === near.loop) : null;
          blockInfo = near
            ? `traffic (${near.x.toFixed(0)},${near.z.toFixed(0)}) v${near.speed.toFixed(1)} loop${near.loop} sig=${sig ? signalState(sig, simTime) : '?'}` 
            : 'no traffic near';
          phase = 'unstick';
          phaseSteps = 0;
          unsticks += 1;
        }
      } else blockedTime = 0;
      if (dist < 8) {
        wpLog.push([wp, totalSteps, playerCar.x.toFixed(0), playerCar.z.toFixed(0)]);
        wp += 1;
        if (wp >= waypoints.length) { phase = 'brake'; phaseSteps = 0; }
      }
    } else if (phase === 'unstick') {
      // Back up for a second and a half, then wait three seconds so the
      // traffic car that blocked the crossing can clear it before driving on.
      keys.clear();
      if (phaseSteps < 90) keys.add('KeyS');
      if (phaseSteps >= 270) {
        phase = 'drive';
        phaseSteps = 0;
        blockedTime = 0;
      }
    } else if (phase === 'brake') {
      keys.clear();
      keys.add('KeyS');
      if (playerCar.speed < 0.5) { phase = 'reverse'; phaseSteps = 0; }
      else if (phaseSteps > 600) { error = 'brake did not stop the car'; return false; }
    } else if (phase === 'reverse') {
      keys.clear();
      keys.add('KeyS');
      reverseMax = Math.min(reverseMax, playerCar.speed);
      if (phaseSteps >= 120) {
        phase = 'exit';
        phaseSteps = 0;
      }
    } else if (phase === 'exit') {
      keys.clear();
      const car = playerCar;
      exitCar();
      exitPos = [car.x, car.z];
      if (!drivableCars.includes(car)) { error = 'exited car did not persist'; finish(); return; }
      // Step beside the second starter car and get into it.
      player.x = 242;
      player.z = 336;
      phase = 'reenter';
      phaseSteps = 0;
    } else if (phase === 'reenter') {
      if (enterCar()) {
        reenterProfile = playerCar.name;
        entered.push(playerCar.name);
        phase = 'drive2';
        phaseSteps = 0;
      } else if (phaseSteps > 60) { error = 'could not re-enter the second car'; return false; }
    } else if (phase === 'drive2') {
      keys.clear();
      keys.add('KeyW');
      if (phaseSteps >= 180) { return false; }
    }
    simStep(STEP);
    return true;
  }
  // Run the whole play-through now, synchronously, and report progress
  // every 2000 steps so a stuck run still shows where it stopped.
  let guard = 0;
  while (step()) {
    guard += 1;
    if (guard % 2000 === 0) {
      statusEl.textContent = `DRIVE-PROGRESS phase ${phase} wp ${wp}/${waypoints.length} car ${playerCar ? `(${playerCar.x.toFixed(0)},${playerCar.z.toFixed(0)}) ${speedKmh(playerCar).toFixed(0)} km/h` : 'none'} steps ${totalSteps} unsticks ${unsticks}`;
    }
  }
  // One render at the end smoke-checks the chase camera and headlights
  // without paying the software renderer's per-frame cost.
  renderFrame(totalSteps * STEP);
  finish();
}

if (testName === 'drive') runDriveTest();
else if (testName === 'headlights') runHeadlightTest();
else if (shotName) stageShot(shotName);
else runGame();
