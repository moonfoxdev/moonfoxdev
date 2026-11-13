// JÉEN Villas server: serves the site in jeen-villas/ and the admin portal API.
// No dependencies, just Node 20+.
//
// Environment:
//   PORT            port to listen on (Railway sets this)
//   ADMIN_PASSWORD  password for /admin (required to log in)
//   SESSION_SECRET  optional; signs login cookies (generated and saved if missing)
//   DATA_DIR        where bookings, settings and uploaded photos are stored
//                   (default: the Railway volume if attached, else ./data)
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "jeen-villas");
const DATA_DIR = path.resolve(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "..", "data"));
const UPLOADS = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PORT = Number(process.env.PORT) || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_DAYS = 14;
const MAX_PHOTO = 12 * 1024 * 1024;

fs.mkdirSync(UPLOADS, { recursive: true });

// ── defaults from js/data.js ────────────────────────────────
function loadDefaults() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js", "data.js"), "utf8"), ctx);
  return ctx.window.JEEN;
}
const DEFAULTS = loadDefaults();

// ── storage (one JSON file, written atomically) ─────────────
const emptyDb = () => ({ bookings: [], blocks: [], villas: {}, brand: {}, contact: {}, views: {}, secret: null });
let db = emptyDb();
try {
  db = Object.assign(emptyDb(), JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
} catch (e) {
  if (e.code !== "ENOENT") console.error("Could not read", DB_FILE, e.message);
}
if (!db.secret) db.secret = crypto.randomBytes(32).toString("hex");
const SECRET = process.env.SESSION_SECRET || db.secret;

let saveTimer = null, saving = Promise.resolve();
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saving = saving.then(async () => {
      const tmp = DB_FILE + ".tmp";
      await fsp.writeFile(tmp, JSON.stringify(db));
      await fsp.rename(tmp, DB_FILE);
    }).catch((e) => console.error("Save failed:", e.message));
  }, 150);
}
save();

// ── data helpers ────────────────────────────────────────────
const VILLA_FIELDS = {
  name: "string", subtitle: "string", description: "string", highlight: "string",
  guests: "number", bedrooms: "number", bathrooms: "number", pricePerNight: "number",
  currency: "string", tour: "string", available: "boolean",
  amenities: "strings", photos: "strings",
};
const BRAND_FIELDS = ["tagline", "intro", "location"];
const CONTACT_FIELDS = ["instagram", "whatsapp", "email", "phone"];

function villas() {
  return DEFAULTS.villas.map((v) => ({ ...v, ...(db.villas[v.id] || {}) }));
}
const villaById = (id) => villas().find((v) => v.id === id);
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const nights = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const overlaps = (a1, b1, a2, b2) => a1 < b2 && a2 < b1; // end dates are check-out (exclusive)
const today = () => new Date().toISOString().slice(0, 10);
const id = () => crypto.randomBytes(6).toString("hex");
const str = (v, max = 500) => (v == null ? "" : String(v).trim().slice(0, max));

// Ranges guests can't pick: confirmed bookings and blocked dates.
function busy(villaId, exceptId) {
  const out = [];
  for (const b of db.bookings)
    if (b.villa === villaId && b.status === "confirmed" && b.id !== exceptId) out.push({ start: b.checkin, end: b.checkout });
  for (const b of db.blocks) if (b.villa === villaId) out.push({ start: b.start, end: b.end });
  return out.filter((r) => r.end > today());
}

function bookingTotal(b) {
  if (b.total != null) return b.total;
  const v = villaById(b.villa);
  return v && v.pricePerNight ? v.pricePerNight * nights(b.checkin, b.checkout) : null;
}

function publicSite() {
  const booked = {};
  for (const v of DEFAULTS.villas) booked[v.id] = busy(v.id);
  return {
    brand: db.brand,
    contact: db.contact,
    villas: db.villas,
    booked,
  };
}

