// Geometry builders and the procedural facade atlas for Palkon Auto. Every texture
// is painted on an offscreen canvas at boot, so the game ships no image files and
// loads nothing over the network. One atlas holds the facades, roads, ground and
// roof tiles; a second atlas holds only what glows at night (lit windows, lamps).
//
// Vertex layout, 17 floats: position xyz, normal xyz, repeat uv (the raw
// repeat count, wrapped into the tile in the fragment shader), colour rgba
// (a = gloss), emissive strength, tile rect (u0, v0, u1, v1 in the atlas).
// The repeat uv must stay raw: wrapping it in the vertex shader would break
// interpolation across a face, and wrapping the whole texture would sample
// every tile in the atlas row instead of repeating one tile.

export const TILE = {
  brickRed: [0, 0], brickOchre: [1, 0], limestone: [2, 0], limestonePlain: [3, 0],
  glassBlue: [4, 0], glassTeal: [5, 0], shopfront: [6, 0], concrete: [7, 0],
  roof: [0, 1], road: [1, 1], sidewalk: [2, 1], plaza: [3, 1], grass: [4, 1],
  sand: [5, 1], awning: [6, 1], leaf: [7, 1],
  wood: [0, 2], whiteWall: [1, 2], coralWall: [2, 2], tealWall: [3, 2], darkWall: [4, 2],
  roofTerra: [5, 2],
  lampGlow: [7, 2],
};

const COLS = 8;
const ROWS = 4;
const TILE_PX = 128;

