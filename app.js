// İstanbul Nabzı portalı: /api/data (Cloudflare KV) ya da yerelde data.json okur.
// Grafikler elle SVG, haritalar Leaflet + OpenStreetMap.
"use strict";

const TZ = "Europe/Istanbul";
const OFFSET = 3 * 3600e3; // İstanbul yıl boyu UTC+3
const DAY = 86400e3;
const NS = "http://www.w3.org/2000/svg";
const KIND = { yuksek: "Olağanın üstü", dusuk: "Olağanın altı", rekor_max: "Rekor yoğun", rekor_min: "Rekor sakin" };
const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const DAYS_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const fmt = (opts) => new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, ...opts });
const fTime = fmt({ hour: "2-digit", minute: "2-digit" });
const fDayTime = fmt({ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fTick = fmt({ weekday: "short", day: "2-digit", month: "2-digit" });
const fLongDay = fmt({ day: "numeric", month: "long", weekday: "long" });
const num = (v, d = 0) => v == null ? "–" : v.toLocaleString("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d });
const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const localDay = (t) => Math.floor((t + OFFSET) / DAY) * DAY - OFFSET; // yerel gece yarısı (UTC ms)
const weekday = (t) => (new Date(t + OFFSET).getUTCDay() + 6) % 7;      // 0 = Pazartesi
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (_) { /* gizli pencere vb. */ }
  return null;
}

async function load() {
  // Cloudflare'de /api/data (KV), GitHub Pages'te data.json; önbelleği atlamak için zaman damgası.
  const urls = location.hostname.endsWith("github.io") ? ["data.json"] : ["api/data", "data.json"];
  for (const url of urls) {
    try {
      const r = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) return await r.json();
    } catch (_) { /* sıradakini dene */ }
  }
  throw new Error("veri alınamadı");
}

// --- tooltip ----------------------------------------------------------------

const tip = $("tip");
function showTip(html, x, y) {
  tip.innerHTML = html;
  tip.hidden = false;
  const w = tip.offsetWidth, hgt = tip.offsetHeight;
  let left = x + 14, top = y - hgt - 10;
  if (left + w > innerWidth - 8) left = x - w - 14;
  if (top < 8) top = y + 16;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${top}px`;
}
const hideTip = () => { tip.hidden = true; };

// --- üst bant: şu an + neden ------------------------------------------------

const ICONS = {
  rain: '<path d="M7 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.6 1.5A3.5 3.5 0 0 1 17 15H7z"/><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  pin: '<path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  ok: '<circle cx="12" cy="12" r="8"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
};

function hero(d) {
  const tr = d.traffic, n = tr && tr.now;
  if (!n) { $("headline").textContent = "Veri bekleniyor"; return; }
  const H = $("headline");
  if (n.median == null) H.textContent = n.word;
  else if (n.state === "normal") H.innerHTML = "normal seyrinde";
  else {
    const pct = Math.abs(n.pct);
    H.innerHTML = n.state === "up"
      ? `normalden <span class="up">%${num(pct)} yoğun</span>`
      : `normalden <span class="down">%${num(pct)} sakin</span>`;
  }
  $("subline").innerHTML = `Endeks <b>${num(n.value)}</b> (${esc(n.word)})` +
    (n.median != null ? ` · ${DAYS[weekday(n.t)]} bu saatte normalde <b>${num(n.median)}</b>, genelde ${num(n.q1)}–${num(n.q3)}` : "") +
    ` · ${fTime.format(n.t)}`;
  $("outlook").textContent = n.outlook || "";

  const g = $("gauge");
  g.innerHTML = '<div class="bar"></div>';
  const pos = (v) => `${Math.max(0, Math.min(100, v))}%`;
  if (n.q1 != null) {
    const r = h("div", "rng");
    r.style.left = pos(n.q1 - 1);
    r.style.width = `${Math.max(2, n.q3 - n.q1 + 2)}%`;
    r.append(h("span", null, "normal"));
    g.append(r);
  }
  const p = h("div", "pin");
  p.style.left = pos(n.value);
  g.append(p);
  const ticks = h("div", "ticks");
  ["0 · boş", "25", "50", "75", "100 · kilit"].forEach((t) => ticks.append(h("span", null, t)));
  g.append(ticks);

  const ul = $("why");
  ul.innerHTML = "";
  const items = [...(d.why || [])];
  if (n.state === "normal") items.unshift({ icon: "ok", text: "Olağan dışı bir şey yok: bu gün ve saat için beklenen seviyede." });
  if (n.state === "down" && !items.some((x) => x.icon === "calendar"))
    items.unshift({ icon: "ok", text: "Yollar bu saat için beklenenden rahat; takvimde özel bir gün yok." });
  for (const it of items) {
    const li = h("li");
    li.innerHTML = `<span class="ic"><svg viewBox="0 0 24 24">${ICONS[it.icon] || ICONS.clock}</svg></span><span>${esc(it.text)}` +
      (it.link ? ` <a href="${esc(it.link)}" target="_blank" rel="noopener">UYM →</a>` : "") + "</span>";
    ul.append(li);
  }
}

// --- zaman grafiği ----------------------------------------------------------

const M = { l: 34, r: 10, t: 14, b: 24 };

function scales(box, x0, x1, y0, y1) {
  const W = box.clientWidth, H = box.clientHeight;
  const sx = (t) => M.l + (t - x0) / (x1 - x0) * (W - M.l - M.r);
  const sy = (v) => H - M.b - (v - y0) / (y1 - y0) * (H - M.t - M.b);
  const inv = (px) => x0 + (px - M.l) / (W - M.l - M.r) * (x1 - x0);
  return { W, H, sx, sy, inv };
}

function path(points, sx, sy, gap = 31 * 60e3) {
  let d = "", prev = null;
  for (const [t, v] of points) {
    if (v == null) { prev = null; continue; }
    d += (prev == null || t - prev > gap ? "M" : "L") + sx(t).toFixed(1) + "," + sy(v).toFixed(1);
    prev = t;
  }
  return d;
}

function bandPath(band, sx, sy, gap = 61 * 60e3) {
  const parts = [];
  let cur = [];
  for (const row of band) {
    if (cur.length && row[0] - cur[cur.length - 1][0] > gap) { parts.push(cur); cur = []; }
    cur.push(row);
  }
  if (cur.length) parts.push(cur);
  return parts.map((p) => "M" + p.map((r) => `${sx(r[0]).toFixed(1)},${sy(r[3]).toFixed(1)}`).join("L")
    + "L" + p.slice().reverse().map((r) => `${sx(r[0]).toFixed(1)},${sy(r[1]).toFixed(1)}`).join("L") + "Z").join("");
}

function axes(svg, ctx, y1, unit, xTicks, xLabel) {
  const { W, H, sx, sy } = ctx;
  for (let i = 0; i <= 4; i++) {
    const v = y1 / 4 * i, y = sy(v);
    el("line", { x1: M.l, x2: W - M.r, y1: y, y2: y, stroke: i ? "var(--grid)" : "var(--axis)", "stroke-width": 1 }, svg);
    el("text", { x: M.l - 6, y: y + 4, "text-anchor": "end" }, svg).textContent = unit ? `%${num(v)}` : num(v);
  }
  const narrow = W < 520;
  xTicks.forEach((t, i) => {
    el("line", { x1: sx(t), x2: sx(t), y1: M.t, y2: H - M.b, stroke: "var(--grid)", "stroke-width": 1 }, svg);
    if (narrow && i % 2) return;
    el("text", { x: sx(t) + 3, y: H - 6 }, svg).textContent = xLabel(t);
  });
}

function hover(svg, ctx, points, bandRows, unit) {
  const { W, H, sx, sy, inv } = ctx;
  const cross = el("line", { y1: M.t, y2: H - M.b, stroke: "var(--axis)", "stroke-width": 1, visibility: "hidden" }, svg);
  const dot = el("circle", { r: 4.5, fill: "var(--series)", stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" }, svg);
  const hit = el("rect", { x: M.l, y: 0, width: Math.max(0, W - M.l - M.r), height: H, fill: "transparent" }, svg);
  const fv = (v) => unit ? `%${num(v)}` : num(v);
  const bandAt = (t) => {
    let best = null;
    for (const b of bandRows) if (!best || Math.abs(b[0] - t) < Math.abs(best[0] - t)) best = b;
    return best && Math.abs(best[0] - t) < 20 * 60e3 ? best : null;
  };
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const t = inv(ev.clientX - r.left);
    let best = null;
    for (const p of points) if (!best || Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
    const b = bandAt(best && Math.abs(best[0] - t) < 30 * 60e3 ? best[0] : t);
    if (!best && !b) return;
    const x = sx(best && Math.abs(best[0] - t) < 30 * 60e3 ? best[0] : b[0]);
    cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
    let html;
    if (best && Math.abs(best[0] - t) < 30 * 60e3) {
      dot.setAttribute("cx", x); dot.setAttribute("cy", sy(best[1])); dot.setAttribute("visibility", "visible");
      html = `${fDayTime.format(best[0])}<br><b>${fv(best[1])}</b>`;
    } else {
      dot.setAttribute("visibility", "hidden");
      html = `${fDayTime.format(b[0])}`;
    }
    if (b) html += `<br><span class="m">normali ${fv(b[2])} (genelde ${fv(b[1])}–${fv(b[3])})</span>`;
    showTip(html, ev.clientX, ev.clientY);
  };
  const leave = () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); hideTip(); };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", leave);
}

function lineChart(box, { points, band = [], x0, x1, unit = "", highlights = [], nowT, ticks, tickLabel, aria }) {
  box.innerHTML = "";
  if (!points || !points.length) { box.append(h("p", "empty", "Henüz veri yok.")); return; }
  const vals = points.map((p) => p[1]).concat(band.map((b) => b[3]));
  const y1 = unit ? 100 : Math.max(20, Math.ceil(Math.max(...vals) * 1.08 / 20) * 20);
  const ctx = scales(box, x0, x1, 0, y1);
  const { W, H, sx, sy } = ctx;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": aria || "" });
  box.append(svg);
  axes(svg, ctx, y1, unit, ticks, tickLabel);
  for (const [a, b] of highlights) {
    const xa = sx(Math.max(a, x0)), xb = sx(Math.min(b, x1));
    if (xb > xa) el("rect", { x: xa, y: M.t, width: Math.max(2, xb - xa), height: H - M.t - M.b, fill: "var(--highlight)", opacity: .10 }, svg);
  }
  if (band.length) {
    el("path", { d: bandPath(band, sx, sy), fill: "var(--band)", opacity: .75 }, svg);
    el("path", { d: path(band.map((b) => [b[0], b[2]]), sx, sy, 61 * 60e3), fill: "none", stroke: "var(--muted)", "stroke-width": 1.2, "stroke-dasharray": "4 3" }, svg);
  }
  if (nowT) {
    el("line", { x1: sx(nowT), x2: sx(nowT), y1: M.t, y2: H - M.b, stroke: "var(--ink-2)", "stroke-width": 1, "stroke-dasharray": "2 3" }, svg);
    el("text", { x: sx(nowT) + 4, y: M.t + 2, class: "lbl" }, svg).textContent = "şimdi";
  }
  el("path", { d: path(points, sx, sy), fill: "none", stroke: "var(--series)", "stroke-width": 2.2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
  const last = points[points.length - 1];
  el("circle", { cx: sx(last[0]), cy: sy(last[1]), r: 5, fill: "var(--series)", stroke: "var(--surface)", "stroke-width": 2 }, svg);
  hover(svg, ctx, points, band, unit);
}

function dayTicks(x0, x1) {
  const out = [];
  for (let t = localDay(x0) + DAY; t <= x1; t += DAY) out.push(t);
  return out;
}

function rainChart(box, rain, x0, x1) {
  box.innerHTML = "";
  const pts = rain.filter((r) => r[0] >= x0 && r[0] <= x1);
  const maxV = Math.max(5, ...pts.map((r) => r[1]));
  const { W, H, sx, sy } = scales(box, x0, x1, 0, maxV);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Saatlik yağış" });
  box.append(svg);
  el("line", { x1: M.l, x2: W - M.r, y1: sy(0), y2: sy(0), stroke: "var(--axis)" }, svg);
  el("text", { x: M.l - 6, y: M.t + 8, "text-anchor": "end" }, svg).textContent = num(maxV);
  el("text", { x: M.l + 2, y: M.t + 8, class: "lbl" }, svg).textContent = "yağış, mm/saat";
  const bw = Math.max(1, sx(x0 + 3600e3) - sx(x0) - 1);
  for (const [t, v] of pts) {
    if (v < 0.1) continue;
    const r = el("rect", { x: sx(t), y: sy(v), width: bw, height: sy(0) - sy(v), fill: "var(--rain)", rx: 1 }, svg);
    r.addEventListener("pointermove", (ev) => showTip(`${fDayTime.format(t)}<br><b>${num(v, 1)} mm</b>`, ev.clientX, ev.clientY));
    r.addEventListener("pointerleave", hideTip);
  }
}

function barChart(box, values, { label, highlight, tipText }) {
  box.innerHTML = "";
  const maxV = Math.max(...values, 1);
  const { W, H, sy } = scales(box, 0, 1, 0, maxV);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label });
  box.append(svg);
  const n = values.length, slot = (W - M.l - M.r) / n, bw = Math.max(2, slot - 3);
  el("line", { x1: M.l, x2: W - M.r, y1: sy(0), y2: sy(0), stroke: "var(--axis)" }, svg);
  values.forEach((v, i) => {
    const x = M.l + i * slot + (slot - bw) / 2, y = sy(v);
    const r = el("rect", { x, y, width: bw, height: Math.max(0, sy(0) - y), rx: 3,
      fill: i === highlight ? "var(--c-kaza)" : "var(--series)", opacity: i === highlight ? 1 : .55 }, svg);
    if (i % (W < 520 ? 6 : 3) === 0) el("text", { x: x + bw / 2, y: H - 6, "text-anchor": "middle" }, svg).textContent = String(i).padStart(2, "0");
    r.addEventListener("pointermove", (ev) => showTip(tipText(i, v), ev.clientX, ev.clientY));
    r.addEventListener("pointerleave", hideTip);
  });
}

// --- haritalar ---------------------------------------------------------------

const maps = {};
function baseMap(id) {
  if (maps[id]) return maps[id];
  const m = L.map(id, { scrollWheelZoom: false, zoomControl: true, attributionControl: true, preferCanvas: true })
    .setView([41.03, 28.98], 10);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(m);
  maps[id] = { map: m, layer: L.layerGroup().addTo(m) };
  return maps[id];
}

function lotState(l) {
  if (!l.open || l.empty == null) return ["closed", "Kapalı"];
  // "Dolu" yalnızca gerçekten yer kalmadıysa; 956'lık otoparkta 33 boş yer "az yer"dir, dolu değil.
  if (l.empty <= 2) return ["full", "Dolu"];
  if (l.empty / l.cap < 0.15 || l.empty < 10) return ["warn", "Az yer"];
  return ["ok", "Boş yer var"];
}

function parking(d) {
  const P = d.parking;
  if (!P) return;
  const sel = $("district");
  if (!sel.options.length) {
    sel.append(new Option("Tüm İstanbul", ""));
    for (const x of P.districts) sel.append(new Option(`${x.name} (%${num(x.pct)} dolu)`, x.name));
    const saved = store("nabiz.ilce");
    if (saved && P.districts.some((x) => x.name === saved)) sel.value = saved;
    sel.addEventListener("change", () => syncDistrict(sel.value, "district"));
  } else {
    for (const o of sel.options) {
      const x = P.districts.find((y) => y.name === o.value);
      if (x) o.text = `${x.name} (%${num(x.pct)} dolu)`;
    }
  }
  $("parking-note").textContent = `İSPARK otoparkları, ${fTime.format(P.t)} itibarıyla boş yer. Gideceğin ilçeyi seç.`;
  $("park-legend").innerHTML = [["ok", "Boş yer var"], ["warn", "Az yer (%15'ten az)"], ["full", "Dolu (en çok 2 yer)"], ["closed", "Kapalı"]]
    .map(([k, t]) => `<span><i style="background:var(--${k})"></i>${t}</span>`).join("") + "<span>Daire büyüklüğü = kapasite</span>";
  drawParking(false);
}

function drawParking(fit) {
  const P = DATA.parking, name = $("district").value;
  const lots = P.lots.filter((l) => !name || l.district === name);
  const open = lots.filter((l) => l.open && l.empty != null);
  const cap = open.reduce((a, l) => a + l.cap, 0), empty = open.reduce((a, l) => a + l.empty, 0);
  const s = $("park-stats");
  s.innerHTML = "";
  const stat = (v, k) => { const x = h("div", "stat"); x.append(h("div", "v", v), h("div", "k", k)); s.append(x); };
  stat(cap ? `%${num(100 * (cap - empty) / cap)}` : "–", "doluluk");
  stat(num(empty), "boş yer");
  stat(`${open.length}/${lots.length}`, "açık otopark");

  const { map, layer } = baseMap("park-map");
  map.invalidateSize();
  layer.clearLayers();
  const markers = new Map();
  for (const l of lots) {
    const [st, word] = lotState(l);
    const m = L.circleMarker([l.lat, l.lng], {
      radius: Math.max(5, Math.min(16, Math.sqrt(l.cap) / 2.2)), weight: 1.5, color: "#fff",
      fillColor: css(`--${st}`), fillOpacity: .9,
    }).bindPopup(`<b>${esc(l.name)}</b><br>${word}: <b>${l.empty ?? "–"}</b> boş / ${l.cap}<br>` +
      `<span style="color:var(--ink-2)">${esc(l.kind)} · ${esc(l.hours || "")}${l.free_min ? ` · ilk ${l.free_min} dk ücretsiz` : ""}</span>`);
    m.addTo(layer);
    markers.set(l.id, m);
  }
  if (fit || !layer._fitted) {
    const pts = lots.map((l) => [l.lat, l.lng]);
    if (pts.length) map.fitBounds(pts, { padding: [24, 24], maxZoom: 15, animate: false });
    layer._fitted = true;
  }

  const ol = $("lots");
  ol.innerHTML = "";
  const sorted = lots.slice().sort((a, b) => (b.open - a.open) || ((b.empty ?? -1) - (a.empty ?? -1)));
  for (const l of sorted.slice(0, 60)) {
    const [st, word] = lotState(l);
    const li = h("li");
    li.append(h("span", "n", l.name), h("span", "e", l.open ? `${l.empty ?? "–"} boş` : "kapalı"));
    const meter = h("span", "meter"), fill = h("i");
    fill.style.width = l.open && l.empty != null ? `${100 * (l.cap - l.empty) / l.cap}%` : "0";
    fill.style.background = `var(--${st})`;
    meter.append(fill);
    li.append(meter, h("span", "m", `${name ? "" : l.district + " · "}${word} · ${l.cap} araçlık · ${l.hours || ""}`));
    li.addEventListener("click", () => { map.flyTo([l.lat, l.lng], 16, { duration: .6 }); markers.get(l.id).openPopup(); });
    ol.append(li);
  }
}

const TYPE_COLOR = (t) => t === "Kaza Bildirimi" ? "--c-kaza" : t === "Araç Arızası" ? "--c-ariza"
  : /Bakım|Kapanma|Çalışma|Düzenleme/.test(t) ? "--c-yol" : "--c-diger";

function yesterday(d) {
  const Y = d.yesterday, box = $("yesterday");
  box.innerHTML = "";
  if (!Y) return;
  const day = new Date(`${Y.day}T12:00:00+03:00`).getTime();
  box.append(h("h3", null, `Dün yollarda: ${fLongDay.format(day)}`));
  const st = h("div", "stats wide");
  const c = Y.counts;
  for (const [k, label, color] of [["kaza", "kaza", "--c-kaza"], ["ariza", "araç arızası", "--c-ariza"], ["yol", "yol çalışması / kapanma", "--c-yol"]]) {
    const x = h("div", "stat"), v = h("div", "v"), dot = h("span", "dot");
    dot.style.background = `var(${color})`;
    v.append(dot, num(c[k] || 0));
    x.append(v, h("div", "k", label));
    st.append(x);
  }
  const all = h("div", "stat");
  all.append(h("div", "v", num(Object.values(c).reduce((a, b) => a + b, 0))), h("div", "k", "toplam duyuru"));
  st.append(all);
  box.append(st);
  if (Y.items.length) {
    const det = h("details", "works");
    det.append(h("summary", null, `Dünün duyuruları (${Y.items.length})`));
    const ul = h("ul", "live");
    for (const x of Y.items) {
      const li = h("li"), dot = h("span", "dot");
      dot.style.background = `var(${LIVE_COLOR[x.tur] || "--c-diger"})`;
      li.append(dot, h("span", null, x.text), h("span", "ago", fTime.format(x.t)));
      ul.append(li);
    }
    det.append(ul);
    box.append(det);
  }
  box.append(h("p", "note", "İBB Ulaşım Yönetim Merkezi'nin anlık duyurularından, sunucunun 5 dakikada bir kaydettikleri." +
    (Y.complete ? "" : " Kayıt dün gün içinde başladığı için eksik olabilir.")));
}

function roads(d) {
  const I = d.incidents;
  yesterday(d);
  if (!I) { $("roads-note").textContent = "İBB'nin konumlu kaza kayıtlarına şu an ulaşılamıyor."; return; }
  const day = new Date(`${I.day}T12:00:00+03:00`).getTime();
  $("roads-title").textContent = "Yollarda ne oldu?";
  $("roads-note").innerHTML = I.stale
    ? `Aşağıdaki harita İBB'nin konumlu kaza kayıtlarından. İBB bu açık veriyi ${fLongDay.format(I.source_last)} tarihinden beri güncellemedi; ` +
      `harita eldeki son günü (<b>${fLongDay.format(day)}</b>) ve son 12 ayın kara noktalarını gösteriyor.`
    : `Harita: İBB Ulaşım Yönetim Merkezi'nin konumlu kayıtları, ${fLongDay.format(day)}. Açık veri gecede bir yayınlandığı için 1-2 gün geriden gelir.`;
  $("map-day").textContent = `Haritada: ${fLongDay.format(day)}${I.stale ? " (İBB'nin son konumlu verisi)" : ""}`;
  const acc = I.by_type["Kaza Bildirimi"] || 0;
  const work = Object.entries(I.by_type).filter(([k]) => TYPE_COLOR(k) === "--c-yol").reduce((a, [, v]) => a + v, 0);
  const s = $("road-stats");
  s.innerHTML = "";
  const stat = (v, k, color) => {
    const x = h("div", "stat");
    const vv = h("div", "v");
    if (color) { const dot = h("span", "dot"); dot.style.background = `var(${color})`; vv.append(dot); }
    vv.append(v);
    x.append(vv, h("div", "k", k));
    s.append(x);
  };
  stat(num(acc), `kaza · ${num(I.accidents["yaralanmalı"] || 0)} yaralanmalı, ${num(I.accidents["zincirleme"] || 0)} zincirleme`, "--c-kaza");
  stat(num(I.by_type["Araç Arızası"] || 0), "araç arızası", "--c-ariza");
  stat(num(work), "yol çalışması / kapanma", "--c-yol");
  stat(num(I.per_day, 0), "günde ortalama kaza (12 ay)");

  const { map, layer } = baseMap("road-map");
  map.invalidateSize();
  layer.clearLayers();
  for (const x of I.items) {
    L.circleMarker([x.lat, x.lng], { radius: x.type === "Kaza Bildirimi" ? 7 : 5.5, weight: 1.5, color: "#fff",
      fillColor: css(TYPE_COLOR(x.type)), fillOpacity: .9 })
      .bindPopup(`<b>${fTime.format(x.t)} · ${esc(x.type)}${x.sub ? ` (${esc(x.sub)})` : ""}</b><br>${esc(x.title)}`)
      .addTo(layer);
  }
  const hotLayer = L.layerGroup().addTo(layer);
  for (const p of I.hotspots) {
    L.circle([p.lat, p.lng], { radius: 350, color: css("--c-kaza"), weight: 1.5, fill: false, dashArray: "4 4" })
      .bindTooltip(`${esc(p.name)}: ${p.count} kaza (12 ay)`).addTo(hotLayer);
  }
  if (!layer._fitted && I.items.length) {
    map.fitBounds(I.items.map((x) => [x.lat, x.lng]), { padding: [20, 20], maxZoom: 12 });
    layer._fitted = true;
  }
  $("road-legend").innerHTML = [["--c-kaza", "Kaza"], ["--c-ariza", "Araç arızası"], ["--c-yol", "Yol çalışması / kapanma"], ["--c-diger", "Diğer"]]
    .map(([k, t]) => `<span><i style="background:var(${k})"></i>${t}</span>`).join("") + "<span>Kesikli halka = kara nokta</span>";

  const ol = $("hotspots");
  ol.innerHTML = "";
  const maxC = Math.max(...I.hotspots.map((p) => p.count), 1);
  for (const p of I.hotspots) {
    const li = h("li");
    const bar = h("span", "bar");
    bar.style.width = `${100 * p.count / maxC}%`;
    li.append(h("span", null, p.name), h("span", "c", num(p.count)), bar);
    li.addEventListener("click", () => {
      map.flyTo([p.lat, p.lng], 14, { duration: .6 });
      $("road-map").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    ol.append(li);
  }

  const peak = I.by_hour.indexOf(Math.max(...I.by_hour));
  barChart($("hour-chart"), I.by_hour, {
    label: "Saatlere göre kaza sayısı", highlight: peak,
    tipText: (i, v) => `${String(i).padStart(2, "0")}.00–${String(i + 1).padStart(2, "0")}.00<br><b>${num(v)} kaza</b> <span class="m">(12 ay)</span>`,
  });
}

// --- ısı haritası --------------------------------------------------------------

function mix(a, b, t) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
}

function heat(d) {
  const H = d.heatmap, box = $("heat");
  box.innerHTML = "";
  if (!H) return;
  const c0 = css("--heat-0"), c1 = css("--heat-1");
  const all = H.grid.flat().filter((v) => v != null), maxV = Math.max(...all);
  const nowD = weekday(d.updated), nowH = new Date(d.updated + OFFSET).getUTCHours();
  box.append(h("span"));
  for (let hr = 0; hr < 24; hr++) box.append(h("span", "cl", String(hr).padStart(2, "0")));
  H.grid.forEach((row, di) => {
    box.append(h("span", "rl", DAYS_SHORT[di]));
    row.forEach((v, hr) => {
      const c = h("span", "cell" + (di === nowD && hr === nowH ? " now" : ""));
      c.style.background = v == null ? "transparent" : mix(c0, c1, Math.pow(v / maxV, 1.3));
      c.addEventListener("pointermove", (ev) => showTip(`${DAYS[di]} ${String(hr).padStart(2, "0")}.00<br><b>${num(v)}</b> <span class="m">olağan endeks</span>`, ev.clientX, ev.clientY));
      c.addEventListener("pointerleave", hideTip);
      box.append(c);
    });
  });
  const w = H.worst[0];
  if (w) $("heat-note").textContent = `Haftanın her saatinde olağan trafik endeksi, son 8 hafta (tatiller hariç). ` +
    `En kötüsü ${DAYS[w.day]} ${String(w.hour).padStart(2, "0")}.00 (${num(w.value)}). Çerçeveli kare = şimdi.`;
}

// --- anlık duyurular -----------------------------------------------------------

const LIVE_COLOR = { kaza: "--c-kaza", ariza: "--c-ariza", yol: "--c-yol", diger: "--c-diger" };

function ago(m) {
  if (m < 60) return `${m} dk önce`;
  if (m < 1440) return `${Math.floor(m / 60)} sa ${m % 60 ? `${m % 60} dk ` : ""}önce`;
  return `${Math.floor(m / 1440)} gündür`;
}

function live(d) {
  const card = $("live-card");
  if (!d.live) {
    $("live-note").innerHTML = `Anlık duyurulara şu an ulaşılamıyor; <a href="${esc(d.links.uym)}" target="_blank" rel="noopener">UYM</a>'ye bakabilirsin.`;
    $("live").innerHTML = "";
    return;
  }
  card.hidden = false;
  const row = (x) => {
    const li = h("li");
    const dot = h("span", "dot");
    dot.style.background = `var(${LIVE_COLOR[x.tur] || "--c-diger"})`;
    // yaş, verinin üretildiği andan bu yana geçenle güncellenir
    const age = x.age_min + Math.max(0, Math.round((Date.now() - d.updated) / 60e3));
    li.append(dot, h("span", null, x.text), h("span", "ago", ago(age)));
    return li;
  };
  const recent = d.live.filter((x) => x.age_min < 1440);
  const long = d.live.filter((x) => x.age_min >= 1440);
  const ul = $("live");
  ul.innerHTML = "";
  if (!recent.length) ul.append(h("li", "empty", "Son 24 saatte yeni bir kaza, arıza ya da kapanma duyurusu yok."));
  recent.forEach((x) => ul.append(row(x)));
  const box = $("works-box");
  box.hidden = !long.length;
  $("works-sum").textContent = `Süren yol çalışmaları ve uzun kapanmalar (${long.length})`;
  const w = $("works");
  w.innerHTML = "";
  long.forEach((x) => w.append(row(x)));
  $("live-note").innerHTML = `İBB Ulaşım Yönetim Merkezi'nin anlık duyuruları, ${fTime.format(d.updated)} itibarıyla. ` +
    `Kaynak: <a href="${esc(d.links.uym)}" target="_blank" rel="noopener">uym.ibb.gov.tr</a>`;
}

// --- listeler ---------------------------------------------------------------

function feed(d) {
  const box = $("feed");
  box.innerHTML = "";
  if (!d.feed.length) { box.append(h("li", "empty", "Son iki haftada öne çıkan bir şey yok.")); return; }
  for (const f of d.feed) {
    const li = h("li");
    const w = h("div", "when", fDayTime.format(f.start));
    w.append(h("span", "kind", KIND[f.kind] || f.kind));
    li.append(w, h("p", null, f.text));
    box.append(li);
  }
}

function upcoming(d) {
  const box = $("upcoming");
  box.innerHTML = "";
  if (!d.upcoming.length) { box.append(h("li", "empty", "Önümüzdeki 30 günde takvimde bir şey yok.")); return; }
  const fD = fmt({ day: "numeric", month: "short", weekday: "short" });
  const day = (s) => fD.format(new Date(`${s}T12:00:00+03:00`));
  for (const e of d.upcoming) {
    const li = h("li");
    li.append(h("span", "when", e.start === e.end ? day(e.start) + (e.time ? ` ${e.time}` : "") : `${day(e.start)} – ${day(e.end)}`),
      h("span", null, e.name));
    box.append(li);
  }
}

// --- yol parçaları: canlı harita + ilçe -------------------------------------------

let SEGS = null; // segments.json: { id: { z, n, l, g: [[lat, lng], ...] } }
async function loadSegments() {
  if (SEGS) return SEGS;
  try {
    const r = await fetch("segments.json", { cache: "default" });
    if (r.ok) SEGS = await r.json();
  } catch (_) { /* yoksa bölüm gizlenir */ }
  return SEGS;
}

// hız sınıfı: yolların boşkenki hızına (yoksa 60 km/s) oranla
const SPEED_CLASSES = [[0.75, "--ok", "Açık"], [0.5, "--warn", "Akıcı"], [0.3, "--c-kaza", "Yavaş"], [0, "--full", "Tıkalı"]];
function speedClass(v, ff) {
  const r = v / (ff || 60);
  return SPEED_CLASSES.find(([lim]) => r >= lim);
}
const trLower = (s) => (s || "").toLocaleLowerCase("tr-TR");
const segName = (id) => (SEGS[id] && SEGS[id].n) || "İsimsiz yol";

function syncDistrict(value, from) {
  store("nabiz.ilce", value);
  for (const id of ["district", "r-district"]) {
    const sel = $(id);
    if (id !== from && sel && [...sel.options].some((o) => o.value === value)) sel.value = value;
  }
  drawParking(true);
  drawRoads(true);
}

async function roadsLive(d) {
  const R = d.roads, card = $("roads-live");
  if (!R || !(await loadSegments())) { card.hidden = true; return; }
  card.hidden = false;
  const sel = $("r-district");
  if (!sel.options.length) {
    sel.append(new Option("Tüm İstanbul", ""));
    for (const x of R.districts) sel.append(new Option(x.name, x.name));
    const saved = store("nabiz.ilce");
    if (saved && R.districts.some((x) => x.name === saved)) sel.value = saved;
    sel.addEventListener("change", () => syncDistrict(sel.value, "r-district"));
  }
  $("roads-live-note").textContent = `İBB'nin ölçtüğü ${num(Object.keys(R.s).length)} ana yol parçasında anlık hız, ${fTime.format(R.t)} itibarıyla. ` +
    "Renk, yolun boşkenki hızına göre.";
  $("speed-legend").innerHTML = SPEED_CLASSES.map(([lim, c, t]) => `<span><i style="background:var(${c})"></i>${t}</span>`).join("") +
    "<span>Gri = veri yok</span><span>Büyük daireler = şu anki kaza / arıza / kapanma (UYM)</span>";
  drawRoads(false);
}

function drawRoads(fit) {
  const R = DATA && DATA.roads;
  if (!R || !SEGS) return;
  const name = $("r-district").value;
  const { map, layer } = baseMap("live-map");
  map.invalidateSize();
  layer.clearLayers();
  const canvas = L.canvas({ padding: 0.3 });
  const bounds = [];
  let len = 0, time = 0, fftime = 0, jam = 0;
  const rows = [];
  for (const [id, m] of Object.entries(SEGS)) {
    const s = R.s[id];
    const inD = !name || trLower(m.z) === trLower(name);
    const [, color] = s && s[0] > 0 ? speedClass(s[0], s[1]) : [0, "--closed"];
    L.polyline(m.g, { renderer: canvas, color: css(color), weight: inD ? 4 : 2, opacity: inD ? .95 : .25 })
      .bindTooltip(`${esc(m.n || "İsimsiz yol")}<br><b>${s ? s[0] : "–"} km/s</b>` + (s && s[1] ? ` <span class="m">(boşken ~${s[1]})</span>` : ""))
      .addTo(layer);
    if (!inD || !s || s[0] <= 0) continue;
    if (name) bounds.push(...m.g);
    const ff = s[1] || 60;
    len += m.l; time += m.l / s[0]; fftime += m.l / ff;
    if (s[0] / ff < 0.3) jam += m.l;
    if (m.l >= 200) rows.push({ id, r: s[0] / ff, v: s[0], ff, l: m.l, name: m.n || `#${id}` });
  }
  // UYM anlık duyuruları (geçmiş kayıtlardan bulunan konumuyla)
  for (const x of (DATA.live || []).filter((x) => x.lat && x.age_min < 1440 && x.tur !== "diger")) {
    L.circleMarker([x.lat, x.lng], { radius: x.tur === "kaza" ? 9 : 7, weight: 2, color: "#fff",
      fillColor: css(LIVE_COLOR[x.tur]), fillOpacity: 1 })
      .bindPopup(`<b>${x.tur === "kaza" ? "Kaza" : x.tur === "ariza" ? "Araç arızası" : "Yol çalışması / kapanma"}</b> · ${ago(x.age_min)}<br>${esc(x.text)}` +
        '<br><span style="color:var(--muted)">Konum, aynı yerdeki geçmiş kayıtlardan yaklaşık.</span>')
      .addTo(layer);
  }
  if (fit || !layer._fitted) {
    if (bounds.length) map.fitBounds(bounds, { padding: [16, 16], maxZoom: 14, animate: false });
    else map.setView([41.03, 28.98], 10);
    layer._fitted = true;
  }
  const s = $("rd-stats");
  s.innerHTML = "";
  const stat = (v, k) => { const x = h("div", "stat"); x.append(h("div", "v", v), h("div", "k", k)); s.append(x); };
  const avg = len ? len / time : null, ffAvg = len ? len / fftime : null;
  stat(avg ? `${num(avg)} km/s` : "–", "ortalama hız");
  stat(ffAvg ? `${num(ffAvg)} km/s` : "–", "yollar boşken");
  stat(len ? `%${num(100 * jam / len)}` : "–", "tıkalı yol");
  stat(`${num(len / 1000)} km`, "ölçülen yol");

  const ol = $("slow-list");
  ol.innerHTML = "";
  // aynı adlı yolun parçaları tek satır: en yavaş parçası öne çıkar
  const seen = new Set();
  const slow = rows.sort((a, b) => a.r - b.r).filter((x) => !seen.has(x.name) && seen.add(x.name)).slice(0, 8);
  if (!slow.length) ol.append(h("li", "empty", "Bu bölgede ölçüm yok."));
  for (const x of slow) {
    const li = h("li");
    const bar = h("span", "bar");
    bar.style.width = `${Math.max(4, 100 * x.r)}%`;
    bar.style.background = `var(${speedClass(x.v, x.ff)[1]})`;
    li.append(h("span", null, `${segName(x.id)}${name ? "" : ` · ${SEGS[x.id].z ? SEGS[x.id].z.charAt(0) + trLower(SEGS[x.id].z).slice(1) : ""}`}`),
      h("span", "c", `${x.v} km/s`), bar);
    li.addEventListener("click", () => map.fitBounds(SEGS[x.id].g, { maxZoom: 16, padding: [40, 40] }));
    ol.append(li);
  }
}

// --- rota analizi ---------------------------------------------------------------

const NOMINATIM = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tr&accept-language=tr" +
  "&viewbox=27.95,41.60,29.95,40.75&bounded=1&q=";
const OSRM = "https://router.project-osrm.org/route/v1/driving/";
const route = { from: null, to: null, markers: {}, line: null, busy: false };

function setPoint(which, lat, lng, label) {
  route[which] = { lat, lng, label };
  const { map, layer } = baseMap("route-map");
  if (route.markers[which]) layer.removeLayer(route.markers[which]);
  route.markers[which] = L.marker([lat, lng], { draggable: true, title: which === "from" ? "Nereden" : "Nereye" })
    .bindTooltip(which === "from" ? "A" : "B", { permanent: true, direction: "top" })
    .on("dragend", (e) => { const p = e.target.getLatLng(); setPoint(which, p.lat, p.lng, "Haritadan seçilen nokta"); })
    .addTo(layer);
  $(which === "from" ? "r-from" : "r-to").value = label;
  map.panTo([lat, lng]);
}

async function geocode(q) {
  // Nominatim serbest metinde katı; bulamazsa sadeleştirip (en çok 3 deneme, saniyede bir) tekrar dene
  const plain = q.replace(/\b(metro(su)?|metrobüs|istasyonu|durağı|iskelesi|iskele|meydanı|mahallesi|mah\.?)\b/giu, " ").replace(/\s+/g, " ").trim();
  const tries = [...new Set([q, `${plain}, İstanbul`, plain.split(" ")[0]])].filter(Boolean);
  for (let i = 0; i < tries.length; i++) {
    if (i) await sleep(1100);
    const r = await fetch(NOMINATIM + encodeURIComponent(tries[i]));
    if (!r.ok) throw new Error("Adres servisi şu an yanıt vermiyor.");
    const j = await r.json();
    if (j.length) return { lat: +j[0].lat, lng: +j[0].lon, label: j[0].display_name.split(",").slice(0, 3).join(",") };
  }
  throw new Error(`"${q}" İstanbul içinde bulunamadı; daha genel yaz (ör. "Levent") ya da haritaya dokun.`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function routeInit() {
  if (route.inited) return;
  route.inited = true;
  const { map } = baseMap("route-map");
  map.setView([41.03, 28.98], 10);
  setTimeout(() => map.invalidateSize(), 300);
  map.on("click", (e) => {
    const which = !route.from ? "from" : !route.to ? "to" : "to";
    setPoint(which, e.latlng.lat, e.latlng.lng, "Haritadan seçilen nokta");
    if (route.from && route.to) runRoute();
  });
  for (const id of ["r-from", "r-to"]) $(id).addEventListener("input", () => { route[id === "r-from" ? "from" : "to"] = null; });
  $("r-me").addEventListener("click", () => {
    if (!navigator.geolocation) return msg("Tarayıcın konum vermiyor.");
    msg("Konum alınıyor…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setPoint("from", p.coords.latitude, p.coords.longitude, "Konumum"); msg(""); },
      () => msg("Konum izni verilmedi; adres yazabilir ya da haritaya dokunabilirsin."), { timeout: 10000 });
  });
  $("route-form").addEventListener("submit", (e) => { e.preventDefault(); runRoute(); });
  $("route-legend").innerHTML = SPEED_CLASSES.map(([lim, c, t]) => `<span><i style="background:var(${c})"></i>${t}</span>`).join("") +
    '<span>Gri = İBB ölçümü olmayan kısım</span><span>Rota: <a href="https://project-osrm.org" target="_blank" rel="noopener">OSRM</a> · Adres: <a href="https://nominatim.org" target="_blank" rel="noopener">Nominatim</a></span>';
}

const msg = (t) => { $("route-msg").textContent = t; };

// rota üstündeki İBB parçalarını bul: noktalarının çoğu rotaya 35 m'den yakın ve yönü aynı
function matchSegments(coords) {
  const M = 111320, CELL = 0.0006, NEAR = 35;
  const cos = Math.cos(41 * Math.PI / 180);
  const dense = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const [a1, o1] = coords[i], [a2, o2] = coords[i + 1];
    const d = Math.hypot((a2 - a1) * M, (o2 - o1) * M * cos), n = Math.max(1, Math.ceil(d / 20));
    for (let k = 0; k < n; k++) dense.push([a1 + (a2 - a1) * k / n, o1 + (o2 - o1) * k / n]);
  }
  dense.push(coords[coords.length - 1]);
  const grid = new Map(), key = (a, o) => `${Math.floor(a / CELL)},${Math.floor(o / CELL)}`;
  dense.forEach(([a, o], i) => { const k = key(a, o); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  const nearest = (a, o) => {
    let best = null, bd = Infinity;
    const ca = Math.floor(a / CELL), co = Math.floor(o / CELL);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
      for (const i of grid.get(`${ca + x},${co + y}`) || []) {
        const d = Math.hypot((dense[i][0] - a) * M, (dense[i][1] - o) * M * cos);
        if (d < bd) { bd = d; best = i; }
      }
    }
    return bd <= NEAR ? best : null;
  };
  const out = [];
  for (const [id, m] of Object.entries(SEGS)) {
    const g = m.g, pts = [];
    for (let i = 0; i < g.length - 1; i++) {
      const [a1, o1] = g[i], [a2, o2] = g[i + 1];
      const d = Math.hypot((a2 - a1) * M, (o2 - o1) * M * cos), n = Math.max(1, Math.ceil(d / 25));
      for (let k = 0; k < n; k++) pts.push([a1 + (a2 - a1) * k / n, o1 + (o2 - o1) * k / n]);
    }
    pts.push(g[g.length - 1]);
    if (nearest(pts[0][0], pts[0][1]) == null && nearest(pts[pts.length - 1][0], pts[pts.length - 1][1]) == null
        && nearest(pts[pts.length >> 1][0], pts[pts.length >> 1][1]) == null) continue;
    const idx = pts.map(([a, o]) => nearest(a, o));
    const hit = idx.filter((x) => x != null);
    if (hit.length < 0.7 * pts.length || hit.length < 2) continue;
    if (hit[hit.length - 1] <= hit[0]) continue; // ters yön
    out.push({ id, at: hit[0] });
  }
  return out.sort((a, b) => a.at - b.at);
}

async function runRoute() {
  if (route.busy) return;
  const R = DATA && DATA.roads;
  route.busy = true;
  $("r-go").disabled = true;
  try {
    await loadSegments();
    for (const which of ["from", "to"]) {
      if (route[which]) continue;
      const q = $(which === "from" ? "r-from" : "r-to").value.trim();
      if (!q) throw new Error(which === "from" ? "Nereden başlayacağını yaz ya da haritaya dokun." : "Nereye gideceğini yaz ya da haritaya dokun.");
      msg(`"${q}" aranıyor…`);
      const p = await geocode(q);
      setPoint(which, p.lat, p.lng, p.label);
      await sleep(1100); // Nominatim: saniyede en çok bir istek
    }
    msg("Rota hesaplanıyor…");
    const { from: A, to: B } = route;
    const r = await fetch(`${OSRM}${A.lng},${A.lat};${B.lng},${B.lat}?overview=full&geometries=geojson&steps=true`);
    if (!r.ok) throw new Error("Rota servisi şu an yanıt vermiyor; biraz sonra tekrar dene.");
    const j = await r.json();
    if (!j.routes || !j.routes.length) throw new Error("Bu iki nokta arasında araç rotası bulunamadı.");
    const rt = j.routes[0];
    const coords = rt.geometry.coordinates.map(([o, a]) => [a, o]);
    const { map, layer } = baseMap("route-map");
    map.invalidateSize();
    if (route.line) layer.removeLayer(route.line);
    route.line = L.layerGroup().addTo(layer);
    L.polyline(coords, { color: css("--closed"), weight: 7, opacity: .7 }).addTo(route.line);
    map.fitBounds(coords, { padding: [30, 30] });

    const matched = R && SEGS ? matchSegments(coords) : [];
    // isimsiz İBB parçaları için en yakın OSRM adımının sokak adı
    const stepPts = rt.legs[0].steps.filter((s) => s.name)
      .flatMap((s) => s.geometry.coordinates.map(([o, a]) => [a, o, s.name]));
    const stepName = (g) => {
      const [a, o] = g[g.length >> 1];
      let best = null, bd = Infinity;
      for (const [sa, so, n] of stepPts) {
        const d = (sa - a) ** 2 + ((so - o) * 0.75) ** 2;
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    };
    let mLen = 0, delay = 0, normalDelay = 0, withNormal = 0;
    const stretches = [];
    for (const { id } of matched) {
      const m = SEGS[id], s = R.s[id];
      if (!s || s[0] <= 0) continue;
      const ff = s[1] || 60, [, color, word] = speedClass(s[0], ff);
      L.polyline(m.g, { color: css(color), weight: 6, opacity: .95 })
        .bindTooltip(`${esc(m.n || "İsimsiz yol")}<br><b>${s[0]} km/s</b> · ${word}`).addTo(route.line);
      mLen += m.l;
      const d = m.l / 1000 * (1 / s[0] - 1 / ff) * 3600; // sn
      delay += d;
      if (s[2]) { normalDelay += m.l / 1000 * (1 / s[2] - 1 / ff) * 3600; withNormal += m.l; }
      const last = stretches[stretches.length - 1], name = m.n || stepName(m.g) || "İsimsiz yol";
      if (last && last.name === name) { last.l += m.l; last.t += m.l / s[0]; last.d += d; }
      else stretches.push({ name, l: m.l, t: m.l / s[0], d, id });
    }
    delay = Math.max(0, delay);
    const base = rt.duration, now = base + delay;
    const out = $("route-out");
    out.innerHTML = "";
    const eta = h("div", "eta");
    const mins = (s) => Math.max(1, Math.round(s / 60));
    eta.innerHTML = `<div class="big">~${mins(now)} dk <small>· ${num(rt.distance / 1000, 1)} km</small></div>` +
      `<p>Yollar boşken ~${mins(base)} dk · <span class="delay ${delay >= 120 ? "up" : "ok"}">${delay >= 60 ? `+${mins(delay)} dk gecikme` : "gecikme yok"}</span></p>` +
      (withNormal > mLen / 2 ? `<p>Bu gün ve saatte normalde gecikme ~${mins(Math.max(0, normalDelay))} dk.</p>` : "") +
      `<p>Rotanın ${num(mLen / 1000, 1)} km'si (%${num(100 * mLen / rt.distance)}) İBB'nin ölçtüğü yollardan; kalanı için OSRM süresi kullanıldı.</p>`;
    out.append(eta);

    const live = (DATA.live || []).filter((x) => x.age_min < 180 && x.tur !== "diger");
    const names = new Set([...stretches.map((x) => x.name), ...rt.legs[0].steps.map((s) => s.name)]
      .filter((n) => n && n.length >= 5).map(trLower));
    const onRoute = live.filter((x) => [...names].some((n) => trLower(x.text).includes(n)));
    for (const x of onRoute.slice(0, 3)) out.append(h("p", "route-warn", `⚠️ Rotanda (${ago(x.age_min)}): ${x.text}`));

    const worst = stretches.filter((x) => x.d > 30).sort((a, b) => b.d - a.d).slice(0, 5);
    if (worst.length) {
      out.append(h("h3", null, "Seni en çok yavaşlatacak yerler"));
      const ol = h("ol", "hot");
      for (const x of worst) {
        const li = h("li");
        li.append(h("span", null, x.name), h("span", "c", `+${mins(x.d)} dk`));
        const sub = h("span", "bar");
        sub.style.width = `${Math.min(100, 100 * x.d / worst[0].d)}%`;
        li.append(sub);
        li.title = `${num(x.l / 1000, 1)} km, ortalama ${num(x.l / x.t)} km/s`;
        li.addEventListener("click", () => map.fitBounds(SEGS[x.id].g, { maxZoom: 16, padding: [40, 40] }));
        ol.append(li);
      }
      out.append(ol);
    } else if (mLen) out.append(h("p", "note", "Rotanda belirgin bir yavaşlama yok."));
    msg("");
  } catch (e) {
    msg(e.message || "Rota hesaplanamadı.");
  } finally {
    route.busy = false;
    $("r-go").disabled = false;
  }
}

// --- çizim ------------------------------------------------------------------

let DATA = null;
function render() {
  const d = DATA;
  $("updated").textContent = `Son güncelleme ${fDayTime.format(d.updated)}`;
  hero(d);
  live(d);
  const tr = d.traffic;
  if (tr) {
    const day0 = localDay(tr.now.t);
    $("today-title").textContent = `Bugün, olağan bir ${DAYS[weekday(day0)]} ile`;
    lineChart($("today-chart"), {
      points: tr.today, band: tr.typical, x0: day0, x1: day0 + DAY, nowT: tr.now.t, aria: "Bugünün trafik endeksi ve olağan gün",
      ticks: Array.from({ length: 7 }, (_, i) => day0 + (i + 1) * 3 * 3600e3), tickLabel: (t) => fTime.format(t),
    });
    const x1 = d.updated, x0 = x1 - 7 * DAY;
    const hl = d.feed.filter((f) => f.series === tr.label).map((f) => [f.start, f.end]);
    lineChart($("week-chart"), { points: tr.week, band: tr.band, x0, x1, highlights: hl, aria: "Son 7 gün trafik endeksi",
      ticks: dayTicks(x0, x1), tickLabel: (t) => fTick.format(t) });
    rainChart($("rain-chart"), d.rain, x0, x1);
  }
  parking(d);
  roadsLive(d);
  routeInit();
  roads(d);
  heat(d);
  feed(d);
  upcoming(d);
}

async function main() {
  try {
    DATA = await load();
    render();
  } catch (e) {
    console.error(e);
    $("updated").textContent = "Veri şu an alınamadı, birazdan tekrar dene.";
  }
}

let rt, lastW = innerWidth;
addEventListener("resize", () => {
  if (innerWidth === lastW) return; // mobilde adres çubuğu kayınca yeniden çizme
  lastW = innerWidth;
  clearTimeout(rt);
  rt = setTimeout(() => DATA && render(), 150);
});
setInterval(main, 5 * 60e3);
main();
