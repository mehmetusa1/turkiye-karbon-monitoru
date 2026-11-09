import { test, assertEqual, ctx } from "./run.js";
import { parseHash } from "../../site/js/router.js";
import {
  slugify, estimateProvinceHour, statusOf, validateMap, validateHistory, loadOptional,
} from "../../site/js/data.js";

const S = () => new Set(ctx.MAP.provinces.map((p) => slugify(p.name)));

test("parseHash boş → ana sayfa", () => assertEqual(parseHash("", S()), { route: "/", params: {} }));
test("parseHash bilinmeyen → ana sayfa", () => assertEqual(parseHash("#/bilinmez", S()).route, "/"));
test("parseHash büyük harf kabul edilmez", () => assertEqual(parseHash("#/HARITA", S()).route, "/"));
test("parseHash il allowlist", () =>
  assertEqual(parseHash("#/harita?il=antalya", S()), { route: "/harita", params: { il: "antalya" } }));
test("parseHash zararlı il yok sayılır", () =>
  assertEqual(parseHash("#/harita?il=<img src=x>", S()).params, {}));
test("parseHash il yalnızca haritada", () =>
  assertEqual(parseHash("#/rehber?il=antalya", S()), { route: "/rehber", params: {} }));
test("parseHash path traversal", () => assertEqual(parseHash("#/../yontem", S()).route, "/"));
test("slugify TR", () =>
  assertEqual(["İstanbul", "Şanlıurfa", "Çanakkale", "Iğdır", "Muğla", "Kırşehir"].map(slugify),
    ["istanbul", "sanliurfa", "canakkale", "igdir", "mugla", "kirsehir"]));
test("slug benzersiz (81)", () => assertEqual(S().size, 81));
test("estimateProvinceHour gece güneş 0", () =>
  assertEqual(estimateProvinceHour({ solar: 60, gas: 40 }, { gas: 50, coal: 50 }).mix_pct.solar, undefined));
test("statusOf eşikler", () =>
  assertEqual([299, 300, 450].map((g) => statusOf(g, { clean_below: 300, dirty_from: 450 })),
    ["clean", "medium", "dirty"]));
test("validateMap kötü path atılır", () =>
  assertEqual(validateMap({ viewBox: "0 0 1000 460", provinces: [
    { id: 1, name: "X", center: [1, 1], path: 'M0 0"/><script>', capacity_pct: { hydro: 100 } },
  ] }).provinces.length, 0));
test("validateMap geçerli il korunur", () =>
  assertEqual(validateMap({ viewBox: "0 0 1000 460", provinces: [
    { id: 7, name: "Antalya", center: [1, 1], path: "M0,0L1,1Z", capacity_pct: { hydro: 100, lignite: 3 } },
  ] }).provinces[0].capacity_pct, { hydro: 100 }));
test("validateHistory bilinmeyen grup atılır", () =>
  assertEqual(Object.keys(validateHistory({ is_sample: true, provinces: { Antalya: { months: [
    { month: "2026-01", avg_intensity: 200, renewable_share: 0.5, mix_pct: { hydro: 100, lignite: 5 } },
  ] } } }).provinces.Antalya.months[0].mix_pct), ["hydro"]));
test("validateHistory bozuk ay atılır", () =>
  assertEqual(validateHistory({ provinces: { Antalya: { months: [
    { month: "<b>", avg_intensity: 200, renewable_share: 0.5, mix_pct: { hydro: 100 } },
    { month: "2026-02", avg_intensity: "x", renewable_share: 0.5, mix_pct: { hydro: 100 } },
  ] } } }).provinces.Antalya.months.length, 0));
test("loadOptional 404 → null", async () => assertEqual(await loadOptional("yok-boyle-dosya"), null));

// --- Hover kartı konumlandırma (Task 4) ---
const { placeTooltip } = await import("../../site/js/tooltip.js");
const VP = { w: 1000, h: 600 };
const SZ = { w: 240, h: 160 };
test("tooltip normalde sağ-alt", () => assertEqual(placeTooltip({ x: 100, y: 100 }, SZ, VP), { left: 114, top: 114 }));
test("tooltip sağ kenarda sola döner", () => assertEqual(placeTooltip({ x: 990, y: 100 }, SZ, VP).left, 990 - 14 - 240));
test("tooltip alt kenarda yukarı döner", () => assertEqual(placeTooltip({ x: 100, y: 590 }, SZ, VP).top, 590 - 14 - 160));
test("tooltip asla negatif değil", () => {
  const p = placeTooltip({ x: 5, y: 5 }, { w: 990, h: 590 }, VP);
  assertEqual(p.left >= 0 && p.top >= 0, true);
});
test("tooltip viewport'tan büyükse sol-üste yapışır", () =>
  assertEqual(placeTooltip({ x: 500, y: 300 }, { w: 1200, h: 800 }, VP), { left: 0, top: 0 }));

