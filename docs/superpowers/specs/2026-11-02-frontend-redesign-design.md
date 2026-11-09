# Frontend Yeniden Tasarımı — Tasarım Dokümanı

Tarih: 2026-11-02
Kapsam: `site/` klasörü (frontend), `scripts/make_sample.py` (örnek veri), `tests/` (yeni şema testi), README notu.

## 1. Amaç ve başarı ölçütleri

Mevcut tek sayfalık site, menülü ve çok görünümlü bir yapıya dönüşecek. Kullanıcı:

1. Siteye girdiğinde "havadan Türkiye'ye iniyormuş" gibi bir giriş animasyonu görür.
2. Üstteki sabit menüden Ana Sayfa, Harita, Harita Rehberi, Veriler ve Yöntem sekmelerine sayfa yenilemeden geçer.
3. Ana sayfada büyük animasyonlu banner, solda hover efektli 2 buton, aşağı kaydırdıkça beliren bilgi panoları ve "Projenin Amacı" bölümü bulunur.
4. Harita kendi sekmesindedir. Bir ilin üzerine gelindiğinde yoğunluğun yanında kaynak dağılımı (kömür, doğalgaz, hidro, rüzgâr, güneş, jeotermal, biyokütle) gösterilir.
5. Bir ile tıklandığında sağdan bir yan panel açılır: son 24 saat tahmini dağılım, aylık geçmiş üretim dağılımı ve kurulu güç profili.

Korunacaklar: TR/EN dil desteği, açık/koyu tema, örnek veri ve gecikme uyarıları, COP31 sayacı/özeti, mevcut grafikler, metodoloji metni, ham MWh verisinin yayınlanmaması.

Başarı ölçütleri:
- Bütün rotalar çalışır, tarayıcının geri/ileri tuşları doğru davranır.
- Konsolda hata yoktur, CSP ihlali yoktur.
- `pytest` geçer (yeni şema testi dahil).
- `prefers-reduced-motion` açıkken animasyonlar kapalıdır.
- Klavye ile harita ve panel kullanılabilir.

## 2. Yaklaşım

Vanilla JavaScript + yerel ES modülleri, build adımı yok. Yeni npm bağımlılığı eklenmez. Tek dış script Chart.js'tir (SRI hash ile, mevcut olduğu gibi).

Gerekçe: GitHub Pages ve mevcut Actions akışı değişmeden çalışır, tedarik zinciri riski artmaz, CSP `'self'` seviyesinde kalır.

## 3. Mimari

```
site/
  index.html              tek kabuk: üst menü, görünüm bölümleri, yan panel, giriş katmanı
  css/
    tokens.css            renk/tipografi/boşluk değişkenleri, açık/koyu tema
    base.css              reset, tipografi, yardımcı sınıflar, banner'lar
    nav.css               üst menü
    intro.css             giriş animasyonu
    home.css              banner, butonlar, panolar, projenin amacı
    map.css               harita sahnesi, harita araç çubuğu, lejant, hover kartı
    panel.css             il yan paneli
    sections.css          rehber, veriler, yöntem sayfaları
  fonts/                  Space Grotesk + Inter (woff2, OFL) + OFL lisans metni
  js/
    main.js               veri yükleme, modülleri başlatma, hata durumu
    state.js              paylaşılan durum (dil, seçili il, seçili saat, harita modu)
    i18n.js               TR/EN metinleri, t(), applyText()
    format.js             sayı/yüzde/tarih biçimlendirme
    data.js               JSON yükleme + doğrulama, estimateProvinceHour(), renk fonksiyonları
    router.js             hash yönlendirme (allowlist)
    intro.js              giriş animasyonu
    hero.js               banner SVG ve canlı değer
    reveal.js             IntersectionObserver ile beliren panolar
    home.js               ana sayfa panoları (ulusal yoğunluk, COP31, amaç)
    map.js                harita çizimi, zoom/pan, saat kaydırıcı, oynat
    tooltip.js            hover kartı
    panel.js              il yan paneli
    charts.js             Chart.js grafikleri (veriler sayfası + panel)
    guard.js              çerçeve içinde açılma kontrolü
  data/
    latest.json, monthly.json, cop31.json, tr-map.json   (mevcut)
    province-history.json                                 (yeni)
```

