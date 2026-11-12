// ─────────────────────────────────────────────────────────────
//  Villa models for the 3D landscape.
//
//  loadVillaModel(villa) is the single entry point the scene uses:
//   • if the villa has `model: "assets/models/villa-1.glb"` in js/data.js,
//     that file is loaded (GLTFLoader, fetched only when needed);
//   • otherwise buildVillaModel() makes a low-poly stand-in in code.
//
//  Model convention: 1 unit = 1 metre, origin at ground level in the middle
//  of the footprint, front (terrace / pool side) facing +z. A .glb in another
//  scale can be fixed with `map.scale` in data.js.
// ─────────────────────────────────────────────────────────────
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

// Materials follow the real villas: smooth off-white render, dark-framed
// glazing, grey stone paving, black aluminium pergolas, blue-tiled pools.
const MAT = () => ({
  render: new THREE.MeshStandardMaterial({ color: "#ece7de", roughness: 0.82 }),
  renderShade: new THREE.MeshStandardMaterial({ color: "#e2dccf", roughness: 0.85 }),
  coping: new THREE.MeshStandardMaterial({ color: "#d9d4ca", roughness: 0.7 }),
  paving: new THREE.MeshStandardMaterial({ color: "#bdb4a5", roughness: 0.8 }),
  base: new THREE.MeshStandardMaterial({ color: "#8f887b", roughness: 0.95 }),
  glass: new THREE.MeshStandardMaterial({ color: "#1c2427", roughness: 0.05, metalness: 0.9, emissive: new THREE.Color("#ffb070"), emissiveIntensity: 0.06 }),
  frame: new THREE.MeshStandardMaterial({ color: "#1e2021", roughness: 0.45, metalness: 0.6 }),
  door: new THREE.MeshStandardMaterial({ color: "#6b4630", roughness: 0.6 }),
  water: new THREE.MeshStandardMaterial({ color: "#1d9cc2", roughness: 0.07, metalness: 0, envMapIntensity: 0.3, emissive: new THREE.Color("#0f7fa3"), emissiveIntensity: 0.45, normalMap: waterNormals(), normalScale: new THREE.Vector2(0.3, 0.3) }),
  fabric: new THREE.MeshStandardMaterial({ color: "#d8d2c6", roughness: 1 }),
  fabricDark: new THREE.MeshStandardMaterial({ color: "#4a4a47", roughness: 1 }),
  lamp: new THREE.MeshStandardMaterial({ color: "#fff0d6", emissive: new THREE.Color("#ffc27a"), emissiveIntensity: 1.6 }),
  ac: new THREE.MeshStandardMaterial({ color: "#c9c9c4", roughness: 0.6, metalness: 0.2 }),
  trunk: new THREE.MeshStandardMaterial({ color: "#6a6155", roughness: 1 }),
  olive: new THREE.MeshStandardMaterial({ color: "#7c876a", roughness: 1 }),
});

