// The driving of Palkon Auto: four profiles, a bicycle-model step with
// speed-dependent steering, and swept sub-step collision against
// architecture, street furniture and other cars. Pure maths, no DOM and no
// imports, so the same code runs in the game and in a Node test harness.
// One unit is one metre; speeds are metres per second, 0-60 mph is 26.8 m/s.
// A car's forward is (sin(angle), cos(angle)) in (x, z), the same convention
// the car mesh is drawn with.

export const PROFILES = {
  compact: {
    name: 'Compact', accel: 7.0, brake: 26, reverseAccel: 10,
    maxSpeed: 40, maxReverse: 12, maxSteer: 0.55, steerFalloff: 0.28,
    wheelBase: 2.6, length: 4.2, width: 1.9,
  },
  sedan: {
    name: 'Sedan', accel: 6.0, brake: 24, reverseAccel: 9,
    maxSpeed: 46, maxReverse: 12, maxSteer: 0.5, steerFalloff: 0.26,
    wheelBase: 2.8, length: 4.6, width: 2.0,
  },
  van: {
    name: 'Van', accel: 4.5, brake: 20, reverseAccel: 8,
    maxSpeed: 34, maxReverse: 10, maxSteer: 0.45, steerFalloff: 0.22,
    wheelBase: 3.2, length: 5.2, width: 2.1,
  },
  coupe: {
    name: 'Coupe', accel: 9.0, brake: 30, reverseAccel: 11,
    maxSpeed: 55, maxReverse: 14, maxSteer: 0.6, steerFalloff: 0.3,
    wheelBase: 2.5, length: 4.4, width: 2.0,
  },
};

export const PROFILE_NAMES = ['compact', 'sedan', 'van', 'coupe'];

// Every car gets a stable id, in creation order: the city cars, the two
// starters and the courier van are always created in the same order, so the
// same car has the same id on every load — the garages use it to put a
// parked car back in its bay after a reload.
let nextVehicleId = 1;

export function createVehicle(profileName, x, z, angle, color) {
  const profile = PROFILES[profileName] ?? PROFILES.sedan;
  return {
    id: `car-${nextVehicleId++}`,
    profile: profileName,
    name: profile.name,
    x, z, angle,
    speed: 0,
    color: color ?? [0.85, 0.35, 0.28],
    headlights: false,
  };
}

/** The two collision circles of a car (front and rear axle), for swept checks. */
function axleCircles(x, z, angle, length) {
  const fx = Math.sin(angle);
  const fz = Math.cos(angle);
  const half = length / 2 - 0.9;
  return [
    { x: x + fx * half, z: z + fz * half, r: 1.3 },
    { x: x - fx * half, z: z - fz * half, r: 1.3 },
  ];
}

function carLength(car) {
  return PROFILES[car.profile].length;
}

function circleHitsBox(cx, cz, r, box) {
  const nx = Math.max(box.x0, Math.min(cx, box.x1));
  const nz = Math.max(box.z0, Math.min(cz, box.z1));
  const dx = cx - nx;
  const dz = cz - nz;
  return dx * dx + dz * dz < r * r;
}

function poseCollides(x, z, angle, length, colliders, obstacles) {
  for (const c of axleCircles(x, z, angle, length)) {
    for (const box of colliders) {
      if (circleHitsBox(c.x, c.z, c.r, box)) return true;
    }
    for (const o of obstacles) {
      const dx = c.x - o.x;
      const dz = c.z - o.z;
      const rr = c.r + o.r;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
  }
  return false;
}

/**
 * One fixed step of driving. `input` is { throttle: 0|1, brake: 0|1,
 * reverse: 0|1, steer: -1..1 } (steer +1 is right). `colliders` are AABB
 * boxes {x0,z0,x1,z1}; `obstacles` are circles {x,z,r} (other cars).
 * The move is swept in sub-steps of at most 0.5 units so a fast car cannot
 * tunnel through a wall, and a blocked move slides along one axis before it
 * stops. Returns true when the car hit something this step.
 */
export function stepVehicle(car, input, dt, colliders, obstacles = []) {
  const p = PROFILES[car.profile];
  const steerAngle = input.steer * p.maxSteer / (1 + Math.abs(car.speed) * p.steerFalloff);
  if (input.throttle) {
    car.speed = Math.min(car.speed + p.accel * dt, p.maxSpeed);
  } else if (input.brake) {
    if (car.speed > 0.5) car.speed = Math.max(0, car.speed - p.brake * dt);
    else car.speed = Math.max(-p.maxReverse, car.speed - p.reverseAccel * dt);
  } else if (input.reverse) {
    car.speed = Math.max(-p.maxReverse, car.speed - p.reverseAccel * dt);
  } else {
    // Rolling drag, and a gentle stop at rest.
    const drag = 0.6 * dt;
    if (car.speed > drag) car.speed -= drag;
    else if (car.speed < -drag) car.speed += drag;
    else car.speed = 0;
  }
  if (car.speed !== 0) {
    car.angle += (car.speed / p.wheelBase) * Math.tan(steerAngle) * dt;
  }
  const distance = car.speed * dt;
  const steps = Math.max(1, Math.ceil(Math.abs(distance) / 0.5));
  const sub = distance / steps;
  const fx = Math.sin(car.angle);
  const fz = Math.cos(car.angle);
  const length = carLength(car);
  let hit = false;
  for (let i = 0; i < steps; i += 1) {
    const nx = car.x + fx * sub;
    const nz = car.z + fz * sub;
    if (!poseCollides(nx, nz, car.angle, length, colliders, obstacles)) {
      car.x = nx;
      car.z = nz;
      continue;
    }
    // Blocked: try sliding along one axis; a slide that moves nothing is
    // not a slide — the car stops against the wall instead of sitting
    // against it at full speed.
    hit = true;
    const startX = car.x;
    const startZ = car.z;
    if (fx !== 0 && !poseCollides(nx, car.z, car.angle, length, colliders, obstacles)) {
      car.x = nx;
    } else if (fz !== 0 && !poseCollides(car.x, nz, car.angle, length, colliders, obstacles)) {
      car.z = nz;
    }
    if (car.x === startX && car.z === startZ) car.speed = 0;
    break;
  }
  return hit;
}

/** Speed in km/h, for the driving HUD. */
export function speedKmh(car) {
  return Math.abs(car.speed) * 3.6;
}

/** The two headlight positions, ahead of the car's nose. */
export function headlightPositions(car) {
  const fx = Math.sin(car.angle);
  const fz = Math.cos(car.angle);
  // Right-hand side of the car, in (x, z): (fz, -fx) is 90 degrees right
  // of the forward (fx, fz).
  const rx = fz;
  const rz = -fx;
  const noseX = car.x + fx * (carLength(car) / 2 + 1.5);
  const noseZ = car.z + fz * (carLength(car) / 2 + 1.5);
  const aheadX = noseX + fx * 8;
  const aheadZ = noseZ + fz * 8;
  return [
    { x: aheadX + rx * 0.7, y: 1.2, z: aheadZ + rz * 0.7, radius: 34, color: [1.0, 0.88, 0.66] },
    { x: aheadX - rx * 0.7, y: 1.2, z: aheadZ - rz * 0.7, radius: 34, color: [1.0, 0.88, 0.66] },
  ];
}
