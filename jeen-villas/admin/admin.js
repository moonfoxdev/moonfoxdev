// JÉEN admin portal. Talks to /api/admin/* on server/server.js.
(function () {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const main = $("#main");
  const dialog = $("#dialog");
  let S = null; // state from the server
  const ui = { filter: "new", q: "", calVilla: null, calMonth: null, villa: null, sel: null };

  // ── helpers ────────────────────────────────────────────────
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayIso = () => iso(new Date());
  const parse = (s) => new Date(s + "T00:00:00");
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const fmt = (s, o = { day: "numeric", month: "short" }) => parse(s).toLocaleDateString("en-GB", o);
  const fmtRange = (a, b) => `${fmt(a)} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
  const money = (n, cur = "OMR") => (n == null ? "—" : `${cur} ${Math.round(n).toLocaleString("en-US")}`);
  const villa = (id) => S.villas.find((v) => v.id === id) || { id, name: id, subtitle: id, currency: "OMR" };
  const vLabel = (id) => { const v = villa(id); return v.subtitle && v.subtitle !== v.name ? `${v.subtitle} · ${v.name}` : v.name; };
  const ago = (t) => {
    const m = Math.round((Date.now() - Date.parse(t)) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    if (m < 1440) return `${Math.round(m / 60)} h ago`;
    return `${Math.round(m / 1440)} d ago`;
  };
  const photoSrc = (v, f) => (f.startsWith("/") ? f : `../assets/villas/${v.id}/${f}`);
  const waLink = (phone, text) => {
    const digits = String(phone || "").replace(/\D/g, "").replace(/^00/, "");
    return digits ? `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
  };

  function toast(msg, err) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("is-err", !!err);
    t.classList.add("is-on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("is-on"), 3000);
  }

  async function api(method, path, body, raw) {
    const opts = { method, headers: { "X-Jeen-Admin": "1" }, credentials: "same-origin" };
    if (raw) { opts.body = raw; opts.headers["Content-Type"] = raw.type; }
    else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
    const res = await fetch(`/api/admin${path}`, opts);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "/login") { showLogin(); throw new Error("Please log in again"); }
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }
  // run a change, refresh state, re-render
  async function act(method, path, body, okMsg) {
    try {
      const st = await api(method, path, body);
      if (st && st.villas) S = st;
      render();
      if (okMsg) toast(okMsg);
      return true;
    } catch (e) {
      toast(e.message, true);
      return false;
    }
  }

  // ── auth ───────────────────────────────────────────────────
  function showLogin() {
    $("#shell").hidden = true;
    $("#login").hidden = false;
    $("#login-form").password.focus();
  }
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#login-error");
    err.textContent = "";
    try {
      await api("POST", "/login", { password: e.target.password.value });
      e.target.reset();
      await boot();
    } catch (x) { err.textContent = x.message; }
  });
  $("#logout").onclick = logout;
  async function logout() { await api("POST", "/logout", {}).catch(() => {}); S = null; showLogin(); }

  async function boot() {
    try { S = await api("GET", "/state"); }
    catch (e) { if (!S) showLogin(); return; }
    $("#login").hidden = true;
    $("#shell").hidden = false;
    render();
  }

  // ── router ─────────────────────────────────────────────────
  const VIEWS = { overview, bookings, calendar, villas, settings };
  function render() {
    if (!S) return;
    const view = location.hash.slice(1) || "overview";
    const fn = VIEWS[view] || overview;
    $$(".side__nav a").forEach((a) => a.classList.toggle("is-active", a.dataset.view === (VIEWS[view] ? view : "overview")));
    const n = S.stats.newRequests;
    $("#badge-new").hidden = !n;
    $("#badge-new").textContent = n;
    document.title = `${n ? `(${n}) ` : ""}JÉEN Admin`;
    const y = window.scrollY, same = render._last === view;
    main.innerHTML = (S.storage.persistent ? "" : storageNotice()) + fn();
    if (same) window.scrollTo(0, y); else window.scrollTo(0, 0);
    render._last = view;
    (BIND[view] || BIND.overview)();
  }
  window.addEventListener("hashchange", render);

  const storageNotice = () => `<div class="notice"><strong>Data isn't saved permanently yet.</strong> Attach a Railway volume to this service so bookings and edits survive redeploys (Railway → service → Settings → Volumes → mount path <code>/data</code>).</div>`;

  // ── overview ───────────────────────────────────────────────
  function overview() {
    const st = S.stats, t = todayIso();
    const conf = S.bookings.filter((b) => b.status === "confirmed");
    const next = conf.filter((b) => b.checkout > t).sort((a, b) => (a.checkin < b.checkin ? -1 : 1)).slice(0, 5);
    const recent = S.bookings.slice(0, 5);
    const max = Math.max(1, ...st.visits.map((d) => d.views));
    const monthName = parse(st.month + "-01").toLocaleDateString("en-GB", { month: "long" });
    const total30 = st.visits.reduce((a, d) => a + d.views, 0);
    const vv = S.villas.filter((v) => v.available !== false).map((v) => ({ v, n: st.villaViews[v.id] || 0 }));
    const vmax = Math.max(1, ...vv.map((x) => x.n));

    return `
    <div class="head">
      <div><h1>Overview</h1><p class="muted">${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p></div>
      <div class="head__actions"><button class="btn btn--outline" data-add-booking>+ Add booking</button></div>
    </div>

    <div class="kpis">
      <a class="kpi ${st.newRequests ? "kpi--hot" : ""}" href="#bookings" data-filter="new"><span>New requests</span><strong>${st.newRequests}</strong><small>waiting for a reply</small></a>
      <a class="kpi" href="#bookings" data-filter="upcoming"><span>Upcoming stays</span><strong>${st.upcoming}</strong><small>${st.staysNow ? `${st.staysNow} checked in now` : "confirmed"}</small></a>
      <a class="kpi" href="#calendar"><span>Occupancy · ${esc(monthName)}</span><strong>${Math.round(st.occupancy * 100)}%</strong><small>of available nights</small></a>
      <div class="kpi"><span>Revenue · ${esc(monthName)}</span><strong>${st.revenueMonth ? Math.round(st.revenueMonth).toLocaleString("en-US") : "0"}</strong><small>OMR, confirmed stays</small></div>
    </div>

    <div class="cols">
      <div class="colstack">
        <section class="card">
          <div class="card__head"><h2>Next arrivals</h2><a href="#calendar" class="small">Calendar →</a></div>
          ${next.length ? `<div class="rows">${next.map(bookingRow).join("")}</div>` : `<p class="empty">No confirmed stays coming up.</p>`}
        </section>
        <section class="card">
          <div class="card__head"><h2>Latest requests</h2><a href="#bookings" class="small" data-filter="all">All bookings →</a></div>
          ${recent.length ? `<div class="rows">${recent.map(bookingRow).join("")}</div>` : `<p class="empty">No booking requests yet. They'll appear here as soon as a guest sends one from the site.</p>`}
        </section>
      </div>
      <div class="colstack">
        <section class="card">
          <div class="card__head"><h2>Site visits</h2><span class="muted small">${total30.toLocaleString("en-US")} in 30 days</span></div>
          <div class="bars" role="img" aria-label="Page views per day for the last 30 days">
            ${st.visits.map((d) => `<i style="height:${(d.views / max) * 100}%" title="${esc(fmt(d.date))}: ${d.views} views"></i>`).join("")}
          </div>
          <div class="bars__axis"><span>${esc(fmt(st.visits[0].date))}</span><span>Today</span></div>
          <p class="small muted" style="margin:.9rem 0 0">${st.requests30} request${st.requests30 === 1 ? "" : "s"} in 30 days${total30 ? ` · ${(st.conversion * 100).toFixed(1)}% of page views` : ""}</p>
        </section>
        <section class="card">
          <div class="card__head"><h2>Most viewed villas</h2><span class="muted small">30 days</span></div>
          <div class="rank">${vv.map((x) => `<div class="rank__row"><div><span>${esc(x.v.name)}</span><strong>${x.n}</strong></div><div class="meter"><i style="width:${(x.n / vmax) * 100}%"></i></div></div>`).join("")}</div>
        </section>
      </div>
    </div>`;
  }

  function bookingRow(b) {
    const d = parse(b.checkin);
    return `<button class="row" data-booking="${b.id}">
      <div class="row__date"><b>${d.getDate()}</b><small>${d.toLocaleDateString("en-GB", { month: "short" })}</small></div>
      <div class="row__main"><strong>${esc(b.name)}</strong><span>${esc(vLabel(b.villa))} · ${b.nights} night${b.nights === 1 ? "" : "s"} · ${b.guests} guest${b.guests === 1 ? "" : "s"}</span></div>
      <div class="row__end">
        <span class="pill pill--${b.status}">${b.status}</span>
        ${b.clash && b.status === "new" ? `<span class="pill pill--clash">Dates taken</span>` : `<span class="small muted">${b.status === "new" ? ago(b.createdAt) : money(b.estTotal, villa(b.villa).currency)}</span>`}
      </div>
    </button>`;
  }

  // ── bookings ───────────────────────────────────────────────
  function bookings() {
    const t = todayIso();
    const groups = {
      new: (b) => b.status === "new",
      upcoming: (b) => b.status === "confirmed" && b.checkout > t,
      past: (b) => b.status === "confirmed" && b.checkout <= t,
      declined: (b) => b.status === "declined" || b.status === "cancelled",
      all: () => true,
    };
    const names = { new: "New", upcoming: "Upcoming", past: "Past stays", declined: "Declined / cancelled", all: "All" };
    const q = ui.q.toLowerCase();
    let list = S.bookings.filter(groups[ui.filter] || groups.all);
    if (q) list = list.filter((b) => [b.name, b.phone, b.email, b.notes, b.adminNotes, vLabel(b.villa)].join(" ").toLowerCase().includes(q));
    if (ui.filter === "upcoming") list.sort((a, b) => (a.checkin < b.checkin ? -1 : 1));
    if (ui.filter === "past") list.sort((a, b) => (a.checkin > b.checkin ? -1 : 1));

    return `
    <div class="head">
      <div><h1>Bookings</h1><p class="muted">Every request from the website, plus stays you add yourself.</p></div>
      <div class="head__actions">
        <a class="btn btn--outline" href="/api/admin/bookings.csv">Export CSV</a>
        <button class="btn" data-add-booking>+ Add booking</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="chips">${Object.keys(groups).map((k) => `<button class="chip ${ui.filter === k ? "is-on" : ""}" data-chip="${k}">${names[k]}<b>${S.bookings.filter(groups[k]).length}</b></button>`).join("")}</div>
      <input type="search" id="q" placeholder="Search name, phone, notes…" value="${esc(ui.q)}" />
    </div>
    <section class="card">
      ${list.length ? `<div class="rows">${list.map(bookingRow).join("")}</div>` : `<p class="empty">Nothing here${q ? " for that search" : ""}.</p>`}
    </section>`;
  }

  function openBooking(id) {
    const b = S.bookings.find((x) => x.id === id);
    if (!b) return;
    const v = villa(b.villa);
    const first = b.name.split(" ")[0];
    const replies = {
      confirm: `Hello ${first}, thank you for choosing JÉEN. Your stay at ${v.name} from ${fmt(b.checkin)} to ${fmt(b.checkout)} is confirmed${b.estTotal ? ` (total ${money(b.estTotal, v.currency)})` : ""}. We look forward to welcoming you.`,
      decline: `Hello ${first}, thank you for your request for ${v.name} from ${fmt(b.checkin)} to ${fmt(b.checkout)}. Unfortunately those dates aren't available. Would other dates work for you?`,
    };
    const wa = waLink(b.phone);
    dialog.innerHTML = `
    <form method="dialog" id="bk">
      <div class="dialog__head">
        <div><h2>${esc(b.name)}</h2><p class="muted small" style="margin:.2rem 0 0">Received ${esc(new Date(b.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))}${b.via ? ` · via ${esc(b.via)}` : ""}</p></div>
        <button class="iconbtn" value="close" formnovalidate aria-label="Close">✕</button>
      </div>
      ${b.clash && b.status === "new" ? `<div class="notice" style="margin:0">These dates overlap a confirmed stay or blocked dates.</div>` : ""}
      <div class="status-btns">${["new", "confirmed", "declined", "cancelled"].map((s) => `<button type="button" class="chip ${b.status === s ? "is-on" : ""}" data-s="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join("")}</div>
      <div class="grid2">
        <label>Villa<select name="villa">${S.villas.map((x) => `<option value="${x.id}" ${x.id === b.villa ? "selected" : ""}>${esc(vLabel(x.id))}</option>`).join("")}</select></label>
        <label>Guests<input type="number" name="guests" min="1" max="50" value="${b.guests}" /></label>
        <label>Check-in<input type="date" name="checkin" value="${b.checkin}" /></label>
        <label>Check-out<input type="date" name="checkout" value="${b.checkout}" /></label>
        <label>Phone<input type="tel" name="phone" value="${esc(b.phone)}" /></label>
        <label>Total (${esc(v.currency || "OMR")})<input type="number" name="total" min="0" step="1" value="${b.total ?? ""}" placeholder="${b.estTotal != null && b.total == null ? `est. ${Math.round(b.estTotal)}` : ""}" /></label>
      </div>
      ${b.notes ? `<div><p class="small muted" style="margin:0 0 .3rem">Guest's notes</p><p class="guest-note">${esc(b.notes)}</p></div>` : ""}
      <label>Private notes<textarea name="adminNotes" rows="2" placeholder="Deposit paid, arrival time…">${esc(b.adminNotes)}</textarea></label>
      ${wa ? `<div class="head__actions">
        <a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${esc(wa)}">WhatsApp ${esc(first)}</a>
        <a class="btn btn--outline btn--sm" target="_blank" rel="noopener" href="${esc(waLink(b.phone, replies.confirm))}">Send confirmation</a>
        <a class="btn btn--outline btn--sm" target="_blank" rel="noopener" href="${esc(waLink(b.phone, replies.decline))}">Send "not available"</a>
      </div>` : `<p class="small muted" style="margin:0">No phone number given. The guest's WhatsApp message will have their number.</p>`}
      <div class="dialog__foot">
        <button type="button" class="btn btn--danger btn--sm spacer" data-del>Delete</button>
        <button class="btn btn--outline" value="close" formnovalidate>Close</button>
        <button type="submit" class="btn" value="save">Save</button>
      </div>
    </form>`;
    const f = $("#bk");
    let status = b.status;
    $$(".status-btns .chip", f).forEach((c) => (c.onclick = () => {
      status = c.dataset.s;
      $$(".status-btns .chip", f).forEach((x) => x.classList.toggle("is-on", x === c));
    }));
    f.addEventListener("submit", async (e) => {
      if (e.submitter?.value !== "save") return;
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const ok = await act("PATCH", `/bookings/${b.id}`, { ...d, status }, "Booking saved");
      if (ok) dialog.close();
    });
    $("[data-del]", f).onclick = async () => {
      if (!confirm(`Delete the booking for ${b.name}? This can't be undone.`)) return;
      if (await act("DELETE", `/bookings/${b.id}`, undefined, "Booking deleted")) dialog.close();
    };
    dialog.showModal();
  }

  function addBooking(preset = {}) {
    const avail = S.villas.filter((v) => v.available !== false);
    dialog.innerHTML = `
    <form method="dialog" id="nb">
      <div class="dialog__head"><h2>Add a booking</h2><button class="iconbtn" value="close" formnovalidate aria-label="Close">✕</button></div>
      <p class="muted small" style="margin:-.4rem 0 0">For stays booked by phone, Instagram or in person.</p>
      <div class="grid2">
        <label class="span2">Guest name<input name="name" required /></label>
        <label>Villa<select name="villa">${(avail.length ? avail : S.villas).map((x) => `<option value="${x.id}" ${x.id === preset.villa ? "selected" : ""}>${esc(vLabel(x.id))}</option>`).join("")}</select></label>
        <label>Guests<input type="number" name="guests" min="1" max="50" value="2" /></label>
        <label>Check-in<input type="date" name="checkin" value="${preset.checkin || ""}" required /></label>
        <label>Check-out<input type="date" name="checkout" value="${preset.checkout || ""}" required /></label>
        <label>Phone<input type="tel" name="phone" placeholder="+968…" /></label>
        <label>Total (OMR)<input type="number" name="total" min="0" placeholder="optional" /></label>
        <label class="span2">Private notes<textarea name="adminNotes" rows="2"></textarea></label>
        <label class="check span2"><input type="checkbox" name="confirmed" checked /> Confirmed (blocks these dates on the site)</label>
      </div>
      <div class="dialog__foot"><button class="btn btn--outline" value="close" formnovalidate>Cancel</button><button type="submit" class="btn" value="save">Add booking</button></div>
    </form>`;
    const f = $("#nb");
    f.addEventListener("submit", async (e) => {
      if (e.submitter?.value !== "save") return;
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      d.status = d.confirmed ? "confirmed" : "new";
      delete d.confirmed;
      if (await act("POST", "/bookings", d, "Booking added")) dialog.close();
    });
    dialog.showModal();
  }

  // ── calendar ───────────────────────────────────────────────
  function calendar() {
    if (!ui.calVilla || !S.villas.some((v) => v.id === ui.calVilla)) ui.calVilla = (S.villas.find((v) => v.available !== false) || S.villas[0]).id;
    if (!ui.calMonth) ui.calMonth = todayIso().slice(0, 7);
    const first = parse(ui.calMonth + "-01");
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7)); // weeks start Monday
    const t = todayIso();
    const evs = [
      ...S.bookings.filter((b) => b.villa === ui.calVilla && (b.status === "confirmed" || b.status === "new"))
        .map((b) => ({ kind: b.status, start: b.checkin, end: b.checkout, label: b.name, id: b.id })),
      ...S.blocks.filter((b) => b.villa === ui.calVilla).map((b) => ({ kind: "block", start: b.start, end: b.end, label: b.note || "Blocked", block: b.id })),
    ];
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const s = iso(d);
      const on = evs.filter((e) => e.start <= s && s < e.end);
      const inSel = ui.sel && (ui.sel.end ? ui.sel.start <= s && s <= ui.sel.end : s === ui.sel.start);
      days.push(`<button class="cal__day ${d.getMonth() !== first.getMonth() ? "is-out" : ""} ${s === t ? "is-today" : ""} ${inSel ? "is-sel" : ""}" data-day="${s}">
        <span class="cal__n">${d.getDate()}</span>
        ${on.map((e) => `<span class="ev ev--${e.kind}" title="${esc(e.label)}">${e.start === s || d.getDate() === 1 || i % 7 === 0 ? esc(e.label) : "&nbsp;"}</span>`).join("")}
      </button>`);
      if (i === 34 && new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getMonth() !== first.getMonth()) break; // 5 rows is enough
    }
    const blocks = S.blocks.filter((b) => b.villa === ui.calVilla && b.end > t).sort((a, b) => (a.start < b.start ? -1 : 1));

    return `
    <div class="head">
      <div><h1>Calendar</h1><p class="muted">Tap a start and an end day to block dates or add a booking.</p></div>
    </div>
    <div class="cal-head">
      <select id="cal-villa" aria-label="Villa">${S.villas.map((v) => `<option value="${v.id}" ${v.id === ui.calVilla ? "selected" : ""}>${esc(vLabel(v.id))}</option>`).join("")}</select>
      <div class="cal-nav">
        <button class="iconbtn" data-mon="-1" aria-label="Previous month">‹</button>
        <h2>${first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2>
        <button class="iconbtn" data-mon="1" aria-label="Next month">›</button>
        <button class="btn btn--outline btn--sm" data-mon="0">Today</button>
      </div>
    </div>
    <div class="cal">
      ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="cal__dow">${d}</div>`).join("")}
      ${days.join("")}
    </div>
    <div class="legend">
      <span><i class="ev--confirmed"></i>Confirmed stay</span>
      <span><i class="ev--new"></i>Request (not confirmed)</span>
      <span><i class="ev--block"></i>Blocked</span>
    </div>
    <section class="card" style="margin-top:1.2rem">
      <div class="card__head"><h2>Blocked dates</h2><button class="btn btn--outline btn--sm" data-block>+ Block dates</button></div>
      ${blocks.length ? `<div class="rows">${blocks.map((b) => `<div class="row" style="cursor:default">
          <div class="row__date"><b>${parse(b.start).getDate()}</b><small>${parse(b.start).toLocaleDateString("en-GB", { month: "short" })}</small></div>
          <div class="row__main"><strong>${esc(b.note || "Blocked")}</strong><span>${fmtRange(b.start, addDays(b.end, -1))} · ${Math.round((parse(b.end) - parse(b.start)) / 864e5)} night(s) closed to guests</span></div>
          <div class="row__end"><button class="btn btn--danger btn--sm" data-unblock="${b.id}">Remove</button></div>
        </div>`).join("")}</div>` : `<p class="empty">No blocked dates. Block dates for maintenance, owner stays or bookings made elsewhere.</p>`}
    </section>`;
  }

  function blockDialog(start = "", endInclusive = "") {
    dialog.innerHTML = `
    <form method="dialog" id="bl">
      <div class="dialog__head"><h2>Dates for ${esc(villa(ui.calVilla).name)}</h2><button class="iconbtn" value="close" formnovalidate aria-label="Close">✕</button></div>
      <div class="grid2">
        <label>From<input type="date" name="start" value="${start}" required /></label>
        <label>Until (check-out day)<input type="date" name="end" value="${endInclusive ? addDays(endInclusive, 1) : ""}" required /></label>
        <label class="span2">Reason (only you see this)<input name="note" placeholder="Maintenance, owner stay, Airbnb booking…" /></label>
      </div>
      <div class="dialog__foot">
        <button type="button" class="btn btn--outline spacer" data-asbooking>Add as booking instead</button>
        <button class="btn btn--outline" value="close" formnovalidate>Cancel</button>
        <button type="submit" class="btn" value="save">Block dates</button>
      </div>
    </form>`;
    const f = $("#bl");
    f.addEventListener("submit", async (e) => {
      if (e.submitter?.value !== "save") return;
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      if (await act("POST", "/blocks", { ...d, villa: ui.calVilla }, "Dates blocked")) { ui.sel = null; dialog.close(); render(); }
    });
    $("[data-asbooking]", f).onclick = () => {
      const d = Object.fromEntries(new FormData(f));
      dialog.close();
      ui.sel = null;
      addBooking({ villa: ui.calVilla, checkin: d.start, checkout: d.end });
    };
    dialog.showModal();
  }

  // ── villas ─────────────────────────────────────────────────
  function villas() {
    if (!ui.villa || !S.villas.some((v) => v.id === ui.villa)) ui.villa = S.villas[0].id;
    const v = villa(ui.villa);
    const photos = v.photos || [];
    return `
    <div class="head">
      <div><h1>Villas</h1><p class="muted">Changes go live on the site as soon as you save.</p></div>
      <div class="head__actions"><a class="btn btn--outline" href="/#/villa/${v.id}" target="_blank" rel="noopener">View on site ↗</a></div>
    </div>
    <div class="vtabs chips">${S.villas.map((x) => `<button class="chip ${x.id === v.id ? "is-on" : ""}" data-villa="${x.id}">${esc(x.subtitle || x.name)}</button>`).join("")}</div>
    <form id="vf" class="stack">
      <section class="card stack">
        <div class="card__head" style="margin:0"><h2>Details</h2>
          <label class="check"><input type="checkbox" name="available" ${v.available !== false ? "checked" : ""} /> Bookable on the site</label>
        </div>
        <div class="grid2">
          <label>Name<input name="name" value="${esc(v.name)}" required /></label>
          <label>Label<input name="subtitle" value="${esc(v.subtitle)}" placeholder="Villa 1" /></label>
          <label class="span2">Description<textarea name="description" rows="4">${esc(v.description)}</textarea></label>
        </div>
        <div class="grid3 keep">
          <label>Guests<input type="number" name="guests" min="0" value="${v.guests ?? ""}" /></label>
          <label>Bedrooms<input type="number" name="bedrooms" min="0" value="${v.bedrooms ?? ""}" /></label>
          <label>Bathrooms<input type="number" name="bathrooms" min="0" value="${v.bathrooms ?? ""}" /></label>
        </div>
        <div class="grid3">
          <label>Price per night<input type="number" name="pricePerNight" min="0" value="${v.pricePerNight ?? ""}" placeholder="Leave empty for 'on request'" /></label>
          <label>Currency<select name="currency">${["OMR", "AED", "USD", "EUR", "SAR"].map((c) => `<option ${c === (v.currency || "OMR") ? "selected" : ""}>${c}</option>`).join("")}</select></label>
          <label>Highlight<input name="highlight" value="${esc(v.highlight)}" placeholder="Private pool" /></label>
        </div>
        <label>Matterport 3D tour ID<input name="tour" value="${esc(v.tour)}" placeholder="e.g. xHiJJNx9nob" /></label>
      </section>

      <section class="card stack">
        <div class="card__head" style="margin:0"><h2>Amenities</h2><span class="muted small">One per line</span></div>
        <textarea name="amenities" rows="8">${esc((v.amenities || []).join("\n"))}</textarea>
      </section>

      <section class="card">
        <div class="card__head"><h2>Photos</h2><span class="muted small">First photo is the cover</span></div>
        <div class="photos">
          ${photos.map((p, i) => `<div class="photo">
            <img src="${esc(photoSrc(v, p))}" alt="" loading="lazy" />
            ${i === 0 ? `<span class="photo__tag">Cover</span>` : ""}
            <div class="photo__bar">
              <span><button type="button" data-ph="left" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move left">‹</button>
              <button type="button" data-ph="right" data-i="${i}" ${i === photos.length - 1 ? "disabled" : ""} aria-label="Move right">›</button></span>
              <span>${i ? `<button type="button" data-ph="cover" data-i="${i}" title="Make cover" aria-label="Make cover">★</button>` : ""}
              <button type="button" data-ph="del" data-i="${i}" title="Remove" aria-label="Remove photo">✕</button></span>
            </div>
          </div>`).join("")}
          <label class="upload"><input type="file" id="upl" accept="image/jpeg,image/png,image/webp" multiple /><span>+ Add photos<br /><small>JPG, PNG or WebP</small></span></label>
        </div>
      </section>

      <div class="savebar"><button type="submit" class="btn">Save ${esc(v.subtitle || v.name)}</button></div>
    </form>`;
  }

  function villaPayload(f) {
    const d = Object.fromEntries(new FormData(f));
    return {
      ...d,
      available: !!d.available,
      amenities: d.amenities.split("\n").map((s) => s.trim()).filter(Boolean),
    };
  }

  // Resize big photos in the browser before upload (keeps the site fast).
  function shrink(file, maxSide = 2000) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        if (k === 1 && file.size < 1.5e6) return resolve(file);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => resolve(b || file), "image/jpeg", 0.85);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  // ── settings ───────────────────────────────────────────────
  function settings() {
    const b = S.brand, c = S.contact;
    return `
    <div class="head"><div><h1>Settings</h1><p class="muted">Contact details and text shown across the site.</p></div></div>
    <form id="sf" class="stack">
      <section class="card stack">
        <h2>Contact</h2>
        <div class="grid2">
          <label>Phone (shown on site)<input name="phone" value="${esc(c.phone)}" placeholder="+968 9699 0776" /></label>
          <label>WhatsApp number (booking requests go here)<input name="whatsapp" value="${esc(c.whatsapp)}" placeholder="96896990776" inputmode="numeric" /></label>
          <label>Email<input type="email" name="email" value="${esc(c.email)}" placeholder="stay@…" /></label>
          <label>Instagram<input name="instagram" value="${esc(c.instagram)}" placeholder="jeen.villas" /></label>
        </div>
      </section>
      <section class="card stack">
        <h2>Brand</h2>
        <label>Location<input name="location" value="${esc(b.location)}" placeholder="e.g. Jebel Akhdar, Oman" /></label>
        <label>Tagline<input name="tagline" value="${esc(b.tagline)}" /></label>
        <label>Intro<textarea name="intro" rows="3">${esc(b.intro)}</textarea></label>
      </section>
      <div class="savebar"><button type="submit" class="btn">Save settings</button></div>
    </form>
    <section class="card stack">
      <h2>Account</h2>
      <p class="muted small" style="margin:0">To change the admin password, update <code>ADMIN_PASSWORD</code> in Railway → service → Variables. Everyone is logged out when it changes only if <code>SESSION_SECRET</code> changes too.</p>
      <div class="head__actions"><a class="btn btn--outline" href="/" target="_blank" rel="noopener">View site ↗</a><button class="btn btn--outline" data-logout>Log out</button></div>
    </section>`;
  }

  // ── event binding per view ─────────────────────────────────
  function bindCommon() {
    $$("[data-booking]").forEach((el) => (el.onclick = () => openBooking(el.dataset.booking)));
    $$("[data-add-booking]").forEach((el) => (el.onclick = () => addBooking()));
    $$("[data-filter]").forEach((el) => el.addEventListener("click", () => (ui.filter = el.dataset.filter)));
  }
  const BIND = {
    overview: bindCommon,
    bookings() {
      bindCommon();
      $$("[data-chip]").forEach((el) => (el.onclick = () => { ui.filter = el.dataset.chip; render(); }));
      const q = $("#q");
      q.oninput = () => {
        ui.q = q.value;
        const pos = q.selectionStart;
        render();
        const nq = $("#q");
        nq.focus();
        nq.setSelectionRange(pos, pos);
      };
    },
    calendar() {
      bindCommon();
      $("#cal-villa").onchange = (e) => { ui.calVilla = e.target.value; ui.sel = null; render(); };
      $$("[data-mon]").forEach((el) => (el.onclick = () => {
        const n = Number(el.dataset.mon);
        if (!n) ui.calMonth = todayIso().slice(0, 7);
        else { const d = parse(ui.calMonth + "-01"); d.setMonth(d.getMonth() + n); ui.calMonth = iso(d).slice(0, 7); }
        render();
      }));
      $$("[data-day]").forEach((el) => (el.onclick = (e) => {
        const s = el.dataset.day;
        // tapping an existing booking opens it
        const bk = S.bookings.find((b) => b.villa === ui.calVilla && (b.status === "confirmed" || b.status === "new") && b.checkin <= s && s < b.checkout);
        if (bk && !ui.sel) return openBooking(bk.id);
        if (!ui.sel || ui.sel.end) { ui.sel = { start: s }; render(); return; }
        const a = ui.sel.start < s ? ui.sel.start : s, b = ui.sel.start < s ? s : ui.sel.start;
        ui.sel = { start: a, end: b };
        render();
        blockDialog(a, b);
      }));
      dialog.addEventListener("close", () => { if (ui.sel && ui.sel.end) { ui.sel = null; render(); } }, { once: true });
      $("[data-block]").onclick = () => blockDialog();
      $$("[data-unblock]").forEach((el) => (el.onclick = () => act("DELETE", `/blocks/${el.dataset.unblock}`, undefined, "Dates unblocked")));
    },
    villas() {
      $$("[data-villa]").forEach((el) => (el.onclick = () => { ui.villa = el.dataset.villa; render(); }));
      const f = $("#vf");
      const v = villa(ui.villa);
      f.addEventListener("submit", (e) => { e.preventDefault(); act("PUT", `/villas/${v.id}`, villaPayload(f), "Saved. Live on the site now."); });
      $$("[data-ph]", f).forEach((el) => (el.onclick = () => {
        const i = Number(el.dataset.i), p = [...v.photos];
        const op = el.dataset.ph;
        if (op === "left") [p[i - 1], p[i]] = [p[i], p[i - 1]];
        if (op === "right") [p[i + 1], p[i]] = [p[i], p[i + 1]];
        if (op === "cover") p.unshift(...p.splice(i, 1));
        if (op === "del") { if (!confirm("Remove this photo from the villa?")) return; p.splice(i, 1); }
        act("PUT", `/villas/${v.id}`, { photos: p }, op === "del" ? "Photo removed" : "Photo order saved");
      }));
      $("#upl").onchange = async (e) => {
        const files = [...e.target.files];
        if (!files.length) return;
        let done = 0;
        for (const file of files) {
          toast(`Uploading ${done + 1} of ${files.length}…`);
          try {
            const blob = await shrink(file);
            S = await api("POST", `/villas/${v.id}/photos`, undefined, blob);
            done++;
          } catch (x) { toast(`${file.name}: ${x.message}`, true); }
        }
        render();
        if (done) toast(`${done} photo${done > 1 ? "s" : ""} added`);
      };
    },
    settings() {
      const f = $("#sf");
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(f));
        act("PUT", "/settings", {
          contact: { phone: d.phone, whatsapp: d.whatsapp, email: d.email, instagram: d.instagram },
          brand: { location: d.location, tagline: d.tagline, intro: d.intro },
        }, "Settings saved");
      });
      $("[data-logout]").onclick = logout;
    },
  };

  // refresh quietly every minute so new requests show up
  setInterval(async () => {
    if (!S || document.hidden || dialog.open) return;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    try {
      const fresh = await api("GET", "/state");
      const hadNew = S.stats.newRequests;
      S = fresh;
      if (location.hash.slice(1) !== "villas" && location.hash.slice(1) !== "settings") render();
      else { $("#badge-new").hidden = !S.stats.newRequests; $("#badge-new").textContent = S.stats.newRequests; }
      if (S.stats.newRequests > hadNew) toast("New booking request");
    } catch (_) {}
  }, 60000);

  boot();
})();
