# Frontend Yeniden Tasarımı — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tek sayfalık karbon monitörünü; giriş animasyonu, menülü görünümler, ayrı harita sekmesi, kaynak dağılımlı hover kartı ve il geçmişi yan paneli olan bir siteye dönüştürmek.

**Architecture:** Build adımı olmayan vanilla JS ES modülleri (`site/js/`), parçalı CSS (`site/css/`), hash router ile tek HTML kabuğu. Yeni `province-history.json` sözleşmesi Python tarafında `karbon/provinces.py` ile üretilir ve test edilir.

**Tech Stack:** HTML/CSS/vanilla JS (ES2022 modülleri), Chart.js 4.4.1 (mevcut SRI), Python 3 + pytest, yerel woff2 fontlar (Space Grotesk, Inter — @fontsource-variable, OFL).

**Spec:** `docs/superpowers/specs/2026-11-02-frontend-redesign-design.md`

## Global Constraints

- Build aracı, framework, npm bağımlılığı yok. Tek dış script: `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js`, mevcut `integrity="sha384-9nhczxUqK87bcKHh20fSQcTGD4qq5GhayNYSYWqwBkINBhOfQLg/P5HG5lF1urn4"`.
- CSP (meta, birebir): `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`.
- `site/js/**` içinde yasak: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function`, string argümanlı `setTimeout`/`setInterval`. HTML içinde `style="..."` niteliği ve inline `<script>`/`<style>` yok.
- `site/data/*.json` içinde "generation", "mwh" ve alt kaynak anahtarları (lignite, dam_hydro…) yok. `mix_pct` toplamı 100 ± 0,5, anahtarlar `karbon.publish.GROUPS`.
- Rotalar: `#/`, `#/harita`, `#/rehber`, `#/veriler`, `#/yontem`; harita parametresi `?il=<slug>`.
- Bütün kullanıcıya görünen metin `i18n.js` içinde TR ve EN olarak bulunur.
- `prefers-reduced-motion: reduce` → giriş animasyonu, paralaks, akan hatlar ve reveal animasyonları kapalı.
- `localStorage.lang ∈ {tr,en}`, `sessionStorage.introSeen === "1"`; erişim `try/catch`.
- Mevcut hesaplama davranışı korunur: `estimateProvinceHour`, `intensityToRgb`, `statusOf`, zoom/pan sabitleri (`FULL_BOX=[0,0,1000,460]`, `MIN_ZOOM_WIDTH=180`).
- Proje git deposu değildir: "Commit" adımları depo başlatılana kadar atlanır.

## Review Focus

1. **`province-history.json` yok/404 veya bozuk** → panelin geçmiş bölümü boş durum mesajı gösterir, panelin geri kalanı ve site çalışır. (Task 5 testi: `data.test.html` → `loadOptional` 404'te `null` döner; elle: dosya yeniden adlandırılınca panel açılır.)
2. **Elle yazılmış/bozuk hash** (`#/harita?il=<img src=x>`, `#/../`, `#/HARITA`) → ana sayfaya veya ilsiz haritaya düşer, DOM'a yazılmaz. (Task 2 testi: `router` saf fonksiyonu `parseHash`.)
3. **Türkçe karakterli il slug'ları** (`İstanbul`, `Şanlıurfa`, `Çanakkale`, `Iğdır`) → `?il=istanbul`, `sanliurfa`, `canakkale`, `igdir` doğru ili açar, 81 slug benzersizdir. (Task 2 testi: `slugify`.)
4. **Ekran kenarındaki illerde hover kartı** (Hakkari, Edirne, Sinop) → kart viewport dışına taşmaz. (Task 4: `placeTooltip` saf fonksiyon testi.)
5. **Panel açıkken saat oynatma veya dil değişimi** → panel içeriği ve grafikleri yeniden yaratılmadan güncellenir, odak kaybolmaz. (Task 5 elle doğrulama adımı.)

## JS test düzeneği

Saf JS fonksiyonları için tarayıcıda çalışan, bağımlılıksız küçük bir test sayfası kullanılır: `site/tests/index.html` + `site/tests/run.js` (`test(name, fn)`, `assertEqual(a, b)`, sonucu `<pre id="out">`'a `textContent` ile yazar, sonunda `PASS n/n` veya `FAIL`). Çalıştırma: `.venv/Scripts/python -m http.server 8000 --bind 127.0.0.1 -d site` ve `http://127.0.0.1:8000/tests/` açılır. Doğrulama: sayfada `PASS` satırı. Bu klasör yalnızca geliştirme içindir; `site/tests/` README'de belirtilir.

---

### Task 1: İl geçmişi veri sözleşmesi (Python)

**Files:**
- Modify: `karbon/provinces.py` (yeni fonksiyon)
- Modify: `scripts/make_sample.py` (`province-history.json` yazımı)
- Create: `tests/test_province_history.py`
- Create (üretilir): `site/data/province-history.json`

**Interfaces:**
- Produces: `province_history(hours: Iterable[Mapping]) -> dict[str, dict]` — `hours` öğeleri `derive_hour` çıktısıdır (`time`, `mix_pct`). Dönüş: `{il_adı: {"months": [{"month": "YYYY-MM", "avg_intensity": float, "renewable_share": float, "mix_pct": {grup: float}}]}}`, aylar artan sırada.
- Produces: dosya şeması spec §6 ile birebir: `{"is_sample": true, "updated": <ISO>, "provinces": {...}}`.

- [ ] **Step 1: Testleri yaz** (`tests/test_province_history.py`)

```python
from karbon.provinces import PROVINCE_CAPACITIES, province_history
from karbon.publish import GROUPS
HOURS = [  # iki ay, ikişer saat
    {"time": "2026-01-01T00:00:00+03:00", "mix_pct": {"coal": 40, "gas": 30, "hydro": 20, "wind": 10}},
    {"time": "2026-01-01T12:00:00+03:00", "mix_pct": {"coal": 30, "gas": 20, "hydro": 20, "wind": 10, "solar": 20}},
    {"time": "2026-02-01T00:00:00+03:00", "mix_pct": {"coal": 50, "gas": 30, "hydro": 20}},
    {"time": "2026-02-01T12:00:00+03:00", "mix_pct": {"coal": 40, "gas": 20, "hydro": 20, "solar": 20}},
]

def test_all_81_provinces_and_months():
    out = province_history(HOURS)
    assert set(out) == set(PROVINCE_CAPACITIES)
    assert [m["month"] for m in out["Antalya"]["months"]] == ["2026-01", "2026-02"]

def test_month_mix_sums_to_100_and_known_groups():
    for prov in province_history(HOURS).values():
        for m in prov["months"]:
            assert abs(sum(m["mix_pct"].values()) - 100) <= 0.5
            assert set(m["mix_pct"]) <= set(GROUPS)
            assert 0 <= m["renewable_share"] <= 1
            assert 0 < m["avg_intensity"] < 1100

def test_no_solar_at_night_only_month():
    night = [h for h in HOURS if h["time"].endswith("T00:00:00+03:00")]
    assert "solar" not in province_history(night)["Konya"]["months"][0]["mix_pct"]

def test_coal_province_dirtier_than_hydro_province():
    out = province_history(HOURS)
    assert out["Zonguldak"]["months"][0]["avg_intensity"] > out["Artvin"]["months"][0]["avg_intensity"]

def test_published_file_schema():
    import json; from pathlib import Path
    p = Path(__file__).resolve().parents[1] / "site/data/province-history.json"
    d = json.loads(p.read_text(encoding="utf-8"))
    assert set(d) == {"is_sample", "updated", "provinces"}
    assert set(d["provinces"]) == set(PROVINCE_CAPACITIES)
    assert len(d["provinces"]["Antalya"]["months"]) == 12
```


- [ ] **Step 2: Çalıştır, başarısız olduğunu gör** — `.venv/Scripts/python -m pytest tests/test_province_history.py -v` → `ImportError: cannot import name 'province_history'`.

- [ ] **Step 3: `province_history` yaz** — Her saat için her il `estimate_province_hour(normalized_capacity(il), hour["mix_pct"])` ile hesaplanır. Aylık kovada `intensity` ve `renewable_share` aritmetik ortalaması, `mix_pct` grup bazında ortalaması alınır. Ortalama `mix_pct` toplamı 100'e yeniden normalize edilir, 1 ondalığa yuvarlanır, 0 gruplar atılır. Yuvarlama: `avg_intensity` 1 ondalık, `renewable_share` 3 ondalık.

- [ ] **Step 4: `make_sample.py`'ye ekle** — `main()` içinde `write("province-history.json", {"updated": last24[-1]["time"], "provinces": province_history(year[::3])})` (her 3 saatte bir örnek: dosya boyutu değil, süre için; çıktı aylık olduğundan sonuç değişmez). Çalıştır: `.venv/Scripts/python scripts/make_sample.py`.

- [ ] **Step 5: Tüm testleri çalıştır** — `.venv/Scripts/python -m pytest -q` → hepsi geçer (`test_published_data.py` yeni dosyayı da tarar). Dosya boyutu ~150 KB altında olmalı (`wc -c site/data/province-history.json`).

---

### Task 2: Kabuk, router, i18n, veri katmanı, güvenlik testi

**Files:**
- Create: `site/index.html` (yeniden yazılır), `site/css/tokens.css`, `site/css/base.css`, `site/css/nav.css`
- Create: `site/fonts/` — `inter-latin-wght-normal.woff2`, `inter-latin-ext-wght-normal.woff2`, `space-grotesk-latin-wght-normal.woff2`, `space-grotesk-latin-ext-wght-normal.woff2`, `OFL-Inter.txt`, `OFL-SpaceGrotesk.txt` (kaynak: `https://cdn.jsdelivr.net/npm/@fontsource-variable/inter/files/…` ve `…/@fontsource-variable/space-grotesk/files/…`; lisanslar paketlerin `LICENSE` dosyası)
- Create: `site/js/main.js`, `state.js`, `i18n.js`, `format.js`, `data.js`, `router.js`, `guard.js`
- Create: `site/tests/index.html`, `site/tests/run.js`, `site/tests/core.test.js`
- Create: `tests/test_site_security.py`
- Delete: `site/app.js`, `site/style.css` (içerikleri bu ve sonraki görevlere taşındıktan sonra; silme Task 7 sonunda)

**Interfaces:**
- Produces `state.js`: `state` (nesne: `lang`, `city`, `hourIndex`, `mapMode`, `route`, `params`), `set(patch)`, `subscribe(keys: string[], fn)`.
- Produces `i18n.js`: `I18N` (mevcut anahtarlar + yeni: `nav_home`, `nav_map`, `nav_guide`, `nav_data`, `nav_method`, `hero_*`, `btn_explore`, `btn_purpose`, `purpose_*`, `guide_*`, `panel_*`, `legend_btn`, `skip_intro`, `skip_link`, `framed_warning`, `chart_failed`, `history_empty`), `t(key)`, `applyText(root = document)`.
- Produces `format.js`: `fmtNum(n, digits=0)`, `fmtPct(share)`, `fmtDate(iso, opts)`, `fmtHour(iso)`, `fmtDayHour(iso)`.
- Produces `data.js`: `GROUP_ORDER`, `GROUP_COLORS`, `GROUP_FACTORS`, `RENEWABLE_GROUPS`, `FACTOR_TABLE` (mevcut değerler), `loadRequired() -> Promise<{latest, cop31, monthly, map}>`, `loadOptional(name) -> Promise<object|null>`, `validateLatest/validateMap/validateHistory(obj) -> obj` (geçersiz kayıtları atar, yapı tamamen bozuksa `Error` atar), `estimateProvinceHour(capacityPct, nationalMixPct)`, `intensityToRgb(g) -> [r,g,b]`, `statusOf(g, thresholds) -> "clean"|"medium"|"dirty"`, `slugify(name) -> string`.
- Produces `router.js`: `ROUTES = ["/", "/harita", "/rehber", "/veriler", "/yontem"]`, `parseHash(hash: string, validSlugs: Set<string>) -> {route, params: {il?: string}}`, `startRouter(onChange)`, `navigate(route, params?)`.

- [ ] **Step 1: JS testlerini yaz** (`site/tests/core.test.js`)

```js
test("parseHash bilinmeyen → ana sayfa", () => assertEqual(parseHash("#/bilinmez", S).route, "/"));
test("parseHash büyük harf kabul edilmez", () => assertEqual(parseHash("#/HARITA", S).route, "/"));
test("parseHash il allowlist", () => assertEqual(parseHash("#/harita?il=antalya", S), {route: "/harita", params: {il: "antalya"}}));
test("parseHash zararlı il yok sayılır", () => assertEqual(parseHash("#/harita?il=<img src=x>", S).params, {}));
test("parseHash path traversal", () => assertEqual(parseHash("#/../yontem", S).route, "/"));
test("slugify TR", () => assertEqual(["İstanbul","Şanlıurfa","Çanakkale","Iğdır","Muğla"].map(slugify), ["istanbul","sanliurfa","canakkale","igdir","mugla"]));
test("slug benzersiz", () => assertEqual(new Set(MAP.provinces.map(p => slugify(p.name))).size, 81));
test("estimateProvinceHour gece güneş 0", () => assertEqual(estimateProvinceHour({solar: 60, gas: 40}, {gas: 50, coal: 50}).mix_pct.solar, undefined));
test("statusOf eşikler", () => assertEqual([299, 300, 450].map(g => statusOf(g, {clean_below: 300, dirty_from: 450})), ["clean","medium","dirty"]));
test("validateMap kötü path atılır", () => assertEqual(validateMap({viewBox: "0 0 1000 460", provinces: [{id: 1, name: "X", center: [1,1], path: "M0 0\"/><script>", capacity_pct: {}}]}).provinces.length, 0));
test("validateHistory bilinmeyen grup atılır", () => assertEqual(Object.keys(validateHistory({is_sample: true, provinces: {Antalya: {months: [{month: "2026-01", avg_intensity: 200, renewable_share: 0.5, mix_pct: {hydro: 100, lignite: 5}}]}}}).provinces.Antalya.months[0].mix_pct), ["hydro"]));
```
(`S` = `tr-map.json`'dan üretilen slug kümesi, `MAP` = yüklenen harita; `run.js` bunları test başlamadan yükler.)

- [ ] **Step 2: Güvenlik testini yaz** (`tests/test_site_security.py`) — yalnızca `site/js/**/*.js` taranır (`site/tests/` hariç): yasak kalıplar (Global Constraints listesi) regex ile aranır; `index.html` CSP'si Global Constraints'teki dizeye birebir eşit; `index.html`'de `style="`, `<style`, inline `<script>` (src'siz) yok; `https://` ile başlayan her `<script src>` bir `integrity` niteliği taşıyor; `target="_blank"` geçen her etikette `noopener`.

