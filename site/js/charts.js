// Chart.js grafikleri: il paneli (24 saat, aylık geçmiş, kurulu güç) ve Veriler sayfası.
// Chart.js yüklenemezse grafik alanına açıklayıcı metin yazılır; site çalışmaya devam eder.
import { t } from "./i18n.js";
import { fmtNum, fmtHour, fmtMonth } from "./format.js";
import { GROUP_COLORS, GROUP_ORDER } from "./data.js";

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function theme() {
  return { text: cssVar("--muted"), strong: cssVar("--text"), grid: cssVar("--grid") };
}

/** Chart.js yoksa kutudaki canvas'ın yerine metin koyar ve false döner. */
function ensureChart(box) {
  if (window.Chart) return true;
  if (!box.querySelector(".chart-failed")) {
    const p = document.createElement("p");
    p.className = "chart-failed";
    p.textContent = t("chart_failed");
    box.replaceChildren(p);
  }
  return false;
}

function baseOptions(extra = {}) {
  const c = theme();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 350 },
    interaction: { mode: "index", intersect: false },
    color: c.text,
    font: { family: "Manrope, system-ui, sans-serif" },
    plugins: {
      legend: { labels: { color: c.text, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "rectRounded" } },
      tooltip: { titleFont: { family: "Fraunces, Georgia, serif" }, bodyFont: { family: "Manrope, system-ui" } },
    },
    ...extra,
  };
}

/** Panel grafiklerinde yoğunluk çizgisi dahil küçük alt lejant. */
const panelLegend = () => ({
  position: "bottom",
  labels: { color: theme().text, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "rectRounded", font: { size: 11 }, padding: 10 },
});

const xAxis = (c, stacked = false) => ({
  stacked,
  ticks: { color: c.text, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 },
  grid: { color: c.grid },
});

/** Bir grafik oluşturur; build(chart|null) her güncellemede config'i yeniden üretir. */
function managed(canvas, build) {
  const box = canvas.parentElement; // canvas metinle değiştirilse de kutu sabit kalır
  let chart = null;
  return {
    update(input) {
      if (!box || !ensureChart(box)) return;
      const cfg = build(input);
      if (!chart) {
        chart = new window.Chart(canvas, cfg);
      } else {
        chart.data = cfg.data;
        chart.options = cfg.options;
        chart.update();
      }
    },
    destroy() {
      chart?.destroy();
      chart = null;
    },
  };
}

// ---------- İl paneli ----------

/** input: { series: provinceDaySeries çıktısı, name } */
export function createPanelDayChart(canvas) {
  return managed(canvas, ({ series, name }) => {
    const c = theme();
    canvas.setAttribute("aria-label", t("panel_day_aria")(name));
    return {
      type: "line",
      data: {
        labels: series.times.map(fmtHour),
        datasets: [
          {
            label: t("intensity_series"), data: series.intensity, yAxisID: "g", order: 0,
            borderColor: c.strong, backgroundColor: c.strong, borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false,
          },
          ...Object.entries(series.mix).map(([g, values]) => ({
            label: t("groups")[g], data: values, yAxisID: "pct", stack: "mix", order: 1,
            borderColor: GROUP_COLORS[g], backgroundColor: `${GROUP_COLORS[g]}cc`,
            borderWidth: 0, pointRadius: 0, tension: 0.3, fill: true,
          })),
        ],
      },
      options: baseOptions({
        plugins: { ...baseOptions().plugins, legend: panelLegend() },
        scales: {
          x: xAxis(c),
          pct: { stacked: true, min: 0, max: 100, ticks: { color: c.text, callback: (v) => `${v}%` }, grid: { color: c.grid } },
          g: { position: "right", grid: { drawOnChartArea: false }, ticks: { color: c.text } },
        },
      }),
    };
  });
}

/** input: { months: [{month, avg_intensity, mix_pct}], name } */
export function createPanelHistoryChart(canvas) {
  return managed(canvas, ({ months, name }) => {
    const c = theme();
    canvas.setAttribute("aria-label", t("panel_history_aria")(name));
    const groups = GROUP_ORDER.filter((g) => months.some((m) => (m.mix_pct[g] ?? 0) > 0));
    return {
      data: {
        labels: months.map((m) => fmtMonth(m.month)),
        datasets: [
          {
            type: "line", label: t("intensity_series"), data: months.map((m) => m.avg_intensity), yAxisID: "g", order: 0,
            borderColor: c.strong, backgroundColor: c.strong, borderWidth: 2, pointRadius: 2, tension: 0.3,
          },
          ...groups.map((g) => ({
            type: "bar", label: t("groups")[g], data: months.map((m) => m.mix_pct[g] ?? 0),
            backgroundColor: GROUP_COLORS[g], stack: "mix", yAxisID: "pct", order: 1, borderRadius: 2,
          })),
        ],
      },
      options: baseOptions({
        plugins: { ...baseOptions().plugins, legend: panelLegend() },
        scales: {
          x: xAxis(c, true),
          pct: { stacked: true, min: 0, max: 100, ticks: { color: c.text, callback: (v) => `${v}%` }, grid: { color: c.grid } },
          g: { position: "right", grid: { drawOnChartArea: false }, ticks: { color: c.text } },
        },
      }),
    };
  });
}