Modüller arası iletişim: `state.js` küçük bir olay yayıcı (`subscribe`/`set`) sunar. Örneğin `map.js` il seçince `state.set({ city })` çağırır, `panel.js` buna abone olur.

`app.js` ve `style.css` kaldırılır, içerikleri yukarıdaki modüllere taşınır. Mevcut hesaplama mantığı (`estimateProvinceHour`, `intensityToRgb`, zoom/pan) davranış değiştirmeden taşınır.

## 4. Rotalar ve görünümler

Rotalar `router.js` içinde sabit bir allowlist'tir:

| Hash | Görünüm |
|------|---------|
| `#/` (varsayılan) | Ana Sayfa |
| `#/harita` | Harita (isteğe bağlı `?il=<slug>`) |
| `#/rehber` | Harita Rehberi |
| `#/veriler` | Veriler (24 saat + 12 ay grafikleri) |
| `#/yontem` | Yöntem (metodoloji + katsayı tablosu) |

- Her görünüm `index.html` içinde `<section data-view="...">` olarak bulunur. Router yalnızca `hidden` niteliğini değiştirir.
- Bilinmeyen hash `#/` rotasına yönlendirilir. Hash'ten DOM'a hiçbir değer yazılmaz.
- `?il=` parametresi il listesinden üretilmiş slug haritasına göre doğrulanır, eşleşmezse yok sayılır.
- Görünüm geçişinde kısa bir solma + yukarıdan inme animasyonu oynar. Geçişten sonra odak görünümün başlığına taşınır, `document.title` güncellenir.
- Aktif menü öğesi `aria-current="page"` alır.
- Harita DOM'u ilk `#/harita` ziyaretinde oluşturulur. Grafikler görünüm ilk açıldığında çizilir.

### 4.1 Üst menü
Sabit, cam efektli (`backdrop-filter`). Sol: marka + canlı nokta. Orta: 5 menü öğesi. Sağ: "Örnek Veri" rozeti, TR/EN düğmesi. Mobilde (≤ 760px) hamburger düğmesi menüyü açılır listeye çevirir (`aria-expanded`). Kaydırıldığında menü küçülür ve arka planı koyulaşır.