// Ripple normal map for pool water (made once from noise, shared).
let waterTex = null;
export function waterNormals() {
  if (waterTex) return waterTex;
  const N = 128;
  const h = new Float32Array(N * N);
  const rand = (i) => (Math.sin(i * 127.1) * 43758.5453) % 1;
  const waves = Array.from({ length: 6 }, (_, i) => ({ fx: Math.round(rand(i + 1) * 6) + 1, fy: Math.round(rand(i + 9) * 6) - 3, ph: rand(i + 17) * 6.28 }));
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      h[y * N + x] = waves.reduce((a, w) => a + Math.sin(((x * w.fx + y * w.fy) / N) * Math.PI * 2 + w.ph), 0);
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
      const dy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      const v = new THREE.Vector3(-dx * 0.5, -dy * 0.5, 4).normalize();
      const o = (y * N + x) * 4;
      img.data[o] = (v.x * 0.5 + 0.5) * 255;
      img.data[o + 1] = (v.y * 0.5 + 0.5) * 255;
      img.data[o + 2] = (v.z * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  waterTex = new THREE.CanvasTexture(c);
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(0.4, 0.4);
  return waterTex;
}

/** Call every frame to make pool water ripple. */
export function animateWater(t) {
  if (!waterTex) return;
  waterTex.offset.set(t * 0.012, t * 0.008);
}

/** "pool" | "jacuzzi" | null, from `map.pool` or the villa's own text. */
export function poolType(villa) {
  if (villa.map && "pool" in villa.map) return villa.map.pool || null;
  const text = [villa.highlight, ...(villa.amenities || [])].join(" ").toLowerCase();
  if (/jacuzzi|hot tub/.test(text)) return "jacuzzi";
  if (/pool/.test(text)) return "pool";
  return null;
}

function makeBox(w, h, d, mat, x, y, z, shadows = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

function oliveTree(M, x, z, k = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * k, 0.18 * k, 2.2 * k, 6), M.trunk);
  trunk.position.y = 1.1 * k;
  trunk.rotation.z = 0.08;
  trunk.castShadow = true;
  g.add(trunk);
  const blobs = [[0, 2.7, 0, 1.25], [0.8, 2.35, 0.3, 0.85], [-0.7, 2.45, -0.3, 0.9], [0.2, 3.25, -0.4, 0.8]];
  for (const [bx, by, bz, r] of blobs) {
    const bg = mergeVertices(new THREE.IcosahedronGeometry(r * k, 1).deleteAttribute("normal").deleteAttribute("uv"));
    bg.computeVertexNormals();
    const b = new THREE.Mesh(bg, M.olive);
    b.position.set(bx * k, by * k, bz * k);
    b.scale.y = 0.75;
    b.castShadow = true;
    b.receiveShadow = true;
    g.add(b);
  }
  g.position.set(x, 0, z);
  return g;
}

/**
 * A modern walled villa: off-white rendered house with a flat parapet roof
 * and big dark-framed glazing, a paved terrace with pool or jacuzzi, a black
 * pergola with outdoor seating, olive trees and a perimeter wall.
 * Front (terrace side) faces +z; ground level is y = 0.
 */