function stats() {
  const t = today();
  const month = t.slice(0, 7);
  const monthStart = month + "-01";
  const next = new Date(Date.parse(monthStart));
  next.setUTCMonth(next.getUTCMonth() + 1);
  const monthEnd = next.toISOString().slice(0, 10);
  const daysInMonth = nights(monthStart, monthEnd);
  const bookable = villas().filter((v) => v.available !== false);

  let bookedNights = 0, revenue = 0;
  const confirmed = db.bookings.filter((b) => b.status === "confirmed");
  for (const b of confirmed) {
    const s = b.checkin > monthStart ? b.checkin : monthStart;
    const e = b.checkout < monthEnd ? b.checkout : monthEnd;
    const n = Math.max(0, nights(s, e));
    if (!n) continue;
    bookedNights += n;
    const total = bookingTotal(b);
    if (total) revenue += (total * n) / nights(b.checkin, b.checkout);
  }

  // last 30 days of visits
  const visits = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const day = db.views[d] || {};
    visits.push({ date: d, views: Object.values(day).reduce((a, n) => a + n, 0) });
  }
  const villaViews = {};
  for (const [d, day] of Object.entries(db.views)) {
    if (Date.parse(d) < Date.now() - 30 * 86400000) continue;
    for (const [k, n] of Object.entries(day)) if (k.startsWith("villa/")) villaViews[k.slice(6)] = (villaViews[k.slice(6)] || 0) + n;
  }
  const requests30 = db.bookings.filter((b) => Date.parse(b.createdAt) > Date.now() - 30 * 86400000).length;
  const totalViews30 = visits.reduce((a, d) => a + d.views, 0);

  return {
    newRequests: db.bookings.filter((b) => b.status === "new").length,
    upcoming: confirmed.filter((b) => b.checkout > t).length,
    staysNow: confirmed.filter((b) => b.checkin <= t && b.checkout > t).length,
    occupancy: bookable.length ? bookedNights / (bookable.length * daysInMonth) : 0,
    revenueMonth: Math.round(revenue),
    month,
    visits,
    villaViews,
    requests30,
    conversion: totalViews30 ? requests30 / totalViews30 : 0,
  };
}

function adminState() {
  return {
    villas: villas(),
    bookings: db.bookings.map((b) => ({ ...b, nights: nights(b.checkin, b.checkout), estTotal: bookingTotal(b) })),
    blocks: db.blocks,
    brand: { ...DEFAULTS.brand, ...db.brand },
    contact: { ...DEFAULTS.contact, ...db.contact },
    stats: stats(),
    // On Railway, data only survives redeploys when a volume is attached.
    storage: { persistent: !process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_VOLUME_MOUNT_PATH },
  };
}

// ── auth ────────────────────────────────────────────────────
const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("base64url");
function makeToken() {
  const payload = `admin.${Date.now() + SESSION_DAYS * 86400000}`;
  return `${payload}.${sign(payload)}`;
}
function checkToken(tok) {
  if (!tok) return false;
  const i = tok.lastIndexOf(".");
  const payload = tok.slice(0, i), sig = tok.slice(i + 1);
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  return Number(payload.split(".")[1]) > Date.now();
}
function passwordOk(p) {
  if (!ADMIN_PASSWORD || typeof p !== "string") return false;
  const a = crypto.createHash("sha256").update(p).digest();
  const b = crypto.createHash("sha256").update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
const cookies = (req) =>
  Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).filter((p) => p[0]).map(([k, ...v]) => [k, v.join("=")]));
const isAdmin = (req) => checkToken(cookies(req).jeen_admin);
const secure = (req) => req.headers["x-forwarded-proto"] === "https";

// simple per-IP rate limits
const hits = new Map();
function limited(req, key, max, windowMs) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const k = `${key}:${ip}`, now = Date.now();
  const list = (hits.get(k) || []).filter((t) => t > now - windowMs);
  list.push(now);
  hits.set(k, list);
  return list.length > max;
}
setInterval(() => hits.clear(), 3600000).unref();

