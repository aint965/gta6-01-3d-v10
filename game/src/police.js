// The police of Palkon Auto: witnessed crimes raise a warrant from 1 to 5
// stars; patrol cars pursue, roadblocks form at 3 stars, a helicopter joins
// at 4. A 2.5-second arrest meter fills when the police close in, and an
// arrest sends Mara back to the civic park with a cash penalty and a failed
// mission. An armed guard stands at the Glasspoint office and grapples Mara
// if she gets too close — she can shove him off, but the shove is itself a
// witnessed crime, so fighting back never beats the response, it feeds it.
//
// A crime only counts when someone sees it: a traffic car, a patrol car, or
// the guard within witness range. The warrant cools off on its own when
// Mara stays clean and out of sight for a while. No DOM is touched here, so
// the logic runs the same in the game and in a scripted test.

import { createVehicle, stepVehicle } from './vehicles.js';
import { drawCar, drawPersonAt, rotBox } from './people.js';
import { TILE } from './mesh.js';
import { ROAD_XS, ROAD_ZS } from './city.js';
import { signalState } from './traffic.js';

/** Seconds the arrest meter takes to fill when the police are close. */
export const ARREST_TIME = 2.5;

const WITNESS_RADIUS = 60;
const CRIME_COOLDOWN = 5; // seconds between warrant rises from separate crimes
const QUIET_TIME = 30; // seconds without a crime before the warrant cools
const DECAY_STEP = 20; // seconds per star shed while cooling off
const PATROL_TARGET_SPEED = 20;
const PATROL_COUNTS = [0, 1, 2, 3, 3, 3]; // patrol cars by star level
const ROADBLOCK_STARS = 3;
const HELI_STARS = 4;
const ARREST_RANGE_FOOT = 10;
const ARREST_RANGE_CAR = 6;
const GUARD_POST = { x: 1200, z: -1072 }; // outside the Glasspoint office door
const GUARD_GRAPPLE_RANGE = 5;
const SHOVE_COOLDOWN = 1.5;
const SHOVE_PUSH = 8;
const POLICE_COLOR = [0.12, 0.18, 0.35];

const CRIME_REASONS = {
  collision: 'a crash was witnessed',
  redlight: 'ran a red light in front of a witness',
  shove: 'assaulted the Glasspoint guard',
};

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function starsText(n) {
  return '\u2605'.repeat(n) + '\u2606'.repeat(5 - n);
}