/** UV rect of one atlas tile. The canvas is uploaded flipped, so row 0 is the top. */
export function tileUV(tile) {
  const col = tile[0];
  const row = tile[1];
  const u0 = col / COLS;
  const u1 = (col + 1) / COLS;
  const v1 = 1 - row / ROWS;
  const v0 = 1 - (row + 1) / ROWS;
  return [u0, v0, u1, v1];
}

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.emi = [];
    this.tile = [];
    this.idx = [];
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  reset() {
    this.pos.length = 0;
    this.nrm.length = 0;
    this.uv.length = 0;
    this.col.length = 0;
    this.emi.length = 0;
    this.tile.length = 0;
    this.idx.length = 0;
  }

  quad(a, b, c, d, normal, tileRect, uRepeat, vRepeat, color, gloss, emissive) {
    const base = this.vertexCount;
    const pts = [a, b, c, d];
    // Raw repeat uv: a (0,0), b (u,0), c (u,v), d (0,v); the fragment shader
    // wraps these inside the tile rect.
    const corners = [[0, 0], [uRepeat, 0], [uRepeat, vRepeat], [0, vRepeat]];
    for (let i = 0; i < 4; i += 1) {
      this.pos.push(pts[i][0], pts[i][1], pts[i][2]);
      this.nrm.push(normal[0], normal[1], normal[2]);
      this.uv.push(corners[i][0], corners[i][1]);
      this.col.push(color[0], color[1], color[2], gloss);
      this.emi.push(emissive);
      this.tile.push(tileRect[0], tileRect[1], tileRect[2], tileRect[3]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** A box centred at (cx, cy, cz). Sides use `tile`, the top uses `tileTop`. */
  addBox(cx, cy, cz, w, h, d, opts = {}) {
    const tile = opts.tile ?? TILE.limestone;
    const tileTop = opts.tileTop ?? TILE.roof;
    const color = opts.color ?? [1, 1, 1];
    const gloss = opts.gloss ?? 0.05;
    const emissive = opts.emissive ?? 0;
    const hx = w / 2;
    const hy = h / 2;
    const hz = d / 2;
    const side = tileUV(tile);
    const top = tileUV(tileTop);
    const sideU = Math.max(1, Math.round(w / 10));
    const sideV = Math.max(1, Math.round(h / 10));
    const depthU = Math.max(1, Math.round(d / 10));
    const topU = Math.max(1, Math.round(w / 20));
    const topV = Math.max(1, Math.round(d / 20));
    // +X
    this.quad([cx + hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz + hz], [1, 0, 0], side, depthU, sideV, color, gloss, emissive);
    // -X
    this.quad([cx - hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz + hz], [cx - hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz - hz], [-1, 0, 0], side, depthU, sideV, color, gloss, emissive);
    // +Z
    this.quad([cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz], [0, 0, 1], side, sideU, sideV, color, gloss, emissive);
    // -Z
    this.quad([cx + hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz - hz], [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz], [0, 0, -1], side, sideU, sideV, color, gloss, emissive);
    // +Y (roof)
    this.quad([cx - hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz], [0, 1, 0], top, topU, topV, color, gloss, emissive);
    // -Y (never seen, kept dark)
    this.quad([cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz], [0, -1, 0], side, topU, topV, [0.1, 0.1, 0.1], 0, 0);
  }

  /** A flat quad on the ground plane, facing up. */
  addGroundQuad(x0, z0, x1, z1, y, opts = {}) {
    const tile = opts.tile ?? TILE.sidewalk;
    const color = opts.color ?? [1, 1, 1];
    const gloss = opts.gloss ?? 0;
    const emissive = opts.emissive ?? 0;
    const rect = tileUV(tile);
    const uRepeat = Math.max(1, Math.round((x1 - x0) / 20));
    const vRepeat = Math.max(1, Math.round((z1 - z0) / 20));
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], rect, uRepeat, vRepeat, color, gloss, emissive);
  }

  /** A low-poly sphere (tree crowns, lamp globes). */
  addSphere(cx, cy, cz, radius, opts = {}) {
    const color = opts.color ?? [1, 1, 1];
    const gloss = opts.gloss ?? 0;
    const emissive = opts.emissive ?? 0;
    const tile = opts.tile ?? TILE.leaf;
    const rect = tileUV(tile);
    const latSegs = 6;
    const lonSegs = 8;
    const base = this.vertexCount;
    for (let lat = 0; lat <= latSegs; lat += 1) {
      const phi = (lat / latSegs) * Math.PI;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      for (let lon = 0; lon <= lonSegs; lon += 1) {
        const theta = (lon / lonSegs) * Math.PI * 2;
        const nx = sinPhi * Math.cos(theta);
        const ny = cosPhi;
        const nz = sinPhi * Math.sin(theta);
        this.pos.push(cx + nx * radius, cy + ny * radius, cz + nz * radius);
        this.nrm.push(nx, ny, nz);
        this.uv.push(lon / lonSegs, lat / latSegs);
        this.col.push(color[0], color[1], color[2], gloss);
        this.emi.push(emissive);
        this.tile.push(rect[0], rect[1], rect[2], rect[3]);
      }
    }
    for (let lat = 0; lat < latSegs; lat += 1) {
      for (let lon = 0; lon < lonSegs; lon += 1) {
        const a = base + lat * (lonSegs + 1) + lon;
        const b = a + lonSegs + 1;
        this.idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }

  toArrays() {
    return {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nrm),
      uvs: new Float32Array(this.uv),
      colors: new Float32Array(this.col),
      emissives: new Float32Array(this.emi),
      tiles: new Float32Array(this.tile),
      indices: new Uint32Array(this.idx),
    };
  }
}

// ---------------------------------------------------------------------------
// Facade atlas painting. Each tile is 128x128 on a 1024x512 canvas (8 x 4).
// ---------------------------------------------------------------------------

function tileCtx(ctx, col, row) {
  // An absolute transform for this tile: every painter draws inside its own
  // 128x128 square, so no clip is needed and nothing accumulates between tiles.
  ctx.setTransform(1, 0, 0, 1, col * TILE_PX, row * TILE_PX);
  return ctx;
}

function speckle(ctx, rng, count, colors, size = 2) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.fillRect(Math.floor(rng() * TILE_PX), Math.floor(rng() * TILE_PX), size, size);
  }
}

function windowGrid(ctx, rng, cols, rows, opts = {}) {
  const glass = opts.glass ?? '#1c2733';
  const lit = opts.lit ?? null;
  const frame = opts.frame ?? '#e8ddc4';
  const margin = 12;
  const gapX = 6;
  const gapY = 8;
  const w = (TILE_PX - margin * 2 - gapX * (cols - 1)) / cols;
  const h = (TILE_PX - margin * 2 - gapY * (rows - 1)) / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = margin + c * (w + gapX);
      const y = margin + r * (h + gapY);
      const isLit = lit !== null && rng() < lit;
      ctx.fillStyle = frame;
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = isLit ? '#ffd27a' : glass;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, y, w, 3);
    }
  }
}