export function buildVillaModel(villa) {
  const M = MAT();
  const g = new THREE.Group();
  g.name = `villa:${villa.id}`;
  const beds = villa.bedrooms || 2;
  const pool = poolType(villa);

  const W = 10 + beds * 2.6; // house width
  const D = 8.5; // house depth
  const H = 3.8; // storey height
  const PW = W + 9; // plot
  const PD = D + 15;
  const top = 0.2; // terrace level
  const houseZ = -PD / 2 + D / 2 + 1.2;
  const frontZ = houseZ + D / 2;

  // Plinth the plot sits on (runs into the ground on slopes)
  g.add(makeBox(PW + 0.6, 3.2, PD + 0.6, M.base, 0, top - 1.6 - 0.05, 0));

  // Terrace paving with a hole cut for the pool
  const pw = pool === "pool" ? Math.min(W * 0.55, 9) : pool === "jacuzzi" ? 2.6 : 0;
  const pd = pool === "pool" ? 3.6 : pool === "jacuzzi" ? 2.6 : 0;
  const px = pool === "pool" ? -PW / 2 + 1.4 + pw / 2 : -PW / 2 + 2 + pw / 2;
  const pz = frontZ + 1.8 + pd / 2;
  const T = 0.12;
  const paveY = top - T / 2;
  if (pool) {
    const x0 = -PW / 2, x1 = PW / 2, z0 = -PD / 2, z1 = PD / 2;
    const hx0 = px - pw / 2, hx1 = px + pw / 2, hz0 = pz - pd / 2, hz1 = pz + pd / 2;
    g.add(makeBox(PW, T, hz0 - z0, M.paving, 0, paveY, (z0 + hz0) / 2, false));
    g.add(makeBox(PW, T, z1 - hz1, M.paving, 0, paveY, (hz1 + z1) / 2, false));
    g.add(makeBox(hx0 - x0, T, pd, M.paving, (x0 + hx0) / 2, paveY, pz, false));
    g.add(makeBox(x1 - hx1, T, pd, M.paving, (hx1 + x1) / 2, paveY, pz, false));
    // coping and water (the plinth below stands in for the basin)
    for (const [cw, cd, cx, cz] of [[pw + 0.6, 0.3, px, pz - pd / 2 - 0.15], [pw + 0.6, 0.3, px, pz + pd / 2 + 0.15], [0.3, pd, px - pw / 2 - 0.15, pz], [0.3, pd, px + pw / 2 + 0.15, pz]])
      g.add(makeBox(cw, 0.06, cd, M.coping, cx, top + 0.03, cz, false));
    const water = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), M.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(px, top - 0.025, pz);
    water.receiveShadow = true;
    water.name = "water";
    g.add(water);
    if (pool === "pool") {
      // the waterfall feature: a raised rendered wall at the back of the pool
      g.add(makeBox(pw * 0.5, 1.1, 0.35, M.renderShade, px, top + 0.55, pz - pd / 2 - 0.45));
    }
  } else {
    g.add(makeBox(PW, T, PD, M.paving, 0, paveY, 0, false));
  }

  // House: rendered box, parapet roof, glazing
  const house = new THREE.Group();
  house.position.set(0, top, houseZ);
  house.add(makeBox(W, H, D, M.render, 0, H / 2, 0));
  house.add(makeBox(W + 0.5, 0.25, D + 0.5, M.renderShade, 0, H + 0.12, 0));
  const par = 0.6, pt = 0.2;
  house.add(makeBox(W + 0.5, par, pt, M.render, 0, H + 0.25 + par / 2, (D + 0.5) / 2 - pt / 2));
  house.add(makeBox(W + 0.5, par, pt, M.render, 0, H + 0.25 + par / 2, -(D + 0.5) / 2 + pt / 2));
  house.add(makeBox(pt, par, D + 0.5, M.render, (W + 0.5) / 2 - pt / 2, H + 0.25 + par / 2, 0));
  house.add(makeBox(pt, par, D + 0.5, M.render, -(W + 0.5) / 2 + pt / 2, H + 0.25 + par / 2, 0));
  // AC units on the roof
  house.add(makeBox(1.0, 0.7, 0.7, M.ac, W * 0.25, H + 0.6, -D * 0.2));
  house.add(makeBox(1.0, 0.7, 0.7, M.ac, W * 0.25 + 1.3, H + 0.6, -D * 0.2));
  // big sliding doors onto the terrace, with frames
  const gw = W * 0.62, gh = H * 0.78, gx = -W * 0.12;
  house.add(makeBox(gw, gh, 0.06, M.glass, gx, gh / 2 + 0.05, D / 2 + 0.03, false));
  const panels = 4;
  for (let i = 0; i <= panels; i++) house.add(makeBox(0.08, gh, 0.1, M.frame, gx - gw / 2 + (i * gw) / panels, gh / 2 + 0.05, D / 2 + 0.05, false));
  house.add(makeBox(gw + 0.08, 0.1, 0.1, M.frame, gx, gh + 0.05, D / 2 + 0.05, false));
  // tall slot window and a wooden entrance door on the side
  house.add(makeBox(0.06, H * 0.6, 0.9, M.glass, W / 2 + 0.03, H * 0.5, -D * 0.15, false));
  house.add(makeBox(0.08, 2.4, 1.2, M.door, -W / 2 - 0.04, 1.2, -D * 0.2, false));
  // warm wall lights
  for (const lx of [gx - gw / 2 - 0.5, gx + gw / 2 + 0.5]) house.add(makeBox(0.12, 0.25, 0.08, M.lamp, lx, 2.4, D / 2 + 0.05, false));
  g.add(house);

  // Second, lower wing for the bigger villas
  if (beds >= 3) {
    const ww = W * 0.42, wd = D * 0.85, wh = H * 0.85;
    const wing = new THREE.Group();
    wing.position.set(W / 2 + ww / 2 - 0.6, top, houseZ - 1.4);
    wing.add(makeBox(ww, wh, wd, M.renderShade, 0, wh / 2, 0));
    wing.add(makeBox(ww + 0.4, 0.25, wd + 0.4, M.render, 0, wh + 0.12, 0));
    wing.add(makeBox(ww * 0.6, wh * 0.55, 0.06, M.glass, 0, wh * 0.5, wd / 2 + 0.03, false));
    g.add(wing);
  }

  // Pergola: black aluminium posts, beams and louvres
  const pgW = 4.8, pgD = 4, pgH = 2.8;
  const pgX = pool === "pool" ? PW / 2 - pgW / 2 - 1.2 : PW / 2 - pgW / 2 - 1.6;
  const pgZ = frontZ + 1.2 + pgD / 2;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(makeBox(0.14, pgH, 0.14, M.frame, pgX + (sx * pgW) / 2, top + pgH / 2, pgZ + (sz * pgD) / 2));
  for (const sz of [-1, 1]) g.add(makeBox(pgW + 0.2, 0.22, 0.14, M.frame, pgX, top + pgH, pgZ + (sz * pgD) / 2));
  for (const sx of [-1, 1]) g.add(makeBox(0.14, 0.22, pgD + 0.2, M.frame, pgX + (sx * pgW) / 2, top + pgH, pgZ));
  for (let i = 0; i < 14; i++) g.add(makeBox(0.06, 0.16, pgD, M.frame, pgX - pgW / 2 + 0.2 + (i * (pgW - 0.4)) / 13, top + pgH + 0.05, pgZ));
  // L-shaped outdoor sofa and a table under the pergola
  g.add(makeBox(3.2, 0.45, 0.85, M.fabricDark, pgX, top + 0.22, pgZ - pgD / 2 + 0.7));
  g.add(makeBox(0.85, 0.45, 2.2, M.fabricDark, pgX - 1.6 + 0.42, top + 0.22, pgZ + 0.1));
  g.add(makeBox(3.0, 0.12, 0.7, M.fabric, pgX, top + 0.5, pgZ - pgD / 2 + 0.72));
  g.add(makeBox(1.3, 0.4, 0.8, M.frame, pgX + 0.4, top + 0.2, pgZ + 0.4));
  // sun loungers by the pool
  if (pool === "pool") {
    for (let i = 0; i < 2; i++) {
      const l = makeBox(0.75, 0.3, 1.9, M.fabric, px - pw / 4 + i * 1.3, top + 0.15, pz + pd / 2 + 1.4);
      l.rotation.x = -0.05;
      g.add(l);
    }
  }

  // Perimeter wall: tall at the back and sides, low at the front with a gate gap
  const wt = 0.25, wh = 2.4, fh = 1.0;
  g.add(makeBox(PW, wh, wt, M.render, 0, top + wh / 2, -PD / 2 + wt / 2));
  g.add(makeBox(wt, wh, PD, M.render, -PW / 2 + wt / 2, top + wh / 2, 0));
  g.add(makeBox(wt, wh, PD, M.render, PW / 2 - wt / 2, top + wh / 2, 0));
  const gate = 2.2;
  const half = (PW - gate) / 2;
  g.add(makeBox(half, fh, wt, M.render, -PW / 2 + half / 2, top + fh / 2, PD / 2 - wt / 2));
  g.add(makeBox(half, fh, wt, M.render, PW / 2 - half / 2, top + fh / 2, PD / 2 - wt / 2));
  for (const s of [-1, 1]) g.add(makeBox(wt + 0.06, 0.06, PD, M.coping, s * (PW / 2 - wt / 2), top + wh + 0.03, 0, false));
  // wall lights along the side walls
  for (let i = 0; i < 3; i++)
    for (const s of [-1, 1]) g.add(makeBox(0.08, 0.2, 0.12, M.lamp, s * (PW / 2 - wt - 0.04), top + 1.8, -PD / 2 + 4 + i * ((PD - 6) / 2), false));

  // Olive trees in the corners of the garden
  g.add(oliveTree(M, -PW / 2 + 1.6, PD / 2 - 1.8, 1));
  g.add(oliveTree(M, PW / 2 - 1.4, PD / 2 - 1.5, 0.85));
  g.add(oliveTree(M, -PW / 2 + 1.5, -PD / 2 + 1.6, 0.9));

  const merged = mergeByMaterial(g);
  merged.name = g.name;
  merged.userData.footprint = Math.max(PW, PD) + 1;
  merged.userData.height = H + 0.9;
  return merged;
}

