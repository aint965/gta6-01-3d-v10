// The garages of Palkon Auto: three buyable lock-ups across Solmar. Mara
// buys one with mission earnings (walk up and press Q), parks a car in it by
// getting out inside, and the garage and the car stay in the save — a fresh
// load puts the car back in its bay. The garages ride in the same save as
// the evidence and the cash (missions.js writes them via getGarageSave).
//
// Each garage sits on the first clear plot near its centre: clear of every
// building and street prop, off the road itself but within 30 m of one, so
// Mara can drive straight in. The scan order is fixed, so the same seed
// always places the same garages.

import { createVehicle } from './vehicles.js';
import { rotBox } from './people.js';
import { TILE } from './mesh.js';
import { ROAD_XS, ROAD_ZS } from './city.js';

const SAVE_KEY = 'palkon-auto-save-v1';

const GARAGE_DEFS = [
  { id: 0, name: 'South Market Garage', price: 400, cx: 190, cz: 920 },
  { id: 1, name: 'Citrus Quarter Garage', price: 700, cx: 940, cz: 1040 },
  { id: 2, name: 'Glasspoint Garage', price: 1000, cx: 940, cz: -1360 },
];
const GARAGE_W = 18;
const GARAGE_D = 14;
const BUY_RANGE = 14;

function rectsOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

function nearRoad(x, z) {
  return ROAD_XS.some((rx) => Math.abs(x - rx) <= 30)
    || ROAD_ZS.some((rz) => Math.abs(z - rz) <= 30);
}

function overlapsRoad(f) {
  return ROAD_XS.some((rx) => f.x0 < rx + 11 && f.x1 > rx - 11)
    || ROAD_ZS.some((rz) => f.z0 < rz + 11 && f.z1 > rz - 11);
}

function nearest(list, v) {
  let best = list[0];
  for (const n of list) {
    if (Math.abs(n - v) < Math.abs(best - v)) best = n;
  }
  return best;
}

