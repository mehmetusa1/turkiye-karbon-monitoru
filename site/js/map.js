// Harita görünümü: 81 il, 3B kabartma, zoom/pan, saat oynatma, lejant ve hover kartı.
import { state, set, subscribe } from "./state.js";
import { t, applyText } from "./i18n.js";
import { fmtNum, fmtDayHour } from "./format.js";
import { estimateProvinceHour, intensityToRgb, rgb, GROUP_COLORS, slugify } from "./data.js";
import { navigate } from "./router.js";
import { onView } from "./views.js";
import { showTooltip, hideTooltip } from "./tooltip.js";
import { initPanel } from "./panel.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FULL_BOX = [0, 0, 1000, 460];
const MIN_ZOOM_WIDTH = 180;
const MAX_ZOOM_WIDTH = 1000;
const ASPECT = 460 / 1000;
const LEGEND_SOURCES = ["solar", "wind", "hydro", "geothermal", "biomass", "gas", "coal"];

const $ = (id) => document.getElementById(id);
const provinceEls = new Map(); // ad → { prov, g, shadow, wall, top, est }
const bySlug = new Map();      // slug → ad
let ctx = null;
let currentBox = [...FULL_BOX];
let animId = null;
let playId = null;
let isPanning = false;
let didDrag = false;
let dragStart = [0, 0];
let dragBox = [...FULL_BOX];
let hoverName = null;

// ---------- Dışa açık yardımcılar (panel kullanır) ----------

export const provinceBySlug = (slug) => bySlug.get(slug) ?? null;
export const getProvince = (name) => provinceEls.get(name)?.prov ?? null;
export const getEstimate = (name) => provinceEls.get(name)?.est ?? null;
export const provinceElement = (name) => provinceEls.get(name)?.g ?? null;

// ---------- Zoom / pan ----------

function clampBox([x, y, w]) {
  const cw = Math.max(MIN_ZOOM_WIDTH, Math.min(MAX_ZOOM_WIDTH, w));
  const ch = cw * ASPECT;
  return [Math.max(-40, Math.min(1040 - cw, x)), Math.max(-30, Math.min(490 - ch, y)), cw, ch];
}

function applyBox(box) {
  currentBox = clampBox(box);
  $("tr-map").setAttribute("viewBox", currentBox.map((v) => v.toFixed(1)).join(" "));
}

function animateBox(target, duration = 420) {
  if (animId) cancelAnimationFrame(animId);
  const goal = clampBox(target);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    applyBox(goal);
    return;
  }
  const start = [...currentBox];
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    const e = 1 - (1 - p) ** 3;
    applyBox(start.map((s, i) => s + (goal[i] - s) * e));
    animId = p < 1 ? requestAnimationFrame(step) : null;
  };
  animId = requestAnimationFrame(step);
}

function zoomBy(factor) {
  const [vx, vy, vw, vh] = currentBox;
  const nw = Math.max(MIN_ZOOM_WIDTH, Math.min(MAX_ZOOM_WIDTH, vw * factor));
  const cx = vx + vw / 2;
  const cy = vy + vh / 2;
  animateBox([cx - nw / 2, cy - (nw * ASPECT) / 2, nw], 240);
}

export function zoomToCity(name) {
  const prov = getProvince(name);
  if (!prov) return;
  const [cx, cy] = prov.center;
  const w = 560;
  // Masaüstünde sağ panel haritanın bir kısmını örter: ili görünür alanın ortasına kaydır
  let shift = 0;
  const vp = $("map-viewport").getBoundingClientRect();
  if (window.innerWidth > 760 && vp.width > 0) {
    const panelSpace = Math.min(430, window.innerWidth - 16) + 8;
    const covered = Math.max(0, panelSpace - (window.innerWidth - vp.right));
    const scale = Math.min(vp.width / w, vp.height / (w * ASPECT)); // px / svg birimi (meet)
    shift = covered / 2 / scale;
  }
  animateBox([cx + shift - w / 2, cy - (w * ASPECT) / 2, w], 480);
}

export function resetMapZoom() {
  animateBox(FULL_BOX, 420);
}

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform ?? "");
let hintTimer = 0;

