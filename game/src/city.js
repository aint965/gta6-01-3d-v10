// Solmar, the city of Palkon Auto: 3,840 by 3,456 units, seven districts, one
// deterministic build from a seed. The generator emits one merged static mesh
// (ground, roads, buildings, trees, lamps, docks, boats), the collision boxes,
// lamp posts, parked cars, pedestrian loops and the traffic loop. Nothing here
// reads the network; the same seed always builds the same city.

import { createRandom } from './rng.js';
import { MeshBuilder, TILE } from './mesh.js';

export const CITY = {
  x0: -1920, x1: 1920, z0: -1728, z1: 1728,
  seaX: -1560, // water starts west of this line
  sandX0: -1560, sandX1: -1440,
};

export const DISTRICTS = [
  { name: 'Old Solmar', x0: -1440, z0: -1728, x1: -600, z1: -600, color: '#e3d3ac' },
  { name: 'Glasspoint', x0: 600, z0: -1728, x1: 1920, z1: -600, color: '#7fa8c4' },
  { name: 'Canal Ward', x0: -600, z0: -600, x1: 600, z1: 200, color: '#d9cba6' },
  { name: 'Citrus Quarter', x0: 600, z0: -600, x1: 1920, z1: 1728, color: '#e8a04c' },
  { name: 'South Market', x0: -600, z0: 200, x1: 600, z1: 1728, color: '#d77f69' },
  { name: 'Pearl Marina', x0: -1440, z0: -600, x1: -600, z1: 900, color: '#398e99' },
  { name: 'Sunstrand Beach', x0: -1560, z0: 900, x1: -600, z1: 1728, color: '#e0c48f' },
];

const PARK = { x0: -1200, z0: -1400, x1: -800, z1: -1000 };
const POND = { x0: -1080, z0: -1280, x1: -920, z1: -1120 };
const PLAZA = { x0: -220, z0: 560, x1: 220, z1: 1000 };
const HARBOR = { x0: -1560, z0: -120, x1: -1260, z1: 260 };
const CANAL = { x0: -600, z0: -220, x1: 600, z1: -180 };
const BRIDGE_XS = [-480, 0, 480];

const ROAD_XS = [-1200, -960, -720, -480, -240, 0, 240, 480, 720, 960, 1200, 1440, 1680];
const ROAD_ZS = [-1560, -1320, -1080, -840, -600, -360, -120, 120, 360, 600, 840, 1080, 1320, 1560];
const BLOCK_XS = [-1440, -1200, -960, -720, -480, -240, 0, 240, 480, 720, 960, 1200, 1440, 1680, 1920];
const BLOCK_ZS = [-1728, -1560, -1320, -1080, -840, -600, -360, -120, 120, 360, 600, 840, 1080, 1320, 1560, 1728];

const CAR_COLORS = [
  [0.85, 0.35, 0.28], [0.22, 0.56, 0.6], [0.92, 0.9, 0.85], [0.16, 0.18, 0.22],
  [0.95, 0.75, 0.2], [0.5, 0.3, 0.55], [0.85, 0.5, 0.3], [0.6, 0.65, 0.7],
];
const SHIRT_COLORS = [
  [0.85, 0.35, 0.28], [0.22, 0.56, 0.6], [0.95, 0.75, 0.2], [0.95, 0.95, 0.9],
  [0.5, 0.3, 0.55], [0.35, 0.55, 0.35], [0.2, 0.25, 0.4], [0.9, 0.55, 0.75],
];

function rectsOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  }
  return DISTRICTS[2];
}

