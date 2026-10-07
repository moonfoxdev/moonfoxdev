(function () {
  "use strict";

  const { brand, contact, villas } = window.JEEN;
  const app = document.getElementById("app");
  const HERO = "assets/brand/hero.webp";

  // ── helpers ────────────────────────────────────────────────
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const photoUrl = (villa, file) => `assets/villas/${villa.id}/${file}`;
  const cover = (villa) => (villa.photos.length ? photoUrl(villa, villa.photos[0]) : null);
  const placeholder = (v) =>
    `<div class="ph"><svg viewBox="0 0 120 40" aria-hidden="true"><path d="M0 40 L38 6 L52 18 L64 10 L120 40Z"/></svg><span>${esc(v.name)}</span></div>`;
  const coverImg = (v) => (v.photos.length ? `<img src="${esc(cover(v))}" alt="${esc(v.name)}" loading="lazy" />` : placeholder(v));
  const findVilla = (id) => villas.find((v) => v.id === id);
  const money = (n, cur) => `${cur} ${Number(n).toLocaleString("en-US")}`;
  const igUrl = `https://instagram.com/${contact.instagram}`;

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("is-on"), 2800);
  }

  function facts(v) {
    const plural = (n, word) => `<strong>${esc(n)}</strong> ${word}${n === 1 ? "" : "s"}`;
    const items = [
      v.guests && plural(v.guests, "guest"),
      v.bedrooms && plural(v.bedrooms, "bedroom"),
      v.bathrooms && plural(v.bathrooms, "bath"),
      v.highlight && esc(v.highlight),
    ].filter(Boolean);
    return `<ul class="facts">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  }

  function priceLine(v) {
    return v.pricePerNight
      ? `<p class="price">From <strong>${money(v.pricePerNight, v.currency)}</strong> / night</p>`
      : `<p class="price">Price on request</p>`;
  }

  function villaCard(v) {
    return `<a class="card" href="#/villa/${v.id}">
      <div class="card__img">${coverImg(v)}</div>
      <div class="card__body">
        <p class="eyebrow">${esc(v.subtitle)}</p>
        <h3>${esc(v.name)}</h3>
        ${facts(v)}
        ${priceLine(v)}
      </div>
    </a>`;
  }

  // ── views ──────────────────────────────────────────────────
  const views = {
    home() {
      return `
      <section class="hero">
        <img class="hero__logo" src="${HERO}" alt="JÉEN" />
        <div class="hero__content">
          <h1 class="visually-hidden">JÉEN Villas</h1>
          <p class="hero__tag">${esc(brand.tagline)}</p>
          <div class="hero__cta">
            <a href="#/villas" class="btn btn--light">Explore villas</a>
            <a href="#/book" class="btn btn--ghost">Request a stay</a>
          </div>
        </div>
      </section>

      <section class="section intro">
        <p class="eyebrow">Welcome</p>
        <p class="lead">${esc(brand.intro)}</p>
        ${brand.location ? `<p class="muted">${esc(brand.location)}</p>` : ""}
      </section>

      <section class="section">
        <div class="section__head">
          <h2>The villas</h2>
          <a href="#/villas" class="link">View all</a>
        </div>
        <div class="grid">${villas.map(villaCard).join("")}</div>
      </section>

      <section class="section band">
        <h2>Plan your stay</h2>
        <p>Choose your villa and dates — we'll confirm availability directly with you.</p>
        <a href="#/book" class="btn btn--light">Request booking</a>
      </section>

      <section class="section insta">
        <p class="eyebrow">Follow along</p>
        <a class="insta__handle" href="${igUrl}" target="_blank" rel="noopener">@${esc(contact.instagram)}</a>
      </section>`;
    },

    villas() {
      return `
      <section class="section page-head">
        <p class="eyebrow">Stay with us</p>
        <h1>Our villas</h1>
      </section>
      <section class="section"><div class="grid">${villas.map(villaCard).join("")}</div></section>`;
    },

    villa(id) {
      const v = findVilla(id);
      if (!v) return views.notFound();
      const photos = v.photos.length ? v.photos.map((f) => photoUrl(v, f)) : [];
      const gallery = photos.length
        ? `<div class="gallery">${photos
            .map((src, i) => `<button class="gallery__item" data-index="${i}" aria-label="Open photo ${i + 1}"><img src="${esc(src)}" alt="${esc(v.name)} photo ${i + 1}" loading="lazy" /></button>`)
            .join("")}</div>`
        : `<div class="gallery-empty">
             <p>Photos of ${esc(v.name)} coming soon.</p>
             <a href="${igUrl}" target="_blank" rel="noopener" class="link">See more on Instagram →</a>
           </div>`;

      return `
      <section class="villa-hero">
        ${coverImg(v)}
      </section>

      <section class="section villa-intro">
        <a href="#/villas" class="back-link">‹ All villas</a>
        <p class="eyebrow">${esc(v.subtitle)}</p>
        <h1>${esc(v.name)}</h1>
        ${facts(v)}
        <p class="lead">${esc(v.description)}</p>
      </section>

      <section class="section">
        <h2>Gallery</h2>
        ${gallery}
      </section>

      <section class="section">
        <h2>Amenities</h2>
        <ul class="amenities">${v.amenities.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      </section>

      <div class="sticky-book">
        ${priceLine(v)}
        <a href="#/book?villa=${v.id}" class="btn">Request to book</a>
      </div>`;
    },

    book(params) {
      const selected = params.get("villa") || villas[0].id;
      const today = new Date().toISOString().slice(0, 10);
      return `
      <section class="section page-head">
        <p class="eyebrow">Reservations</p>
        <h1>Request a stay</h1>
        <p class="muted">Send us your dates and we'll reply to confirm availability and price.</p>
      </section>

      <form class="section form" id="book-form" novalidate>
        <fieldset class="villa-pick">
          <legend>Villa</legend>
          ${villas
            .map(
              (v) => `<label class="pick">
                <input type="radio" name="villa" value="${v.id}" ${v.id === selected ? "checked" : ""} />
                <span><strong>${esc(v.subtitle)}</strong><small>${esc(v.name)}</small></span>
              </label>`
            )
            .join("")}
        </fieldset>

        <div class="row">
          <label>Check-in<input type="date" name="checkin" min="${today}" required /></label>
          <label>Check-out<input type="date" name="checkout" min="${today}" required /></label>
        </div>

        <div class="row">
          <label>Guests<input type="number" name="guests" min="1" max="30" value="2" required /></label>
          <label>Phone<input type="tel" name="phone" autocomplete="tel" placeholder="+971…" /></label>
        </div>

        <label>Full name<input type="text" name="name" autocomplete="name" required /></label>
        <label>Notes<textarea name="notes" rows="3" placeholder="Occasion, arrival time, special requests…"></textarea></label>

        <p class="summary" id="summary"></p>

        <div class="send">
          ${contact.whatsapp ? `<button type="submit" class="btn" data-via="whatsapp">Send via WhatsApp</button>` : ""}
          ${contact.email ? `<button type="submit" class="btn ${contact.whatsapp ? "btn--outline" : ""}" data-via="email">Send by email</button>` : ""}
          <button type="submit" class="btn ${contact.whatsapp || contact.email ? "btn--outline" : ""}" data-via="instagram">Send via Instagram DM</button>
        </div>
      </form>`;
    },

    contact() {
      const rows = [
        `<a class="contact-row" href="${igUrl}" target="_blank" rel="noopener"><span>Instagram</span><strong>@${esc(contact.instagram)}</strong></a>`,
        contact.whatsapp && `<a class="contact-row" href="https://wa.me/${esc(contact.whatsapp)}" target="_blank" rel="noopener"><span>WhatsApp</span><strong>Chat with us</strong></a>`,
        contact.phone && `<a class="contact-row" href="tel:${esc(contact.phone.replace(/\s/g, ""))}"><span>Phone</span><strong>${esc(contact.phone)}</strong></a>`,
        contact.email && `<a class="contact-row" href="mailto:${esc(contact.email)}"><span>Email</span><strong>${esc(contact.email)}</strong></a>`,
      ].filter(Boolean);
      return `
      <section class="section page-head">
        <p class="eyebrow">Get in touch</p>
        <h1>Contact</h1>
        ${brand.location ? `<p class="muted">${esc(brand.location)}</p>` : ""}
      </section>
      <section class="section contact">${rows.join("")}</section>
      <section class="section install" id="install-box" hidden>
        <p>Add JÉEN to your home screen for quick access.</p>
        <button class="btn btn--outline" id="install-btn">Install app</button>
      </section>`;
    },

    notFound() {
      return `<section class="section page-head"><h1>Not found</h1><p><a class="link" href="#/">Back home</a></p></section>`;
    },
  };

  // ── booking logic ──────────────────────────────────────────
  function nightsBetween(a, b) {
    if (!a || !b) return 0;
    const n = Math.round((new Date(b) - new Date(a)) / 86400000);
    return n > 0 ? n : 0;
  }

  function bindBooking() {
    const form = document.getElementById("book-form");
    if (!form) return;
    const summary = document.getElementById("summary");

    const update = () => {
      const d = Object.fromEntries(new FormData(form));
      const v = findVilla(d.villa);
      form.checkout.min = d.checkin || form.checkin.min;
      const n = nightsBetween(d.checkin, d.checkout);
      if (!n) return (summary.textContent = "");
      summary.textContent =
        `${n} night${n > 1 ? "s" : ""} at ${v.name}` +
        (v.pricePerNight ? ` · est. ${money(v.pricePerNight * n, v.currency)}` : "");
    };
    form.addEventListener("input", update);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const via = e.submitter?.dataset.via || "instagram";
      const d = Object.fromEntries(new FormData(form));
      const n = nightsBetween(d.checkin, d.checkout);
      if (!d.name?.trim() || !d.checkin || !d.checkout) return toast("Please add your name and dates.");
      if (!n) return toast("Check-out must be after check-in.");

      const v = findVilla(d.villa);
      const msg = [
        `Hello JÉEN, I'd like to request a stay.`,
        ``,
        `Villa: ${v.subtitle} – ${v.name}`,
        `Dates: ${d.checkin} → ${d.checkout} (${n} night${n > 1 ? "s" : ""})`,
        `Guests: ${d.guests}`,
        `Name: ${d.name.trim()}`,
        d.phone ? `Phone: ${d.phone}` : null,
        d.notes?.trim() ? `Notes: ${d.notes.trim()}` : null,
      ]
        .filter((l) => l !== null)
        .join("\n");

      if (via === "whatsapp") {
        window.open(`https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank");
      } else if (via === "email") {
        location.href = `mailto:${contact.email}?subject=${encodeURIComponent(`Booking request – ${v.subtitle}`)}&body=${encodeURIComponent(msg)}`;
      } else {
        const open = () => window.open(`https://ig.me/m/${contact.instagram}`, "_blank");
        if (navigator.clipboard) {
          navigator.clipboard.writeText(msg).then(
            () => { toast("Request copied — paste it in the Instagram chat."); setTimeout(open, 700); },
            open
          );
        } else open();
      }
    });
  }

  // ── lightbox ───────────────────────────────────────────────
  const lb = document.getElementById("lightbox");
  const lbImg = lb.querySelector("img");
  let lbList = [], lbIdx = 0;
  const lbShow = (i) => { lbIdx = (i + lbList.length) % lbList.length; lbImg.src = lbList[lbIdx]; };
  const lbClose = () => { lb.hidden = true; document.body.classList.remove("no-scroll"); };
  lb.querySelector(".lightbox__close").onclick = lbClose;
  lb.querySelector(".lightbox__nav--prev").onclick = () => lbShow(lbIdx - 1);
  lb.querySelector(".lightbox__nav--next").onclick = () => lbShow(lbIdx + 1);
  lb.addEventListener("click", (e) => e.target === lb && lbClose());
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") lbClose();
    if (e.key === "ArrowLeft") lbShow(lbIdx - 1);
    if (e.key === "ArrowRight") lbShow(lbIdx + 1);
  });
  let touchX = null;
  lb.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) lbShow(lbIdx + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  function bindGallery() {
    const items = [...app.querySelectorAll(".gallery__item")];
    if (!items.length) return;
    lbList = items.map((b) => b.querySelector("img").src);
    items.forEach((b) =>
      b.addEventListener("click", () => {
        lbShow(Number(b.dataset.index));
        lb.hidden = false;
        document.body.classList.add("no-scroll");
      })
    );
  }

  // Missing photo files fall back to the brand image.
  app.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && !img.dataset.fallback) {
      img.dataset.fallback = "1";
      img.replaceWith(Object.assign(document.createElement("div"), { className: "ph" }));
    }
  }, true);

  // ── install prompt ─────────────────────────────────────────
  let deferredInstall = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e;
    bindInstall();
  });
  function bindInstall() {
    const box = document.getElementById("install-box");
    if (!box || !deferredInstall) return;
    box.hidden = false;
    document.getElementById("install-btn").onclick = async () => {
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      box.hidden = true;
    };
  }

  // ── router ─────────────────────────────────────────────────
  function render() {
    const raw = location.hash.replace(/^#/, "") || "/";
    const [path, query = ""] = raw.split("?");
    const params = new URLSearchParams(query);
    const parts = path.split("/").filter(Boolean);
    const route = parts[0] || "home";

    let html, tab = route;
    if (route === "home") html = views.home();
    else if (route === "villas") html = views.villas();
    else if (route === "villa") { html = views.villa(parts[1]); tab = "villas"; }
    else if (route === "book") html = views.book(params);
    else if (route === "contact") html = views.contact();
    else html = views.notFound();

    app.innerHTML = html;
    document.body.dataset.route = route;
    document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("is-active", a.dataset.tab === tab));
    window.scrollTo(0, 0);
    bindBooking();
    bindGallery();
    bindInstall();
    onScroll();
  }

  const topbar = document.getElementById("topbar");
  function onScroll() {
    topbar.classList.toggle("is-solid", window.scrollY > 40 || document.body.dataset.route !== "home");
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("scroll", onScroll, { passive: true });
  render();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
