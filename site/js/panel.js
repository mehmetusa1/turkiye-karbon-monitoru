// İl yan paneli: seçili saat özeti, son 24 saat, aylık geçmiş ve kurulu güç profili.
// Açılış/kapanış URL'den (#/harita?il=...) yönetilir; geri tuşu paneli kapatır.
import { state, subscribe } from "./state.js";
import { t } from "./i18n.js";
import { fmtNum, fmtPct, fmtPctValue, fmtDayHour } from "./format.js";
import { GROUP_COLORS, statusOf, provinceDaySeries, plantDisplayName } from "./data.js";
import { leaveTo } from "./router.js";
import { getProvince, getEstimate, provinceElement } from "./map.js";
import { createPanelDayChart, createPanelHistoryChart, createCapacityChart } from "./charts.js";

const $ = (id) => document.getElementById(id);
let ctx = null;
let openName = null;
let closing = false;
let dayChart = null;
let historyChart = null;
let capacityChart = null;

function renderNow(name) {
  const prov = getProvince(name);
  const est = getEstimate(name);
  if (!prov || !est) return;
  const hour = ctx.latest.hours[state.hourIndex] ?? ctx.latest.hours.at(-1);

  $("panel-hour").textContent = t("panel_at_hour")(fmtDayHour(hour.time));
  $("panel-intensity").textContent = fmtNum(est.intensity);
  const st = statusOf(est.intensity, ctx.latest.thresholds);
  const stEl = $("panel-status");
  stEl.className = `status ${st}`;
  stEl.textContent = t("status")[st];
  // Ulusal değer 0 veya geçersizse yüzde karşılaştırma anlamsız (NaN/Infinity yazılmasın)
  const national = Number(hour.intensity);
  $("panel-compare").textContent = national > 0
    ? t("vs_national")(Math.round(((est.intensity - national) / national) * 100))
    : "";
  $("panel-renewable").textContent = fmtPct(est.renewable_share);
  $("panel-dominant").textContent = t("groups")[est.dominant] ?? est.dominant;
}

function renderCapacityList(capacity) {
  const total = Object.values(capacity).reduce((a, b) => a + b, 0) || 1;
  $("panel-capacity-list").replaceChildren(...Object.entries(capacity)
    .sort((a, b) => b[1] - a[1])
    .map(([g, v]) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = GROUP_COLORS[g] ?? "#888";
      const label = document.createElement("span");
      label.textContent = t("groups")[g] ?? g;
      const val = document.createElement("strong");
      val.textContent = fmtPctValue((v / total) * 100);
      li.append(dot, label, val);
      return li;
    }));
}

function renderHistory(name) {
  if (!ctx.historyLoaded) {
    // Dosya hâlâ yükleniyor: "henüz yayınlanmadı" mesajı yanlışlıkla görünmesin
    $("panel-history-box").hidden = true;
    $("panel-history-empty").hidden = true;
    $("panel-history-sample").hidden = true;
    return;
  }
  const history = ctx.history;
  const months = history?.provinces?.[name]?.months ?? [];
  const has = months.length > 0;
  $("panel-history-box").hidden = !has;
  $("panel-history-empty").hidden = has;
  $("panel-history-sample").hidden = !(has && history.is_sample);
  if (has) historyChart.update({ months, name });
}