- [ ] **Step 3: Çalıştır, başarısız olduğunu gör** — `pytest tests/test_site_security.py -v` → `site/js` yok / CSP eşleşmiyor; `http://127.0.0.1:8000/tests/` → modüller bulunamadı.

- [ ] **Step 4: Modülleri ve kabuğu yaz** — Hesaplama/biçimlendirme/i18n kodu `app.js`'ten taşınır. `index.html`: atla bağlantısı, `<nav>` (marka, 5 bağlantı `href="#/..."`, hamburger `aria-expanded`, örnek veri rozeti, dil düğmesi), banner alanı (`sample-banner`, `stale-banner`, `error`, `framed-banner`), 5 adet `<section data-view="/...">` (içi sonraki görevlerde dolar), panel iskeleti `<aside id="province-panel" role="dialog" hidden>`, giriş katmanı `<div id="intro" hidden>`. Router hash değişiminde yalnızca `hidden` değiştirir, aktif linke `aria-current="page"` koyar, odakları görünüm `h1/h2`'sine taşır, `document.title` günceller. `guard.js`: `window.top !== window.self` ise `framed-banner` gösterilir. Fontlar `tokens.css` içinde `@font-face` ile, `latin` ve `latin-ext` için `unicode-range` ayrı. Renk/tema token'ları spec §7 (koyu taban `#0b1020`), `light-dark()` yerine mevcut `prefers-color-scheme` deseni.

