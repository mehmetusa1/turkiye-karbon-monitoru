// Veri yükleme, şema doğrulama ve il tahmini.
// Sitedeki JSON dosyaları yalnızca türetilmiş değer içerir (ham MWh yok).
// Gelen her kayıt doğrulanır; tanınmayan anahtar ve geçersiz değerler atılır.

export const GROUP_ORDER = ["coal", "gas", "other", "geothermal", "biomass", "hydro", "wind", "solar", "nuclear"];
const GROUP_SET = new Set(GROUP_ORDER);

// Fosil sıcak, yenilenebilir soğuk/parlak tonlar; koyu ve açık zeminde ayırt edilebilir.
export const GROUP_COLORS = {
  coal: "#6b6f80",
  gas: "#f08a3c",
  other: "#a58fb8",
  geothermal: "#e0609a",
  biomass: "#8fbf4a",
  hydro: "#3d8fe0",
  wind: "#5fd4c4",
  solar: "#f2c744",
  nuclear: "#9a7cf0",
};

export const GROUP_FACTORS = {
  coal: 900, gas: 490, other: 650, biomass: 230, solar: 41, geothermal: 38, hydro: 24, nuclear: 12, wind: 11,
};
export const RENEWABLE_GROUPS = new Set(["hydro", "wind", "solar", "geothermal", "biomass"]);
const NATIONAL_BASELINE_PCT = { coal: 21, gas: 24, hydro: 29, wind: 12, solar: 11, geothermal: 1.6, biomass: 1.4 };

export const FACTOR_TABLE = [
  { key: "lignite", g: 1000, tr: ["Linyit", "Literatür aralığı (~950–1150); düşük kalorili yerli linyit"], en: ["Lignite", "Literature range (~950–1150); low-calorific domestic lignite"] },
  { key: "hard_coal", g: 820, tr: ["Taş kömürü / İthal kömür / Asfaltit", "IPCC AR5 WGIII Annex III medyan (pulverize kömür; asfaltit linyit varsayımıyla 1000)"], en: ["Hard coal / Imported coal / Asphaltite", "IPCC AR5 WGIII Annex III median (pulverized coal; asphaltite at 1000)"] },
  { key: "natural_gas", g: 490, tr: ["Doğalgaz / LNG", "IPCC AR5 medyan (kombine çevrim)"], en: ["Natural gas / LNG", "IPCC AR5 median (combined cycle)"] },
  { key: "fuel_oil", g: 650, tr: ["Fuel-oil / Nafta", "Yaklaşık literatür değeri (şebeke payı <%1)"], en: ["Fuel oil / Naphtha", "Approximate literature value (grid share <1%)"] },
  { key: "biomass", g: 230, tr: ["Biyokütle", "IPCC AR5 medyan (biyokütle)"], en: ["Biomass", "IPCC AR5 median (dedicated biomass)"] },
  { key: "solar", g: 41, tr: ["Güneş", "IPCC AR5 medyan (PV yaşam döngüsü)"], en: ["Solar PV", "IPCC AR5 median (PV life-cycle)"] },
  { key: "geothermal", g: 38, tr: ["Jeotermal", "IPCC AR5 küresel medyan (Not: Türkiye'de bazı sahalarda doğal CO₂ salımı daha yüksektir)"], en: ["Geothermal", "IPCC AR5 global median (Note: some Turkish fields have higher natural CO₂ release)"] },
  { key: "hydro", g: 24, tr: ["Hidroelektrik (Barajlı / Akarsu)", "IPCC AR5 medyan"], en: ["Hydropower (Dam / Run-of-river)", "IPCC AR5 median"] },
  { key: "nuclear", g: 12, tr: ["Nükleer", "IPCC AR5 medyan"], en: ["Nuclear", "IPCC AR5 median"] },
  { key: "wind", g: 11, tr: ["Rüzgâr", "IPCC AR5 medyan (kara rüzgârı)"], en: ["Wind", "IPCC AR5 median (onshore)"] },
];