function showWheelHint() {
  const hint = $("map-wheel-hint");
  if (!hint) return;
  hint.textContent = t("wheel_hint")(IS_MAC ? "⌘" : "Ctrl");
  hint.hidden = false;
  requestAnimationFrame(() => hint.classList.add("is-visible"));
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hint.classList.remove("is-visible");
    hintTimer = setTimeout(() => { hint.hidden = true; }, 250);
  }, 1400);
}

function setupZoomPan() {
  const viewport = $("map-viewport");
  const svg = $("tr-map");

  viewport.addEventListener("wheel", (e) => {
    // Sayfa kaydırılabiliyorsa düz tekerlek sayfayı kaydırır; yakınlaştırma Ctrl/⌘ (veya
    // touchpad sıkıştırma, tarayıcı ctrlKey ile gönderir) ile yapılır.
    const pageScrolls = document.documentElement.scrollHeight > window.innerHeight + 1;
    if (pageScrolls && !e.ctrlKey && !e.metaKey) {
      showWheelHint();
      return;
    }
    e.preventDefault();
    if (animId) cancelAnimationFrame(animId);
    const rect = svg.getBoundingClientRect();
    const rx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ry = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const [vx, vy, vw, vh] = currentBox;
    const nw = Math.max(MIN_ZOOM_WIDTH, Math.min(MAX_ZOOM_WIDTH, vw * (e.deltaY < 0 ? 0.84 : 1.19)));
    const ax = vx + rx * vw;
    const ay = vy + ry * vh;
    applyBox([ax - rx * nw, ay - ry * nw * ASPECT, nw]);
  }, { passive: false });

  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".zoom-controls")) return;
    isPanning = true;
    didDrag = false;
    dragStart = [e.clientX, e.clientY];
    dragBox = [...currentBox];
  });
  const endPan = () => {
    if (!isPanning) return;
    isPanning = false;
    viewport.classList.remove("dragging");
  };
  window.addEventListener("pointermove", (e) => {
    if (!isPanning) return;
    const dx = e.clientX - dragStart[0];
    const dy = e.clientY - dragStart[1];
    if (!didDrag && Math.hypot(dx, dy) > 4) {
      didDrag = true;
      viewport.classList.add("dragging");
      hideTooltip();
    }
    if (!didDrag) return;
    const rect = svg.getBoundingClientRect();
    applyBox([dragBox[0] - dx * (dragBox[2] / rect.width), dragBox[1] - dy * (dragBox[3] / rect.height), dragBox[2]]);
  });
  window.addEventListener("pointerup", endPan);
  window.addEventListener("pointercancel", endPan);
  window.addEventListener("blur", endPan);

  $("zoom-in-btn").addEventListener("click", () => zoomBy(0.75));
  $("zoom-out-btn").addEventListener("click", () => zoomBy(1.33));
  $("reset-zoom-btn").addEventListener("click", resetMapZoom);
}

// ---------- İl seçimi ----------

function openProvince(name) {
  const slug = slugify(name);
  // Panel zaten açıksa iller arası geçiş geçmişi doldurmasın
  navigate("/harita", { il: slug }, { replace: Boolean(state.params.il) });
}

function pointInViewport(e) {
  const vp = $("map-viewport").getBoundingClientRect();
  return { x: e.clientX - vp.left, y: e.clientY - vp.top };
}

function centerInViewport(g) {
  const vp = $("map-viewport").getBoundingClientRect();
  const r = g.getBoundingClientRect();
  return { x: r.left + r.width / 2 - vp.left, y: r.top + r.height / 2 - vp.top };
}

