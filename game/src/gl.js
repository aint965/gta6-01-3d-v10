// The handwritten WebGL 2 renderer for Palkon Auto. No 3D library is vendored:
// one merged static mesh (the city), one rebuilt-per-frame dynamic mesh (people
// and traffic), a procedural sky dome, an animated sea plane, and a 1024x1024
// shadow map from the sun. World-space lighting: a directional sun (or moon),
// ambient light, specular paint and glass, emissive windows and lamps at night,
// and the six nearest street lights as point lights.

import { buildAtlases } from './mesh.js';
import { createRandom } from './rng.js';

// ---------------------------------------------------------------------------
// Small column-major mat4 helpers (no library).
// ---------------------------------------------------------------------------

function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

function mat4Ortho(left, right, bottom, top, near, far) {
  const m = new Float32Array(16);
  m[0] = 2 / (right - left);
  m[5] = 2 / (top - bottom);
  m[10] = -2 / (far - near);
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[14] = -(far + near) / (far - near);
  m[15] = 1;
  return m;
}

function mat4LookAt(eye, target, up) {
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  let zl = Math.hypot(zx, zy, zz);
  const z = [zx / zl, zy / zl, zz / zl];
  const xx = up[1] * z[2] - up[2] * z[1];
  const xy = up[2] * z[0] - up[0] * z[2];
  const xz = up[0] * z[1] - up[1] * z[0];
  zl = Math.hypot(xx, xy, xz) || 1;
  const x = [xx / zl, xy / zl, xz / zl];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const m = new Float32Array(16);
  m[0] = x[0]; m[4] = x[1]; m[8] = x[2]; m[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  m[1] = y[0]; m[5] = y[1]; m[9] = y[2]; m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  m[2] = z[0]; m[6] = z[1]; m[10] = z[2]; m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1;
  return m;
}

function mat4Translate(x, y, z) {
  const m = mat4Identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// ---------------------------------------------------------------------------
// The three lighting presets: scorching midday, sunset, night.
// ---------------------------------------------------------------------------

export const PRESETS = {
  day: {
    label: 'MIDDAY — SCORCHING SUN',
    sunDir: normalize3([-0.35, 0.82, -0.45]),
    sunColor: [1.15, 1.05, 0.9],
    ambient: [0.42, 0.45, 0.5],
    zenith: [0.14, 0.42, 0.72],
    horizon: [0.72, 0.86, 0.93],
    fog: [0.78, 0.87, 0.93],
    fogNear: 800, fogFar: 4200,
    emissive: 0, lampGlow: 0, shadow: true, night: 0, sunsetBand: 0, reflect: 0.55,
    moonDir: normalize3([0.45, 0.6, 0.35]), moonColor: [0.3, 0.36, 0.5],
  },
  sunset: {
    label: 'SUNSET — GOLDEN HOUR',
    sunDir: normalize3([-0.98, 0.1, 0.12]),
    sunColor: [1.2, 0.6, 0.28],
    ambient: [0.32, 0.26, 0.3],
    zenith: [0.2, 0.2, 0.42],
    horizon: [1.0, 0.55, 0.25],
    fog: [0.85, 0.55, 0.4],
    fogNear: 400, fogFar: 2200,
    emissive: 0.25, lampGlow: 0.4, shadow: true, night: 0.15, sunsetBand: 1, reflect: 0.7,
    moonDir: normalize3([0.45, 0.6, 0.35]), moonColor: [0.3, 0.36, 0.5],
  },
  night: {
    label: 'NIGHT — MOON & STREET LIGHTS',
    sunDir: normalize3([0.45, 0.6, 0.35]),
    sunColor: [0.32, 0.4, 0.58],
    ambient: [0.07, 0.09, 0.13],
    zenith: [0.015, 0.025, 0.07],
    horizon: [0.05, 0.09, 0.16],
    fog: [0.04, 0.06, 0.1],
    fogNear: 300, fogFar: 1800,
    emissive: 1, lampGlow: 1, shadow: false, night: 1, sunsetBand: 0, reflect: 0.25,
    moonDir: normalize3([0.45, 0.6, 0.35]), moonColor: [0.55, 0.65, 0.85],
  },
};

// ---------------------------------------------------------------------------
// Shaders.
// ---------------------------------------------------------------------------

const OPAQUE_VERT = `#version 300 es
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_nrm;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in vec4 a_col;
layout(location = 4) in float a_emi;
layout(location = 5) in vec4 a_tile;
uniform mat4 u_viewProj;
uniform mat4 u_lightViewProj;
out vec3 v_world;
out vec3 v_nrm;
out vec2 v_uv;
out vec4 v_col;
out float v_emi;
out vec4 v_tile;
out vec4 v_shadowCoord;
void main() {
  vec4 world = vec4(a_pos, 1.0);
  v_world = world.xyz;
  v_nrm = a_nrm;
  v_uv = a_uv;
  v_col = a_col;
  v_emi = a_emi;
  v_tile = a_tile;
  v_shadowCoord = u_lightViewProj * world;
  gl_Position = u_viewProj * world;
}`;

const OPAQUE_FRAG = `#version 300 es
precision highp float;
in vec3 v_world;
in vec3 v_nrm;
in vec2 v_uv;
in vec4 v_col;
in float v_emi;
in vec4 v_tile;
in vec4 v_shadowCoord;
uniform vec3 u_camPos;
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform vec3 u_ambient;
uniform vec3 u_horizon;
uniform float u_reflect;
uniform vec3 u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_shadowOn;
uniform float u_emissiveStrength;
uniform float u_lampGlow;
uniform int u_lightCount;
uniform vec4 u_lights[6];
uniform vec3 u_lightColors[6];
uniform sampler2D u_diffuse;
uniform sampler2D u_emissive;
uniform sampler2D u_shadow;
out vec4 fragColor;

float shadowFactor(float diffuse) {
  if (u_shadowOn < 0.5) return 1.0;
  vec3 sc = v_shadowCoord.xyz / v_shadowCoord.w;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  float depth = texture(u_shadow, sc.xy).r;
  float bias = 0.0025 + 0.0015 * (1.0 - diffuse);
  return (sc.z - bias < depth) ? 1.0 : 0.3;
}

void main() {
  vec3 N = normalize(v_nrm);
  // The repeat uv wraps inside this face's atlas tile, so one tile repeats
  // across a long wall instead of the whole atlas repeating.
  vec2 tuv = vec2(
    v_tile.x + fract(v_uv.x) * (v_tile.z - v_tile.x),
    v_tile.y + fract(v_uv.y) * (v_tile.w - v_tile.y)
  );
  vec3 base = texture(u_diffuse, tuv).rgb * v_col.rgb;
  float diff = max(dot(N, u_sunDir), 0.0);
  float sh = shadowFactor(diff);
  vec3 V = normalize(u_camPos - v_world);
  vec3 H = normalize(u_sunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 24.0) * v_col.a * diff * sh;
  vec3 col = base * (u_ambient + u_sunColor * diff * sh) + u_sunColor * spec;
  // Fresnel sky reflection: glossy surfaces (glass towers, car paint) pick
  // up the horizon colour at grazing angles, so Glasspoint glares at
  // midday, glows warm at sunset, and stays dark at night. The strength
  // follows the surface gloss (v_col.a) and the preset's reflect factor.
  // Energy-conserving: as the reflection grows the diffuse fades, so a
  // red car seen side-on at a grazing angle keeps its paint instead of
  // washing out to grey under a full-strength additive sky wash.
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  float refl = clamp(fres * v_col.a * u_reflect, 0.0, 0.6);
  col = col * (1.0 - refl) + u_horizon * refl;
  col += texture(u_emissive, tuv).rgb * u_emissiveStrength;
  col += v_emi * vec3(1.0, 0.8, 0.5) * u_lampGlow;
  for (int i = 0; i < 6; i++) {
    if (i >= u_lightCount) break;
    vec3 L = u_lights[i].xyz - v_world;
    float d = length(L);
    float att = clamp(1.0 - d / u_lights[i].w, 0.0, 1.0);
    att *= att;
    col += base * u_lightColors[i] * max(dot(N, L / max(d, 0.001)), 0.0) * att * 1.6;
  }
  float dist = length(u_camPos - v_world);
  float fogF = clamp((dist - u_fogNear) / (u_fogFar - u_fogNear), 0.0, 1.0);
  col = mix(col, u_fogColor, fogF);
  fragColor = vec4(col, 1.0);
}`;

const DEPTH_VERT = `#version 300 es
layout(location = 0) in vec3 a_pos;
uniform mat4 u_lightViewProj;
void main() {
  gl_Position = u_lightViewProj * vec4(a_pos, 1.0);
}`;

const DEPTH_FRAG = `#version 300 es
precision highp float;
void main() {}`;

const SKY_VERT = `#version 300 es
layout(location = 0) in vec3 a_pos;
uniform mat4 u_viewProj;
uniform vec3 u_camPos;
out vec3 v_dir;
void main() {
  vec4 world = vec4(a_pos + u_camPos, 1.0);
  v_dir = normalize(a_pos);
  gl_Position = u_viewProj * world;
  gl_Position = gl_Position.xyww;
}`;

const SKY_FRAG = `#version 300 es
precision highp float;
in vec3 v_dir;
uniform vec3 u_zenith;
uniform vec3 u_horizon;
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform vec3 u_moonDir;
uniform vec3 u_moonColor;
uniform float u_night;
uniform float u_sunsetBand;
uniform float u_time;
out vec4 fragColor;

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
}

void main() {
  vec3 dir = normalize(v_dir);
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(u_horizon, u_zenith, pow(h, 0.6));
  float sunAmt = max(dot(dir, u_sunDir), 0.0);
  col += u_sunColor * (pow(sunAmt, 350.0) * 1.4 + pow(sunAmt, 8.0) * 0.28 * (1.0 - u_night));
  col += vec3(1.0, 0.45, 0.15) * pow(max(1.0 - abs(dir.y + 0.02) * 5.0, 0.0), 2.0) * u_sunsetBand * 0.55;
  float moonAmt = max(dot(dir, u_moonDir), 0.0);
  col += u_moonColor * (smoothstep(0.9993, 0.9997, moonAmt) * 1.6 + pow(moonAmt, 32.0) * 0.14) * max(u_night, 0.15);
  if (dir.y > 0.02) {
    vec3 p = dir * 260.0;
    vec3 id = floor(p);
    vec3 f = fract(p);
    float h1 = hash3(id);
    vec3 sp = vec3(hash3(id + 1.0), hash3(id + 2.0), hash3(id + 3.0));
    float d = length(f - sp);
    float star = smoothstep(0.14, 0.0, d) * step(0.93, h1);
    star *= 0.6 + 0.4 * sin(u_time * 2.0 + h1 * 40.0);
    col += vec3(star) * u_night * smoothstep(0.02, 0.25, dir.y);
  }
  // Below the horizon, fade to the fog colour so the sea line reads clean.
  col = mix(u_horizon * 0.92, col, smoothstep(-0.08, 0.02, dir.y));
  fragColor = vec4(col, 1.0);
}`;

const SEA_VERT = `#version 300 es
layout(location = 0) in vec3 a_pos;
uniform mat4 u_viewProj;
uniform float u_time;
out vec3 v_world;
out vec3 v_nrm;
void main() {
  vec3 p = a_pos;
  float t = u_time;
  p.y += sin(p.x * 0.11 + t * 0.9) * 0.35 + sin(p.z * 0.16 - t * 0.7) * 0.28 + sin((p.x + p.z) * 0.05 + t * 0.5) * 0.4;
  float dx = 0.11 * 0.35 * cos(p.x * 0.11 + t * 0.9) + 0.05 * 0.4 * cos((p.x + p.z) * 0.05 + t * 0.5);
  float dz = 0.16 * 0.28 * cos(p.z * 0.16 - t * 0.7) + 0.05 * 0.4 * cos((p.x + p.z) * 0.05 + t * 0.5);
  v_nrm = normalize(vec3(-dx, 1.0, -dz));
  v_world = p;
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;

const SEA_FRAG = `#version 300 es
precision highp float;
in vec3 v_world;
in vec3 v_nrm;
uniform vec3 u_camPos;
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform vec3 u_skyColor;
uniform vec3 u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_time;
out vec4 fragColor;
void main() {
  vec3 N = normalize(v_nrm);
  vec3 V = normalize(u_camPos - v_world);
  vec3 deep = vec3(0.04, 0.3, 0.38);
  vec3 shallow = vec3(0.12, 0.55, 0.6);
  float shore = smoothstep(-1750.0, -1560.0, v_world.x);
  vec3 col = mix(deep, shallow, shore * 0.7);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col = mix(col, u_skyColor, fres * 0.55);
  vec3 R = reflect(-u_sunDir, N);
  float glint = pow(max(dot(R, V), 0.0), 90.0);
  col += u_sunColor * glint * 1.4;
  float foamBand = smoothstep(-1600.0, -1558.0, v_world.x) * (0.5 + 0.5 * sin(v_world.z * 0.35 + u_time * 1.6));
  col = mix(col, vec3(0.9, 0.95, 0.92), foamBand * 0.45);
  float dist = length(u_camPos - v_world);
  float fogF = clamp((dist - u_fogNear) / (u_fogFar - u_fogNear), 0.0, 1.0);
  col = mix(col, u_fogColor, fogF);
  fragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------------------
// Renderer.
// ---------------------------------------------------------------------------

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    throw new Error(`shader compile failed: ${log}`);
  }
  return shader;
}

function createProgram(gl, vertSource, fragSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

function makeTexture(gl, canvas) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}

function buildMeshVAO(gl, arrays, dynamic) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const usage = dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
  function attribute(location, data, size) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    return buf;
  }
  const buffers = {
    pos: attribute(0, arrays.positions, 3),
    nrm: attribute(1, arrays.normals, 3),
    uv: attribute(2, arrays.uvs, 2),
    col: attribute(3, arrays.colors, 4),
    emi: attribute(4, arrays.emissives, 1),
    tile: attribute(5, arrays.tiles, 4),
  };
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arrays.indices, usage);
  gl.bindVertexArray(null);
  return { vao, buffers, indexBuffer, indexCount: arrays.indices.length, usage };
}

