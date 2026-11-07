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
      r *= r;
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

    const crest = ridged(x * 0.0042 + 11, z * 0.0042 - 4);
    const bulk = fbm(x * 0.0025, z * 0.0025, 3) * 0.5 + 0.5;
    const mountains = Math.pow(mask, 1.5) * (crest * 1.2 + bulk * 0.5) * 115;

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

// ── colour by height and slope ──────────────────────────────
const C = {
  sand: new THREE.Color("#cdb38a"),
  stone: new THREE.Color("#a99578"),
  scrub: new THREE.Color("#8c8a68"),
  rock: new THREE.Color("#6a645a"),
  dark: new THREE.Color("#454842"),
  crest: new THREE.Color("#8a8073"),
};

/**
 * @param {object} o
 * @param {number} o.size        width/depth of the terrain square (world units ≈ metres)
 * @param {number} o.segments    grid resolution (lower on phones)
 * @param {string} [o.heightmap] URL of a greyscale PNG; procedural when empty
 * @param {number} [o.heightScale] height of pure white in a heightmap
 * @param {number} [o.seed]
 * @param {{x:number,z:number,r:number}[]} [o.pads] flat spots for the villas
 * @param {boolean} [o.shadows]
 */
export async function createTerrain(o) {
  const { size = 900, segments = 200, heightmap = null, heightScale = 90, seed = 7, pads = [], shadows = true } = o;

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
  let maxH = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = heightAt(pos.getX(i), pos.getZ(i));
    pos.setY(i, y);
    if (y > maxH) maxH = y;
  }
  geo.computeVertexNormals();

  const tint = makeSimplex(seed + 99);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = y / Math.max(1, maxH);
    const slope = 1 - nrm.getY(i); // 0 flat … 1 vertical
    const patch = tint(x * 0.03, z * 0.03) * 0.5 + 0.5;

    c.copy(C.sand).lerp(C.stone, smoothstep(0.02, 0.18, t));
    c.lerp(C.scrub, smoothstep(0.55, 0.85, patch) * (1 - smoothstep(0.1, 0.35, t)) * 0.55);
    c.lerp(C.rock, smoothstep(0.15, 0.45, t));
    c.lerp(C.dark, smoothstep(0.42, 0.75, t) * 0.85);
    c.lerp(C.crest, smoothstep(0.82, 1, t) * 0.6);
    c.lerp(C.dark, smoothstep(0.18, 0.5, slope) * 0.6); // cliffs read as darker rock
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = shadows;
  mesh.castShadow = shadows;
  mesh.name = "terrain";

  return { mesh, heightAt, size, maxHeight: maxH };
}

/**
 * Scatter low-poly boulders and desert shrubs over the valley floor.
 * Returns a Group of InstancedMeshes (cheap: two draw calls).
 */
export function createScatter(heightAt, { size = 900, seed = 7, pads = [], count = 420, shadows = true } = {}) {
  const rand = rng(seed + 5);
  const group = new THREE.Group();
  group.name = "scatter";

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: "#8b8070", roughness: 1, flatShading: true });
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);
  const bushMat = new THREE.MeshStandardMaterial({ color: "#6f7454", roughness: 1, flatShading: true });

  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, count);
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  let nr = 0, nb = 0;
  const half = Math.min(size * 0.42, 260);
  for (let tries = 0; tries < count * 6 && (nr < count || nb < count); tries++) {
    const x = (rand() * 2 - 1) * half;
    const z = (rand() * 2 - 1) * half;
    if (pads.some((pd) => Math.hypot(x - pd.x, z - pd.z) < pd.r * 1.25)) continue;
    const y = heightAt(x, z);
    const dx = heightAt(x + 1, z) - y, dz = heightAt(x, z + 1) - y;
    const steep = Math.hypot(dx, dz);
    if (steep > 0.9) continue;
    e.set(rand() * 3, rand() * 6, rand() * 3);
    q.setFromEuler(e);
    if (rand() < 0.45 && nr < count) {
      const k = 0.4 + Math.pow(rand(), 3) * 2.6;
      s.set(k * (0.8 + rand() * 0.5), k * (0.5 + rand() * 0.4), k);
      p.set(x, y + s.y * 0.25, z);
      rocks.setMatrixAt(nr++, m.compose(p, q, s));
    } else if (nb < count && y < 22 && steep < 0.45) {
      const k = 0.5 + rand() * 0.9;
      s.set(k * 1.2, k * 0.75, k * 1.2);
      p.set(x, y + s.y * 0.5, z);
      bushes.setMatrixAt(nb++, m.compose(p, q.identity(), s));
    }
  }
  rocks.count = nr;
  bushes.count = nb;
  for (const im of [rocks, bushes]) {
    im.castShadow = shadows;
    im.receiveShadow = shadows;
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
  }
  return group;
}
