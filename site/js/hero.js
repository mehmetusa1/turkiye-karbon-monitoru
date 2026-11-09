// Ana sayfa banner'ı: gece ışıklarıyla parlayan Türkiye ve iller arası akan enerji hatları.
import { intensityToRgb, rgb } from "./data.js";

const SVG_NS = "http://www.w3.org/2000/svg";
let built = false;

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Her ili en yakın 2 komşusuna bağlayan, tekrarsız kenar listesi. */
function nearestEdges(provinces, k = 2) {
  const seen = new Set();
  const edges = [];
  provinces.forEach((a, i) => {
    provinces
      .map((b, j) => ({ j, d: Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) }))
      .filter((x) => x.j !== i)
      .sort((x, y) => x.d - y.d)
      .slice(0, k)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push([a.center, provinces[j].center]);
        }
      });
  });
  return edges;
}

function buildMap(svg, provinces) {
  const land = el("g", { class: "hero-land" });
  for (const p of provinces) land.append(el("path", { d: p.path }));

  const grid = el("g", { class: "hero-grid" });
  nearestEdges(provinces).forEach(([[x1, y1], [x2, y2]], i) => {
    const d = `M${x1},${y1}L${x2},${y2}`;
    const base = el("path", { d, class: "hero-wire" });
    const pulse = el("path", { d, pathLength: 1, class: "hero-pulse" });
    pulse.style.setProperty("--d", `${(i % 17) * 0.37}s`);
    grid.append(base, pulse);
  });

  const lights = el("g", { class: "hero-lights" });
  provinces.forEach((p, i) => {
    const big = p.name === "İstanbul" || p.name === "Ankara" || p.name === "İzmir";
    const dot = el("circle", { cx: p.center[0], cy: p.center[1], r: big ? 3.6 : 2 });
    dot.style.setProperty("--d", `${(i % 9) * 0.45}s`);
    lights.append(dot);
  });

  const antalya = provinces.find((p) => p.name === "Antalya");
  if (antalya) {
    const [cx, cy] = antalya.center;
    lights.append(el("circle", { cx, cy, r: 9, class: "hero-cop-ring" }));
  }
  svg.append(land, grid, lights);
}

let onPointer = null;
let parallaxOn = false;

function setupParallax(art) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!matchMedia("(pointer: fine)").matches) return;
  let frame = 0;
  let tx = 0;
  let ty = 0;
  onPointer = (e) => {
    tx = (e.clientX / window.innerWidth - 0.5) * 2;
    ty = (e.clientY / window.innerHeight - 0.5) * 2;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      art.style.setProperty("--px", tx.toFixed(3));
      art.style.setProperty("--py", ty.toFixed(3));
    });
  };
}

/** Parallax dinleyicisi yalnızca ana sayfa görünürken bağlı kalır. */
export function setHeroActive(on) {
  if (!onPointer || on === parallaxOn) return;
  parallaxOn = on;
  if (on) window.addEventListener("pointermove", onPointer, { passive: true });
  else window.removeEventListener("pointermove", onPointer);
}

/** Banner haritasını (bir kez) çizer ve rengini son saatin yoğunluğuna göre ayarlar. */
export function renderHero(latest, map) {
  const art = document.getElementById("hero-art");
  if (!built) {
    buildMap(document.getElementById("hero-map"), map.provinces);
    setupParallax(art);
    built = true;
  }
  const color = rgb(intensityToRgb(latest.hours.at(-1).intensity));
  art.style.setProperty("--grid-color", color);
}