/** input: { capacity: {grup: yüzde}, name } */
export function createCapacityChart(canvas) {
  return managed(canvas, ({ capacity, name }) => {
    canvas.setAttribute("aria-label", t("panel_capacity_aria")(name));
    const entries = Object.entries(capacity).sort((a, b) => b[1] - a[1]);
    return {
      type: "doughnut",
      data: {
        labels: entries.map(([g]) => t("groups")[g] ?? g),
        datasets: [{
          data: entries.map(([, v]) => v),
          backgroundColor: entries.map(([g]) => GROUP_COLORS[g] ?? "#888"),
          borderColor: cssVar("--surface"),
          borderWidth: 2,
        }],
      },
      options: baseOptions({
        cutout: "62%",
        interaction: { mode: "nearest", intersect: true },
        plugins: { ...baseOptions().plugins, legend: { display: false } },
      }),
    };
  });
}

// ---------- Veriler sayfası ----------

let dayChart = null;
let yearChart = null;

export function renderDataCharts(latest, monthly) {
  const dayCanvas = document.getElementById("day-chart");
  const yearCanvas = document.getElementById("year-chart");
  dayChart ??= managed(dayCanvas, () => {
    const c = theme();
    const hours = latest.hours;
    const groups = GROUP_ORDER.filter((g) => hours.some((h) => (h.mix_pct[g] ?? 0) > 0));
    const vals = hours.map((h) => h.intensity);
    dayCanvas.setAttribute("aria-label", t("day_aria")(fmtNum(Math.min(...vals)), fmtNum(Math.max(...vals))));
    return {
      data: {
        labels: hours.map((h) => fmtHour(h.time)),
        datasets: [
          {
            type: "line", label: t("intensity_series"), data: vals, yAxisID: "g", order: 0,
            borderColor: c.strong, backgroundColor: c.strong, borderWidth: 2, pointRadius: 0, tension: 0.3,
          },
          ...groups.map((g) => ({
            type: "bar", label: t("groups")[g], data: hours.map((h) => h.mix_pct[g] ?? 0),
            backgroundColor: GROUP_COLORS[g], stack: "mix", yAxisID: "pct", order: 1,
          })),
        ],
      },
      options: baseOptions({
        scales: {
          x: xAxis(c, true),
          pct: {
            stacked: true, position: "left", min: 0, max: 100,
            title: { display: true, text: t("share_axis"), color: c.text },
            ticks: { color: c.text, callback: (v) => `${v}%` }, grid: { color: c.grid },
          },
          g: {
            position: "right", grid: { drawOnChartArea: false },
            title: { display: true, text: "gCO₂eq/kWh", color: c.text }, ticks: { color: c.text },
          },
        },
      }),
    };
  });
  yearChart ??= managed(yearCanvas, () => {
    const c = theme();
    const months = monthly.months;
    const vals = months.map((m) => m.avg_intensity);
    yearCanvas.setAttribute("aria-label", t("year_aria")(fmtNum(Math.min(...vals)), fmtNum(Math.max(...vals))));
    return {
      data: {
        labels: months.map((m) => fmtMonth(m.month)),
        datasets: [
          {
            type: "line", label: t("intensity_series"), data: vals, yAxisID: "g", order: 0,
            borderColor: c.strong, backgroundColor: c.strong, borderWidth: 2, tension: 0.3,
          },
          {
            type: "bar", label: t("renewable_series"), yAxisID: "pct", order: 1, borderRadius: 4,
            data: months.map((m) => Math.round(m.avg_renewable_share * 1000) / 10),
            backgroundColor: GROUP_COLORS.wind,
          },
        ],
      },
      options: baseOptions({
        scales: {
          x: xAxis(c),
          g: {
            position: "left", title: { display: true, text: "gCO₂eq/kWh", color: c.text },
            ticks: { color: c.text }, grid: { color: c.grid },
          },
          pct: {
            position: "right", min: 0, max: 100, grid: { drawOnChartArea: false },
            ticks: { color: c.text, callback: (v) => `${v}%` },
          },
        },
      }),
    };
  });
  dayChart.update();
  yearChart.update();
}