// ── http helpers ────────────────────────────────────────────
function send(res, status, body, headers = {}) {
  const json = typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(status, {
    "Content-Type": json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(json ? JSON.stringify(body) : body);
}
function readBody(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("Too large"), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
async function readJson(req) {
  const buf = await readBody(req);
  try { return JSON.parse(buf.toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("Bad JSON"), { status: 400 }); }
}
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// ── public API ──────────────────────────────────────────────
function validateBooking(d, { admin = false } = {}) {
  const v = villaById(d.villa);
  if (!v || (!admin && v.available === false)) throw bad("Unknown villa");
  if (!isDate(d.checkin) || !isDate(d.checkout)) throw bad("Dates are missing");
  if (d.checkout <= d.checkin) throw bad("Check-out must be after check-in");
  if (!admin && d.checkin < today()) throw bad("Check-in is in the past");
  if (nights(d.checkin, d.checkout) > 120) throw bad("Stay is too long");
  const name = str(d.name, 120);
  if (!name) throw bad("Name is missing");
  return {
    villa: v.id,
    checkin: d.checkin,
    checkout: d.checkout,
    guests: Math.max(1, Math.min(50, parseInt(d.guests, 10) || 1)),
    name,
    phone: str(d.phone, 40),
    email: str(d.email, 120),
    notes: str(d.notes, 2000),
  };
}

async function publicApi(req, res, url) {
  if (url.pathname === "/api/site.js" && req.method === "GET") {
    return send(res, 200, `window.JEEN_LIVE=${JSON.stringify(publicSite()).replace(/</g, "\\u003c")};`, {
      "Content-Type": "application/javascript; charset=utf-8",
    });
  }
  if (url.pathname === "/api/bookings" && req.method === "POST") {
    if (limited(req, "book", 10, 3600000)) throw bad("Too many requests, please try again later", 429);
    const d = await readJson(req);
    if (d.website) return send(res, 201, { ok: true }); // honeypot
    const b = validateBooking(d);
    const clash = busy(b.villa).some((r) => overlaps(b.checkin, b.checkout, r.start, r.end));
    const booking = {
      id: id(), ...b, via: ["whatsapp", "email", "instagram"].includes(d.via) ? d.via : "website",
      status: "new", total: null, adminNotes: "", clash, createdAt: new Date().toISOString(),
    };
    db.bookings.unshift(booking);
    save();
    return send(res, 201, { ok: true, id: booking.id, clash });
  }
  if (url.pathname === "/api/track" && req.method === "POST") {
    if (limited(req, "track", 300, 3600000)) return send(res, 204, "");
    const d = await readJson(req).catch(() => ({}));
    const route = str(d.route, 40).replace(/[^a-z0-9/-]/gi, "") || "home";
    const day = today();
    const bucket = (db.views[day] ||= {});
    if (Object.keys(bucket).length < 200) bucket[route] = (bucket[route] || 0) + 1;
    // keep ~1 year
    for (const k of Object.keys(db.views)) if (Date.parse(k) < Date.now() - 366 * 86400000) delete db.views[k];
    save();
    return send(res, 204, "");
  }
  return false;
}

// ── admin API ───────────────────────────────────────────────
async function adminApi(req, res, url) {
  const p = url.pathname.replace(/^\/api\/admin/, "");

  if (p === "/login" && req.method === "POST") {
    if (limited(req, "login", 10, 15 * 60000)) throw bad("Too many attempts. Wait 15 minutes.", 429);
    if (!ADMIN_PASSWORD) throw bad("ADMIN_PASSWORD is not set on the server yet.", 503);
    const { password } = await readJson(req);
    if (!passwordOk(password)) throw bad("Wrong password", 401);
    const cookie = `jeen_admin=${makeToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure(req) ? "; Secure" : ""}`;
    return send(res, 200, { ok: true }, { "Set-Cookie": cookie });
  }
  if (p === "/logout" && req.method === "POST") {
    return send(res, 200, { ok: true }, { "Set-Cookie": "jeen_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });
  }

  if (!isAdmin(req)) throw bad("Not logged in", 401);
  // CSRF guard on top of SameSite=Strict: changes must come from our own JS.
  if (req.method !== "GET" && req.headers["x-jeen-admin"] !== "1") throw bad("Forbidden", 403);

  let m;
  if (p === "/state" && req.method === "GET") return send(res, 200, adminState());

  if (p === "/bookings" && req.method === "POST") {
    const d = await readJson(req);
    const b = validateBooking(d, { admin: true });
    const booking = {
      id: id(), ...b, via: "manual", status: ["new", "confirmed"].includes(d.status) ? d.status : "confirmed",
      total: d.total === "" || d.total == null ? null : Number(d.total) || null,
      adminNotes: str(d.adminNotes, 2000), clash: false, createdAt: new Date().toISOString(),
    };
    if (booking.status === "confirmed" && busy(b.villa).some((r) => overlaps(b.checkin, b.checkout, r.start, r.end)))
      throw bad("Those dates overlap a confirmed stay or blocked dates", 409);
    db.bookings.unshift(booking);
    save();
    return send(res, 201, adminState());
  }
  if ((m = p.match(/^\/bookings\/([a-f0-9]+)$/))) {
    const b = db.bookings.find((x) => x.id === m[1]);
    if (!b) throw bad("Not found", 404);
    if (req.method === "DELETE") {
      db.bookings = db.bookings.filter((x) => x !== b);
      save();
      return send(res, 200, adminState());
    }
    if (req.method === "PATCH") {
      const d = await readJson(req);
      const next = { ...b };
      if (d.status != null) {
        if (!["new", "confirmed", "declined", "cancelled"].includes(d.status)) throw bad("Bad status");
        next.status = d.status;
      }
      for (const k of ["checkin", "checkout"]) if (d[k] != null) { if (!isDate(d[k])) throw bad("Bad date"); next[k] = d[k]; }
      if (next.checkout <= next.checkin) throw bad("Check-out must be after check-in");
      if (d.villa != null) { if (!villaById(d.villa)) throw bad("Unknown villa"); next.villa = d.villa; }
      if (d.total !== undefined) next.total = d.total === "" || d.total == null ? null : Number(d.total) || null;
      if (d.adminNotes != null) next.adminNotes = str(d.adminNotes, 2000);
      for (const k of ["name", "phone", "email"]) if (d[k] != null) next[k] = str(d[k], 120);
      if (d.guests != null) next.guests = Math.max(1, Math.min(50, parseInt(d.guests, 10) || 1));
      if (next.status === "confirmed" && busy(next.villa, next.id).some((r) => overlaps(next.checkin, next.checkout, r.start, r.end)))
        throw bad("Those dates overlap another confirmed stay or blocked dates", 409);
      next.clash = false;
      Object.assign(b, next, { updatedAt: new Date().toISOString() });
      save();
      return send(res, 200, adminState());
    }
  }

  if (p === "/blocks" && req.method === "POST") {
    const d = await readJson(req);
    if (!villaById(d.villa)) throw bad("Unknown villa");
    if (!isDate(d.start) || !isDate(d.end) || d.end <= d.start) throw bad("Pick a start and end date");
    db.blocks.push({ id: id(), villa: d.villa, start: d.start, end: d.end, note: str(d.note, 200) });
    save();
    return send(res, 201, adminState());
  }
  if ((m = p.match(/^\/blocks\/([a-f0-9]+)$/)) && req.method === "DELETE") {
    db.blocks = db.blocks.filter((b) => b.id !== m[1]);
    save();
    return send(res, 200, adminState());
  }

  if ((m = p.match(/^\/villas\/([\w-]+)$/)) && req.method === "PUT") {
    if (!DEFAULTS.villas.some((v) => v.id === m[1])) throw bad("Unknown villa", 404);
    const d = await readJson(req);
    const o = { ...(db.villas[m[1]] || {}) };
    for (const [k, type] of Object.entries(VILLA_FIELDS)) {
      if (!(k in d)) continue;
      const val = d[k];
      if (val === null || val === "") { o[k] = type === "strings" ? [] : null; continue; }
      if (type === "number") { const n = Number(val); if (!isFinite(n) || n < 0) throw bad(`${k} must be a number`); o[k] = n; }
      else if (type === "boolean") o[k] = !!val;
      else if (type === "strings") {
        if (!Array.isArray(val)) throw bad(`${k} must be a list`);
        o[k] = val.map((s) => str(s, 300)).filter(Boolean).slice(0, 80);
      } else o[k] = str(val, 4000);
    }
    if (o.photos) o.photos = o.photos.filter((f) => /^[\w.-]+$/.test(f) || /^\/uploads\/[\w-]+\/[\w.-]+$/.test(f));
    db.villas[m[1]] = o;
    save();
    return send(res, 200, adminState());
  }
  if ((m = p.match(/^\/villas\/([\w-]+)\/photos$/)) && req.method === "POST") {
    if (!DEFAULTS.villas.some((v) => v.id === m[1])) throw bad("Unknown villa", 404);
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[req.headers["content-type"]];
    if (!ext) throw bad("Use a JPG, PNG or WebP photo");
    const buf = await readBody(req, MAX_PHOTO);
    if (!buf.length) throw bad("Empty file");
    const dir = path.join(UPLOADS, m[1]);
    await fsp.mkdir(dir, { recursive: true });
    const file = `${Date.now().toString(36)}-${id()}.${ext}`;
    await fsp.writeFile(path.join(dir, file), buf);
    const url = `/uploads/${m[1]}/${file}`;
    const v = villaById(m[1]);
    db.villas[m[1]] = { ...(db.villas[m[1]] || {}), photos: [...(v.photos || []), url] };
    save();
    return send(res, 201, adminState());
  }

  if (p === "/settings" && req.method === "PUT") {
    const d = await readJson(req);
    for (const k of BRAND_FIELDS) if (k in (d.brand || {})) db.brand[k] = str(d.brand[k], 2000);
    for (const k of CONTACT_FIELDS) if (k in (d.contact || {})) db.contact[k] = str(d.contact[k], 120);
    if (db.contact.whatsapp) db.contact.whatsapp = db.contact.whatsapp.replace(/\D/g, "");
    if (db.contact.instagram) db.contact.instagram = db.contact.instagram.replace(/^@/, "");
    save();
    return send(res, 200, adminState());
  }

  if (p === "/bookings.csv" && req.method === "GET") {
    const cols = ["createdAt", "status", "villa", "checkin", "checkout", "nights", "guests", "name", "phone", "email", "via", "total", "notes", "adminNotes"];
    const cell = (v) => {
      let s = String(v ?? "");
      if (/^[=@\t\r]/.test(s) || /^[+-](?![\d\s()+-]*$)/.test(s)) s = "'" + s; // stop spreadsheet formulas, keep phone numbers
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = db.bookings.map((b) => cols.map((c) => cell(c === "nights" ? nights(b.checkin, b.checkout) : c === "total" ? bookingTotal(b) : b[c])).join(","));
    return send(res, 200, [cols.join(","), ...rows].join("\n"), {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jeen-bookings-${today()}.csv"`,
    });
  }

  throw bad("Not found", 404);
}

// ── static files ────────────────────────────────────────────
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".glb": "model/gltf-binary", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
};
const COMPRESSIBLE = /\.(html|js|css|json|webmanifest|svg|txt)$/;
const gzCache = new Map();
const FRESH = new Set(["/", "/index.html", "/sw.js", "/manifest.webmanifest", "/admin/", "/admin/index.html"]);

async function serveFile(req, res, base, rel, urlPath) {
  const file = path.join(base, rel);
  if (!file.startsWith(base + path.sep)) return send(res, 404, "Not found");
  let st;
  try { st = await fsp.stat(file); } catch { return send(res, 404, "Not found"); }
  if (st.isDirectory()) return serveFile(req, res, base, path.join(rel, "index.html"), urlPath);
  const ext = path.extname(file).toLowerCase();
  const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
  const headers = {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    ETag: etag,
    "Cache-Control": FRESH.has(urlPath) || ext === ".html" ? "no-cache" : base === UPLOADS ? "public, max-age=31536000, immutable" : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };
  if (urlPath.startsWith("/admin")) Object.assign(headers, { "X-Frame-Options": "DENY", "X-Robots-Tag": "noindex" });
  if (req.headers["if-none-match"] === etag) { res.writeHead(304, headers); return res.end(); }
  if (COMPRESSIBLE.test(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
    let gz = gzCache.get(file);
    if (!gz || gz.etag !== etag) {
      gz = { etag, buf: zlib.gzipSync(await fsp.readFile(file)) };
      gzCache.set(file, gz);
    }
    res.writeHead(200, { ...headers, "Content-Encoding": "gzip", Vary: "Accept-Encoding", "Content-Length": gz.buf.length });
    return res.end(req.method === "HEAD" ? undefined : gz.buf);
  }
  res.writeHead(200, { ...headers, "Content-Length": st.size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

// ── server ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return send(res, 400, "Bad request"); }
    if (pathname.includes("\0")) return send(res, 400, "Bad request");

    if (pathname === "/healthz") return send(res, 200, "ok");
    if (pathname.startsWith("/api/admin/")) return await adminApi(req, res, url);
    if (pathname.startsWith("/api/")) {
      if ((await publicApi(req, res, url)) === false) send(res, 404, { error: "Not found" });
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
    if (pathname === "/admin") { res.writeHead(301, { Location: "/admin/" }); return res.end(); }
    if (pathname.startsWith("/uploads/")) return await serveFile(req, res, UPLOADS, pathname.slice(9), pathname);
    return await serveFile(req, res, ROOT, pathname.slice(1) || "index.html", pathname);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? "Server error" : e.message });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`JÉEN Villas on :${PORT} · data in ${DATA_DIR}${ADMIN_PASSWORD ? "" : " · ADMIN_PASSWORD not set, admin login disabled"}`);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, async () => {
    clearTimeout(saveTimer);
    try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