// --- Panel serileri (Task 5) ---
const { provinceDaySeries } = await import("../../site/js/data.js");
const HOURS = [
  { time: "2026-10-30T00:00:00+03:00", intensity: 500, renewable_share: 0.3, mix_pct: { coal: 50, gas: 30, hydro: 20 } },
  { time: "2026-10-30T12:00:00+03:00", intensity: 400, renewable_share: 0.5, mix_pct: { coal: 30, gas: 20, hydro: 20, solar: 30 } },
];
test("provinceDaySeries saat başına seri", () => {
  const s = provinceDaySeries({ solar: 50, hydro: 50 }, HOURS);
  assertEqual(s.times, HOURS.map((h) => h.time));
  assertEqual(s.intensity.length, 2);
  assertEqual(s.mix.solar, [0, s.mix.solar[1]]);
  assertEqual(s.mix.solar[1] > 0, true);
});
test("provinceDaySeries yalnızca görülen gruplar, sıralı", () =>
  assertEqual(Object.keys(provinceDaySeries({ solar: 50, hydro: 50 }, HOURS).mix), ["hydro", "solar"]));

// --- Chart.js yokken grafikler (Task 6 hata düzeltmesi) ---
const { createCapacityChart } = await import("../../site/js/charts.js");
test("Chart.js yokken tekrar update hata atmaz ve metin gösterir", () => {
  const box = document.createElement("div");
  const canvas = document.createElement("canvas");
  box.append(canvas);
  document.body.append(box);
  const chart = createCapacityChart(canvas);
  chart.update({ capacity: { hydro: 100 }, name: "X" });
  chart.update({ capacity: { hydro: 100 }, name: "X" });
  assertEqual(box.querySelectorAll(".chart-failed").length, 1);
  box.remove();
});

// --- Kanonik hash (Task 7 düzeltmesi) ---
const { canonicalHash } = await import("../../site/js/router.js");
test("canonicalHash ana sayfa", () => assertEqual(canonicalHash({ route: "/", params: {} }), "#/"));
test("canonicalHash il parametresi", () =>
  assertEqual(canonicalHash({ route: "/harita", params: { il: "antalya" } }), "#/harita?il=antalya"));
test("geçersiz hash kanonik biçime iner", () =>
  assertEqual(canonicalHash(parseHash("#/harita?il=<x>", S())), "#/harita"));

// --- Santraller (plants.json) ---
const { validatePlants, plantDisplayName } = await import("../../site/js/data.js");
test("validatePlants geçerli kaydı korur, zararlı/bozuk olanları atar", () => {
  const d = validatePlants({ source: "WRI", license: "CC BY 4.0", as_of: "2021", provinces: {
    "Adıyaman": [
      { id: "WRI1", name: "Atatürk Dam", group: "hydro", capacity_mw: 2400 },
      { id: "WRI2", name: "<img src=x onerror=alert(1)>", group: "hydro", capacity_mw: 10 },
      { id: "WRI3", name: "Plazma", group: "plasma", capacity_mw: 10 },
      { id: "WRI4", name: "Dev Santral", group: "coal", capacity_mw: 99999 },
    ],
    "<b>": [{ id: "WRI5", name: "Kötü İl", group: "gas", capacity_mw: 5 }],
  } });
  assertEqual(Object.keys(d.provinces), ["Adıyaman"]);
  assertEqual(d.provinces["Adıyaman"].map((p) => p.name), ["Atatürk Dam"]);
});
test("validatePlants kaynak bilgisini metin olarak sınırlar", () =>
  assertEqual(validatePlants({ source: "x".repeat(500), license: "CC BY 4.0", as_of: "2021", provinces: {} }).source.length <= 120, true));
test("plantDisplayName TR: Dam → Barajı", () =>
  assertEqual(["Atatürk Dam", "Keban Dam", "Ambarlı B Doğalgaz Santrali"].map((n) => plantDisplayName(n, "tr")),
    ["Atatürk Barajı", "Keban Barajı", "Ambarlı B Doğalgaz Santrali"]));
test("plantDisplayName EN değişmez", () => assertEqual(plantDisplayName("Atatürk Dam", "en"), "Atatürk Dam"));

const { leaveTo, navigate } = await import("../../site/js/router.js");
function withFakeBack(fn) {
  let called = false;
  history.back = () => { called = true; };
  try { fn(); } finally { delete history.back; }
  return called;
}
test("leaveTo: hedeften push ile gelindiyse geri gider (boş geri adımı kalmaz)", () => {
  history.replaceState({ from: "#/harita" }, "", "#/veriler");
  assertEqual(withFakeBack(() => leaveTo("/harita")), true);
});
test("leaveTo: derin linkte (state yok) geri gitmez, yerinde değiştirir", () => {
  history.replaceState(null, "", "#/veriler");
  assertEqual([withFakeBack(() => leaveTo("/harita")), location.hash], [false, "#/harita"]);
});
test("navigate push, nereden gelindiğini kayda yazar", () => {
  history.replaceState(null, "", "#/harita");
  navigate("/rehber");
  const from = history.state?.from;
  history.replaceState(null, "", "#/");
  assertEqual(from, "#/harita");
});