function districtTiles(name) {
  switch (name) {
    case 'Old Solmar': return { tiles: [TILE.brickRed, TILE.limestone, TILE.whiteWall], hMin: 12, hMax: 26, ground: TILE.plaza };
    case 'Glasspoint': return { tiles: [TILE.glassBlue, TILE.glassTeal, TILE.concrete], hMin: 20, hMax: 44, ground: TILE.sidewalk };
    case 'Canal Ward': return { tiles: [TILE.limestone, TILE.brickOchre, TILE.shopfront], hMin: 14, hMax: 30, ground: TILE.plaza };
    case 'Citrus Quarter': return { tiles: [TILE.whiteWall, TILE.tealWall, TILE.limestone], hMin: 18, hMax: 42, ground: TILE.sidewalk };
    case 'South Market': return { tiles: [TILE.coralWall, TILE.brickOchre, TILE.limestone], hMin: 10, hMax: 22, ground: TILE.plaza };
    case 'Pearl Marina': return { tiles: [TILE.whiteWall, TILE.tealWall, TILE.limestone], hMin: 12, hMax: 26, ground: TILE.sidewalk };
    case 'Sunstrand Beach': return { tiles: [TILE.whiteWall, TILE.coralWall], hMin: 8, hMax: 16, ground: TILE.sand };
    default: return { tiles: [TILE.limestone], hMin: 12, hMax: 24, ground: TILE.sidewalk };
  }
}

