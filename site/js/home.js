// Ana sayfa: canlı değer, gösterge şeridi, COP31 sayacı/özeti, "Projenin amacı" kaydırması.
import { state, subscribe } from "./state.js";
import { t } from "./i18n.js";
import { fmtNum, fmtPct, fmtHour, fmtDayHour } from "./format.js";
import { statusOf } from "./data.js";
import { onView } from "./views.js";
import { renderHero, setHeroActive } from "./hero.js";
import { observeReveal } from "./reveal.js";

const $ = (id) => document.getElementById(id);
let ctx = null;
let timer = 0;

function setStatus(el, intensity, thresholds) {
  const st = statusOf(intensity, thresholds);
  el.className = `status ${st}`;
  el.textContent = t("status")[st];
}

/** "14:00" + küçük birim satırı; metin yalnızca textContent ile yazılır. */
function setHourValue(el, hour) {
  const unit = document.createElement("span");
  unit.className = "gauge-sub";
  unit.textContent = `${fmtNum(hour.intensity)} gCO₂eq/kWh`;
  el.replaceChildren(document.createTextNode(fmtHour(hour.time)), unit);
}

export function renderHome(latest, cop31) {
  const hours = latest.hours;
  const last = hours.at(-1);

  $("hero-value").textContent = fmtNum(last.intensity);
  setStatus($("hero-status"), last.intensity, latest.thresholds);

  $("now-value").textContent = fmtNum(last.intensity);
  setStatus($("now-status"), last.intensity, latest.thresholds);
  const pct = Math.min(100, Math.max(4, Math.round((last.intensity / 750) * 100)));
  $("now-meter-fill").style.width = `${pct}%`;
  $("now-renewable").textContent = fmtPct(last.renewable_share);

  const cleanest = hours.reduce((a, b) => (b.intensity < a.intensity ? b : a));
  const dirtiest = hours.reduce((a, b) => (b.intensity > a.intensity ? b : a));
  setHourValue($("now-cleanest"), cleanest);
  setHourValue($("now-dirtiest"), dirtiest);

  const ageHours = Math.floor((Date.now() - new Date(last.time).getTime()) / 3_600_000);
  $("now-updated").textContent = latest.is_sample
    ? fmtDayHour(last.time)
    : `${fmtDayHour(last.time)} (${t("hours_ago")(ageHours)})`;

  renderCop(cop31);
}

function renderCop(cop31) {
  const start = new Date(cop31.start).getTime();
  const preview = new URLSearchParams(location.search).has("preview");
  const before = Date.now() < start && !preview;
  const summary = cop31.summary;

  $("cop-countdown").hidden = !before;
  $("cop-summary").hidden = before || !summary;

  if (before) {
    const totalHours = Math.max(0, Math.floor((start - Date.now()) / 3_600_000));
    $("cd-days").textContent = fmtNum(Math.floor(totalHours / 24));
    $("cd-hours").textContent = fmtNum(totalHours % 24);
  } else if (summary) {
    const g = (v) => `${fmtNum(v)} gCO₂eq/kWh`;
    $("cop-avg").textContent = g(summary.avg_intensity);
    $("cop-ren").textContent = fmtPct(summary.avg_renewable_share);
    $("cop-clean").textContent = `${fmtDayHour(summary.cleanest.time)}, ${g(summary.cleanest.intensity)}`;
    $("cop-dirty").textContent = `${fmtDayHour(summary.dirtiest.time)}, ${g(summary.dirtiest.intensity)}`;
    $("cop-hours").textContent = fmtNum(summary.hours_counted);
  }
}

function setupPurposeButton() {
  $("btn-purpose").addEventListener("click", (e) => {
    e.preventDefault(); // hash'i değiştirmeden kaydır (router #amac'ı rota sanmasın)
    const target = $("amac");
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    target.focus({ preventScroll: true });
  });
}

onView("/", {
  init(data) {
    ctx = data;
    setupPurposeButton();
    renderHero(data.latest, data.map);
    renderHome(data.latest, data.cop31);
    observeReveal($("view-root"));
    subscribe(["lang"], () => {
      if (state.route === "/") renderHome(ctx.latest, ctx.cop31);
    });
  },
  show(data) {
    renderHome(data.latest, data.cop31);
    // "x saat önce" ve COP31 sayacı yalnızca ana sayfa açıkken tazelenir
    clearInterval(timer);
    timer = setInterval(() => renderHome(ctx.latest, ctx.cop31), 60_000);
    setHeroActive(true);
  },
  hide() {
    clearInterval(timer);
    timer = 0;
    setHeroActive(false);
  },
});