function buildDom() {
  const svg = $("tr-map");
  const provinces = ctx.map.provinces;

  const select = $("city-select");
  const none = document.createElement("option");
  none.value = "";
  none.dataset.i18n = "select_city_none";
  select.append(none);
  for (const p of [...provinces].sort((a, b) => a.name.localeCompare(b.name, "tr"))) {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = `${String(p.id).padStart(2, "0")} ${p.name}`;
    select.append(opt);
  }
  select.addEventListener("change", () => {
    if (select.value && provinceEls.has(select.value)) openProvince(select.value);
  });

  // Kuzeyden güneye çizim: güneydeki illerin "duvarı" kuzeydekinin üstünde kalır
  for (const prov of [...provinces].sort((a, b) => a.center[1] - b.center[1])) {
    bySlug.set(slugify(prov.name), prov.name);
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "prov");
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    const mk = (cls) => {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", prov.path);
      p.setAttribute("class", cls);
      return p;
    };
    const shadow = mk("prov-shadow");
    const wall = mk("prov-wall");
    const top = mk("prov-top");
    g.append(shadow, wall, top);

    g.addEventListener("click", (e) => {
      e.stopPropagation();
      if (didDrag) return; // sürükleme sonunda yanlışlıkla seçim olmasın
      openProvince(prov.name);
    });
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openProvince(prov.name);
      }
    });
    g.addEventListener("pointermove", (e) => {
      if (isPanning && didDrag) return;
      hoverName = prov.name;
      showTooltip(prov, provinceEls.get(prov.name).est, ctx.latest.thresholds, pointInViewport(e));
    });
    g.addEventListener("pointerleave", () => {
      hoverName = null;
      hideTooltip();
    });
    g.addEventListener("focus", () => {
      hoverName = prov.name;
      showTooltip(prov, provinceEls.get(prov.name).est, ctx.latest.thresholds, centerInViewport(g));
    });
    g.addEventListener("blur", () => {
      hoverName = null;
      hideTooltip();
    });

    svg.append(g);
    provinceEls.set(prov.name, { prov, g, shadow, wall, top, est: null });
  }

  const antalya = getProvince("Antalya");
  if (antalya) {
    const [cx, cy] = antalya.center;
    const marker = document.createElementNS(SVG_NS, "g");
    marker.setAttribute("id", "cop-marker");
    marker.setAttribute("aria-hidden", "true");
    for (const [r, cls] of [[7, "cop-ring"], [3.5, "cop-dot"]]) {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", cx);
      c.setAttribute("cy", cy - 5);
      c.setAttribute("r", r);
      c.setAttribute("class", cls);
      marker.append(c);
    }
    svg.append(marker);
  }
}

// ---------- Çizim ----------

function renderLegend() {
  const intensity = state.mapMode === "intensity";
  $("legend-intensity").hidden = !intensity;
  $("legend-source").hidden = intensity;
  $("legend-mid").textContent = fmtNum(ctx.latest.thresholds.dirty_from);
  $("legend-source-list").replaceChildren(...LEGEND_SOURCES.map((g) => {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = GROUP_COLORS[g];
    li.append(dot, document.createTextNode(t("groups")[g]));
    return li;
  }));
}

function renderControls() {
  const intensity = state.mapMode === "intensity";
  $("mode-intensity").setAttribute("aria-pressed", String(intensity));
  $("mode-source").setAttribute("aria-pressed", String(!intensity));
  $("hour-slider").value = String(state.hourIndex);
  const hour = ctx.latest.hours[state.hourIndex] ?? ctx.latest.hours.at(-1);
  $("hour-output").textContent = fmtDayHour(hour.time);
  $("city-select").value = state.city ?? "";
  const playing = Boolean(playId);
  $("play-btn").setAttribute("aria-pressed", String(playing));
  $("play-label").textContent = playing ? t("pause") : t("play");
  $("icon-play").setAttribute("visibility", playing ? "hidden" : "visible");
  $("icon-pause").setAttribute("visibility", playing ? "visible" : "hidden");
}

