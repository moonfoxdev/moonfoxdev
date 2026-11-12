// ─────────────────────────────────────────────────────────────
//  Virtual-tour UI: the full-screen Matterport overlay, and the villa
//  panel that slides in after a villa is picked on the 3D map
//  (right-hand panel on desktop, bottom sheet on phones).
// ─────────────────────────────────────────────────────────────

export const tourSrc = (v) => `https://my.matterport.com/show/?m=${encodeURIComponent(v.tour)}&play=1&qs=1`;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const TOUR_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5 12 12l8-4.5M12 12v9"/></svg>`;
export { TOUR_ICON };

let current = null; // the open overlay, if any

/**
 * Open the Matterport tour full screen.
 * @param {object} villa
 * @param {{onOpen?:Function,onClose?:Function}} [hooks]
 */
export function openTour(villa, hooks = {}) {
  if (!villa?.tour) return;
  closeTour();

  const returnFocus = document.activeElement;
  const el = document.createElement("div");
  el.className = "tour-overlay";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", `${villa.subtitle || villa.name} virtual tour`);
  el.innerHTML = `
    <div class="tour-overlay__bar">
      <p class="tour-overlay__title"><span>${esc(villa.subtitle)}</span> ${esc(villa.name)}</p>
      <button class="tour-overlay__close" type="button" aria-label="Close virtual tour">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>
    <div class="tour-overlay__frame">
      <div class="tour-overlay__loading" aria-hidden="true"><span>JÉEN</span><i></i></div>
    </div>`;

  const frame = document.createElement("iframe");
  frame.src = tourSrc(villa);
  frame.title = `${villa.name} — 3D tour`;
  frame.allow = "fullscreen; xr-spatial-tracking";
  frame.addEventListener("load", () => el.classList.add("is-loaded"), { once: true });
  el.querySelector(".tour-overlay__frame").appendChild(frame);

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeTour();
    }
  };
  const onHash = () => closeTour();

  el.querySelector(".tour-overlay__close").addEventListener("click", () => closeTour());
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("hashchange", onHash);
  document.body.appendChild(el);
  document.body.classList.add("no-scroll");
  requestAnimationFrame(() => el.classList.add("is-open"));
  el.querySelector(".tour-overlay__close").focus({ preventScroll: true });

  current = {
    el,
    close() {
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("hashchange", onHash);
      document.body.classList.remove("no-scroll");
      el.remove(); // removing the iframe stops the tour (and its audio) at once
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
      hooks.onClose?.();
    },
  };
  hooks.onOpen?.();
}

export function closeTour() {
  if (!current) return;
  const c = current;
  current = null;
  c.close();
}

export const isTourOpen = () => !!current;

/**
 * The villa panel shown over the 3D map.
 * @param {HTMLElement} host   element the panel is placed in (the hero)
 * @param {object} ui          helpers from app.js: facts(v), priceLine(v), coverImg(v)
 * @param {{onTour:Function,onClose:Function}} hooks
 */
export function createVillaPanel(host, ui, hooks) {
  const el = document.createElement("aside");
  el.className = "villa-panel";
  el.setAttribute("aria-live", "polite");
  el.hidden = true;
  host.appendChild(el);
  let villa = null;
  let hideTimer = 0;

  const onKey = (e) => {
    if (e.key === "Escape" && villa && !isTourOpen()) close();
  };
  document.addEventListener("keydown", onKey);

  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || !villa) return;
    if (btn.dataset.act === "close") close();
    if (btn.dataset.act === "tour") hooks.onTour?.(villa);
  });

  // prepare() fills the panel and lays it out off-screen (so inset() can be
  // measured while the camera flies), show() slides it in.
  function prepare(v) {
    clearTimeout(hideTimer);
    villa = v;
    el.innerHTML = `
      <button class="villa-panel__close" type="button" data-act="close" aria-label="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
      <span class="villa-panel__grip" aria-hidden="true"></span>
      <div class="villa-panel__img">${ui.coverImg(v)}</div>
      <div class="villa-panel__body">
        <p class="eyebrow">${esc(v.subtitle)}${v.tour ? ` <span class="chip">3D tour</span>` : ""}</p>
        <h2>${esc(v.name)}</h2>
        ${ui.facts(v)}
        ${ui.priceLine(v)}
        <div class="villa-panel__cta">
          ${v.tour ? `<button class="btn" type="button" data-act="tour">${TOUR_ICON} Enter virtual tour</button>` : ""}
          <a class="btn btn--outline" href="#/villa/${esc(v.id)}">View details</a>
        </div>
      </div>`;
    el.classList.remove("is-open");
    el.hidden = false;
  }

  function show() {
    if (!villa) return;
    host.classList.add("has-panel");
    void el.offsetWidth; // commit the off-screen position so the slide-in animates
    el.classList.add("is-open");
  }

  function open(v) {
    prepare(v);
    show();
  }

  function close() {
    if (!villa) return;
    villa = null;
    el.classList.remove("is-open");
    host.classList.remove("has-panel");
    hideTimer = setTimeout(() => (el.hidden = true), 400);
    hooks.onClose?.();
  }

  return {
    el,
    prepare,
    show,
    open,
    close,
    get villa() {
      return villa;
    },
    /** Size the panel covers, so the camera can frame the villa beside it. */
    inset() {
      if (!villa) return { x: 0, y: 0 };
      // offsetLeft/Top ignore the slide-in transform, so this is the final size.
      const side = window.matchMedia("(min-width: 820px)").matches;
      return side
        ? { x: Math.max(0, host.clientWidth - el.offsetLeft), y: 0 }
        : { x: 0, y: Math.max(0, host.clientHeight - el.offsetTop) };
    },
    destroy() {
      clearTimeout(hideTimer);
      document.removeEventListener("keydown", onKey);
      el.remove();
    },
  };
}