export function buildCity(seed) {
  const rng = createRandom(seed);
  const mesh = new MeshBuilder();
  const colliders = [];
  const lamps = [];
  const parkedCars = [];
  const walkLoops = [];
  const exclusions = [PARK, PLAZA, HARBOR, CANAL];
  let buildingCount = 0;
  let treeCount = 0;

  // --- Ground: one big quad per district, plus the sand strip and the park.
  for (const d of DISTRICTS) {
    const spec = districtTiles(d.name);
    mesh.addGroundQuad(d.x0, d.z0, d.x1, d.z1, 0, { tile: spec.ground, color: [0.86, 0.82, 0.74] });
  }
  mesh.addGroundQuad(CITY.sandX0, CITY.z0, CITY.sandX1, CITY.z1, 0.02, { tile: TILE.sand });
  mesh.addGroundQuad(PARK.x0, PARK.z0, PARK.x1, PARK.z1, 0.04, { tile: TILE.grass });
  // The pond in the park.
  mesh.addGroundQuad(POND.x0, POND.z0, POND.x1, POND.z1, 0.1, { tile: TILE.glassTeal, color: [0.35, 0.65, 0.75], gloss: 0.85 });
  colliders.push({ ...POND });
  // The canal and the harbour basin are water.
  mesh.addGroundQuad(CANAL.x0, CANAL.z0, CANAL.x1, CANAL.z1, 0.08, { tile: TILE.glassTeal, color: [0.3, 0.55, 0.62], gloss: 0.85 });
  mesh.addGroundQuad(HARBOR.x0, HARBOR.z0, HARBOR.x1, HARBOR.z1, 0.08, { tile: TILE.glassTeal, color: [0.3, 0.55, 0.62], gloss: 0.85 });

  // --- Roads: a grid, skipping the spans the canal cuts.
  for (const x of ROAD_XS) {
    let z = CITY.z0;
    // Split the vertical road around the canal span.
    const spans = x >= CANAL.x0 && x <= CANAL.x1
      ? [[CITY.z0, CANAL.z0], [CANAL.z1, CITY.z1]]
      : [[CITY.z0, CITY.z1]];
    for (const [z0, z1] of spans) {
      mesh.addGroundQuad(x - 10, z0, x + 10, z1, 0.06, { tile: TILE.road });
    }
    z = z; // (kept for clarity; roads are drawn per span above)
  }
  for (const z of ROAD_ZS) {
    mesh.addGroundQuad(CITY.x0 + 480, z - 10, CITY.x1, z + 10, 0.06, { tile: TILE.road });
  }
  // The harbour road runs along the basin's east edge.
  mesh.addGroundQuad(-1270, HARBOR.z0 - 60, -1250, HARBOR.z1 + 60, 0.06, { tile: TILE.road });

  // --- Bridges over the canal, where the roads cross it.
  for (const x of BRIDGE_XS) {
    mesh.addBox(x, 0.35, (CANAL.z0 + CANAL.z1) / 2, 20, 0.7, CANAL.z1 - CANAL.z0 + 16, {
      tile: TILE.concrete, tileTop: TILE.road, color: [0.9, 0.88, 0.82], gloss: 0.1,
    });
  }
  // The canal blocks walking except at the bridges.
  for (const x of BRIDGE_XS) {
    colliders.push({ x0: CANAL.x0, z0: CANAL.z0, x1: x - 12, z1: CANAL.z1 });
    colliders.push({ x0: x + 12, z0: CANAL.z0, x1: CANAL.x1, z1: CANAL.z1 });
  }
  colliders.push({ x0: HARBOR.x0, z0: HARBOR.z0, x1: HARBOR.x1, z1: HARBOR.z1 });

  // --- Buildings, one block at a time.
  function placeBuilding(cx, cz, w, d, h, tiles, rngLocal) {
    const tile = rngLocal.pick(tiles);
    const glass = tile === TILE.glassBlue || tile === TILE.glassTeal;
    const tileTop = rngLocal.chance(0.5) ? TILE.roof : TILE.roofTerra;
    mesh.addBox(cx, h / 2, cz, w, h, d, {
      tile, tileTop, color: [1, 1, 1], gloss: glass ? 0.9 : 0.05,
    });
    // A parapet cap on most buildings breaks the skyline up.
    if (rngLocal.chance(0.55)) {
      mesh.addBox(cx, h + 0.8, cz, w - 3, 1.6, d - 3, {
        tile: TILE.roof, color: [0.85, 0.82, 0.75], gloss: 0.05,
      });
    }
    colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
    buildingCount += 1;
  }

  for (let bi = 0; bi < BLOCK_XS.length - 1; bi += 1) {
    for (let bj = 0; bj < BLOCK_ZS.length - 1; bj += 1) {
      const bx0 = BLOCK_XS[bi] + 14;
      const bz0 = BLOCK_ZS[bj] + 14;
      const bx1 = BLOCK_XS[bi + 1] - 14;
      const bz1 = BLOCK_ZS[bj + 1] - 14;
      if (bx1 - bx0 < 40 || bz1 - bz0 < 40) continue;
      const cx = (bx0 + bx1) / 2;
      const cz = (bz0 + bz1) / 2;
      const district = districtAt(cx, cz);
      const spec = districtTiles(district.name);
      const block = { x0: bx0, z0: bz0, x1: bx1, z1: bz1 };
      if (exclusions.some((e) => rectsOverlap(block, e))) {
        // A block the park, plaza, harbour or canal touches keeps only the
        // buildings that clear every exclusion.
        if (district.name === 'Glasspoint') continue;
      }
      const cells = rng.int(2, 4);
      for (let c = 0; c < cells; c += 1) {
        const w = rng.range(34, Math.min(90, bx1 - bx0 - 8));
        const d = rng.range(34, Math.min(90, bz1 - bz0 - 8));
        const px = rng.range(bx0 + w / 2, bx1 - w / 2);
        const pz = rng.range(bz0 + d / 2, bz1 - d / 2);
        const foot = { x0: px - w / 2 - 2, z0: pz - d / 2 - 2, x1: px + w / 2 + 2, z1: pz + d / 2 + 2 };
        if (exclusions.some((e) => rectsOverlap(foot, e))) continue;
        if (colliders.some((col) => rectsOverlap(foot, col))) continue;
        const h = rng.range(spec.hMin, spec.hMax);
        placeBuilding(px, pz, w, d, h, spec.tiles, rng);
      }
    }
  }

  // --- Glasspoint towers: a dozen tall glass slabs on their own plots.
  for (let i = 0; i < 12; i += 1) {
    const px = rng.range(700, 1820);
    const pz = rng.range(-1620, -700);
    const w = rng.range(42, 64);
    const d = rng.range(42, 64);
    const h = rng.range(58, 140);
    const foot = { x0: px - w / 2 - 4, z0: pz - d / 2 - 4, x1: px + w / 2 + 4, z1: pz + d / 2 + 4 };
    if (colliders.some((col) => rectsOverlap(foot, col))) continue;
    placeBuilding(px, pz, w, d, h, [TILE.glassBlue, TILE.glassTeal], rng);
    // A lit crown on the tallest towers.
    mesh.addBox(px, h + 2, pz, w * 0.4, 4, d * 0.4, {
      tile: TILE.lampGlow, tileTop: TILE.lampGlow, color: [1, 0.85, 0.6], gloss: 0.2, emissive: 1,
    });
  }

  // --- Trees: the park, the street edges, and Citrus Quarter.
  function plantTree(x, z) {
    const s = rng.range(1.6, 2.6);
    mesh.addBox(x, 1.4, z, 0.7, 2.8, 0.7, { tile: TILE.wood, color: [0.55, 0.4, 0.25], gloss: 0 });
    mesh.addSphere(x, 3.6 + s * 0.4, z, s, {
      color: [rng.range(0.75, 1), rng.range(0.9, 1.1), rng.range(0.75, 1)], gloss: 0,
    });
    treeCount += 1;
  }
  for (let i = 0; i < 90; i += 1) {
    const x = rng.range(PARK.x0 + 12, PARK.x1 - 12);
    const z = rng.range(PARK.z0 + 12, PARK.z1 - 12);
    if (rectsOverlap({ x0: x - 3, z0: z - 3, x1: x + 3, z1: z + 3 }, POND)) continue;
    plantTree(x, z);
  }
  for (const x of ROAD_XS) {
    for (let z = CITY.z0 + 60; z < CITY.z1 - 40; z += rng.range(150, 260)) {
      if (rng.chance(0.5)) plantTree(x + 16, z);
      if (rng.chance(0.5)) plantTree(x - 16, z + 40);
    }
  }
  for (let i = 0; i < 60; i += 1) {
    plantTree(rng.range(700, 1860), rng.range(-500, 1660));
  }

  // --- Lamp posts along the main roads.
  for (const x of [-1200, -480, 0, 480, 1200]) {
    for (let z = CITY.z0 + 80; z < CITY.z1 - 40; z += 170) {
      lamps.push({ x: x + 13, z });
    }
  }
  for (const z of [-840, -120, 360, 1080]) {
    for (let x = CITY.x0 + 560; x < CITY.x1 - 40; x += 170) {
      lamps.push({ x, z: z + 13 });
    }
  }
  // The marina promenade and the beach walk get lamps too.
  for (let z = -560; z < 880; z += 120) lamps.push({ x: -1452, z });
  for (let x = -1400; x < -640; x += 140) lamps.push({ x, z: 920 });
  for (const lamp of lamps) {
    mesh.addBox(lamp.x, 3, lamp.z, 0.35, 6, 0.35, { tile: TILE.darkWall, color: [0.25, 0.25, 0.28], gloss: 0.4 });
    mesh.addBox(lamp.x, 6.1, lamp.z, 0.35, 0.35, 2.2, { tile: TILE.darkWall, color: [0.25, 0.25, 0.28], gloss: 0.4 });
    mesh.addBox(lamp.x, 5.9, lamp.z + 1.1, 1.6, 0.5, 0.7, {
      tile: TILE.lampGlow, tileTop: TILE.lampGlow, color: [1, 0.85, 0.6], gloss: 0.2, emissive: 1,
    });
  }

  // --- The harbour: wooden docks and three moored boats.
  for (let i = 0; i < 3; i += 1) {
    const z = -60 + i * 140;
    mesh.addGroundQuad(-1260, z - 8, -1200, z + 8, 0.3, { tile: TILE.wood, color: [0.85, 0.7, 0.5] });
  }
  for (let i = 0; i < 3; i += 1) {
    const bx = -1380 - i * 40;
    const bz = -40 + i * 130;
    mesh.addBox(bx, 1.2, bz, 9, 2.4, 26, { tile: TILE.whiteWall, color: [0.9, 0.92, 0.95], gloss: 0.5 });
    mesh.addBox(bx, 3.2, bz - 4, 6, 2.2, 12, { tile: TILE.glassTeal, color: [0.9, 0.95, 0.95], gloss: 0.7 });
    mesh.addBox(bx, 7, bz, 0.5, 9, 0.5, { tile: TILE.wood, color: [0.6, 0.45, 0.3], gloss: 0.1 });
  }

  // --- Market stalls on the plaza.
  for (let i = 0; i < 8; i += 1) {
    const sx = -160 + (i % 4) * 105;
    const sz = 640 + Math.floor(i / 4) * 180;
    mesh.addBox(sx, 1.1, sz, 14, 2.2, 8, { tile: TILE.wood, color: [0.8, 0.65, 0.45], gloss: 0.1 });
    mesh.addBox(sx, 2.6, sz, 16, 0.5, 10, { tile: TILE.awning, color: [1, 1, 1], gloss: 0.1 });
  }
  // Park benches.
  for (let i = 0; i < 10; i += 1) {
    const x = rng.range(PARK.x0 + 20, PARK.x1 - 20);
    const z = rng.range(PARK.z0 + 20, PARK.z1 - 20);
    mesh.addBox(x, 0.5, z, 4, 1, 1.2, { tile: TILE.wood, color: [0.6, 0.45, 0.3], gloss: 0.1 });
  }

  // --- Parked cars along the roads.
  for (let i = 0; i < 44; i += 1) {
    const vertical = rng.chance(0.5);
    const road = rng.pick(vertical ? ROAD_XS : ROAD_ZS);
    const along = rng.range(-1500, 1500);
    const side = rng.chance(0.5) ? 15 : -15;
    const x = vertical ? road + side : along;
    const z = vertical ? along : road + side;
    if (x < CITY.sandX1 + 20 || x > CITY.x1 - 30 || z < CITY.z0 + 30 || z > CITY.z1 - 30) continue;
    if (rectsOverlap({ x0: x - 4, z0: z - 4, x1: x + 4, z1: z + 4 }, PARK)) continue;
    if (rectsOverlap({ x0: x - 4, z0: z - 4, x1: x + 4, z1: z + 4 }, HARBOR)) continue;
    parkedCars.push({ x, z, angle: vertical ? 0 : Math.PI / 2, color: rng.pick(CAR_COLORS) });
  }

  // --- Pedestrian loops: rectangles around a few blocks.
  const loopBlocks = [
    [-480, -360, -240, -120], [-240, -360, 0, -120], [0, -360, 240, -120],
    [240, -360, 480, -120], [-480, 120, -240, 360], [0, 120, 240, 360],
    [720, -360, 960, -120], [960, 360, 1200, 600], [-1200, -840, -960, -600],
    [-1200, 360, -960, 600], [720, 840, 960, 1080], [-480, 840, -240, 1080],
  ];
  for (const [x0, z0, x1, z1] of loopBlocks) {
    const m = 16;
    walkLoops.push([
      { x: x0 + m, z: z0 + m }, { x: x1 - m, z: z0 + m },
      { x: x1 - m, z: z1 - m }, { x: x0 + m, z: z1 - m },
    ]);
  }

  // --- The traffic loop: a rectangle around Canal Ward on the roads.
  const carLoop = [
    { x: -480, z: -480 }, { x: 480, z: -480 },
    { x: 480, z: 80 }, { x: -480, z: 80 },
  ];

  return {
    districts: DISTRICTS,
    staticArrays: mesh.toArrays(),
    colliders,
    lamps,
    parkedCars,
    walkLoops,
    carLoop,
    spawn: { x: 0, z: 320, yaw: 0 },
    bounds: { x0: CITY.x0 + 20, x1: CITY.x1 - 20, z0: CITY.z0 + 20, z1: CITY.z1 - 20 },
    counts: { buildings: buildingCount, trees: treeCount, lamps: lamps.length, parkedCars: parkedCars.length },
  };
}
