// Harita hover kartı: il adı, yoğunluk, durum ve kaynak bazında dağılım çubukları.
import { t } from "./i18n.js";
import { fmtNum, fmtPct, fmtPctValue } from "./format.js";
import { GROUP_COLORS, statusOf } from "./data.js";

const $ = (id) => document.getElementById(id);

/**
 * Kartı imlecin sağ-altına yerleştirir; kenara taşarsa karşı tarafa döner,
 * sonra viewport içine sıkıştırır. Tüm değerler viewport'a göre px.
 */
export function placeTooltip(cursor, size, viewport, gap = 14) {
  let left = cursor.x + gap;
  let top = cursor.y + gap;
  if (left + size.w > viewport.w) left = cursor.x - gap - size.w;
  if (top + size.h > viewport.h) top = cursor.y - gap - size.h;
  left = Math.max(0, Math.min(left, viewport.w - size.w));
  top = Math.max(0, Math.min(top, viewport.h - size.h));
  return { left, top };
}

/** Kart içeriğini doldurur (yalnızca textContent / createElement). */
function fill(prov, est, thresholds) {
  $("tt-plate").textContent = String(prov.id).padStart(2, "0");
  $("tt-name").textContent = prov.name;
  $("tt-intensity").textContent = fmtNum(est.intensity);
  const st = statusOf(est.intensity, thresholds);
  const stEl = $("tt-status");
  stEl.className = `status ${st}`;
  stEl.textContent = t("status")[st];
  $("tt-ren").textContent = `${fmtPct(est.renewable_share)} ${t("renewable_short")}`;

  const rows = Object.entries(est.mix_pct)
    .sort((a, b) => b[1] - a[1])
    .map(([group, pct]) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = GROUP_COLORS[group] ?? "#888";
      const name = document.createElement("span");
      name.className = "tt-src";
      name.textContent = t("groups")[group] ?? group;
      const val = document.createElement("span");
      val.className = "tt-pct";
      val.textContent = fmtPctValue(pct);
      const bar = document.createElement("span");
      bar.className = "tt-bar";
      const barFill = document.createElement("span");
      barFill.style.width = `${Math.max(1, Math.min(100, pct))}%`;
      barFill.style.background = GROUP_COLORS[group] ?? "#888";
      bar.append(barFill);
      li.append(dot, name, val, bar);
      return li;
    });
  $("tt-mix").replaceChildren(...rows);
}

/** point: map-viewport'a göre px koordinatı. */
export function showTooltip(prov, est, thresholds, point) {
  const tip = $("map-tooltip");
  fill(prov, est, thresholds);
  tip.hidden = false;
  const vp = $("map-viewport").getBoundingClientRect();
  const { left, top } = placeTooltip(point, { w: tip.offsetWidth, h: tip.offsetHeight }, { w: vp.width, h: vp.height });
  tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

export function hideTooltip() {
  $("map-tooltip").hidden = true;
}
