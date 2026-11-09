// Statik içerikli sayfalar: Harita Rehberi, Veriler, Yöntem.
import { state, subscribe } from "./state.js";
import { t } from "./i18n.js";
import { fmtNum } from "./format.js";
import { GROUP_COLORS, GROUP_FACTORS, FACTOR_TABLE } from "./data.js";
import { onView } from "./views.js";
import { renderDataCharts } from "./charts.js";

const $ = (id) => document.getElementById(id);
const GUIDE_SOURCES = ["coal", "gas", "biomass", "solar", "geothermal", "hydro", "wind"];
const DEFAULT_THRESHOLDS = { clean_below: 300, dirty_from: 450 };

// ---------- Harita Rehberi ----------

export function renderGuide(latest) {
  const th = latest?.thresholds ?? DEFAULT_THRESHOLDS;
  $("g-clean").textContent = fmtNum(th.clean_below);
  $("g-dirty").textContent = fmtNum(th.dirty_from);
  $("g-scale-text").textContent = t("guide_scale")(fmtNum(th.clean_below), fmtNum(th.dirty_from));
  for (const st of ["clean", "medium", "dirty"]) $(`g-st-${st}`).textContent = t("status")[st];

  $("guide-source-list").replaceChildren(...GUIDE_SOURCES.map((g) => {
    const li = document.createElement("li");
    li.className = "source-chip";
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = GROUP_COLORS[g];
    const name = document.createElement("span");
    name.className = "chip-name";
    name.textContent = t("groups")[g];
    const val = document.createElement("span");
    val.className = "chip-val";
    val.textContent = `${fmtNum(GROUP_FACTORS[g])} gCO₂eq/kWh`;
    li.append(sw, name, val);
    return li;
  }));

  $("guide-use-list").replaceChildren(...t("guide_use").map((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    return li;
  }));
}

// ---------- Yöntem ----------

export function renderMethod() {
  $("factor-rows").replaceChildren(...FACTOR_TABLE.map((row) => {
    const tr = document.createElement("tr");
    const [name, note] = row[state.lang];
    const cells = [name, fmtNum(row.g), note].map((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      return td;
    });
    tr.append(...cells);
    return tr;
  }));
}

// ---------- Kayıt ----------

let ctx = null;

onView("/rehber", {
  static: true,
  init(data) {
    ctx = data;
    subscribe(["lang"], () => {
      if (state.route === "/rehber") renderGuide(ctx?.latest);
    });
  },
  show(data) {
    renderGuide(data?.latest);
  },
});

onView("/yontem", {
  static: true,
  init() {
    subscribe(["lang"], () => {
      if (state.route === "/yontem") renderMethod();
    });
  },
  show() {
    renderMethod();
  },
});

onView("/veriler", {
  init(data) {
    ctx = data;
    const redraw = () => {
      if (state.route === "/veriler") renderDataCharts(ctx.latest, ctx.monthly);
    };
    subscribe(["lang"], redraw);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  },
  show(data) {
    renderDataCharts(data.latest, data.monthly);
  },
});