/** İldeki büyük santraller (plants.json). Dosya henüz yüklenmediyse bölüm boş bekler. */
function renderPlants(name) {
  const list = $("panel-plants");
  const total = $("panel-plants-total");
  const empty = $("panel-plants-empty");
  if (!ctx.plantsLoaded) {
    list.replaceChildren();
    total.textContent = "";
    empty.hidden = true;
    return;
  }
  const plants = ctx.plants?.provinces?.[name] ?? [];
  empty.hidden = plants.length > 0;
  list.replaceChildren(...plants.map((p) => {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = GROUP_COLORS[p.group] ?? "#888";
    const text = document.createElement("span");
    text.className = "plant-text";
    const strong = document.createElement("strong");
    strong.textContent = plantDisplayName(p.name, state.lang);
    const type = document.createElement("span");
    type.className = "plant-type";
    type.textContent = t("groups")[p.group] ?? p.group;
    text.append(strong, type);
    const mw = document.createElement("span");
    mw.className = "plant-mw";
    mw.textContent = `${fmtNum(p.capacity_mw, p.capacity_mw < 10 ? 1 : 0)} MW`;
    li.append(dot, text, mw);
    return li;
  }));
  const sum = plants.reduce((a, p) => a + p.capacity_mw, 0);
  total.textContent = plants.length > 1 ? t("plants_total")(fmtNum(sum)) : "";
}

function renderAll(name) {
  const prov = getProvince(name);
  if (!prov) return;
  $("panel-plate").textContent = String(prov.id).padStart(2, "0");
  $("panel-name").textContent = prov.name;
  $("panel-cop").hidden = prov.name !== "Antalya";
  renderNow(name);
  renderPlants(name);
  dayChart.update({ series: provinceDaySeries(prov.capacity_pct, ctx.latest.hours), name });
  capacityChart.update({ capacity: prov.capacity_pct, name });
  renderCapacityList(prov.capacity_pct);
  renderHistory(name);
}

function open(name) {
  const panel = $("province-panel");
  const wasOpen = Boolean(openName);
  openName = name;
  closing = false;
  panel.hidden = false;
  panel.closest(".view").classList.add("has-panel");
  renderAll(name);
  if (!wasOpen) {
    // Bir sonraki karede sınıf ekle ki giriş geçişi çalışsın
    requestAnimationFrame(() => panel.classList.add("is-open"));
    $("panel-close").focus({ preventScroll: true });
  }
  if (!wasOpen) panel.scrollTop = 0;
}

function close() {
  closing = false;
  if (!openName) return;
  const panel = $("province-panel");
  const last = openName;
  openName = null;
  panel.classList.remove("is-open");
  panel.hidden = true;
  panel.closest(".view").classList.remove("has-panel");
  // Odak, paneli açan ile geri dönsün
  const g = provinceElement(last);
  if (g && state.route === "/harita") g.focus({ preventScroll: true });
}

function requestClose() {
  // history.back() eşzamansızdır: art arda Esc iki adım geri gitmesin
  if (closing) return;
  closing = true;
  leaveTo("/harita");
}

/** Giriş animasyonu sırasında (inert) kaybolan odağı, açık panele geri verir. */
export function focusOpenPanel() {
  if (openName && document.activeElement === document.body) {
    $("panel-close").focus({ preventScroll: true });
  }
}

export function initPanel(data) {
  ctx = data;
  dayChart = createPanelDayChart($("panel-day-chart"));
  historyChart = createPanelHistoryChart($("panel-history-chart"));
  capacityChart = createCapacityChart($("panel-capacity-chart"));

  $("panel-close").addEventListener("click", requestClose);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openName && state.route === "/harita") requestClose();
  });

  subscribe(["city"], () => {
    if (state.city) open(state.city);
    else close();
  });
  // Saat değişince yalnızca özet bölümü güncellenir (grafikler yeniden yaratılmaz)
  subscribe(["hourIndex"], () => {
    if (openName) renderNow(openName);
  });
  subscribe(["lang"], () => {
    if (openName) renderAll(openName);
  });
  // İşletim sistemi teması değişince grafik yazı/ızgara renkleri yeni temaya geçsin
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (openName) renderAll(openName);
  });
  data.plantsPromise?.then(() => {
    if (openName) renderPlants(openName);
  });
  // Geçmiş dosyası sonradan yüklenirse açık paneli tazele
  data.historyPromise?.then(() => {
    if (openName) renderHistory(openName);
  });

  if (state.city) open(state.city);
}
