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

const PALETTE = {
  plinth: "#bba98b",
  wall: "#d8cbb1",
  wallDark: "#c4b597",
  roof: "#ebe3d1",
  glass: "#2a383c",
  glow: "#ffb46a",
  wood: "#5a4636",
  water: "#45a9c2",
  coping: "#efe8d8",
};

const box = (w, h, d, color, opts = {}) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...opts })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

/** "pool" | "jacuzzi" | null, from `map.pool` or the villa's own text. */
export function poolType(villa) {
  if (villa.map && "pool" in villa.map) return villa.map.pool || null;
  const text = [villa.highlight, ...(villa.amenities || [])].join(" ").toLowerCase();
  if (/jacuzzi|hot tub/.test(text)) return "jacuzzi";
  if (/pool/.test(text)) return "pool";
  return null;
}

/** A flat-roofed modern stone villa with terrace, optional pool/jacuzzi and a pergola. */
export function buildVillaModel(villa) {
  const g = new THREE.Group();
  g.name = `villa:${villa.id}`;
  const beds = villa.bedrooms || 2;
  const W = 9 + beds * 2.4; // main volume width
  const D = 7.5;
  const H = 3.4;
  const pool = poolType(villa);

  // Stone plinth: goes well below ground so it never floats on a slope.
  const plinthD = D + 9;
  const plinth = box(W + 6, 3, plinthD, PALETTE.plinth, { roughness: 1 });
  plinth.position.set(0, -1.3, 1.5);
  g.add(plinth);

  // Main volume + overhanging roof slab
  const main = box(W, H, D, PALETTE.wall);
  main.position.set(0, 0.2 + H / 2, -2);
  g.add(main);
  const roof = box(W + 1.2, 0.35, D + 1.4, PALETTE.roof);
  roof.position.set(0, 0.2 + H + 0.17, -1.8);
  g.add(roof);

  // Glazing on the terrace side, softly lit from inside (late-afternoon glow)
  const glass = box(W * 0.68, H * 0.72, 0.12, PALETTE.glass, {
    roughness: 0.15,
    metalness: 0.3,
    emissive: new THREE.Color(PALETTE.glow),
    emissiveIntensity: 0.22,
  });
  glass.position.set(-W * 0.08, 0.2 + H * 0.42, -2 + D / 2 + 0.02);
  glass.castShadow = false;
  g.add(glass);

  // Bigger villas get a second, offset wing
  if (beds >= 3) {
    const wing = box(W * 0.45, H * 0.9, D * 0.9, PALETTE.wallDark);
    wing.position.set(W * 0.45, 0.2 + (H * 0.9) / 2, -4.2);
    g.add(wing);
    const wingRoof = box(W * 0.45 + 0.9, 0.3, D * 0.9 + 1, PALETTE.roof);
    wingRoof.position.set(W * 0.45, 0.2 + H * 0.9 + 0.15, -4.2);
    g.add(wingRoof);
  }

  // Pool or jacuzzi: a blue plane set into the terrace with a pale coping
  const frontZ = -2 + D / 2;
  if (pool) {
    const pw = pool === "pool" ? W * 0.55 : 2.6;
    const pd = pool === "pool" ? 3.6 : 2.6;
    const px = pool === "pool" ? -W * 0.12 : -W * 0.25;
    const pz = frontZ + 1.6 + pd / 2;
    const coping = box(pw + 0.8, 0.12, pd + 0.8, PALETTE.coping);
    coping.position.set(px, 0.26, pz);
    g.add(coping);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, pd),
      new THREE.MeshStandardMaterial({
        color: PALETTE.water,
        roughness: 0.08,
        metalness: 0.1,
        emissive: new THREE.Color(PALETTE.water),
        emissiveIntensity: 0.18,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(px, 0.33, pz);
    water.receiveShadow = true;
    water.name = "water";
    g.add(water);
  }

  // Pergola on the terrace
  const pgX = pool === "pool" ? W * 0.36 : W * 0.12;
  const pgW = 4.6, pgD = 3.8, pgH = 2.7;
  const pz0 = frontZ + 1 + pgD / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = box(0.18, pgH, 0.18, PALETTE.wood);
      post.position.set(pgX + (sx * pgW) / 2, 0.2 + pgH / 2, pz0 + (sz * pgD) / 2);
      g.add(post);
    }
  }
  for (const sz of [-1, 1]) {
    const beam = box(pgW + 0.4, 0.2, 0.16, PALETTE.wood);
    beam.position.set(pgX, 0.2 + pgH, pz0 + (sz * pgD) / 2);
    g.add(beam);
  }
  for (let i = 0; i < 7; i++) {
    const slat = box(0.1, 0.12, pgD + 0.5, PALETTE.wood);
    slat.position.set(pgX - pgW / 2 + (i * pgW) / 6, 0.2 + pgH + 0.16, pz0);
    g.add(slat);
  }

  g.userData.footprint = Math.max(W + 6, plinthD); // used to size the highlight ring
  g.userData.height = H + 0.6;
  return g;
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