// ---------- Doğrulama yardımcıları ----------

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const NAME_RE = /^[\p{L} .'’-]{2,40}$/u;
const PATH_RE = /^[MLHVZmlhvz0-9.,\s-]+$/;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isNum = (v, min = -Infinity, max = Infinity) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const isIso = (v) => typeof v === "string" && ISO_RE.test(v) && !Number.isNaN(Date.parse(v));

/** Yalnızca bilinen grup anahtarlarını ve 0–100 arası sayıları bırakır. */
function cleanMix(mix) {
  const out = {};
  if (!isObj(mix)) return out;
  for (const [k, v] of Object.entries(mix)) {
    if (GROUP_SET.has(k) && isNum(v, 0, 100)) out[k] = v;
  }
  return out;
}

function fail(name) {
  throw new Error(`${name}: geçersiz veri yapısı`);
}

export function validateLatest(d) {
  if (!isObj(d) || !Array.isArray(d.hours)) fail("latest");
  const hours = d.hours
    .filter((h) => isObj(h) && isIso(h.time) && isNum(h.intensity, 0, 2000) && isNum(h.renewable_share, 0, 1))
    .map((h) => ({ time: h.time, intensity: h.intensity, renewable_share: h.renewable_share, mix_pct: cleanMix(h.mix_pct) }));
  if (!hours.length) fail("latest");
  const th = isObj(d.thresholds) ? d.thresholds : {};
  return {
    is_sample: d.is_sample === true,
    last_fetch_failed: d.last_fetch_failed === true,
    updated: isIso(d.updated) ? d.updated : hours.at(-1).time,
    thresholds: {
      clean_below: isNum(th.clean_below, 0, 2000) ? th.clean_below : 300,
      dirty_from: isNum(th.dirty_from, 0, 2000) ? th.dirty_from : 450,
    },
    hours,
  };
}

export function validateMonthly(d) {
  if (!isObj(d) || !Array.isArray(d.months)) fail("monthly");
  return {
    is_sample: d.is_sample === true,
    months: d.months
      .filter((m) => isObj(m) && typeof m.month === "string" && MONTH_RE.test(m.month)
        && isNum(m.avg_intensity, 0, 2000) && isNum(m.avg_renewable_share, 0, 1))
      .map((m) => ({ month: m.month, avg_intensity: m.avg_intensity, avg_renewable_share: m.avg_renewable_share })),
  };
}

export function validateCop(d) {
  if (!isObj(d) || !isIso(d.start) || !isIso(d.end)) fail("cop31");
  const s = d.summary;
  const point = (p) => isObj(p) && isIso(p.time) && isNum(p.intensity, 0, 2000);
  const summary = isObj(s) && isNum(s.hours_counted, 0, 1e5) && isNum(s.avg_intensity, 0, 2000)
    && isNum(s.avg_renewable_share, 0, 1) && point(s.cleanest) && point(s.dirtiest)
    ? {
      hours_counted: s.hours_counted,
      avg_intensity: s.avg_intensity,
      avg_renewable_share: s.avg_renewable_share,
      cleanest: { time: s.cleanest.time, intensity: s.cleanest.intensity },
      dirtiest: { time: s.dirtiest.time, intensity: s.dirtiest.intensity },
    }
    : null;
  return { is_sample: d.is_sample === true, start: d.start, end: d.end, summary };
}

export function validateMap(d) {
  if (!isObj(d) || !Array.isArray(d.provinces)) fail("tr-map");
  const provinces = d.provinces
    .filter((p) => isObj(p) && Number.isInteger(p.id) && p.id >= 1 && p.id <= 81
      && typeof p.name === "string" && NAME_RE.test(p.name)
      && Array.isArray(p.center) && p.center.length === 2 && p.center.every((c) => isNum(c, -500, 2000))
      && typeof p.path === "string" && p.path.length < 200_000 && PATH_RE.test(p.path))
    .map((p) => ({ id: p.id, name: p.name, center: [p.center[0], p.center[1]], path: p.path, capacity_pct: cleanMix(p.capacity_pct) }));
  return { provinces };
}

export function validateHistory(d) {
  if (!isObj(d) || !isObj(d.provinces)) fail("province-history");
  const provinces = {};
  for (const [name, prov] of Object.entries(d.provinces)) {
    if (!NAME_RE.test(name) || !isObj(prov) || !Array.isArray(prov.months)) continue;
    provinces[name] = {
      months: prov.months
        .filter((m) => isObj(m) && typeof m.month === "string" && MONTH_RE.test(m.month)
          && isNum(m.avg_intensity, 0, 2000) && isNum(m.renewable_share, 0, 1))
        .map((m) => ({ month: m.month, avg_intensity: m.avg_intensity, renewable_share: m.renewable_share, mix_pct: cleanMix(m.mix_pct) })),
    };
  }
  return { is_sample: d.is_sample === true, updated: isIso(d.updated) ? d.updated : null, provinces };
}

// ---------- Yükleme ----------

async function fetchJson(name) {
  const res = await fetch(`data/${encodeURIComponent(name)}.json`, { cache: "no-cache", credentials: "same-origin" });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.json();
}

/** Zorunlu dosyalar. Herhangi biri yüklenemez ya da geçersizse hata atar. */
export async function loadRequired() {
  const [latest, cop31, monthly, map] = await Promise.all([
    fetchJson("latest").then(validateLatest),
    fetchJson("cop31").then(validateCop),
    fetchJson("monthly").then(validateMonthly),
    fetchJson("tr-map").then(validateMap),
  ]);
  return { latest, cop31, monthly, map };
}

/** İsteğe bağlı dosya: yoksa veya geçersizse null döner. */
export async function loadOptional(name, validator = (x) => x) {
  try {
    return validator(await fetchJson(name));
  } catch {
    return null;
  }
}

// ---------- Hesaplama ----------

export function statusOf(intensity, thresholds) {
  if (intensity < thresholds.clean_below) return "clean";
  if (intensity < thresholds.dirty_from) return "medium";
  return "dirty";
}

/** İlin kurulu güç profili × o saatteki ulusal kaynak kullanılabilirliği → il tahmini. */
export function estimateProvinceHour(capacityPct, nationalMixPct) {
  const weighted = {};
  for (const [group, cap] of Object.entries(capacityPct)) {
    if (cap <= 0) continue;
    const base = NATIONAL_BASELINE_PCT[group] ?? 5;
    weighted[group] = cap * ((nationalMixPct[group] ?? 0) / base);
  }
  let total = Object.values(weighted).reduce((a, b) => a + b, 0);
  if (total <= 0) {
    Object.assign(weighted, capacityPct);
    total = Object.values(weighted).reduce((a, b) => a + b, 0);
  }
  const mixPct = {};
  let intensity = 0;
  let renShare = 0;
  let dominant = "hydro";
  let maxVal = -1;
  for (const [group, val] of Object.entries(weighted)) {
    if (val <= 0) continue;
    const share = val / total;
    mixPct[group] = Math.round(share * 1000) / 10;
    intensity += share * (GROUP_FACTORS[group] ?? 400);
    if (RENEWABLE_GROUPS.has(group)) renShare += share;
    if (val > maxVal) {
      maxVal = val;
      dominant = group;
    }
  }
  return { intensity: Math.round(intensity * 10) / 10, renewable_share: renShare, dominant, mix_pct: mixPct };
}

export function intensityToRgb(intensity) {
  const stops = [
    [50, [29, 138, 78]],
    [250, [52, 199, 89]],
    [400, [234, 179, 8]],
    [550, [234, 88, 12]],
    [780, [185, 28, 28]],
  ];
  const c = Math.max(stops[0][0], Math.min(stops.at(-1)[0], intensity));
  for (let i = 0; i < stops.length - 1; i++) {
    const [x0, c0] = stops[i];
    const [x1, c1] = stops[i + 1];
    if (c <= x1) {
      const r = (c - x0) / (x1 - x0);
      return c0.map((v, idx) => Math.round(v + (c1[idx] - v) * r));
    }
  }
  return [185, 28, 28];
}

export const rgb = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;

const TR_MAP = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** "Şanlıurfa" → "sanliurfa" (URL'de kullanılacak ASCII slug). */
export function slugify(name) {
  return String(name)
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (ch) => TR_MAP[ch])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * İlin son saatlerdeki tahmini serisi (panel grafiği için).
 * mix: GROUP_ORDER sırasında, en az bir saatte >0 olan gruplar; her biri saat başına yüzde dizisi.
 */
export function provinceDaySeries(capacityPct, hours) {
  const ests = hours.map((h) => estimateProvinceHour(capacityPct, h.mix_pct));
  const mix = {};
  for (const g of GROUP_ORDER) {
    if (ests.some((e) => (e.mix_pct[g] ?? 0) > 0)) mix[g] = ests.map((e) => e.mix_pct[g] ?? 0);
  }
  return { times: hours.map((h) => h.time), intensity: ests.map((e) => e.intensity), mix };
}

// ---------- Santraller (plants.json) ----------

const PLANT_NAME_RE = /^[\p{L}\p{N}_ .,'’()&/+-]{2,80}$/u;
const PLANT_ID_RE = /^[\w-]{1,40}$/;
const shortText = (v, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");

/** plants.json: il → büyük santraller. Geçersiz il/santral kayıtları atılır. */
export function validatePlants(d) {
  if (!isObj(d) || !isObj(d.provinces)) fail("plants");
  const provinces = {};
  for (const [name, list] of Object.entries(d.provinces)) {
    if (!NAME_RE.test(name) || !Array.isArray(list)) continue;
    const plants = list
      .filter((p) => isObj(p) && typeof p.id === "string" && PLANT_ID_RE.test(p.id)
        && typeof p.name === "string" && PLANT_NAME_RE.test(p.name)
        && GROUP_SET.has(p.group) && isNum(p.capacity_mw, 0.1, 10000))
      .slice(0, 20)
      .map((p) => ({ id: p.id, name: p.name, group: p.group, capacity_mw: p.capacity_mw }));
    if (plants.length) provinces[name] = plants;
  }
  return { source: shortText(d.source), license: shortText(d.license, 40), as_of: shortText(d.as_of, 20), provinces };
}

/** Veri setindeki İngilizce "X Dam" adlarını Türkçe görünümde "X Barajı" yapar. */
export function plantDisplayName(name, lang) {
  return lang === "tr" ? name.replace(/\s+Dam$/u, " Barajı") : name;
}
