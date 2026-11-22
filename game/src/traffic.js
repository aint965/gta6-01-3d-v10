// The traffic of Palkon Auto: cars on connected lane loops that follow the
// car ahead and stop for red signals, and the 3D traffic signals themselves
// with a green / yellow / all-red / red cycle. Loops run on real roads, so
// no car ever drives cross-country. All state is deterministic from the seed.

import { createRandom } from './rng.js';
import { drawCar, rotBox } from './people.js';
import { TILE } from './mesh.js';
import { PROFILE_NAMES } from './vehicles.js';

/** The signal cycle, in seconds: green 8, yellow 2, all-red 2, red 8, yellow 2. */
export const SIGNAL_CYCLE = 22;

/** The lamp a signal shows at simulation time t (seconds). */
export function signalState(signal, t) {
  const p = (((t + signal.offset) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  if (p < 8) return 'green';
  if (p < 10) return 'yellow';
  if (p < 12) return 'allred';
  if (p < 20) return 'red';
  return 'yellow';
}

/** A closed polyline loop with arc-length parametrisation. */
function makeLoop(points) {
  const cum = [0];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = cum[points.length];
  return {
    points,
    length,
    posAt(d) {
      const dd = (((d % length) + length) % length);
      let i = 0;
      while (i < points.length - 1 && cum[i + 1] <= dd) i += 1;
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const seg = cum[i + 1] - cum[i];
      const t = seg === 0 ? 0 : (dd - cum[i]) / seg;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      // Drive on the right: 5 units to the right of the centreline, so a
      // player driving the wrong way down a one-way leg passes the oncoming
      // traffic instead of meeting it head-on. (Right of the forward
      // (dx, dz) in (x east, z south) is (-dz, dx).) The offset swings
      // around a corner over the last 10 metres of the leg, so the car
      // does not teleport sideways when the loop turns.
      const r1x = (-dz / len) * 5;
      const r1z = (dx / len) * 5;
      let rx = r1x;
      let rz = r1z;
      const distToCorner = (1 - t) * seg;
      if (distToCorner < 10) {
        const c = points[(i + 2) % points.length];
        const ndx = c.x - b.x;
        const ndz = c.z - b.z;
        const nlen = Math.hypot(ndx, ndz) || 1;
        const k = 1 - distToCorner / 10;
        rx = r1x + (((-ndz / nlen) * 5) - r1x) * k;
        rz = r1z + (((ndx / nlen) * 5) - r1z) * k;
      }
      return {
        x: a.x + dx * t + rx,
        z: a.z + dz * t + rz,
        angle: Math.atan2(dx, dz),
      };
    },
    /** Arc distance and lateral distance of the nearest point on the loop. */
    arcOf(x, z) {
      let best = null;
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len2 = dx * dx + dz * dz;
        let t = len2 === 0 ? 0 : ((x - a.x) * dx + (z - a.z) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + dx * t;
        const pz = a.z + dz * t;
        const lateral = Math.hypot(x - px, z - pz);
        if (!best || lateral < best.lateral) {
          best = { d: cum[i] + t * Math.sqrt(len2), lateral };
        }
      }
      return best;
    },
  };
}

// Five lane loops, each a rectangle on real roads (ROAD_XS x ROAD_ZS).
const LOOP_POINTS = [
  [ { x: -480, z: -360 }, { x: 480, z: -360 }, { x: 480, z: 120 }, { x: -480, z: 120 } ],
  [ { x: -240, z: 360 }, { x: 240, z: 360 }, { x: 240, z: 840 }, { x: -240, z: 840 } ],
  [ { x: 720, z: 360 }, { x: 1440, z: 360 }, { x: 1440, z: 1080 }, { x: 720, z: 1080 } ],
  [ { x: -1200, z: -840 }, { x: -720, z: -840 }, { x: -720, z: 360 }, { x: -1200, z: 360 } ],
  [ { x: 720, z: -1320 }, { x: 1440, z: -1320 }, { x: 1440, z: -360 }, { x: 720, z: -360 } ],
];

// Signals: one per loop leg, each governing the traffic that travels past
// it. `dir` is the travel direction at the signal; the head faces oncoming
// traffic. Offsets stagger the cycle so the city does not flip at once.
const SIGNAL_DEFS = [
  { loop: 0, x: 0, z: -360, dir: { x: 1, z: 0 }, offset: 0 },
  { loop: 0, x: 0, z: 120, dir: { x: -1, z: 0 }, offset: 7 },
  { loop: 1, x: 0, z: 360, dir: { x: 1, z: 0 }, offset: 13 },
  { loop: 2, x: 1080, z: 360, dir: { x: 1, z: 0 }, offset: 3 },
  { loop: 3, x: -960, z: -840, dir: { x: 1, z: 0 }, offset: 17 },
  { loop: 4, x: 1080, z: -1320, dir: { x: 1, z: 0 }, offset: 9 },
];

const CAR_COLORS = [
  [0.85, 0.35, 0.28], [0.22, 0.56, 0.6], [0.92, 0.9, 0.85], [0.16, 0.18, 0.22],
  [0.95, 0.75, 0.2], [0.5, 0.3, 0.55], [0.85, 0.5, 0.3], [0.6, 0.65, 0.7],
];

const CRUISE = { compact: 12, sedan: 13, van: 10, coupe: 14 };

const CARS_PER_LOOP = [6, 6, 7, 6, 7]; // 32 cars, denser than Stage B's 20

export function createTraffic(city, seed) {
  const rng = createRandom((seed ^ 0x51ab) >>> 0);
  const loops = LOOP_POINTS.map((pts) => makeLoop(pts));
  const signals = SIGNAL_DEFS.map((def) => {
    const loop = loops[def.loop];
    return { ...def, arc: loop.arcOf(def.x, def.z).d };
  });
  const cars = [];
  for (let li = 0; li < loops.length; li += 1) {
    const loop = loops[li];
    for (let i = 0; i < CARS_PER_LOOP[li]; i += 1) {
      const profile = PROFILE_NAMES[(li + i) % PROFILE_NAMES.length];
      cars.push({
        loop: li,
        d: (i / CARS_PER_LOOP[li]) * loop.length + rng.range(0, 40),
        speed: 0,
        cruise: CRUISE[profile],
        profile,
        color: rng.pick(CAR_COLORS),
        x: 0, z: 0, angle: 0,
      });
    }
  }
  // Place every car on its loop once, so the first frame is already right.
  for (const car of cars) {
    const pos = loops[car.loop].posAt(car.d);
    car.x = pos.x;
    car.z = pos.z;
    car.angle = pos.angle;
    car.speed = car.cruise;
  }

  return {
    loops,
    signals,
    cars,
    /** Advance the traffic by dt at simulation time t. `extraObstacles`
     * are police roadblocks and patrol cars across a lane: traffic stops
     * behind them the same way it stops behind the player's car. */
    update(dt, t, playerCar, extraObstacles = []) {
      for (const car of cars) {
        const loop = loops[car.loop];
        let target = car.cruise;
        // Follow the car ahead on the same loop.
        let nearestGap = Infinity;
        for (const other of cars) {
          if (other === car || other.loop !== car.loop) continue;
          const gap = (other.d - car.d + loop.length) % loop.length;
          if (gap > 0.01 && gap < nearestGap) nearestGap = gap;
        }
        if (nearestGap < 30) {
          target = Math.min(target, Math.max(0, ((nearestGap - 12) / 18) * car.cruise));
        }
        // Stop for a red or yellow signal ahead.
        for (const signal of signals) {
          if (signal.loop !== car.loop) continue;
          const state = signalState(signal, t);
          if (state === 'green') continue;
          const rel = (signal.arc - 12 - car.d + loop.length) % loop.length;
          if (rel > 70) continue;
          const stopping = (car.speed * car.speed) / 16 + 6;
          if (rel < stopping) {
            target = Math.min(target, Math.max(0, (rel - 2) * 0.7));
          }
        }
        // The player's car, a police car, or a roadblock parked across the
        // lane ahead, is an obstacle.
        const obstacles = [];
        if (playerCar) obstacles.push(playerCar);
        for (const o of extraObstacles) obstacles.push(o);
        for (const obstacle of obstacles) {
          const proj = loop.arcOf(obstacle.x, obstacle.z);
          if (proj.lateral < 7) {
            const gap = (proj.d - car.d + loop.length) % loop.length;
            if (gap > 0.01 && gap < 25) {
              target = Math.min(target, Math.max(0, ((gap - 12) / 13) * car.cruise));
            }
          }
        }
        if (car.speed < target) car.speed = Math.min(target, car.speed + 6 * dt);
        else car.speed = Math.max(target, car.speed - 10 * dt);
        car.d = (car.d + car.speed * dt) % loop.length;
        const pos = loop.posAt(car.d);
        car.x = pos.x;
        car.z = pos.z;
        car.angle = pos.angle;
      }
    },
    /** Draw every traffic car and every signal into the dynamic mesh.
     * Cars far from the camera lose their wheels and headlight lenses. */
    drawInto(builder, t, night, camX = 0, camZ = 0) {
      for (const car of cars) {
        const d = Math.hypot(car.x - camX, car.z - camZ);
        drawCar(builder, car.x, car.z, car.angle, car.color, night, d < 400 ? 'full' : 'low');
      }
      for (const signal of signals) {
        drawSignal(builder, signal, signalState(signal, t));
      }
    },
  };
}

const LAMP = {
  red: { color: [2.2, 0.15, 0.15], off: [0.25, 0.06, 0.06] },
  yellow: { color: [2.2, 1.4, 0.15], off: [0.25, 0.18, 0.05] },
  green: { color: [0.25, 2.0, 0.45], off: [0.06, 0.22, 0.08] },
};

function drawSignal(builder, signal, state) {
  const dir = signal.dir;
  // Right of the travel direction, where the pole stands.
  const rx = -dir.z;
  const rz = dir.x;
  const poleX = signal.x + rx * 11;
  const poleZ = signal.z + rz * 11;
  // The pole and the arm over the lane.
  builder.addBox(poleX, 3, poleZ, 0.5, 6, 0.5, {
    tile: TILE.darkWall, color: [0.25, 0.25, 0.28], gloss: 0.4,
  });
  const armAngle = Math.atan2(rx, rz);
  rotBox(builder, signal.x + rx * 5.5, 6, signal.z + rz * 5.5, 0.5, 0.5, 11, armAngle, {
    tile: TILE.darkWall, color: [0.25, 0.25, 0.28], gloss: 0.4,
  });
  // The head hangs over the lane centre, facing oncoming traffic.
  const headAngle = Math.atan2(-dir.x, -dir.z);
  const hx = signal.x;
  const hz = signal.z;
  rotBox(builder, hx, 5.2, hz, 1.0, 2.8, 0.6, headAngle, {
    tile: TILE.darkWall, color: [0.12, 0.12, 0.14], gloss: 0.3,
  });
  const c = Math.cos(headAngle);
  const s = Math.sin(headAngle);
  const lamps = [
    { name: 'red', dy: 0.9, on: state === 'red' || state === 'allred' },
    { name: 'yellow', dy: 0, on: state === 'yellow' },
    { name: 'green', dy: -0.9, on: state === 'green' },
  ];
  for (const lamp of lamps) {
    const def = LAMP[lamp.name];
    // Local (0, dy, +0.4) is the front face of the head, toward the driver.
    const lx = 0;
    const lz = 0.4;
    const wx = hx + lx * c + lz * s;
    const wz = hz - lx * s + lz * c;
    rotBox(builder, wx, 5.2 + lamp.dy, wz, 0.55, 0.55, 0.2, headAngle, {
      tile: lamp.on ? TILE.lampGlow : TILE.darkWall,
      color: lamp.on ? def.color : def.off,
      gloss: 0.1,
      emissive: lamp.on ? 1.2 : 0,
    });
  }
}
