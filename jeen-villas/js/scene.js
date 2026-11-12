// ─────────────────────────────────────────────────────────────
//  The home-page 3D landscape: scene, camera, controls, villas on the
//  map, picking, and the render loop.
//
//  app.js calls mountScene(heroElement, options) when the home route is
//  shown, and the returned controller's unmount() when it leaves, which
//  disposes everything (renderer, GPU buffers, listeners, observers).
// ─────────────────────────────────────────────────────────────
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { createTerrain, createScatter } from "./terrain.js";
import { Sky } from "three/addons/objects/Sky.js";
import { loadVillaModel, applyUnavailableLook, createHighlight, animateWater } from "./villa-models.js";
import { openTour, closeTour, createVillaPanel } from "./tour-overlay.js";

// Late-afternoon light: sun ~11° above the horizon, low in the west.
const SUN = { elevation: 15, azimuth: -118 }; // degrees; azimuth 0 = towards the viewer (+z)
const HAZE = "#c6b9a4"; // aerial-perspective haze over distant ridges
const GOLD = "#e3b766";
const FLY_MS = 1200;
const INTRO_MS = 5200;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Physically based sky (Preetham model) with a warm, slightly dusty atmosphere.
function makeSky(sunDir) {
  const sky = new Sky();
  sky.name = "sky";
  sky.scale.setScalar(2000);
  sky.frustumCulled = false;
  const u = sky.material.uniforms;
  u.turbidity.value = 7;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.86;
  u.sunPosition.value.copy(sunDir);
  return sky;
}

function disposeObject(root) {
  const textures = new Set();
  root.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && v.isTexture) textures.add(v);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value?.isTexture) textures.add(u.value);
      m.dispose();
    }
  });
  textures.forEach((t) => t.dispose());
}

/**
 * @param {HTMLElement} host  the hero section (gets the canvas, labels and panel)
 * @param {object} o
 * @param {object[]} o.villas          window.JEEN.villas
 * @param {object} [o.settings]        window.JEEN.terrain
 * @param {object} o.ui                helpers from app.js: toast, facts, priceLine, coverImg, money
 * @param {(p:number)=>void} [o.onProgress]
 * @param {()=>boolean} [o.isCancelled]
 * @returns {Promise<{unmount:Function}|null>}
 */