function updateMeshVAO(gl, mesh, arrays) {
  gl.bindVertexArray(mesh.vao);
  const parts = [
    [mesh.buffers.pos, arrays.positions],
    [mesh.buffers.nrm, arrays.normals],
    [mesh.buffers.uv, arrays.uvs],
    [mesh.buffers.col, arrays.colors],
    [mesh.buffers.emi, arrays.emissives],
    [mesh.buffers.tile, arrays.tiles],
  ];
  for (const [buf, data] of parts) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arrays.indices, gl.DYNAMIC_DRAW);
  mesh.indexCount = arrays.indices.length;
  gl.bindVertexArray(null);
}

function buildSphereMesh(radius, latSegs, lonSegs) {
  const pos = [];
  const idx = [];
  for (let lat = 0; lat <= latSegs; lat += 1) {
    const phi = (lat / latSegs) * Math.PI;
    for (let lon = 0; lon <= lonSegs; lon += 1) {
      const theta = (lon / lonSegs) * Math.PI * 2;
      pos.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta),
      );
    }
  }
  for (let lat = 0; lat < latSegs; lat += 1) {
    for (let lon = 0; lon < lonSegs; lon += 1) {
      const a = lat * (lonSegs + 1) + lon;
      const b = a + lonSegs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

function buildSeaMesh() {
  const x0 = -4200;
  const x1 = -1555;
  const z0 = -2200;
  const z1 = 2200;
  const nx = 48;
  const nz = 48;
  const pos = [];
  const idx = [];
  for (let j = 0; j <= nz; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      pos.push(x0 + ((x1 - x0) * i) / nx, 0, z0 + ((z1 - z0) * j) / nz);
    }
  }
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const a = j * (nx + 1) + i;
      const b = a + nx + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL 2 is not available');

  const opaqueProgram = createProgram(gl, OPAQUE_VERT, OPAQUE_FRAG);
  const depthProgram = createProgram(gl, DEPTH_VERT, DEPTH_FRAG);
  const skyProgram = createProgram(gl, SKY_VERT, SKY_FRAG);
  const seaProgram = createProgram(gl, SEA_VERT, SEA_FRAG);

  // The facade atlases, painted on canvas at boot from a fixed seed so every
  // load paints the same windows.
  const atlasRng = createRandom(1337);
  const atlases = buildAtlases(() => atlasRng.next());
  const diffuseTex = makeTexture(gl, atlases.diffuse);
  const emissiveTex = makeTexture(gl, atlases.emissive);

  // Shadow map: a 1024 depth texture the sun renders into each frame.
  const shadowSize = 1024;
  const shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, shadowSize, shadowSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const shadowFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // Sky dome and sea plane.
  const sky = buildSphereMesh(3800, 18, 28);
  const skyVao = gl.createVertexArray();
  gl.bindVertexArray(skyVao);
  const skyPos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, skyPos);
  gl.bufferData(gl.ARRAY_BUFFER, sky.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const skyIdx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, skyIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sky.indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const sea = buildSeaMesh();
  const seaVao = gl.createVertexArray();
  gl.bindVertexArray(seaVao);
  const seaPos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, seaPos);
  gl.bufferData(gl.ARRAY_BUFFER, sea.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const seaIdx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, seaIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sea.indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  let staticMesh = null;
  let dynamicMesh = null;

  function uniformLocations(program, names) {
    const out = {};
    for (const name of names) out[name] = gl.getUniformLocation(program, name);
    return out;
  }

  const opaqueU = uniformLocations(opaqueProgram, [
    'u_viewProj', 'u_lightViewProj', 'u_camPos', 'u_sunDir', 'u_sunColor', 'u_ambient',
    'u_horizon', 'u_reflect',
    'u_fogColor', 'u_fogNear', 'u_fogFar', 'u_shadowOn', 'u_emissiveStrength',
    'u_lampGlow', 'u_lightCount', 'u_lights', 'u_lightColors',
    'u_diffuse', 'u_emissive', 'u_shadow',
  ]);
  const depthU = uniformLocations(depthProgram, ['u_lightViewProj']);
  const skyU = uniformLocations(skyProgram, [
    'u_viewProj', 'u_camPos', 'u_zenith', 'u_horizon', 'u_sunDir', 'u_sunColor',
    'u_moonDir', 'u_moonColor', 'u_night', 'u_sunsetBand', 'u_time',
  ]);
  const seaU = uniformLocations(seaProgram, [
    'u_viewProj', 'u_time', 'u_camPos', 'u_sunDir', 'u_sunColor', 'u_skyColor',
    'u_fogColor', 'u_fogNear', 'u_fogFar',
  ]);

  function shadowMatrixFor(sunDir, center) {
    const eye = [
      center[0] + sunDir[0] * 1500,
      center[1] + sunDir[1] * 1500,
      center[2] + sunDir[2] * 1500,
    ];
    const up = Math.abs(sunDir[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
    const view = mat4LookAt(eye, center, up);
    const proj = mat4Ortho(-380, 380, -380, 380, 100, 3000);
    return mat4Multiply(proj, view);
  }

  function drawMesh(program, mesh) {
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  return {
    gl,
    setStatic(arrays) {
      staticMesh = buildMeshVAO(gl, arrays, false);
    },
    setDynamic(arrays) {
      if (!dynamicMesh) dynamicMesh = buildMeshVAO(gl, arrays, true);
      else updateMeshVAO(gl, dynamicMesh, arrays);
    },
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    },
    render(state) {
      const { camera, preset, time, lights } = state;
      const aspect = canvas.width / canvas.height;
      const proj = mat4Perspective((camera.fov * Math.PI) / 180, aspect, 0.5, 9000);
      const target = [
        camera.pos[0] + Math.sin(camera.yaw) * Math.cos(camera.pitch),
        camera.pos[1] + Math.sin(camera.pitch),
        camera.pos[2] - Math.cos(camera.yaw) * Math.cos(camera.pitch),
      ];
      // Forward is (sin(yaw), 0, -cos(yaw)) at pitch 0; target above folds pitch in.
      const view = mat4LookAt(camera.pos, target, [0, 1, 0]);
      const viewProj = mat4Multiply(proj, view);
      const shadowCenter = [
        camera.pos[0] + Math.sin(camera.yaw) * 120,
        0,
        camera.pos[2] - Math.cos(camera.yaw) * 120,
      ];
      const lightViewProj = shadowMatrixFor(preset.sunDir, shadowCenter);

      // --- Shadow pass: the static city and the dynamic crowd, from the sun.
      if (preset.shadow) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
        gl.viewport(0, 0, shadowSize, shadowSize);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(depthProgram);
        gl.uniformMatrix4fv(depthU.u_lightViewProj, false, lightViewProj);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        if (staticMesh) drawMesh(depthProgram, staticMesh);
        if (dynamicMesh) drawMesh(depthProgram, dynamicMesh);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
      }

      gl.clearColor(preset.fog[0], preset.fog[1], preset.fog[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // --- Sky dome. The dome is centred on the camera by the vertex shader
      // (a_pos + u_camPos) and seen from inside, so culling stays off here:
      // its front faces point inward, and culling them would erase the sky.
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(skyProgram);
      gl.uniformMatrix4fv(skyU.u_viewProj, false, viewProj);
      gl.uniform3fv(skyU.u_camPos, camera.pos);
      gl.uniform3fv(skyU.u_zenith, preset.zenith);
      gl.uniform3fv(skyU.u_horizon, preset.horizon);
      gl.uniform3fv(skyU.u_sunDir, preset.sunDir);
      gl.uniform3fv(skyU.u_sunColor, preset.sunColor);
      gl.uniform3fv(skyU.u_moonDir, preset.moonDir);
      gl.uniform3fv(skyU.u_moonColor, preset.moonColor);
      gl.uniform1f(skyU.u_night, preset.night);
      gl.uniform1f(skyU.u_sunsetBand, preset.sunsetBand);
      gl.uniform1f(skyU.u_time, time);
      gl.bindVertexArray(skyVao);
      gl.drawElements(gl.TRIANGLES, sky.indices.length, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      // --- Sea.
      gl.useProgram(seaProgram);
      gl.uniformMatrix4fv(seaU.u_viewProj, false, viewProj);
      gl.uniform1f(seaU.u_time, time);
      gl.uniform3fv(seaU.u_camPos, camera.pos);
      gl.uniform3fv(seaU.u_sunDir, preset.sunDir);
      gl.uniform3fv(seaU.u_sunColor, preset.sunColor);
      gl.uniform3fv(seaU.u_skyColor, preset.horizon);
      gl.uniform3fv(seaU.u_fogColor, preset.fog);
      gl.uniform1f(seaU.u_fogNear, preset.fogNear);
      gl.uniform1f(seaU.u_fogFar, preset.fogFar);
      gl.bindVertexArray(seaVao);
      gl.drawElements(gl.TRIANGLES, sea.indices.length, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);

      // --- Opaque city and crowd.
      gl.useProgram(opaqueProgram);
      gl.uniformMatrix4fv(opaqueU.u_viewProj, false, viewProj);
      gl.uniformMatrix4fv(opaqueU.u_lightViewProj, false, lightViewProj);
      gl.uniform3fv(opaqueU.u_camPos, camera.pos);
      gl.uniform3fv(opaqueU.u_sunDir, preset.sunDir);
      gl.uniform3fv(opaqueU.u_sunColor, preset.sunColor);
      gl.uniform3fv(opaqueU.u_ambient, preset.ambient);
      gl.uniform3fv(opaqueU.u_horizon, preset.horizon);
      gl.uniform1f(opaqueU.u_reflect, preset.reflect);
      gl.uniform3fv(opaqueU.u_fogColor, preset.fog);
      gl.uniform1f(opaqueU.u_fogNear, preset.fogNear);
      gl.uniform1f(opaqueU.u_fogFar, preset.fogFar);
      gl.uniform1f(opaqueU.u_shadowOn, preset.shadow ? 1 : 0);
      gl.uniform1f(opaqueU.u_emissiveStrength, preset.emissive);
      gl.uniform1f(opaqueU.u_lampGlow, preset.lampGlow);
      const lightPos = new Float32Array(24);
      const lightCol = new Float32Array(18);
      const count = Math.min(6, lights.length);
      for (let i = 0; i < count; i += 1) {
        lightPos[i * 4] = lights[i].x;
        lightPos[i * 4 + 1] = lights[i].y;
        lightPos[i * 4 + 2] = lights[i].z;
        lightPos[i * 4 + 3] = lights[i].radius;
        lightCol[i * 3] = lights[i].color[0];
        lightCol[i * 3 + 1] = lights[i].color[1];
        lightCol[i * 3 + 2] = lights[i].color[2];
      }
      gl.uniform1i(opaqueU.u_lightCount, count);
      gl.uniform4fv(opaqueU.u_lights, lightPos);
      gl.uniform3fv(opaqueU.u_lightColors, lightCol);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, diffuseTex);
      gl.uniform1i(opaqueU.u_diffuse, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, emissiveTex);
      gl.uniform1i(opaqueU.u_emissive, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);
      gl.uniform1i(opaqueU.u_shadow, 2);
      if (staticMesh) drawMesh(opaqueProgram, staticMesh);
      if (dynamicMesh) drawMesh(opaqueProgram, dynamicMesh);
    },
  };
}