function brickCourses(ctx, rng, base, mortar) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  const courseH = 8;
  for (let y = 0; y < TILE_PX; y += courseH) {
    ctx.fillStyle = mortar;
    ctx.fillRect(0, y, TILE_PX, 1);
    const offset = (y / courseH) % 2 === 0 ? 0 : 12;
    for (let x = offset; x < TILE_PX; x += 24) {
      ctx.fillStyle = mortar;
      ctx.fillRect(x, y, 1, courseH);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, y + 1, TILE_PX, 1);
  }
  speckle(ctx, rng, 120, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)']);
}

export function buildAtlases(rng) {
  const diffuse = document.createElement('canvas');
  diffuse.width = COLS * TILE_PX;
  diffuse.height = ROWS * TILE_PX;
  const d = diffuse.getContext('2d');
  const emissive = document.createElement('canvas');
  emissive.width = COLS * TILE_PX;
  emissive.height = ROWS * TILE_PX;
  const e = emissive.getContext('2d');
  e.fillStyle = '#000';
  e.fillRect(0, 0, emissive.width, emissive.height);

  // Row 0: facades.
  brickCourses(tileCtx(d, 0, 0), rng, '#a8543f', 'rgba(60,25,15,0.55)');
  windowGrid(tileCtx(d, 0, 0), rng, 4, 5);
  brickCourses(tileCtx(d, 1, 0), rng, '#c08a4e', 'rgba(70,40,15,0.5)');
  windowGrid(tileCtx(d, 1, 0), rng, 4, 5);
  let ctx = tileCtx(d, 2, 0);
  ctx.fillStyle = '#e3d3ac';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  speckle(ctx, rng, 200, ['rgba(120,100,60,0.15)', 'rgba(255,255,255,0.12)']);
  windowGrid(ctx, rng, 4, 5, { glass: '#24344a' });
  ctx = tileCtx(d, 3, 0);
  ctx.fillStyle = '#e9dcbc';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  speckle(ctx, rng, 220, ['rgba(120,100,60,0.15)', 'rgba(255,255,255,0.12)']);
  ctx = tileCtx(d, 4, 0);
  const grad = ctx.createLinearGradient(0, 0, 0, TILE_PX);
  grad.addColorStop(0, '#7fa8c4');
  grad.addColorStop(1, '#4d718f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  windowGrid(ctx, rng, 5, 7, { glass: '#bcd8e8' });
  ctx = tileCtx(d, 5, 0);
  const grad2 = ctx.createLinearGradient(0, 0, 0, TILE_PX);
  grad2.addColorStop(0, '#5d8a94');
  grad2.addColorStop(1, '#35606b');
  ctx.fillStyle = grad2;
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  windowGrid(ctx, rng, 5, 7, { glass: '#9fc4cc' });
  ctx = tileCtx(d, 6, 0);
  ctx.fillStyle = '#d8c49a';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  ctx.fillStyle = '#d77f69';
  for (let x = 0; x < TILE_PX; x += 16) ctx.fillRect(x, 0, 8, 18);
  ctx.fillStyle = '#2c3a44';
  ctx.fillRect(10, 30, 34, 70);
  ctx.fillRect(48, 30, 34, 70);
  ctx.fillRect(86, 30, 32, 70);
  ctx.fillStyle = 'rgba(190,220,235,0.5)';
  ctx.fillRect(12, 32, 30, 66);
  ctx.fillRect(50, 32, 30, 66);
  ctx.fillRect(88, 32, 28, 66);
  ctx = tileCtx(d, 7, 0);
  ctx.fillStyle = '#9aa0a4';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  speckle(ctx, rng, 260, ['rgba(0,0,0,0.15)', 'rgba(255,255,255,0.12)']);

  // Row 1: ground and roofs.
  ctx = tileCtx(d, 0, 1);
  ctx.fillStyle = '#6a5a4a';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  speckle(ctx, rng, 200, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.1)']);
  ctx.fillStyle = '#7a6a58';
  ctx.fillRect(20, 20, 26, 14);
  ctx.fillRect(80, 70, 26, 14);
  ctx = tileCtx(d, 1, 1);
  ctx.fillStyle = '#33373c';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  speckle(ctx, rng, 300, ['rgba(0,0,0,0.2)', 'rgba(255,255,255,0.07)']);
  ctx.fillStyle = '#e8c33c';
  ctx.fillRect(60, 0, 8, 22);
  ctx.fillRect(60, 40, 8, 22);
  ctx.fillRect(60, 80, 8, 22);
  ctx.fillStyle = '#c8cdd2';
  ctx.fillRect(0, 0, 4, TILE_PX);
  ctx.fillRect(124, 0, 4, TILE_PX);
  ctx = tileCtx(d, 2, 1);
  ctx.fillStyle = '#b7ab8e';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  ctx.strokeStyle = 'rgba(90,75,50,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= TILE_PX; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, TILE_PX); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(TILE_PX, i); ctx.stroke();
  }
  ctx = tileCtx(d, 3, 1);
  ctx.fillStyle = '#d9cba6';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  ctx.strokeStyle = 'rgba(120,100,60,0.45)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= TILE_PX; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, TILE_PX); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(TILE_PX, i); ctx.stroke();
  }
  speckle(ctx, rng, 120, ['rgba(120,100,60,0.12)']);
  ctx = tileCtx(d, 4, 1);
  ctx.fillStyle = '#56856b';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  speckle(ctx, rng, 420, ['#4a755e', '#679975', '#3f6a52'], 3);
  ctx = tileCtx(d, 5, 1);
  ctx.fillStyle = '#e0c48f';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  speckle(ctx, rng, 380, ['#d4b57e', '#ecd3a0', '#c9a86e'], 3);
  ctx = tileCtx(d, 6, 1);
  for (let x = 0; x < TILE_PX; x += 16) {
    ctx.fillStyle = (x / 16) % 2 === 0 ? '#d77f69' : '#f2e6cf';
    ctx.fillRect(x, 0, 16, TILE_PX);
  }
  ctx = tileCtx(d, 7, 1);
  ctx.fillStyle = '#3e6b41';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  speckle(ctx, rng, 500, ['#356b39', '#4d8148', '#2c5c33', '#6a9a58'], 3);

  // Row 2: docks, walls, lamp.
  ctx = tileCtx(d, 0, 2);
  ctx.fillStyle = '#7a5a38';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  ctx.strokeStyle = 'rgba(40,25,10,0.6)';
  ctx.lineWidth = 2;
  for (let y = 0; y <= TILE_PX; y += 16) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(TILE_PX, y); ctx.stroke();
  }
  ctx = tileCtx(d, 1, 2);
  ctx.fillStyle = '#efe9dc';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  speckle(ctx, rng, 160, ['rgba(120,110,90,0.14)']);
  windowGrid(ctx, rng, 4, 5, { glass: '#2c3a44' });
  ctx = tileCtx(d, 2, 2);
  ctx.fillStyle = '#d77f69';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  speckle(ctx, rng, 160, ['rgba(120,50,30,0.18)', 'rgba(255,255,255,0.1)']);
  windowGrid(ctx, rng, 4, 5, { glass: '#2c3a44' });
  ctx = tileCtx(d, 3, 2);
  ctx.fillStyle = '#398e99';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  speckle(ctx, rng, 160, ['rgba(10,60,70,0.2)', 'rgba(255,255,255,0.1)']);
  windowGrid(ctx, rng, 4, 5, { glass: '#1e2c38' });
  ctx = tileCtx(d, 4, 2);
  ctx.fillStyle = '#2c3540';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  speckle(ctx, rng, 160, ['rgba(0,0,0,0.3)', 'rgba(255,255,255,0.08)']);
  windowGrid(ctx, rng, 4, 5, { glass: '#141c24' });
  ctx = tileCtx(d, 5, 2);
  ctx.fillStyle = '#8a5a44';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  speckle(ctx, rng, 260, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.1)']);
  ctx.fillStyle = '#9a6a52';
  ctx.fillRect(16, 16, 30, 16);
  ctx.fillRect(76, 80, 30, 16);
  ctx = tileCtx(d, 7, 2);
  ctx.fillStyle = '#22262b';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);

  // Emissive atlas: only the glass and shopfront tiles glow, with random lit windows.
  let ectx = tileCtx(e, 4, 0);
  windowGrid(ectx, rng, 5, 7, { glass: '#000', lit: 0.45, frame: '#000' });
  ectx = tileCtx(e, 5, 0);
  windowGrid(ectx, rng, 5, 7, { glass: '#000', lit: 0.45, frame: '#000' });
  ectx = tileCtx(e, 6, 0);
  ectx.fillStyle = '#ffca6a';
  ectx.fillRect(12, 32, 30, 66);
  ectx.fillRect(50, 32, 30, 66);
  ectx.fillRect(88, 32, 28, 66);
  ectx = tileCtx(e, 7, 2);
  ectx.fillStyle = '#ffd9a0';
  ectx.fillRect(0, 0, TILE_PX, TILE_PX);

  return { diffuse, emissive };
}