export async function mountScene(host, o) {
  const { villas, settings = {}, ui, onProgress = () => {}, isCancelled = () => false } = o;
  const stage = host.querySelector(".hero3d__stage") || host;

  // ── quality tier ─────────────────────────────────────────
  const mq = (q) => window.matchMedia(q).matches;
  const small = mq("(max-width: 819px)");
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const low = settings.quality === "low" || (settings.quality !== "high" && (small || weak));
  const motion = !mq("(prefers-reduced-motion: reduce)");
  const shadows = !low;

  // ── renderer ─────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: !low || window.devicePixelRatio < 2, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "hero3d__canvas";
  renderer.domElement.setAttribute("aria-label", "3D map of the JÉEN villas. Drag to look around, select a villa for details.");
  renderer.domElement.setAttribute("role", "img");

  const labels = new CSS2DRenderer();
  labels.domElement.className = "hero3d__labels";

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(HAZE, 0.00105);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2500);

  let disposed = false;
  const cleanups = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  const bail = () => {
    disposeObject(scene);
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  };

  onProgress(0.08);

  // ── villas: where they go ────────────────────────────────
  const placed = villas.filter((v) => v.map && Number.isFinite(v.map.x) && Number.isFinite(v.map.z));
  const models = await Promise.all(placed.map((v) => loadVillaModel(v)));
  if (isCancelled()) return bail();
  onProgress(0.3);

  const ringR = (m) => Math.max(9, m.userData.footprint * 0.62);
  const pads = placed.map((v, i) => ({ x: v.map.x, z: v.map.z, r: ringR(models[i]) * 1.3 }));

  // ── terrain ──────────────────────────────────────────────
  const terrain = await createTerrain({
    size: settings.size || 900,
    segments: low ? 180 : 360,
    detail: low ? 0.6 : 1,
    heightmap: settings.heightmap || null,
    heightScale: settings.heightScale || 90,
    seed: settings.seed ?? 7,
    pads,
    shadows,
  });
  if (isCancelled()) return bail();
  scene.add(terrain.mesh);
  scene.add(createScatter(terrain.heightAt, { size: terrain.size, seed: settings.seed ?? 7, pads, count: low ? 300 : 800, shadows }));
  onProgress(0.65);

  // ── light & sky ──────────────────────────────────────────
  const centroid = new THREE.Vector3();
  placed.forEach((v) => centroid.add(new THREE.Vector3(v.map.x, 0, v.map.z)));
  if (placed.length) centroid.divideScalar(placed.length);
  centroid.y = terrain.heightAt(centroid.x, centroid.z);
  const spread = placed.reduce((r, v, i) => Math.max(r, Math.hypot(v.map.x - centroid.x, v.map.z - centroid.z) + ringR(models[i])), 30);

  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - SUN.elevation),
    THREE.MathUtils.degToRad(SUN.azimuth)
  );
  const sun = new THREE.DirectionalLight("#ffd3a0", 4.2);
  sun.position.copy(centroid).addScaledVector(sunDir, 260);
  sun.target.position.copy(centroid);
  sun.castShadow = shadows;
  if (shadows) {
    const s = spread + 25;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 50, far: 520 });
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.4;
    sun.shadow.radius = 3;
  }
  scene.add(sun, sun.target);
  const sky = makeSky(sunDir);
  scene.add(sky);
  // Image-based light from the same sky: soft blue fill in the shadows and
  // proper reflections in the glazing and the pool.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(makeSky(sunDir));
  const envRT = pmrem.fromScene(envScene, 0, 1, 5000);
  envScene.traverse((o) => o.geometry?.dispose());
  pmrem.dispose();
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.5;
  scene.add(new THREE.HemisphereLight("#d2d6d6", "#9a8466", 0.45));

  // ── villa objects, highlights, labels ────────────────────
  const entries = placed.map((villa, i) => {
    const model = models[i];
    const available = villa.available !== false;
    const root = new THREE.Group();
    root.name = `villa-root:${villa.id}`;
    root.position.set(villa.map.x, terrain.heightAt(villa.map.x, villa.map.z), villa.map.z);
    root.rotation.y = THREE.MathUtils.degToRad(villa.map.rotation || 0);
    const lift = new THREE.Group();
    lift.add(model);
    root.add(lift);
    if (!available) applyUnavailableLook(model);

    let highlight = null;
    if (available) {
      highlight = createHighlight(ringR(model), GOLD);
      highlight.object.position.y = 0.14;
      root.add(highlight.object);
    }

    // Invisible box used for picking: much easier to hit than thin pergola posts.
    const bb = new THREE.Box3().setFromObject(model);
    const size = bb.getSize(new THREE.Vector3());
    const ctr = bb.getCenter(new THREE.Vector3());
    const hit = new THREE.Mesh(new THREE.BoxGeometry(size.x + 2, Math.max(size.y, 4) + 2, size.z + 2), new THREE.MeshBasicMaterial());
    hit.position.copy(ctr);
    hit.visible = false;
    root.add(hit);

    const el = document.createElement("div");
    el.className = `vlabel${available ? "" : " is-off"}`;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    if (available) {
      const price = villa.pricePerNight ? `From ${ui.money(villa.pricePerNight, villa.currency)}` : "Price on request";
      el.setAttribute("aria-label", `${villa.subtitle}, ${villa.name}. ${price}. Show details`);
      el.innerHTML = `
        <span class="vlabel__top"><span>${esc(villa.subtitle)}</span>${villa.tour ? `<span class="chip">3D tour</span>` : ""}</span>
        <strong class="vlabel__name">${esc(villa.name)}</strong>
        <span class="vlabel__price">${esc(price)}</span>`;
    } else {
      el.setAttribute("aria-label", `${villa.subtitle || villa.name}, unavailable`);
      el.setAttribute("aria-disabled", "true");
      el.innerHTML = `<span class="vlabel__name">${esc(villa.subtitle || villa.name)} · Unavailable</span>`;
    }
    const label = new CSS2DObject(el);
    label.position.set(0, (model.userData.height || 4) + 3.5, 0);
    label.center.set(0.5, 1);
    root.add(label);

    scene.add(root);
    const entry = { villa, available, root, lift, model, highlight, hit, label, el, radius: Math.max(size.x, size.z) / 2 };
    hit.userData.entry = entry;
    return entry;
  });

  // ── camera & controls ────────────────────────────────────
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = 1.36; // ~78°: never level with or under the ground
  controls.minDistance = 18;
  controls.autoRotateSpeed = 0.35;
  // Aim a little behind and above the villas, so they sit in the lower half
  // of the frame with the ridges and sky above them.
  controls.target.copy(centroid).add(new THREE.Vector3(0, 4, -10));

  const view = { w: 1, h: 1, off: { x: 0, y: 0 }, want: { x: 0, y: 0 } };
  const fovFor = (aspect) => (aspect < 0.8 ? 56 : aspect < 1.2 ? 50 : 44);
  // Distance at which a sphere of radius r fits in the visible part of the view.
  function fitDistance(r, inset = { x: 0, y: 0 }) {
    const vh = Math.max(1, view.h - inset.y), vw = Math.max(1, view.w - inset.x);
    const vfov = THREE.MathUtils.degToRad(camera.fov) * (vh / view.h);
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (vw / view.h));
    return r / Math.sin(Math.min(vfov, hfov) / 2);
  }

  const rest = { radius: 120, phi: 1.34, theta: 0.18 };
  function layout() {
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;
    view.w = w;
    view.h = h;
    renderer.setSize(w, h, false);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = fovFor(camera.aspect);
    camera.updateProjectionMatrix();
    applyViewOffset();
    // labels stick out past the villas, so leave more room on narrow screens
    rest.radius = THREE.MathUtils.clamp(fitDistance(spread * (camera.aspect < 1 ? 1.3 : 1)), 60, 260);
    controls.maxDistance = Math.min(300, Math.max(rest.radius * 1.7, 160));
  }
  function applyViewOffset() {
    if (Math.abs(view.off.x) < 0.5 && Math.abs(view.off.y) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(view.w, view.h, view.off.x, view.off.y, view.w, view.h);
  }

  const sph = new THREE.Spherical();
  const placeCamera = (target, s) => {
    sph.set(s.radius, s.phi, s.theta);
    camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sph));
    camera.lookAt(target);
  };
  const sphericalOf = (pos, target) => {
    const s = new THREE.Spherical().setFromVector3(pos.clone().sub(target));
    return { radius: s.radius, phi: s.phi, theta: s.theta };
  };

  stage.appendChild(renderer.domElement);
  stage.appendChild(labels.domElement);
  layout();

  // ── tweens (intro fly-in and fly-to-villa) ───────────────
  let tween = null;
  function animateTo(target, s, ms, ease, done) {
    const from = { target: controls.target.clone(), s: sphericalOf(camera.position, controls.target) };
    if (!motion || ms <= 0) {
      controls.target.copy(target);
      placeCamera(target, s);
      controls.update();
      tween = null;
      done?.();
      return;
    }
    controls.enabled = false;
    tween = { from, to: { target: target.clone(), s }, start: performance.now(), ms, ease, done };
  }
  function stepTween(now) {
    if (!tween) return;
    const k = Math.min(1, (now - tween.start) / tween.ms);
    const e = tween.ease(k);
    const { from, to } = tween;
    controls.target.lerpVectors(from.target, to.target, e);
    placeCamera(controls.target, {
      radius: THREE.MathUtils.lerp(from.s.radius, to.s.radius, e),
      phi: THREE.MathUtils.lerp(from.s.phi, to.s.phi, e),
      theta: lerpAngle(from.s.theta, to.s.theta, e),
    });
    if (k >= 1) {
      const done = tween.done;
      tween = null;
      // drop any momentum left from the tap that started the flight,
      // so the camera doesn't drift after it lands
      controls._sphericalDelta?.set(0, 0, 0);
      controls.enabled = true;
      done?.();
    }
  }

  // Intro: start far out and low, then glide in to the resting view.
  let userTookOver = false;
  const restTarget = controls.target.clone();
  if (motion) {
    placeCamera(restTarget, { radius: Math.min(rest.radius * 2.6, 520), phi: 1.3, theta: rest.theta - 1.15 });
    animateTo(restTarget, { ...rest }, INTRO_MS, easeOutCubic, () => {
      if (!userTookOver) controls.autoRotate = true;
    });
    controls.enabled = true; // the visitor may grab the camera mid-intro
  } else {
    placeCamera(restTarget, rest);
  }
  on(controls, "start", () => {
    userTookOver = true;
    controls.autoRotate = false;
    if (tween && tween.ms === INTRO_MS) {
      tween = null; // hand over from wherever the intro had got to
      controls.enabled = true;
    }
  });

  // ── picking (mouse, pen and touch) ───────────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hits = entries.map((e) => e.hit);
  let hovered = null;
  let selected = null;

  function pick(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(hits, false)[0];
    return hit ? hit.object.userData.entry : null;
  }

  function setHover(entry) {
    if (hovered === entry) return;
    hovered?.el.classList.remove("is-hover");
    hovered = entry;
    hovered?.el.classList.add("is-hover");
    renderer.domElement.style.cursor = !entry ? "" : entry.available ? "pointer" : "not-allowed";
  }

  const panel = createVillaPanel(host, ui, {
    onTour: (villa) =>
      openTour(villa, {
        onOpen: () => {
          state.tourOpen = true;
          updateRunning();
        },
        onClose: () => {
          state.tourOpen = false;
          updateRunning();
        },
      }),
    onClose: () => {
      selected?.el.classList.remove("is-selected");
      selected = null;
      view.want = { x: 0, y: 0 };
    },
  });

  function select(entry) {
    if (!entry) return;
    if (!entry.available) {
      ui.toast("This villa is currently unavailable.");
      return;
    }
    userTookOver = true;
    controls.autoRotate = false;
    selected?.el.classList.remove("is-selected");
    selected = entry;
    entry.el.classList.add("is-selected");

    panel.prepare(entry.villa);
    const inset = panel.inset();
    view.want = { x: inset.x / 2, y: inset.y / 2 };
    const target = entry.root.position.clone().add(new THREE.Vector3(0, 2, 0));
    const cur = sphericalOf(camera.position, controls.target);
    const radius = THREE.MathUtils.clamp(fitDistance(entry.radius * 2.5, inset), controls.minDistance + 4, 130);
    animateTo(target, { radius, phi: 1.1, theta: cur.theta }, FLY_MS, easeInOutCubic, () => {
      if (selected === entry) panel.show();
    });
  }

  const press = { id: null, x: 0, y: 0, t: 0 };
  on(renderer.domElement, "pointerdown", (e) => {
    Object.assign(press, { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() });
  });
  on(renderer.domElement, "pointerup", (e) => {
    if (e.pointerId !== press.id) return;
    press.id = null;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (moved > 8 || performance.now() - press.t > 600) return; // that was a drag
    const entry = pick(e.clientX, e.clientY);
    if (entry) select(entry);
    else if (panel.villa) panel.close();
  });
  on(renderer.domElement, "pointermove", (e) => {
    if (e.pointerType !== "mouse" || e.buttons) return;
    setHover(pick(e.clientX, e.clientY));
  });
  on(renderer.domElement, "pointerleave", () => setHover(null));

  for (const entry of entries) {
    on(entry.el, "click", () => select(entry));
    on(entry.el, "keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select(entry);
      }
    });
    on(entry.el, "pointerenter", (e) => e.pointerType === "mouse" && setHover(entry));
    on(entry.el, "pointerleave", (e) => e.pointerType === "mouse" && hovered === entry && setHover(null));
  }

  // Wheel zooms the map, but once fully zoomed out (or the page is already
  // scrolled) it scrolls the page instead, so the hero never traps the visitor.
  on(
    host,
    "wheel",
    (e) => {
      const far = camera.position.distanceTo(controls.target) >= controls.maxDistance - 1;
      if ((e.deltaY > 0 && far) || window.scrollY > 4) e.stopPropagation();
    },
    { capture: true, passive: true }
  );

  // ── render loop, pausing ─────────────────────────────────
  const state = { visible: !document.hidden, inView: true, tourOpen: false, running: false };
  const clock = new THREE.Clock();
  const groundPad = 3;

  // If the device can't keep up (under ~40 fps over the first couple of
  // seconds), render at a lower resolution rather than stutter.
  const perf = { frames: 0, time: 0, steps: 0 };
  function adaptResolution(rawDt) {
    if (perf.steps >= 2) return;
    perf.frames++;
    perf.time += rawDt;
    if (perf.frames < 60) return;
    const fps = perf.frames / perf.time;
    perf.frames = perf.time = 0;
    const pr = renderer.getPixelRatio();
    if (fps < 40 && pr > 1) {
      renderer.setPixelRatio(Math.max(1, pr * 0.7));
      layout();
      perf.steps++;
    } else perf.steps = 2;
  }

  function frame() {
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    if (!tween || tween.ms !== INTRO_MS) adaptResolution(rawDt);
    const t = clock.elapsedTime;
    stepTween(performance.now());
    if (!tween) controls.update(dt);

    const gy = terrain.heightAt(camera.position.x, camera.position.z) + groundPad;
    if (camera.position.y < gy) camera.position.y = gy;

    view.off.x += (view.want.x - view.off.x) * (motion ? 0.1 : 1);
    view.off.y += (view.want.y - view.off.y) * (motion ? 0.1 : 1);
    applyViewOffset();

    for (const e of entries) {
      const lit = e === hovered || e === selected;
      e.highlight?.update(t, lit, motion);
      const want = e.available && e === hovered ? 0.9 : 0;
      e.lift.position.y += (want - e.lift.position.y) * (motion ? 0.15 : 1);
    }
    sky.position.copy(camera.position);
    if (motion) animateWater(t);
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  function updateRunning() {
    const run = !disposed && state.visible && state.inView && !state.tourOpen;
    if (run === state.running) return;
    state.running = run;
    host.classList.toggle("is-paused", !run);
    if (run) {
      clock.getDelta(); // don't jump after a pause
      if (tween) tween.start = performance.now() - (tween.pausedAt ?? 0);
      renderer.setAnimationLoop(frame);
    } else {
      if (tween) tween.pausedAt = performance.now() - tween.start;
      renderer.setAnimationLoop(null);
    }
  }

  on(document, "visibilitychange", () => {
    state.visible = !document.hidden;
    updateRunning();
  });
  const io = new IntersectionObserver(([en]) => {
    state.inView = en.isIntersecting;
    updateRunning();
  });
  io.observe(host);
  const ro = new ResizeObserver(() => {
    layout();
    if (!state.running) frame();
  });
  ro.observe(stage);

  // Compile shaders before revealing, so the first frames don't stutter.
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    /* compileAsync is an optimisation only */
  }
  if (isCancelled()) {
    unmount();
    return null;
  }
  onProgress(1);
  if (tween) tween.start = performance.now(); // the intro starts once it can be seen
  frame();
  host.classList.add("is-ready");
  updateRunning();

  function unmount() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    tween = null;
    io.disconnect();
    ro.disconnect();
    cleanups.forEach((fn) => fn());
    closeTour();
    panel.destroy();
    controls.dispose();
    entries.forEach((e) => e.label.removeFromParent());
    disposeObject(scene);
    scene.clear();
    envRT.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    labels.domElement.remove();
    host.classList.remove("is-ready", "has-panel", "is-paused");
  }

  // Exposed for debugging and automated checks.
  return {
    unmount,
    get state() {
      return { ...state, selected: selected?.villa.id || null, hovered: hovered?.villa.id || null, flying: !!tween };
    },
    /** Screen position (CSS px, relative to the hero) of a villa — handy for tests. */
    screenPosOf(id) {
      const e = entries.find((x) => x.villa.id === id);
      if (!e) return null;
      const p = e.root.position.clone().add(new THREE.Vector3(0, 2, 0)).project(camera);
      return { x: ((p.x + 1) / 2) * view.w, y: ((1 - p.y) / 2) * view.h };
    },
    camera,
    controls,
  };
}