export function renderMap() {
  if (!ctx) return;
  const hour = ctx.latest.hours[state.hourIndex] ?? ctx.latest.hours.at(-1);
  const sourceMode = state.mapMode === "source";

  for (const [name, entry] of provinceEls) {
    const est = estimateProvinceHour(entry.prov.capacity_pct, hour.mix_pct);
    entry.est = est;
    const base = sourceMode
      ? (GROUP_COLORS[est.dominant] ?? "#3d8fe0").match(/\w\w/g).map((h) => parseInt(h, 16))
      : intensityToRgb(est.intensity);
    const selected = name === state.city;
    const lift = selected ? 12 : sourceMode ? 3 : Math.round(1.5 + est.renewable_share * 3.5);

    entry.top.style.fill = rgb(base);
    entry.top.setAttribute("transform", `translate(0, ${-lift})`);
    const wall = rgb(base.map((v) => Math.round(v * 0.58)));
    entry.wall.style.fill = wall;
    entry.wall.style.stroke = wall;
    entry.wall.setAttribute("stroke-width", selected ? "3" : "1.2");
    entry.wall.setAttribute("transform", `translate(0, ${-Math.round(lift * 0.45)})`);
    entry.shadow.setAttribute("transform", selected ? "translate(2, 8)" : "translate(0, 3.5)");
    entry.g.classList.toggle("is-selected", selected);
    entry.g.setAttribute("aria-label",
      t("province_aria")(name, fmtNum(est.intensity), t("groups")[est.dominant] ?? est.dominant));
  }

  // Seçili il en üstte çizilsin, COP işareti onun da üstünde
  const svg = $("tr-map");
  const chosen = provinceEls.get(state.city);
  if (chosen && svg.lastElementChild !== chosen.g) {
    const focused = document.activeElement === chosen.g;
    svg.append(chosen.g);
    if (focused) chosen.g.focus({ preventScroll: true });
  }
  const marker = $("cop-marker");
  if (marker) svg.append(marker);

  // Açık hover kartını yeni saate göre tazele
  if (hoverName && !$("map-tooltip").hidden) {
    const e = provinceEls.get(hoverName);
    const tip = $("map-tooltip");
    const m = /translate\((-?\d+)px, (-?\d+)px\)/.exec(tip.style.transform);
    if (e && m) showTooltip(e.prov, e.est, ctx.latest.thresholds, { x: Number(m[1]) - 14, y: Number(m[2]) - 14 });
  }

  renderControls();
  renderLegend();
}

// ---------- Saat oynatma ----------

function stopPlay() {
  if (!playId) return;
  clearInterval(playId);
  playId = null;
  renderControls();
}

function togglePlay() {
  if (playId) {
    stopPlay();
    return;
  }
  playId = setInterval(() => {
    set({ hourIndex: (state.hourIndex + 1) % ctx.latest.hours.length });
  }, 700);
  renderControls();
}

// ---------- Lejant ----------

function setupLegend() {
  const btn = $("legend-btn");
  const pop = $("legend-pop");
  const close = (refocus) => {
    if (pop.hidden) return;
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (refocus) btn.focus();
  };
  btn.addEventListener("click", () => {
    const open = pop.hidden;
    pop.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !pop.hidden) {
      e.stopPropagation();
      close(true);
    }
  }, true);
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !e.target.closest(".legend-wrap")) close(false);
  });
  pop.querySelector(".legend-more").addEventListener("click", () => close(false));
}

// ---------- Görünüm kaydı ----------

function init(data) {
  ctx = data;
  buildDom();
  applyText($("tr-map").closest("[data-view]"));
  setupZoomPan();
  setupLegend();

  $("mode-intensity").addEventListener("click", () => set({ mapMode: "intensity" }));
  $("mode-source").addEventListener("click", () => set({ mapMode: "source" }));
  $("play-btn").addEventListener("click", togglePlay);
  const slider = $("hour-slider");
  slider.max = String(ctx.latest.hours.length - 1);
  slider.addEventListener("input", () => {
    stopPlay();
    set({ hourIndex: Number(slider.value) });
  });

  subscribe(["hourIndex", "mapMode", "city", "lang"], () => {
    if (state.route === "/harita") renderMap();
  });
  renderMap();
  initPanel(data); // map aboneliklerinden sonra: panel güncel tahminleri okur
}

onView("/harita", {
  init,
  show(data, params) {
    const name = params.il ? provinceBySlug(params.il) : null;
    const prev = state.city;
    set({ city: name });
    if (state.city === prev) renderMap(); // durum değişmediyse abonelik tetiklenmez
    if (name && name !== prev) zoomToCity(name);
  },
  hide() {
    stopPlay();
    hideTooltip();
  },
});