// The model is built from ~150 small parts; merging the parts that share a
// material (and shadow setting) brings that down to about 20 draw calls.
function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const key = o.material.uuid + (o.castShadow ? ":s" : "") + (o.name === "water" ? ":w" : "");
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, name: o.name, geos: [] });
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
    geo.applyMatrix4(o.matrixWorld);
    buckets.get(key).geos.push(geo);
    o.geometry.dispose();
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(b.geos, false), b.mat);
    b.geos.forEach((gg) => gg.dispose());
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    if (b.name === "water") mesh.name = "water";
    out.add(mesh);
  }
  return out;
}

let gltfLoader = null;
async function loadGlb(url) {
  if (!gltfLoader) {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    gltfLoader = new GLTFLoader();
  }
  const gltf = await gltfLoader.loadAsync(url);
  const root = gltf.scene;
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  root.userData.footprint = Math.max(size.x, size.z) + 4;
  root.userData.height = size.y;
  return root;
}

/** Built-in model, or the villa's .glb when `model` is set (falls back on error). */
export async function loadVillaModel(villa) {
  let obj = null;
  if (villa.model) {
    try {
      obj = await loadGlb(villa.model);
    } catch (err) {
      console.warn(`JÉEN: could not load model "${villa.model}" for ${villa.id}, using the built-in model.`, err);
    }
  }
  if (!obj) obj = buildVillaModel(villa);
  const k = villa.map?.scale || 1;
  if (k !== 1) {
    obj.scale.setScalar(k);
    obj.userData.footprint *= k;
    obj.userData.height *= k;
  }
  return obj;
}