export function createGarages(world) {
  const spots = GARAGE_DEFS.map((def) => {
    let found = null;
    outer: for (let dz = -160; dz <= 160; dz += 20) {
      for (let dx = -200; dx <= 200; dx += 20) {
        const x = def.cx + dx;
        const z = def.cz + dz;
        if (x < -1890 || x > 1890 || z < -1698 || z > 1698) continue;
        if (!nearRoad(x, z)) continue;
        const f = {
          x0: x - GARAGE_W / 2, z0: z - GARAGE_D / 2,
          x1: x + GARAGE_W / 2, z1: z + GARAGE_D / 2,
        };
        if (overlapsRoad(f)) continue;
        if (world.city.colliders.concat(world.city.streetColliders)
          .some((c) => rectsOverlap(f, c))) continue;
        found = { x, z };
        break outer;
      }
    }
    const spot = found ?? { x: def.cx, z: def.cz };
    // The garage faces the nearest road: its open front looks at the road.
    const roadX = nearest(ROAD_XS, spot.x);
    const roadZ = nearest(ROAD_ZS, spot.z);
    const faceX = Math.abs(spot.x - roadX) <= Math.abs(spot.z - roadZ);
    let angle;
    if (faceX) angle = spot.x < roadX ? Math.PI / 2 : -Math.PI / 2;
    else angle = spot.z < roadZ ? 0 : Math.PI;
    return { ...def, x: spot.x, z: spot.z, angle };
  });

  // The back and side walls, as world-axis boxes (every garage faces a
  // cardinal direction, so its walls stay axis-aligned). The open front
  // has no wall: Mara drives in through it.
  const colliders = [];
  for (const g of spots) {
    const c = Math.cos(g.angle);
    const s = Math.sin(g.angle);
    const at = (lx, lz) => [g.x + lx * c + lz * s, g.z - lx * s + lz * c];
    const wall = (lx, lz, w, d) => {
      const [wx, wz] = at(lx, lz);
      const hw = (Math.abs(c) > 0.5 ? w : d) / 2;
      const hd = (Math.abs(c) > 0.5 ? d : w) / 2;
      colliders.push({ x0: wx - hw, z0: wz - hd, x1: wx + hw, z1: wz + hd });
    };
    wall(0, -GARAGE_D / 2, GARAGE_W, 0.6); // back
    wall(-GARAGE_W / 2 + 0.3, 0, 0.6, GARAGE_D); // left
    wall(GARAGE_W / 2 - 0.3, 0, 0.6, GARAGE_D); // right
  }

  const state = {
    owned: [], // garage ids
    parked: {}, // garageId -> { carId, profile, color, x, z, angle }
  };

  function loadSaved() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== 1 || !saved.garages) return;
      if (Array.isArray(saved.garages.owned)) {
        state.owned = saved.garages.owned
          .filter((id) => GARAGE_DEFS.some((d) => d.id === id));
      }
      if (saved.garages.parked) {
        for (const [gid, p] of Object.entries(saved.garages.parked)) {
          if (GARAGE_DEFS.some((d) => d.id === Number(gid)) && p && p.carId) {
            state.parked[gid] = p;
          }
        }
      }
    } catch {
      // A corrupt save starts with no garages; the game never depends on it.
    }
  }
  loadSaved();

  function nearestGarage(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const g of spots) {
      const d = Math.hypot(world.player.x - g.x, world.player.z - g.z);
      if (d < bestD) { best = g; bestD = d; }
    }
    return best;
  }

  /** The owned garage whose bay (x, z) falls in, in garage-local axes. */
  function garageAt(x, z) {
    for (const g of spots) {
      if (!state.owned.includes(g.id)) continue;
      const dx = x - g.x;
      const dz = z - g.z;
      const c = Math.cos(-g.angle);
      const s = Math.sin(-g.angle);
      const lx = dx * c + dz * s;
      const lz = -dx * s + dz * c;
      if (Math.abs(lx) < GARAGE_W / 2 - 1 && Math.abs(lz) < GARAGE_D / 2 - 1) return g;
    }
    return null;
  }

  return {
    spots,
    colliders,

    /** What missions.js writes into the save, next to cash and evidence. */
    getSave() {
      return { owned: [...state.owned], parked: { ...state.parked } };
    },

    list() {
      return spots.map((g) => ({
        id: g.id, name: g.name, price: g.price, x: g.x, z: g.z, angle: g.angle,
        owned: state.owned.includes(g.id),
      }));
    },

    getState() {
      return { owned: [...state.owned], parked: { ...state.parked } };
    },

    /** Q near a for-sale garage: buy it with mission earnings. */
    tryBuy() {
      const g = nearestGarage(BUY_RANGE);
      if (!g) return { ok: false, reason: 'no garage nearby' };
      if (state.owned.includes(g.id)) return { ok: false, reason: 'already owned' };
      if (world.missions.state.cash < g.price) return { ok: false, reason: `needs $${g.price}` };
      world.missions.state.cash -= g.price;
      state.owned.push(g.id);
      world.missions.save();
      world.onEvent(`Bought the ${g.name} \u00b7 -$${g.price}`);
      return { ok: true, garage: g };
    },

    /** Getting out of a car inside an owned garage parks it there. */
    onExitCar(car) {
      const g = garageAt(car.x, car.z);
      if (!g) return false;
      // One car, one garage: clear it out of any other bay first.
      for (const [gid, p] of Object.entries(state.parked)) {
        if (p.carId === car.id && Number(gid) !== g.id) delete state.parked[gid];
      }
      state.parked[g.id] = {
        carId: car.id, profile: car.profile, color: car.color,
        x: car.x, z: car.z, angle: car.angle,
      };
      car.garaged = g.id;
      world.missions.save();
      world.onEvent(`Parked the ${car.name} in the ${g.name}`);
      return true;
    },

    /** Getting back into a parked car takes it out of the garage. */
    onEnterCar(car) {
      if (car.garaged === undefined || car.garaged === null) return false;
      delete state.parked[car.garaged];
      car.garaged = null;
      world.missions.save();
      return true;
    },

    /** After a reload the drivable cars are rebuilt from the city, so a
     * stored car is back at its original spot: move it into its bay by its
     * stable id. Returns how many cars were restored. */
    restore(drivableCars) {
      let restored = 0;
      for (const [gid, p] of Object.entries(state.parked)) {
        let car = drivableCars.find((c) => c.id === p.carId);
        if (!car) {
          car = createVehicle(p.profile, p.x, p.z, p.angle, p.color);
          car.id = p.carId; // keep the saved id, so the next load finds it
          drivableCars.push(car);
        }
        car.x = p.x;
        car.z = p.z;
        car.angle = p.angle;
        car.speed = 0;
        car.garaged = Number(gid);
        restored += 1;
      }
      return restored;
    },

    getDossier() {
      return spots.map((g) => ({
        id: g.id,
        name: g.name,
        price: g.price,
        owned: state.owned.includes(g.id),
        parked: state.parked[g.id] ? state.parked[g.id].profile : null,
      }));
    },

    /** The garages, drawn into the shared dynamic mesh. */
    drawInto(builder, time) {
      for (const g of spots) {
        const owned = state.owned.includes(g.id);
        const c = Math.cos(g.angle);
        const s = Math.sin(g.angle);
        const at = (lx, ly, lz) => [g.x + lx * c + lz * s, ly, g.z - lx * s + lz * c];
        // Floor slab, back and side walls, a roof — the front stays open.
        rotBox(builder, g.x, 0.15, g.z, GARAGE_W, 0.3, GARAGE_D, g.angle, {
          tile: TILE.concrete, color: [0.8, 0.78, 0.72], gloss: 0.1,
        });
        const [bx, by, bz] = at(0, 2.5, -GARAGE_D / 2);
        rotBox(builder, bx, by, bz, GARAGE_W, 5, 0.6, g.angle, {
          tile: TILE.coralWall, color: [1, 1, 1], gloss: 0.05,
        });
        for (const side of [-1, 1]) {
          const [wx, wy, wz] = at(side * (GARAGE_W / 2 - 0.3), 2.5, 0);
          rotBox(builder, wx, wy, wz, 0.6, 5, GARAGE_D, g.angle, {
            tile: TILE.coralWall, color: [1, 1, 1], gloss: 0.05,
          });
        }
        const [rx, ry, rz] = at(0, 5.2, 0);
        rotBox(builder, rx, ry, rz, GARAGE_W + 0.6, 0.5, GARAGE_D + 0.6, g.angle, {
          tile: TILE.roofTerra, color: [0.9, 0.88, 0.82], gloss: 0.1,
        });
        // A sign by the front: gold while for sale, teal once owned; a
        // small gold diamond bobs above a garage that is still for sale.
        const [sx, sy, sz] = at(GARAGE_W / 2 + 1.5, 0, GARAGE_D / 2 + 1);
        rotBox(builder, sx, 1.4, sz, 0.4, 2.8, 0.4, g.angle, {
          tile: TILE.darkWall, color: [0.25, 0.25, 0.28], gloss: 0.2,
        });
        rotBox(builder, sx, 3.0, sz, 2.2, 1.4, 0.3, g.angle, {
          // Concrete, not lampGlow: the lampGlow tile's diffuse is near
          // black, so the panel read as a black slab by day (its emissive
          // only shows at sunset/night). Concrete takes the teal/gold by
          // day and the emissive attribute still glows at night.
          tile: TILE.concrete,
          color: owned ? [0.22, 0.56, 0.6] : [1.0, 0.8, 0.3],
          gloss: 0.1, emissive: 0.7,
        });
        if (!owned) {
          const bob = 4.6 + Math.sin(time * 2) * 0.3;
          builder.addBox(g.x, bob, g.z, 0.9, 0.9, 0.9, {
            tile: TILE.concrete, color: [1.0, 0.8, 0.3], gloss: 0.1, emissive: 1,
          });
        }
      }
    },

    debug: {
      /** Buy a garage outright (verification shots). */
      buy(id) {
        const g = spots.find((s) => s.id === id);
        if (!g || state.owned.includes(id)) return false;
        state.owned.push(id);
        world.missions.save();
        return true;
      },
      /** Put a car in a garage bay (verification shots). */
      park(id, car) {
        const g = spots.find((s) => s.id === id);
        if (!g) return false;
        car.x = g.x;
        car.z = g.z;
        car.angle = g.angle;
        car.speed = 0;
        state.parked[id] = {
          carId: car.id, profile: car.profile, color: car.color,
          x: car.x, z: car.z, angle: car.angle,
        };
        car.garaged = id;
        world.missions.save();
        return true;
      },
    },
  };
}