export function createPolice(world) {
  const state = {
    stars: 0,
    arrestMeter: 0, // 0..1; fills in ARREST_TIME when police are close
    crimeCooldown: 0,
    quietTimer: 0,
    decayTimer: 0,
    grappled: false,
    shoveCooldown: 0,
    arrestSuspended: false,
    patrol: [], // vehicles pursuing Mara
    patrolStuck: new Map(),
    roadblocks: [], // { x, z, angle, cars: [car, car] } across a road
    roadblockTimer: 0,
    heli: null, // { x, z, y, angle } circling above Mara
    guard: { x: GUARD_POST.x, z: GUARD_POST.z, angle: Math.PI, mode: 'post', timer: 0 },
  };

  function playerPos() {
    if (world.getMode() === 'drive' && world.getPlayerCar()) {
      const car = world.getPlayerCar();
      return { x: car.x, z: car.z, driving: true, angle: car.angle };
    }
    return { x: world.player.x, z: world.player.z, driving: false, angle: world.player.yaw };
  }

  function witnessesNear(x, z) {
    if (world.traffic) {
      for (const car of world.traffic.cars) {
        if (dist(x, z, car.x, car.z) < WITNESS_RADIUS) return true;
      }
    }
    for (const car of state.patrol) {
      if (dist(x, z, car.x, car.z) < WITNESS_RADIUS) return true;
    }
    if (dist(x, z, state.guard.x, state.guard.z) < WITNESS_RADIUS) return true;
    return false;
  }

  function clearUnits() {
    state.patrol = [];
    state.patrolStuck.clear();
    state.roadblocks = [];
    state.heli = null;
    state.arrestMeter = 0;
    state.grappled = false;
  }

  function setStars(n, reason, silent = false) {
    const next = Math.max(0, Math.min(5, n));
    if (next === state.stars) return false;
    state.stars = next;
    state.quietTimer = 0;
    state.decayTimer = 0;
    if (next === 0) {
      clearUnits();
      if (!silent) world.onEvent('The police have lost Mara \u2014 the warrant is clear');
    } else if (!silent) {
      world.onEvent(`WARRANT ${starsText(next)} \u2014 ${reason}`);
    }
    return true;
  }

  function reportCrime(kind, stars, x, z) {
    if (state.crimeCooldown > 0) return false;
    if (!witnessesNear(x, z)) return false;
    state.crimeCooldown = CRIME_COOLDOWN;
    state.quietTimer = 0;
    state.decayTimer = 0;
    setStars(state.stars + stars, CRIME_REASONS[kind] ?? 'a crime was witnessed');
    return true;
  }

  /** True when a circle of radius 2.5 at (x, z) touches a car collider
   * (buildings, the pond, the canal, the harbour, the city edge). */
  function spotBlocked(x, z) {
    for (const c of world.carColliders) {
      const nx = Math.max(c.x0, Math.min(x, c.x1));
      const nz = Math.max(c.z0, Math.min(z, c.z1));
      const dx = x - nx;
      const dz = z - nz;
      if (dx * dx + dz * dz < 2.5 * 2.5) return true;
    }
    return false;
  }

  /** Roads nearest the player first, as { vertical, at, d }. */
  function roadsByDistance(p) {
    const list = [];
    for (const rx of ROAD_XS) list.push({ vertical: true, at: rx, d: Math.abs(p.x - rx) });
    for (const rz of ROAD_ZS) list.push({ vertical: false, at: rz, d: Math.abs(p.z - rz) });
    list.sort((a, b) => a.d - b.d);
    return list;
  }

  function spawnPatrolCar() {
    const p = playerPos();
    for (const road of roadsByDistance(p)) {
      for (const along of [90, -90, 140, -140]) {
        const x = road.vertical ? road.at : p.x + along;
        const z = road.vertical ? p.z + along : road.at;
        if (spotBlocked(x, z)) continue;
        const angle = road.vertical
          ? (along > 0 ? 0 : Math.PI)
          : (along > 0 ? Math.PI / 2 : -Math.PI / 2);
        const car = createVehicle('sedan', x, z, angle, POLICE_COLOR);
        car.headlights = true;
        return car;
      }
    }
    return null;
  }

  function repositionPatrol(car) {
    const fresh = spawnPatrolCar();
    if (!fresh) return;
    car.x = fresh.x;
    car.z = fresh.z;
    car.angle = fresh.angle;
    car.speed = 0;
  }

  function updatePatrol(dt) {
    const target = PATROL_COUNTS[state.stars];
    while (state.patrol.length < target) {
      const car = spawnPatrolCar();
      if (!car) break;
      state.patrol.push(car);
    }
    if (state.patrol.length > target) {
      state.patrol.length = target;
      for (const key of [...state.patrolStuck.keys()]) {
        if (!state.patrol.includes(key)) state.patrolStuck.delete(key);
      }
    }
    const p = playerPos();
    for (const car of state.patrol) {
      const dx = p.x - car.x;
      const dz = p.z - car.z;
      const d = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      let diff = desired - car.angle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const steer = Math.max(-1, Math.min(1, diff * 2.5));
      // Within 10 m of Mara on foot, stop and hold: the arrest meter does
      // the work from here instead of the car ramming her.
      const nearStop = !p.driving && d < 10;
      const input = {
        throttle: (!nearStop && car.speed < PATROL_TARGET_SPEED) ? 1 : 0,
        brake: (nearStop && car.speed > 0.5) ? 1 : 0,
        reverse: 0,
        steer,
      };
      const obstacles = [];
      if (world.traffic) {
        for (const c of world.traffic.cars) obstacles.push({ x: c.x, z: c.z, r: 2.6 });
      }
      for (const c of state.patrol) {
        if (c !== car) obstacles.push({ x: c.x, z: c.z, r: 2.6 });
      }
      for (const c of world.drivableCars) {
        if (c !== world.getPlayerCar()) obstacles.push({ x: c.x, z: c.z, r: 2.6 });
      }
      stepVehicle(car, input, dt, world.carColliders, obstacles);
      car.headlights = true;
      // Stuck against a wall for 4 s while Mara is far away: reposition to
      // a road near her, GTA-style, instead of sitting there forever.
      if (car.speed < 0.5 && d > 12) {
        const stuck = (state.patrolStuck.get(car) ?? 0) + dt;
        state.patrolStuck.set(car, stuck);
        if (stuck > 4) {
          repositionPatrol(car);
          state.patrolStuck.set(car, 0);
        }
      } else {
        state.patrolStuck.set(car, 0);
      }
    }
  }

  function placeRoadblocks() {
    const p = playerPos();
    const fx = Math.sin(p.angle);
    const fz = Math.cos(p.angle);
    const aheadX = p.x + fx * 90;
    const aheadZ = p.z + fz * 90;
    const placed = [];
    for (const road of roadsByDistance(p)) {
      if (placed.length >= 2) break;
      const x = road.vertical ? road.at : aheadX;
      const z = road.vertical ? aheadZ : road.at;
      // Keep every traffic loop clear, so no traffic car has to drive
      // through a roadblock.
      if (world.traffic && world.traffic.loops.some((loop) => loop.arcOf(x, z).lateral < 20)) continue;
      if (spotBlocked(x, z)) continue;
      if (placed.some((rb) => dist(x, z, rb.x, rb.z) < 100)) continue;
      const angle = road.vertical ? Math.PI / 2 : 0; // cars face across the road
      const off = road.vertical ? { x: 4, z: 0 } : { x: 0, z: 4 };
      const carA = createVehicle('sedan', x - off.x, z - off.z, angle, POLICE_COLOR);
      const carB = createVehicle('sedan', x + off.x, z + off.z, angle, POLICE_COLOR);
      placed.push({ x, z, angle, cars: [carA, carB] });
    }
    return placed;
  }

  function updateRoadblocks(dt) {
    if (state.stars < ROADBLOCK_STARS) {
      if (state.roadblocks.length) state.roadblocks = [];
      return;
    }
    state.roadblockTimer -= dt;
    const p = playerPos();
    const far = state.roadblocks.length === 0
      || state.roadblocks.every((rb) => dist(p.x, p.z, rb.x, rb.z) > 200);
    if (state.roadblocks.length === 0 || (far && state.roadblockTimer <= 0)) {
      state.roadblocks = placeRoadblocks();
      state.roadblockTimer = 12;
      if (state.roadblocks.length) world.onEvent('Police roadblocks are forming ahead');
    }
  }

  function updateHeli(dt) {
    if (state.stars < HELI_STARS) {
      if (state.heli) state.heli = null;
      return;
    }
    const p = playerPos();
    if (!state.heli) {
      state.heli = { x: p.x + 40, z: p.z + 40, y: 60, angle: 0 };
      world.onEvent('A police helicopter joins the pursuit');
    }
    const h = state.heli;
    h.angle += dt * 0.25;
    const tx = p.x + Math.cos(h.angle) * 25;
    const tz = p.z + Math.sin(h.angle) * 25;
    h.x += (tx - h.x) * Math.min(1, dt * 0.5);
    h.z += (tz - h.z) * Math.min(1, dt * 0.5);
  }

  function updateGuard(dt) {
    const g = state.guard;
    if (state.shoveCooldown > 0) state.shoveCooldown -= dt;
    if (g.mode === 'pushed') {
      g.timer -= dt;
      if (g.timer <= 0) g.mode = 'return';
      return;
    }
    if (g.mode === 'return') {
      const d = dist(g.x, g.z, GUARD_POST.x, GUARD_POST.z);
      if (d < 1) {
        g.mode = 'post';
        g.x = GUARD_POST.x;
        g.z = GUARD_POST.z;
        g.angle = Math.PI;
        return;
      }
      const step = Math.min(6 * dt, d);
      g.x += ((GUARD_POST.x - g.x) / d) * step;
      g.z += ((GUARD_POST.z - g.z) / d) * step;
      g.angle = Math.atan2(GUARD_POST.x - g.x, GUARD_POST.z - g.z);
      return;
    }
    // On post: grapple Mara when she comes close while wanted. An innocent
    // courier can walk up to the office — the office missions (5-8)
    // require it — but a wanted Mara is grabbed on sight. (A touch-range
    // grapple for an innocent Mara broke the office missions: the path to
    // the (1200,-1080) waypoint runs straight through the guard post.)
    if (world.getMode() === 'foot' && !state.grappled) {
      const d = dist(world.player.x, world.player.z, g.x, g.z);
      if (state.stars >= 1 && d < GUARD_GRAPPLE_RANGE) {
        state.grappled = true;
        world.onEvent('The Glasspoint guard has grabbed Mara \u2014 press F to shove him off!');
      }
    }
    // While grappled the guard holds her where she stands, in front of her.
    if (state.grappled) {
      g.x = world.player.x + Math.sin(world.player.yaw) * 1.2;
      g.z = world.player.z + Math.cos(world.player.yaw) * 1.2;
      g.angle = Math.atan2(world.player.x - g.x, world.player.z - g.z);
    }
  }

  function updateRedLights() {
    if (world.getMode() !== 'drive' || !world.getPlayerCar()) return;
    const car = world.getPlayerCar();
    if (Math.abs(car.speed) < 4) return;
    if (!world.traffic) return;
    for (const signal of world.traffic.signals) {
      const st = signalState(signal, world.getTime());
      if (st !== 'red' && st !== 'yellow') continue;
      const loop = world.traffic.loops[signal.loop];
      const proj = loop.arcOf(car.x, car.z);
      if (proj.lateral > 7) continue;
      const rel = (proj.d - signal.arc + loop.length) % loop.length;
      if (rel < 12) reportCrime('redlight', 1, car.x, car.z);
    }
  }

  function updateArrest(dt) {
    if (state.arrestSuspended || state.stars === 0) return;
    const p = playerPos();
    let nearest = Infinity;
    for (const car of state.patrol) nearest = Math.min(nearest, dist(p.x, p.z, car.x, car.z));
    if (state.grappled) nearest = 0;
    const inRange = p.driving
      ? (nearest <= ARREST_RANGE_CAR && world.getPlayerCar() && Math.abs(world.getPlayerCar().speed) < 3)
      : nearest <= ARREST_RANGE_FOOT;
    if (inRange) {
      state.arrestMeter += (dt / ARREST_TIME) * (state.grappled ? 2 : 1);
    } else {
      state.arrestMeter -= dt / 1.5;
    }
    state.arrestMeter = Math.max(0, Math.min(1, state.arrestMeter));
    if (state.arrestMeter >= 1) {
      state.arrestMeter = 0;
      state.grappled = false;
      world.onArrest();
      setStars(0, '', true);
    }
  }

  return {
    state,

    /** A crash into a traffic car, witnessed, raises the warrant by 1. */
    reportCollision(x, z) {
      return reportCrime('collision', 1, x, z);
    },

    /** The arrest meter: 0..1, filled in ARREST_TIME when police are close. */
    arrestMeter() {
      return state.arrestMeter;
    },

    isGrappled() {
      return state.grappled;
    },

    /** F: shove the guard. Breaks a grapple and pushes him back 8 m — and
     * is itself a witnessed crime (+2 stars), so it never beats the police. */
    shove() {
      if (state.shoveCooldown > 0) return false;
      if (world.getMode() !== 'foot') return false;
      const g = state.guard;
      const d = dist(world.player.x, world.player.z, g.x, g.z);
      if (d > 4) return false;
      state.shoveCooldown = SHOVE_COOLDOWN;
      const dx = g.x - world.player.x;
      const dz = g.z - world.player.z;
      const len = Math.hypot(dx, dz) || 1;
      g.x += (dx / len) * SHOVE_PUSH;
      g.z += (dz / len) * SHOVE_PUSH;
      g.mode = 'pushed';
      g.timer = 3;
      if (state.grappled) {
        state.grappled = false;
        world.onEvent('Mara shoved the guard off \u2014 the grapple is broken');
      } else {
        world.onEvent('Mara shoved the Glasspoint guard');
      }
      reportCrime('shove', 2, g.x, g.z);
      return true;
    },

    update(dt) {
      if (state.crimeCooldown > 0) state.crimeCooldown -= dt;
      // The warrant cools off when Mara stays clean and out of sight.
      if (state.stars > 0) {
        state.quietTimer += dt;
        if (state.quietTimer > QUIET_TIME) {
          state.decayTimer += dt;
          if (state.decayTimer >= DECAY_STEP) {
            state.decayTimer = 0;
            setStars(state.stars - 1, 'the warrant cools');
          }
        }
      }
      updatePatrol(dt);
      updateRoadblocks(dt);
      updateHeli(dt);
      updateGuard(dt);
      updateRedLights();
      updateArrest(dt);
    },

    /** Patrol cars and roadblock cars, as circles the player car and the
     * traffic must not drive through. */
    getObstacles() {
      const obs = [];
      for (const rb of state.roadblocks) {
        for (const car of rb.cars) obs.push({ x: car.x, z: car.z, r: 2.6 });
      }
      for (const car of state.patrol) obs.push({ x: car.x, z: car.z, r: 2.6 });
      return obs;
    },

    /** The helicopter searchlight, for the night light list. */
    getLights() {
      if (!state.heli) return [];
      const h = state.heli;
      return [{ x: h.x, y: 2, z: h.z, radius: 120, color: [1.0, 0.95, 0.8] }];
    },

    getState() {
      return {
        stars: state.stars,
        arrestMeter: state.arrestMeter,
        grappled: state.grappled,
        patrol: state.patrol.map((c) => ({ x: c.x, z: c.z })),
        roadblocks: state.roadblocks.map((rb) => ({ x: rb.x, z: rb.z })),
        heli: state.heli ? { x: state.heli.x, z: state.heli.z } : null,
        guard: { x: state.guard.x, z: state.guard.z, mode: state.guard.mode },
      };
    },

    /** The police, drawn into the shared dynamic mesh. */
    drawInto(builder, time) {
      for (const car of state.patrol) {
        drawCar(builder, car.x, car.z, car.angle, car.color, car.headlights);
        // The light bar: red and blue lenses alternating twice a second.
        const red = Math.floor(time * 2) % 2 === 0;
        const c = Math.cos(car.angle);
        const s = Math.sin(car.angle);
        for (const [lx, col] of [
          [-0.5, red ? [2.2, 0.2, 0.2] : [0.2, 0.2, 2.2]],
          [0.5, red ? [0.2, 0.2, 2.2] : [2.2, 0.2, 0.2]],
        ]) {
          const wx = car.x + lx * c;
          const wz = car.z - lx * s;
          rotBox(builder, wx, 1.75, wz, 0.5, 0.22, 0.5, car.angle, {
            tile: TILE.lampGlow, color: col, gloss: 0.1, emissive: 1.2,
          });
        }
      }
      for (const rb of state.roadblocks) {
        for (const car of rb.cars) drawCar(builder, car.x, car.z, car.angle, car.color, false);
        // A striped barrier between the two cars.
        rotBox(builder, rb.x, 1.0, rb.z, 7, 0.5, 0.5, rb.angle, {
          tile: TILE.awning, color: [0.95, 0.95, 0.9], gloss: 0.1,
        });
      }
      if (state.heli) {
        const h = state.heli;
        rotBox(builder, h.x, h.y, h.z, 3.2, 2.0, 6.0, h.angle, {
          tile: TILE.darkWall, color: [0.12, 0.18, 0.35], gloss: 0.6,
        });
        rotBox(builder, h.x, h.y + 0.4, h.z - 4.2, 0.8, 0.8, 3.4, h.angle, {
          tile: TILE.darkWall, color: [0.12, 0.18, 0.35], gloss: 0.6,
        });
        const rotor = time * 9;
        rotBox(builder, h.x, h.y + 1.4, h.z, 9.5, 0.12, 0.5, rotor, {
          tile: TILE.darkWall, color: [0.2, 0.2, 0.22], gloss: 0.3,
        });
        rotBox(builder, h.x, h.y + 1.4, h.z, 0.5, 0.12, 9.5, rotor, {
          tile: TILE.darkWall, color: [0.2, 0.2, 0.22], gloss: 0.3,
        });
        rotBox(builder, h.x, h.y - 1.1, h.z + 2.4, 0.7, 0.5, 0.7, h.angle, {
          tile: TILE.lampGlow, color: [1, 0.95, 0.8], gloss: 0.1, emissive: 1.2,
        });
      }
      // The Glasspoint guard: dark uniform, gold badge, cap.
      const g = state.guard;
      drawPersonAt(builder, g.x, g.z, g.angle, [0.16, 0.18, 0.22], [0.72, 0.52, 0.38], 0);
      rotBox(
        builder,
        g.x + Math.sin(g.angle) * 0.2, 1.32, g.z + Math.cos(g.angle) * 0.2,
        0.2, 0.12, 0.05, g.angle,
        { tile: TILE.lampGlow, color: [1, 0.8, 0.3], gloss: 0.1, emissive: 0.8 },
      );
      rotBox(builder, g.x, 1.86, g.z, 0.34, 0.1, 0.34, g.angle, {
        tile: TILE.darkWall, color: [0.1, 0.12, 0.2], gloss: 0.1,
      });
    },

    debug: {
      /** Set the warrant directly (verification shots and tests): the
       * response units spawn on the next update. */
      setStars(n) {
        state.crimeCooldown = 0;
        setStars(n, 'staged for verification');
      },
      /** Put a patrol car where the camera looks (verification shots). */
      placePatrol(i, x, z, angle) {
        const car = state.patrol[i];
        if (!car) return false;
        car.x = x;
        car.z = z;
        car.angle = angle;
        car.speed = 0;
        return true;
      },
      /** Freeze the arrest meter (verification shots stage a pursuit
       * without Mara being arrested mid-frame). */
      suspendArrest(v) {
        state.arrestSuspended = v;
      },
      setArrestMeter(v) {
        state.arrestMeter = Math.max(0, Math.min(1, v));
      },
      getState() {
        return {
          stars: state.stars,
          arrestMeter: state.arrestMeter,
          grappled: state.grappled,
          patrol: state.patrol.length,
          roadblocks: state.roadblocks.length,
          heli: !!state.heli,
          guard: { ...state.guard },
        };
      },
    },
  };
}