/** Grey, desaturated look for villas that can't be booked. */
export function applyUnavailableLook(obj) {
  const hsl = {};
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m) => {
      const c = m.clone();
      if (c.color) {
        c.color.getHSL(hsl);
        c.color.setHSL(hsl.h, hsl.s * 0.08, hsl.l * 0.8 + 0.06);
      }
      if (c.emissive) c.emissive.setRGB(0, 0, 0);
      if (c.map) c.color.setRGB(0.55, 0.55, 0.55);
      return c;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

// Soft radial texture for the ground glow (made once, shared).
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,0)");
  grd.addColorStop(0.62, "rgba(255,255,255,.12)");
  grd.addColorStop(0.82, "rgba(255,255,255,.55)");
  grd.addColorStop(0.9, "rgba(255,255,255,.35)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/**
 * Warm gold ring + glow on the ground around an available villa.
 * update(t, hover, motion) animates the pulse and brightens on hover.
 */
export function createHighlight(radius, color = "#e3b766") {
  const g = new THREE.Group();
  g.name = "highlight";
  const common = { color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 };

  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.35, radius, 72), new THREE.MeshBasicMaterial({ ...common, opacity: 0.8 }));
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.5, radius * 2.5), new THREE.MeshBasicMaterial({ ...common, map: glowTexture(), opacity: 0.5 }));
  glow.rotation.x = -Math.PI / 2;
  g.add(glow);

  const pulse = new THREE.Mesh(new THREE.RingGeometry(radius - 0.15, radius + 0.15, 72), new THREE.MeshBasicMaterial({ ...common, opacity: 0 }));
  pulse.rotation.x = -Math.PI / 2;
  g.add(pulse);

  let level = 0;
  return {
    object: g,
    update(t, hover, motion = true) {
      level += ((hover ? 1 : 0) - level) * 0.12;
      ring.material.opacity = 0.6 + level * 0.4;
      glow.material.opacity = 0.45 + level * 0.45;
      if (motion) {
        const k = (t * 0.45) % 1; // a ring ripples outwards every ~2 s
        pulse.scale.setScalar(1 + k * 0.35);
        pulse.material.opacity = (1 - k) * (0.55 + level * 0.4);
      } else {
        pulse.material.opacity = 0;
      }
    },
  };
}
