// ─────────────────────────────────────────────────────────────
//  Terrain for the home-page 3D landscape.
//
//  createTerrain() returns a mesh plus heightAt(x, z), which the rest of
//  the scene uses to stand villas, rocks and the camera on the ground.
//
//  Two sources of height:
//   • procedural (default): layered simplex noise shaped into rocky ridges
//     at the back and a gentle valley where the villas sit;
//   • a real heightmap PNG: set `terrain.heightmap` in js/data.js.
//     Black = lowest, white = highest (scaled by `terrain.heightScale`).
//     The image covers the whole terrain square, north (top of the image)
//     towards the back of the scene (−z).
//
//  Either way, each villa gets a flat "pad" so it sits level on the ground.
// ─────────────────────────────────────────────────────────────
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

// ── seeded random + 2D simplex noise (after Stefan Gustavson, public domain) ──
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSimplex(seed) {
  const rand = rng(seed);
  const p = new Uint8Array(256).map((_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;

  return function noise(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    const corner = (x, y, g) => {
      let tt = 0.5 - x * x - y * y;
      if (tt < 0) return 0;
      tt *= tt;
      const gr = grad[g & 7];
      return tt * tt * (gr[0] * x + gr[1] * y);
    };
    n += corner(x0, y0, perm[ii + perm[jj]]);
    n += corner(x1, y1, perm[ii + i1 + perm[jj + j1]]);
    n += corner(x2, y2, perm[ii + 1 + perm[jj + 1]]);
    return 70 * n; // roughly −1..1
  };
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ── procedural height field ──────────────────────────────────
function proceduralField(seed) {
  const n = makeSimplex(seed);
  const fbm = (x, z, oct = 5) => {
    let amp = 1, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += amp * n(x * f, z * f);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm; // −1..1
  };
  // Ridged multifractal: sharp crests, good for rocky mountains.
  const ridged = (x, z, oct = 6) => {
    let amp = 0.5, f = 1, sum = 0, prev = 1;
    for (let o = 0; o < oct; o++) {
      let r = 1 - Math.abs(n(x * f, z * f));
      r = Math.pow(r, 1.6);
      sum += r * amp * prev;
      prev = r;
      amp *= 0.5;
      f *= 2.1;
    }
    return sum; // ~0..1
  };

  return (x, z) => {
    // Mountains rise behind the villas (−z) and at the far sides,
    // with a low rim in front so the edge of the world never shows.
    const back = smoothstep(-80, -320, z + n(x * 0.003, 3.1) * 50);
    const side = smoothstep(150, 340, Math.abs(x) + n(z * 0.004, 7.7) * 40);
    const front = smoothstep(220, 420, z);
    const mask = Math.max(back, side * 0.85, front * 0.4);

    // domain warp: bends the ridges into the irregular, eroded lines of real ranges
    const wx = x + fbm(x * 0.003 + 5, z * 0.003, 3) * 70;
    const wz = z + fbm(x * 0.003, z * 0.003 + 9, 3) * 70;
    const crest = ridged(wx * 0.0042 + 11, wz * 0.0042 - 4);
    const bulk = fbm(x * 0.0025, z * 0.0025, 3) * 0.5 + 0.5;
    let mountains = Math.pow(mask, 1.5) * (crest * 0.85 + bulk * 0.85) * 120;
    // limestone ledges: soft terracing on the higher ground
    const step = 9, tt = mountains / step;
    const terraced = (Math.floor(tt) + smoothstep(0.25, 0.75, tt - Math.floor(tt))) * step;
    mountains += (terraced - mountains) * 0.45 * smoothstep(8, 30, mountains);

    // The valley floor: a slow tilt up towards the mountains, soft hills
    // and fine gravelly detail.
    const tilt = smoothstep(40, -200, z) * 14;
    const hills = fbm(x * 0.01 + 40, z * 0.01, 4) * 6;
    const grit = n(x * 0.07, z * 0.07) * 0.15;
    return mountains + tilt + hills + grit;
  };
}

// ── heightmap PNG field ─────────────────────────────────────
async function heightmapField(url, size, heightScale) {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  const w = Math.min(img.naturalWidth, 1024);
  const h = Math.min(img.naturalHeight, 1024);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;

  const at = (ix, iy) => lum[Math.min(h - 1, Math.max(0, iy)) * w + Math.min(w - 1, Math.max(0, ix))];
  return (x, z) => {
    const u = (x / size + 0.5) * (w - 1);
    const v = (z / size + 0.5) * (h - 1);
    const x0 = Math.floor(u), y0 = Math.floor(v);
    const fx = u - x0, fy = v - y0;
    const a = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const b = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return (a * (1 - fy) + b * fy) * heightScale;
  };
}

// Flatten the ground under each villa: full flat inside r, blending out to 2r.
function withPads(field, pads) {
  const levels = pads.map((p) => {
    let sum = 0, k = 0;
    for (let a = 0; a < 8; a++) {
      sum += field(p.x + Math.cos(a) * p.r * 0.5, p.z + Math.sin(a) * p.r * 0.5);
      k++;
    }
    return (sum / k + field(p.x, p.z)) / 2;
  });
  return (x, z) => {
    let h = field(x, z);
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r * 2) h += (levels[i] - h) * (1 - smoothstep(p.r, p.r * 2, d));
    }
    return h;
  };
}

// ── colour by height, slope and hollows ─────────────────────
// Palette sampled from the Hajar mountains: grey-brown limestone above a
// dusty gravel valley floor with sparse, dry scrub.
const C = {
  gravel: new THREE.Color("#bba98c"),
  dust: new THREE.Color("#c9b99b"),
  scrub: new THREE.Color("#8d8a6e"),
  rock: new THREE.Color("#8f8170"),
  dark: new THREE.Color("#665d52"),
  crest: new THREE.Color("#9a9182"),
};

// Detail added per pixel on the GPU: colour variation, gravel speckle,
// limestone strata on steep faces and a bump that catches the low sun.
// Fades out with distance so far slopes don't shimmer.
const TERRAIN_GLSL = /* glsl */ `
  varying vec3 vTPos;
  varying vec3 vTNrm;
  float tHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float tNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(tHash(i), tHash(i + vec2(1, 0)), u.x), mix(tHash(i + vec2(0, 1)), tHash(i + vec2(1, 1)), u.x), u.y);
  }
  float tFbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int k = 0; k < 4; k++) { s += a * tNoise(p); p = p * 2.07 + 13.1; a *= 0.5; }
    return s;
  }
`;

const TERRAIN_BUMP = /* glsl */ `#include <normal_fragment_maps>
        {
          // bump from the slope of a small height field, sampled in world space
          vec2 q = vTPos.xz;
          float e = 0.2;
          #define TH(P) (tFbm((P) * 0.35) * 0.9 * tMid + tNoise((P) * 1.6) * 0.25 * tFine + tFbm(vec2(vTPos.y * 1.6, ((P).x - (P).y) * 0.05)) * tSteep * 1.4 * tMid)
          float h0 = TH(q);
          float gx = (TH(q + vec2(e, 0.0)) - h0) / e;
          float gz = (TH(q + vec2(0.0, e)) - h0) / e;
          vec3 nW = normalize(vTNrm - vec3(gx, 0.0, gz) * 0.35);
          vec3 nV = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          normal = normalize(mix(normal, nV, tNear));
        }`;

function terrainMaterial(detail) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: detail };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTPos;\nvarying vec3 vTNrm;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTNrm = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uDetail;\n" + TERRAIN_GLSL)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float tDist = length(vTPos - cameraPosition);
        float tNear = (1.0 - smoothstep(60.0, 420.0, tDist)) * uDetail;
        // metres covered by one pixel: fine detail fades before it can alias
        float tPx = length(fwidth(vTPos.xz));
        float tFine = 1.0 - smoothstep(0.08, 0.3, tPx);
        float tMid = 1.0 - smoothstep(0.4, 1.4, tPx);
        float tSteep = smoothstep(0.22, 0.65, 1.0 - vTNrm.y);
        float tPatch = tFbm(vTPos.xz * 0.045);
        float tSpeck = tNoise(vTPos.xz * 1.9);
        float tBands = tFbm(vec2(vTPos.y * 0.9, (vTPos.x + vTPos.z) * 0.012));
        vec3 tc = diffuseColor.rgb;
        tc *= mix(0.84, 1.14, tPatch);
        tc *= mix(1.0, mix(0.86, 1.1, tSpeck), tFine * (1.0 - tSteep));
        tc *= mix(1.0, mix(0.72, 1.12, tBands), tSteep);
        diffuseColor.rgb = tc;`
      )
      // phones skip the per-pixel bump, the most expensive part
      .replace("#include <normal_fragment_maps>", detail < 0.8 ? "#include <normal_fragment_maps>" : TERRAIN_BUMP);
  };
  mat.customProgramCacheKey = () => "jeen-terrain-" + detail;
  return mat;
}

/**
 * @param {object} o
 * @param {number} o.size        width/depth of the terrain square (world units ≈ metres)
 * @param {number} o.segments    grid resolution (lower on phones)
 * @param {string} [o.heightmap] URL of a greyscale PNG; procedural when empty
 * @param {number} [o.heightScale] height of pure white in a heightmap
 * @param {number} [o.seed]
 * @param {{x:number,z:number,r:number}[]} [o.pads] flat spots for the villas
 * @param {boolean} [o.shadows]
 * @param {number} [o.detail]   0…1 strength of the per-pixel surface detail
 */
export async function createTerrain(o) {
  const { size = 900, segments = 200, heightmap = null, heightScale = 90, seed = 7, pads = [], shadows = true, detail = 1 } = o;

  let base = null;
  if (heightmap) {
    try {
      base = await heightmapField(heightmap, size, heightScale);
    } catch (err) {
      console.warn(`JÉEN: could not load heightmap "${heightmap}", using the procedural terrain instead.`, err);
    }
  }
  if (!base) base = proceduralField(seed);
  const heightAt = withPads(base, pads);

  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  let maxH = -Infinity, minH = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = heightAt(pos.getX(i), pos.getZ(i));
    pos.setY(i, y);
    if (y > maxH) maxH = y;
    if (y < minH) minH = y;
  }
  geo.computeVertexNormals();

  // Hollows (concave spots) are shaded darker: a cheap stand-in for
  // ambient occlusion that makes gullies and the foot of slopes read.
  const row = segments + 1;
  const cell = size / segments;
  const cavity = new Float32Array(pos.count);
  for (let iy = 0; iy < row; iy++) {
    for (let ix = 0; ix < row; ix++) {
      const i = iy * row + ix;
      let sum = 0, k = 0;
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]]) {
        const jx = ix + dx, jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= row || jy >= row) continue;
        sum += pos.getY(jy * row + jx);
        k++;
      }
      cavity[i] = (sum / k - pos.getY(i)) / (cell * 2); // >0 means a hollow
    }
  }

  const tint = makeSimplex(seed + 99);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const nrm = geo.attributes.normal;
  const span = Math.max(1, maxH - minH);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (y - minH) / span;
    const slope = 1 - nrm.getY(i); // 0 flat … 1 vertical
    const patch = tint(x * 0.02, z * 0.02) * 0.5 + 0.5;

    c.copy(C.gravel).lerp(C.dust, smoothstep(0.4, 0.8, patch) * (1 - smoothstep(0.05, 0.2, t)));
    c.lerp(C.scrub, smoothstep(0.62, 0.9, 1 - patch) * (1 - smoothstep(0.08, 0.3, t)) * 0.5);
    c.lerp(C.rock, smoothstep(0.1, 0.35, t));
    c.lerp(C.dark, smoothstep(0.35, 0.75, t) * 0.55);
    c.lerp(C.crest, smoothstep(0.8, 1, t) * 0.5);
    c.lerp(C.rock, smoothstep(0.12, 0.35, slope) * 0.7);
    c.lerp(C.dark, smoothstep(0.35, 0.7, slope) * 0.6); // cliffs read as darker rock
    c.multiplyScalar(1 - Math.min(0.35, Math.max(0, cavity[i]) * 0.9));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, terrainMaterial(detail));
  mesh.receiveShadow = shadows;
  mesh.castShadow = shadows;
  mesh.name = "terrain";

  return { mesh, heightAt, size, maxHeight: maxH };
}

// An irregular, rounded rock: an icosphere with its vertices pushed around.
// (Polyhedra come unindexed; welding the vertices gives smooth normals.)
function rockGeometry(seed) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 1).deleteAttribute("normal").deleteAttribute("uv"));
  const n = makeSimplex(seed);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + n(v.x * 1.3 + v.z, v.y * 1.3) * 0.28 + n(v.x * 3.1, v.z * 3.1 + v.y) * 0.12;
    v.multiplyScalar(k);
    if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3; // flat-ish bottom that sits in the ground
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function bushGeometry(seed) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 2).deleteAttribute("normal").deleteAttribute("uv"));
  const n = makeSimplex(seed);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + n(v.x * 2.2, v.z * 2.2 + v.y) * 0.28);
    p.setXYZ(i, v.x, Math.max(v.y, -0.3), v.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Scatter boulders, dry scrub and a few desert trees over the valley.
 * Instanced, so the whole lot is a handful of draw calls.
 */
export function createScatter(heightAt, { size = 900, seed = 7, pads = [], count = 420, shadows = true } = {}) {
  const rand = rng(seed + 5);
  const group = new THREE.Group();
  group.name = "scatter";

  const rocks = new THREE.InstancedMesh(rockGeometry(seed + 1), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.92 }), count);
  const bushes = new THREE.InstancedMesh(bushGeometry(seed + 2), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 }), count);
  const treeN = Math.round(count / 28);
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const canopyGeo = bushGeometry(seed + 3);
  canopyGeo.scale(1, 0.45, 1);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: "#5d5246", roughness: 1 }), treeN);
  const canopies = new THREE.InstancedMesh(canopyGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 }), treeN);

  const rockTones = ["#8e8578", "#7b746a", "#9d9485", "#6f695f"].map((c) => new THREE.Color(c));
  const leafTones = ["#7d8461", "#6f7656", "#8a8b68", "#76704f"].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const col = new THREE.Color();
  let nr = 0, nb = 0, nt = 0;
  const half = Math.min(size * 0.42, 300);
  for (let tries = 0; tries < count * 8 && (nr < count || nb < count); tries++) {
    // denser near the middle, where the camera looks
    const r = Math.pow(rand(), 0.8) * half;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (pads.some((pd) => Math.hypot(x - pd.x, z - pd.z) < pd.r * 1.15)) continue;
    const y = heightAt(x, z);
    const steep = Math.hypot(heightAt(x + 1, z) - y, heightAt(x, z + 1) - y);
    if (steep > 1.1) continue;
    const pick = rand();
    if (pick < 0.5 && nr < count) {
      const k = 0.25 + Math.pow(rand(), 4) * 3.2; // mostly small stones, the odd big boulder
      s.set(k * (0.8 + rand() * 0.6), k * (0.55 + rand() * 0.4), k * (0.8 + rand() * 0.5));
      e.set(rand() * 0.5, rand() * 6.3, rand() * 0.5);
      p.set(x, y + s.y * 0.1, z);
      rocks.setMatrixAt(nr, m.compose(p, q.setFromEuler(e), s));
      rocks.setColorAt(nr++, col.copy(rockTones[Math.floor(rand() * 4)]).multiplyScalar(0.9 + rand() * 0.2));
    } else if (pick < 0.93 && nb < count && steep < 0.6) {
      const k = 0.35 + rand() * 0.7;
      s.set(k * (1 + rand() * 0.4), k * 0.7, k * (1 + rand() * 0.4));
      e.set(0, rand() * 6.3, 0);
      p.set(x, y + s.y * 0.25, z);
      bushes.setMatrixAt(nb, m.compose(p, q.setFromEuler(e), s));
      bushes.setColorAt(nb++, col.copy(leafTones[Math.floor(rand() * 4)]).multiplyScalar(0.85 + rand() * 0.25));
    } else if (nt < treeN && steep < 0.35) {
      const h = 2.2 + rand() * 1.8, w = 2.2 + rand() * 1.6;
      e.set((rand() - 0.5) * 0.15, rand() * 6.3, (rand() - 0.5) * 0.15);
      q.setFromEuler(e);
      trunks.setMatrixAt(nt, m.compose(p.set(x, y - 0.1, z), q, s.set(1, h, 1)));
      canopies.setMatrixAt(nt, m.compose(p.set(x, y + h + 0.1, z), q, s.set(w, w, w)));
      canopies.setColorAt(nt++, col.copy(leafTones[Math.floor(rand() * 4)]).multiplyScalar(0.8 + rand() * 0.2));
    }
  }
  rocks.count = nr;
  bushes.count = nb;
  trunks.count = canopies.count = nt;
  for (const im of [rocks, bushes, trunks, canopies]) {
    im.castShadow = shadows;
    im.receiveShadow = shadows;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im);
  }
  return group;
}
