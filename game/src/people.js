// The moving life of Solmar: pedestrians walking the block loops and cars
// driving the Canal Ward ring, plus the parked cars. Everything here is drawn
// into one dynamic mesh that the renderer rebuilds every frame, so people and
// traffic are lit by the same world-space light as the buildings.

import { createRandom } from './rng.js';
import { TILE, tileUV } from './mesh.js';

const SHIRTS = [
  [0.85, 0.35, 0.28], [0.22, 0.56, 0.6], [0.95, 0.75, 0.2], [0.95, 0.95, 0.9],
  [0.5, 0.3, 0.55], [0.35, 0.55, 0.35], [0.2, 0.25, 0.4], [0.9, 0.55, 0.75],
];
const SKINS = [
  [0.85, 0.65, 0.5], [0.72, 0.52, 0.38], [0.6, 0.45, 0.35], [0.92, 0.75, 0.6],
];

/** A box rotated around Y, for cars and people that face a direction. */
export function rotBox(b, cx, cy, cz, w, h, d, angle, opts = {}) {
  const tile = opts.tile ?? TILE.limestone;
  const tileTop = opts.tileTop ?? TILE.roof;
  const color = opts.color ?? [1, 1, 1];
  const gloss = opts.gloss ?? 0.05;
  const emissive = opts.emissive ?? 0;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rot = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
  const rotN = (x, y, z) => [x * c + z * s, y, -x * s + z * c];
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  const side = tileUV(tile);
  const top = tileUV(tileTop);
  const uW = Math.max(1, Math.round(w / 10));
  const uD = Math.max(1, Math.round(d / 10));
  const vH = Math.max(1, Math.round(h / 10));
  const faces = [
    { n: [1, 0, 0], pts: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], u: uD, v: vH, rect: side },
    { n: [-1, 0, 0], pts: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], u: uD, v: vH, rect: side },
    { n: [0, 0, 1], pts: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], u: uW, v: vH, rect: side },
    { n: [0, 0, -1], pts: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], u: uW, v: vH, rect: side },
    { n: [0, 1, 0], pts: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], u: uW, v: uD, rect: top },
    { n: [0, -1, 0], pts: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], u: uW, v: uD, rect: side },
  ];
  for (const f of faces) {
    b.quad(
      rot(...f.pts[0]), rot(...f.pts[1]), rot(...f.pts[2]), rot(...f.pts[3]),
      rotN(...f.n), f.rect, f.u, f.v, color, gloss, emissive,
    );
  }
}

function drawPerson(b, p) {
  const bob = Math.sin(p.phase) * 0.06;
  const swing = Math.sin(p.phase) * 0.14;
  const a = p.angle;
  // Legs swing along the walking direction; the pair sits across it.
  const fx = Math.sin(a);
  const fz = Math.cos(a);
  const px = Math.cos(a);
  const pz = -Math.sin(a);
  rotBox(b, p.x + px * 0.13 + fx * swing, 0.38 + bob, p.z + pz * 0.13 + fz * swing, 0.2, 0.76, 0.2, a, {
    tile: TILE.darkWall, color: [0.22, 0.24, 0.3], gloss: 0,
  });
  rotBox(b, p.x - px * 0.13 - fx * swing, 0.38 + bob, p.z - pz * 0.13 - fz * swing, 0.2, 0.76, 0.2, a, {
    tile: TILE.darkWall, color: [0.22, 0.24, 0.3], gloss: 0,
  });
  // Torso and head.
  rotBox(b, p.x, 1.12 + bob, p.z, 0.56, 0.72, 0.34, a, {
    tile: TILE.limestonePlain, color: p.shirt, gloss: 0.05,
  });
  rotBox(b, p.x, 1.66 + bob, p.z, 0.3, 0.3, 0.3, a, {
    tile: TILE.limestonePlain, color: p.skin, gloss: 0.05,
  });
}

export function drawCar(b, x, z, angle, color, headlights = false) {
  // Body, cabin and wheels: the paint catches the sun, the glass catches it more.
  rotBox(b, x, 0.55, z, 2.0, 0.85, 4.6, angle, {
    tile: TILE.concrete, color, gloss: 0.9,
  });
  rotBox(b, x, 1.28, z - 0.2, 1.8, 0.65, 2.4, angle, {
    tile: TILE.glassTeal, color: [0.14, 0.18, 0.22], gloss: 1,
  });
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (const [lx, lz] of [[-0.85, 1.5], [0.85, 1.5], [-0.85, -1.5], [0.85, -1.5]]) {
    const wx = x + lx * c + lz * s;
    const wz = z - lx * s + lz * c;
    rotBox(b, wx, 0.32, wz, 0.32, 0.64, 0.64, angle, {
      tile: TILE.darkWall, color: [0.08, 0.08, 0.1], gloss: 0.2,
    });
  }
  if (headlights) {
    // Two lit lenses on the nose; the renderer lights the road ahead with
    // point lights, these lenses are the visible source of the beam.
    for (const lx of [-0.65, 0.65]) {
      const wx = x + lx * c + 2.32 * s;
      const wz = z - lx * s + 2.32 * c;
      rotBox(b, wx, 0.55, wz, 0.4, 0.28, 0.15, angle, {
        tile: TILE.lampGlow, color: [1.0, 0.95, 0.8], gloss: 0.1, emissive: 1.2,
      });
    }
  }
}

function pointOnLoop(loop, distance) {
  let remaining = distance;
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const c = loop[(i + 1) % loop.length];
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const len = Math.hypot(dx, dz);
    if (remaining <= len) {
      const t = len === 0 ? 0 : remaining / len;
      return { x: a.x + dx * t, z: a.z + dz * t, angle: Math.atan2(dx, dz) };
    }
    remaining -= len;
  }
  return { x: loop[0].x, z: loop[0].z, angle: 0 };
}

function loopLength(loop) {
  let total = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const c = loop[(i + 1) % loop.length];
    total += Math.hypot(c.x - a.x, c.z - a.z);
  }
  return total;
}

export function createCrowd(city, seed) {
  const rng = createRandom(seed ^ 0x5f3759df);
  const people = [];
  for (let i = 0; i < 60; i += 1) {
    const loop = rng.pick(city.walkLoops);
    people.push({
      loop,
      length: loopLength(loop),
      distance: rng.range(0, loopLength(loop)),
      speed: rng.range(1.1, 1.9),
      phase: rng.range(0, Math.PI * 2),
      shirt: rng.pick(SHIRTS),
      skin: rng.pick(SKINS),
      x: 0, z: 0, angle: 0,
    });
  }
  return {
    update(dt) {
      for (const p of people) {
        p.distance = (p.distance + p.speed * dt) % p.length;
        const pos = pointOnLoop(p.loop, p.distance);
        p.x = pos.x;
        p.z = pos.z;
        p.angle = pos.angle;
        p.phase += dt * p.speed * 4.2;
      }
    },
    /** Draw the pedestrians into the shared dynamic mesh. Parked and
     * traffic cars are drawn by the driving modules, not here, so a car the
     * player drove away is never drawn twice. */
    drawInto(builder) {
      for (const p of people) drawPerson(builder, p);
    },
  };
}