### 4.2 Ana Sayfa
1. **Banner (tam ekran):** Sol tarafta başlık, kısa açıklama, canlı ulusal yoğunluk değeri ve durum etiketi, altında 2 buton:
   - "Haritayı Keşfet" → `#/harita`
   - "Projenin Amacı" → sayfada `#amac` bölümüne yumuşak kaydırma
   Butonlarda hover/focus durumunda ışık süpürmesi, ok ikonunun kayması ve hafif yükselme olur.
   Sağ ve ortada: `tr-map.json` yollarından üretilen sadeleştirilmiş Türkiye silueti, üstünde illeri bağlayan akan enerji hatları (SVG `stroke-dashoffset` animasyonu). Rengi ulusal yoğunluğa göre `intensityToRgb` skalasından alınır. Fare hareketiyle 2–3 katman hafif paralaks yapar (reduced-motion'da kapalı).
2. **Bilgi panoları (kaydırınca belirir):** Ulusal şebeke yoğunluğu (değer + metre), yenilenebilir payı, son 24 saatin en temiz/en kirli saati, COP31 sayacı veya özeti, veri güncelliği.
3. **Projenin Amacı (`#amac`):** 3 kısa sütun: ne ölçüyoruz, neden COP31, ne ölçmüyoruz (kapsam sınırları). Sonunda "Yöntemi incele" bağlantısı.
4. **Alt bilgi:** mevcut sorumluluk metni ve lisans.

### 4.3 Harita
- Tam yükseklik sahne. Üstünde **harita araç çubuğu**: mod seçici (Karbon Yoğunluğu / Baskın Kaynak), il seçici, saat kaydırıcı + oynat/duraklat, **Lejant** düğmesi.
- Lejant düğmesi küçük bir açılır panel açar: aktif moda göre renk skalası veya kaynak renkleri, "il değerleri tahmindir" notu ve "Rehberin tamamı" → `#/rehber` bağlantısı.
- Zoom/pan, zoom düğmeleri, COP31 işareti ve 3B görünüm mevcut davranışla korunur.

### 4.4 Harita Rehberi
- Yoğunluk renk skalası, eşikler (`thresholds.clean_below`, `dirty_from`) ve durum etiketleri.
- Kaynak renkleri ve her kaynağın emisyon katsayısı.
- İl değerlerinin nasıl tahmin edildiği (mevcut `map_footnote` ve `method_b5` metni, sade bir şemayla).
- Kullanım: hover, tıklama, zoom, sürükleme, saat oynatma, klavye kısayolları.

### 4.5 Veriler ve Yöntem
- Veriler: mevcut 24 saat ve 12 ay grafikleri, yeni temayla.
- Yöntem: mevcut metodoloji maddeleri ve katsayı tablosu.

## 5. Hover kartı ve yan panel

### 5.1 Hover kartı (`tooltip.js`)
- İçerik: plaka + il adı, yoğunluk (`gCO₂eq/kWh`) + durum etiketi, yenilenebilir payı, kaynak bazında yatay mini çubuklar (büyükten küçüğe, renk noktası + ad + yüzde).
- Kart imleci takip eder, viewport kenarına yaklaşınca yön değiştirir.
- Klavyeyle il odaklandığında ilin merkezine göre konumlanır.
- Sürükleme sırasında gizlenir. Seçili il için de gösterilir.

### 5.2 Yan panel (`panel.js`)
- Masaüstünde sağdan kayan, ~420px genişliğinde. Mobilde alttan açılan sayfa. `role="dialog"`, `aria-modal="false"` (harita kullanılabilir kalır), `aria-labelledby` il başlığı.
- Bölümler:
  1. Başlık: plaka, il adı, Antalya için COP31 rozeti, kapatma düğmesi.
  2. Seçili saat özeti: yoğunluk, durum, ulusal ortalamaya göre fark, yenilenebilir payı, baskın kaynak.
  3. Son 24 saat: ilin tahmini kaynak dağılımı (yığılmış alan grafiği) + yoğunluk çizgisi. `estimateProvinceHour` her saat için çalıştırılır.
  4. Geçmiş (aylık): `province-history.json` varsa aylık yığılmış çubuk grafik + yoğunluk çizgisi. Veri yoksa ya da il bulunamazsa "Geçmiş üretim verisi henüz yayınlanmadı" mesajı. Dosya örnek veriyse "Örnek Veri" rozeti.
  5. Kurulu güç profili: `capacity_pct` halka grafiği + liste.
- Davranış: il tıklanınca açılır ve harita ile yakınlaşır. Başka ile tıklanınca içerik güncellenir. Esc veya kapatma düğmesiyle kapanır, odak tıklanan ile döner. Saat kaydırıcısı değişince 2. bölüm güncellenir.
- URL: açıkken `#/harita?il=<slug>`. Kapatınca `#/harita`.
- Panel grafikleri her açılışta yeniden yaratılmaz, `chart.update()` ile güncellenir.

## 6. Veri sözleşmesi: `province-history.json`

```json
{
  "is_sample": true,
  "updated": "2026-11-01T00:00:00+03:00",
  "provinces": {
    "Antalya": {
      "months": [
        { "month": "2025-11", "avg_intensity": 212.4, "renewable_share": 0.71,
          "mix_pct": { "hydro": 41.2, "solar": 22.0, "gas": 19.8, "wind": 9.0, "biomass": 8.0 } }
      ]
    }
  }
}
```

Kurallar:
- `mix_pct` anahtarları yalnızca `karbon.publish.GROUPS` içindeki gruplar olabilir, toplamı 100 ± 0,5.
- MWh veya "generation" alanı bulunmaz (mevcut `test_published_data.py` bu dosyayı da otomatik tarar).
- İl adları `tr-map.json` içindeki adlarla birebir aynıdır.
- `scripts/make_sample.py` bu dosyanın sentetik sürümünü üretir: aylık ulusal örnek veri ile her ilin `capacity_pct` profili birleştirilir, mevsimsellik eklenir (yazın güneş, ilkbaharda hidro artar).
- Gerçek veri: API bağlandığında `update_data.py` aynı formatta yazacak. Bu, bu işin kapsamı dışındadır. Frontend sözleşmeye uyan her dosyayı değişiklik olmadan gösterir.
- Frontend dosyayı isteğe bağlı yükler: 404 veya doğrulama hatası olursa panelin geçmiş bölümü boş durum mesajı gösterir, sitenin geri kalanı etkilenmez.

## 7. Görsel yön

Konsept: **"Anadolu üzerinde gece uçuşu."**

- **Giriş animasyonu (`intro.js`, ~2,5 sn):** Koyu gece mavisi ekran, yukarı doğru akıp dağılan sis/bulut katmanları (CSS gradient + blur, görsel dosyası yok). Türkiye silueti küçük ve eğik (`perspective` + `rotateX`) başlar, büyüyerek düzleşir. İl sınırları sırayla ışıldar, enerji hatları akar, menü yukarıdan süzülür. "Geç" düğmesi ve tıklama/tuş ile atlanabilir. Oturumda bir kez oynar (`sessionStorage`). `prefers-reduced-motion: reduce` ise hiç oynamaz. Animasyon sırasında içerik `inert` olur, bitince kaldırılır.
- **Renk:** Koyu tema ana kimliktir (`#0b1020` taban, mürekkep/lacivert yüzeyler). Açık tema korunur. Fosil kaynaklar sıcak (kömür grisi, kehribar, turuncu), yenilenebilirler soğuk/parlak (camgöbeği, turkuaz, güneş sarısı) tonlardadır. Yoğunluk skalası mevcut yeşil → kırmızı mantığını korur. Durum etiketleri renge ek olarak sembol taşır (✓ ● ▲).
- **Tipografi:** Başlık ve sayılar Space Grotesk, metin Inter. Her ikisi `site/fonts/` altında yerel woff2, `font-display: swap`, sistem fontu yedeği. Sayılarda `font-variant-numeric: tabular-nums`.
- **Hareket:** Panolar kaydırınca hafif yukarıdan inip bulanıklıktan netleşerek belirir (`reveal.js`). Hover geçişleri 150–250 ms. Bütün animasyonlar `transform`/`opacity` ile yapılır.

## 8. Güvenlik

- **DOM yazımı:** Dinamik içerik yalnızca `textContent`, `createElement`, `createElementNS` ve `setAttribute` (sabit nitelik adlarıyla) ile yazılır. `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function` ve string ile `setTimeout` kullanılmaz. Mevcut koddaki oynat ikonu `innerHTML` kullanımı iki hazır `<path>` arasında geçişle değiştirilir.
- **Veri doğrulama (`data.js`):** Yüklenen her JSON şemaya göre kontrol edilir: sayılar sonlu ve makul aralıkta, kaynak anahtarları bilinen gruplar, il adları `tr-map.json`'daki liste, SVG `path` değerleri yalnızca `[MLHVZmlhvz0-9.,\s-]` karakterlerinden oluşur. Geçersiz kayıtlar atlanır.
- **CSP (meta):** `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`. `style-src` içindeki `'unsafe-inline'` kaldırılır. Dinamik stiller CSSOM (`el.style.x = ...`) ile verilir, bu CSP'ye takılmaz. Chart.js canvas kullandığı için etkilenmez (doğrulanacak).
- **Chart.js:** Mevcut sürüm ve SRI hash'i korunur, `crossorigin="anonymous"`.
- **Router:** Allowlist dışındaki hash ve parametreler yok sayılır.
- **Depolama:** `localStorage.lang` yalnızca `tr`/`en`, `sessionStorage.introSeen` yalnızca `"1"` kabul edilir. Erişim `try/catch` içindedir.
- **Clickjacking:** `<meta>` CSP'de `frame-ancestors` çalışmaz, GitHub Pages da başlık eklemeye izin vermez. Sitede form ya da işlem yapan bir eylem olmadığı için risk düşüktür. `guard.js` sayfa çerçeve içinde açılırsa uyarı bandı gösterir ve üst pencerede açma bağlantısı sunar. README'ye not eklenir.
- **Dış bağlantılar:** `target="_blank"` olanlar `rel="noopener noreferrer"` alır.
- **Üçüncü taraf:** Analitik, font CDN'i veya ek script yoktur. Fontlar OFL lisans dosyasıyla birlikte depoya eklenir.
- **Referrer:** `<meta name="referrer" content="strict-origin-when-cross-origin">`.

## 9. Erişilebilirlik

- Anlamsal yapı: `nav`, `main`, `section`, başlık hiyerarşisi. "İçeriğe atla" bağlantısı.
- Harita illeri `role="button"`, `tabindex="0"`, `aria-label` (il + yoğunluk + baskın kaynak). Enter/Boşluk seçer, odakta hover kartı görünür.
- Panel ve lejant odak yönetimi, Esc ile kapanma.
- Kontrast: metin en az WCAG AA.
- `prefers-reduced-motion` ile tüm süreklilik ve paralaks animasyonları kapanır.
- Grafiklere metin özetli `aria-label` (mevcut davranış korunur).

## 10. Hata durumları

- Zorunlu JSON (`latest`, `cop31`, `monthly`, `tr-map`) yüklenemezse: mevcut hata bandı gösterilir. Menü ve statik sayfalar (Rehber, Yöntem) çalışmaya devam eder.
- `province-history.json` yoksa veya geçersizse: yalnızca panelin geçmiş bölümü boş durum gösterir.
- Chart.js yüklenemezse: grafik alanlarında "Grafik yüklenemedi" metni gösterilir, sayısal kartlar çalışır.
- Gecikmiş veya başarısız güncelleme ile örnek veri bantları korunur ve bütün görünümlerde menünün altında gösterilir.

## 11. Test ve doğrulama

- **Python (`pytest`):**
  - Mevcut `test_published_data.py` yeni dosyayı da otomatik kapsar.
  - Yeni `test_province_history.py`: şema, grup anahtarları, toplam 100 ± 0,5, il adlarının `tr-map.json` ile eşleşmesi, yüzde/yoğunluk aralıkları.
  - Yeni `test_site_security.py`: `site/js/**/*.js` içinde `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval(`, `new Function`, `document.write` geçmemesi; `index.html` CSP'sinde `'unsafe-inline'` bulunmaması; dış script'lerde `integrity` niteliği bulunması.
- **Elle / tarayıcıda:** Yerel sunucuyla (`py -m http.server`) her rota açılır. Konsolda hata ve CSP ihlali olmadığı, hover kartı, panel, geri tuşu, dil değişimi, açık/koyu tema, mobil genişlik ve reduced-motion kontrol edilir.

## 12. Kapsam dışı

- EPİAŞ API entegrasyonu ve gerçek il bazlı veri üretimi.
- Python hesaplama mantığında değişiklik (yalnızca `make_sample.py` yeni dosyayı üretecek şekilde genişler).
- Build aracı, framework veya yeni npm bağımlılığı.