- [ ] **Step 5: Testleri çalıştır** — `pytest -q` → güvenlik testi geçer (eski `app.js` hâlâ duruyorsa test yalnızca `site/js/`'i taradığı için etkilenmez); `/tests/` → `PASS 11/11`. Tarayıcıda 5 rota arasında gezinti ve geri tuşu çalışır, konsolda CSP ihlali yok.

---

### Task 3: Giriş animasyonu, banner, ana sayfa panoları

**Files:**
- Create: `site/js/intro.js`, `site/js/hero.js`, `site/js/reveal.js`, `site/js/home.js`
- Create: `site/css/intro.css`, `site/css/home.css`
- Modify: `site/index.html` (`data-view="/"` içeriği), `site/js/main.js`

**Interfaces:**
- Consumes: `state`, `t`, `fmt*`, `intensityToRgb`, `statusOf`, `data.map.provinces[].path`.
- Produces: `playIntro({provinces}) -> Promise<void>` (atlanınca veya reduced-motion'da hemen çözülür), `renderHero(latest, map)`, `renderHome(latest, cop31)`, `observeReveal(root)`.

- [ ] **Step 1: frontend-design skill'ini yükle** ve spec §7 görsel yönüne göre tipografi ölçeği, boşluk ve hareket eğrilerini `tokens.css`'e işle.
- [ ] **Step 2: Giriş** — Tam ekran `#intro`: 3 sis katmanı (CSS gradient + `filter: blur`), `perspective: 1200px` içinde `rotateX(55deg) scale(.35)` → `rotateX(0) scale(1)` ile Türkiye SVG'si (`tr-map.json` yolları, tek renk kontur), illerin `stroke-dashoffset` ile sırayla belirmesi (gecikme = `index * 12ms`, üst sınır 900ms), toplam ≤ 2,6 sn. "Geç" düğmesi, herhangi bir tuş veya tıklama atlar. Bitince `sessionStorage.introSeen="1"`, `#intro` kaldırılır, `main` üzerindeki `inert` kalkar, menüye `nav--landed` sınıfı (yukarıdan süzülme).
- [ ] **Step 3: Banner** — Sol sütun: `h1`, kısa açıklama, canlı değer + durum, 2 buton (`a.btn-primary href="#/harita"`, `a.btn-ghost href="#amac"`); hover/focus-visible: `::before` ile ışık süpürmesi (`translateX(-100%)→100%`), ok `translateX(4px)`, `translateY(-2px)`. Sağ: silüet + illerin merkezlerini en yakın 2 komşuya bağlayan akan hatlar (`stroke-dasharray` animasyonu), renk `intensityToRgb(son saat yoğunluğu)`. Paralaks: `pointermove` → 3 katmana `translate3d` (±12px), `requestAnimationFrame` ile.
- [ ] **Step 4: Panolar ve Projenin Amacı** — Kartlar: ulusal yoğunluk (değer + metre), yenilenebilir payı, son 24 saatin en temiz/en kirli saati, COP31 sayacı/özeti (mevcut `renderCop` mantığı, `?preview` dahil), veri güncelliği + gecikme uyarısı (mevcut `renderNow` mantığı). `#amac`: 3 sütun (ne ölçüyoruz / neden COP31 / ne ölçmüyoruz) + `#/yontem` bağlantısı. Altbilgi. `reveal.js`: `[data-reveal]` öğeleri `IntersectionObserver` (threshold 0.15) ile `is-visible` alır; CSS: `translateY(-16px)`, `blur(6px)`, `opacity 0` → normal.
- [ ] **Step 5: Doğrula** — Tarayıcıda: ilk açılışta giriş oynar, yenilemede oynamaz (aynı sekme), "Geç" çalışır; DevTools'ta reduced-motion emülasyonunda giriş ve paralaks yok, panolar doğrudan görünür. Dil değişince banner ve panolar çevrilir. `pytest -q` geçer, konsol temiz.

---

### Task 4: Harita görünümü, araç çubuğu, lejant, hover kartı

**Files:**
- Create: `site/js/map.js`, `site/js/tooltip.js`, `site/css/map.css`
- Modify: `site/index.html` (`data-view="/harita"`), `site/tests/core.test.js`

**Interfaces:**
- Consumes: `state`, `set`, `subscribe`, `estimateProvinceHour`, `intensityToRgb`, `GROUP_COLORS`, `slugify`, `navigate`.
- Produces: `initMap(map, latest)` (ilk ziyarette bir kez), `getEstimate(name) -> estimate` (seçili saat), `zoomToCity(name)`, `resetMapZoom()`, `placeTooltip(cursor: {x,y}, size: {w,h}, viewport: {w,h}, gap = 14) -> {left, top}`.

- [ ] **Step 1: `placeTooltip` testleri** (`core.test.js`)

```js
test("tooltip sağ kenarda sola döner", () => assertEqual(placeTooltip({x: 990, y: 100}, {w: 240, h: 160}, {w: 1000, h: 600}).left, 990 - 14 - 240));
test("tooltip alt kenarda yukarı döner", () => assertEqual(placeTooltip({x: 100, y: 590}, {w: 240, h: 160}, {w: 1000, h: 600}).top, 590 - 14 - 160));
test("tooltip normalde sağ-alt", () => assertEqual(placeTooltip({x: 100, y: 100}, {w: 240, h: 160}, {w: 1000, h: 600}), {left: 114, top: 114}));
test("tooltip asla negatif değil", () => assertEqual(placeTooltip({x: 5, y: 5}, {w: 990, h: 590}, {w: 1000, h: 600}).left >= 0, true));
```

- [ ] **Step 2: Çalıştır, başarısız** — `/tests/` → `placeTooltip is not defined`.
- [ ] **Step 3: Harita** — `app.js`'teki `buildMapDom`, zoom/pan, `renderMapAndCity` (harita kısmı), oynat taşınır. Oynat ikonu `innerHTML` yerine iki sabit `<path>`'ten birinin `hidden` niteliğiyle değiştirilir. Araç çubuğu: mod seçici, il `<select>`, saat kaydırıcı + oynat, Lejant düğmesi (`aria-expanded`, `aria-controls`) → popover: aktif moda göre yoğunluk gradyanı (150 → 700+) veya kaynak renkleri, "il değerleri tahmindir" notu, `#/rehber` bağlantısı; Esc ve dış tıklama kapatır. İl tıklayınca `set({city})` + `navigate("/harita", {il: slug})`; `didDragMove` koruması korunur.
- [ ] **Step 4: Hover kartı** — `tooltip.js`: başlık (plaka + ad), yoğunluk + durum (sembollü), yenilenebilir payı, kaynak çubukları (büyükten küçüğe; nokta + ad + `%x,y` + genişliği yüzde olan çubuk; genişlik CSSOM ile). Fare için `placeTooltip(cursor)`, klavye `focus` için ilin ekran merkezi. Sürüklemede gizli.
- [ ] **Step 5: Doğrula** — `/tests/` → `PASS 15/15`. Tarayıcıda Hakkari/Edirne/Sinop'ta kart taşmaz, Tab ile illerde gezinince kart görünür, oynatmada renkler değişir, Lejant iki modda doğru içerik gösterir. `pytest -q` geçer.

---

### Task 5: İl yan paneli

**Files:**
- Create: `site/js/panel.js`, `site/css/panel.css`
- Modify: `site/js/charts.js` (Task 6 ile paylaşılır; bu görev yalnızca panel grafik fabrikalarını ekler), `site/index.html` (panel iskeleti), `site/tests/core.test.js`

**Interfaces:**
- Consumes: `state`, `subscribe(["city","hourIndex","lang"])`, `getEstimate`, `estimateProvinceHour`, `data.history` (`null` olabilir), `zoomToCity`, `navigate`.
- Produces: `initPanel({latest, map, history})`, `openPanel(name)`, `closePanel()`; `charts.js`: `createPanelDayChart(canvas)`, `createPanelHistoryChart(canvas)`, `createCapacityChart(canvas)` — her biri `{update(data)}` döner; `window.Chart` yoksa canvas yerine `t("chart_failed")` metni.

- [ ] **Step 1: Test** — `loadOptional("yok-boyle-dosya")` → `null` (`core.test.js`'e ekle).
- [ ] **Step 2: Panel** — Spec §5.2'deki 5 bölüm. Açılış: `hidden` kaldırılır, `.is-open` (masaüstü `translateX(100%)→0`, ≤760px alttan `translateY`), odak kapatma düğmesine; kapanış: Esc / düğme / `navigate("/harita")`, odak son tıklanan il `<g>`'sine. `history` `null` veya il yoksa geçmiş bölümünde `t("history_empty")`; `history.is_sample` ise "Örnek Veri" rozeti. Grafikler bir kez yaratılır, sonra `update()`. Rota `?il=` ile gelirse harita hazır olduktan sonra panel açılır.
- [ ] **Step 3: Doğrula** — `/tests/` geçer. Tarayıcıda: Antalya'ya tıkla → panel, COP31 rozeti, 3 grafik; başka il → içerik değişir; saat oynat → 2. bölüm güncellenir, panel titremez; dil değiştir → panel çevrilir; Esc → odak ile döner; `#/harita?il=sanliurfa` linki doğrudan paneli açar; `province-history.json` geçici olarak yeniden adlandırılınca geçmiş bölümü boş durum gösterir, geri kalan çalışır (sonra dosya geri adlandırılır). Mobil genişlikte alttan açılır.

---

### Task 6: Rehber, Veriler, Yöntem görünümleri

**Files:**
- Modify: `site/js/charts.js` (`renderDayChart`, `renderYearChart` taşınır), `site/index.html` (3 görünüm), `site/css/sections.css`
- Create: `site/js/guide.js`

**Interfaces:**
- Consumes: `GROUP_COLORS`, `FACTOR_TABLE`, `latest.thresholds`, `intensityToRgb`, `t`.
- Produces: `renderGuide(latest)`, `renderDataCharts(latest, monthly)` (görünüm ilk açıldığında), `renderMethod()`.

- [ ] **Step 1: Rehber** — Yoğunluk gradyanı + eşik işaretleri (`clean_below`, `dirty_from` değerleri veriden), durum etiketleri, kaynak kartları (renk + ad + katsayı), il tahmini açıklaması (mevcut `map_footnote`, `method_b5`) ve 3 adımlı sade şema (kurulu güç × ulusal kullanılabilirlik → il profili), kullanım listesi (hover, tıkla, tekerlek, sürükle, oynat, Tab/Enter/Esc).
- [ ] **Step 2: Veriler** — Mevcut iki grafik, yeni tema renkleriyle (`cssVar` okuması korunur), tema değişiminde yeniden çizim.
- [ ] **Step 3: Yöntem** — Mevcut metodoloji maddeleri + katsayı tablosu (`renderFactorTable` taşınır).
- [ ] **Step 4: Doğrula** — Üç görünüm TR/EN, açık/koyu temada okunur; Chart.js script'i engellenince (DevTools request blocking) grafik alanlarında `chart_failed` metni, site çalışır; konsolda CSP ihlali yok.

---

### Task 7: Temizlik ve uçtan uca doğrulama

**Files:**
- Delete: `site/app.js`, `site/style.css`
- Modify: `README.md` (yeni yapı, `site/tests/`, `province-history.json` sözleşmesi, clickjacking notu, font lisansları)

- [ ] **Step 1: Sil ve tara** — Eski dosyalar silinir; `grep -rn "app.js\|style.css" site/` → sonuç yok.
- [ ] **Step 2: README** — Özellikler ve kurulum bölümleri güncellenir; `province-history.json` şeması ve `update_data.py`'nin API bağlanınca aynı formatta yazması gerektiği notu eklenir.
- [ ] **Step 3: Tam doğrulama** — `pytest -q` → hepsi geçer. `/tests/` → `PASS`. Tarayıcıda (masaüstü + 390px genişlik, açık + koyu, TR + EN, reduced-motion): 5 rota, geri/ileri, giriş, butonlar, panolar, harita hover/tıklama/panel, lejant, rehber, grafikler; konsolda hata ve CSP ihlali yok.
- [ ] **Step 4: Son inceleme** — superpowers:requesting-code-review ile tüm değişikliklerin incelemesi; bulgular düzeltilir.
