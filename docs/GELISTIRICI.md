# Geliştirici Notları

Bu dosya projeyi geliştirecek veya kendi bilgisayarında çalıştıracak kişiler içindir. Genel tanıtım için [README](../README.md) dosyasına bakın.

---

## Karbon katsayıları

Hesap, her saat için üretim ağırlıklı ortalamadır:

$$\text{Karbon Yoğunluğu}_t = \frac{\sum_{i} \text{Üretim}_{i,t} \times \text{Katsayı}_i}{\sum_{i} \text{Üretim}_{i,t}}$$

Katsayılar yaşam döngüsü (life-cycle) değerleridir; santral kurulumu ve yakıt tedarik zinciri dahildir. Kaynak: **IPCC AR5 WGIII (2014) Annex III, Tablo A.III.2** medyan değerleri (`gCO₂eq/kWh`).

| Kaynak | Katsayı | Not |
|---|---|---|
| Linyit | 1000 | Literatür aralığı ~950–1150; düşük kalorili yerli linyit |
| Taş kömürü / İthal kömür | 820 | |
| Doğalgaz / LNG | 490 | Kombine çevrim |
| Fuel-oil / Nafta | 650 | |
| Biyokütle | 230 | |
| Güneş (PV) | 41 | |
| Jeotermal | 38 | Küresel medyan; Türkiye'deki bazı sahalarda gerçek salım belirgin biçimde yüksektir |
| Hidroelektrik | 24 | Barajlı ve akarsu |
| Nükleer | 12 | |
| Rüzgâr | 11 | Kara rüzgârı |

Veri EPİAŞ gerçek zamanlı üretim (`realtime-generation`) uç noktasından gelir. Gerçek zamanlı akışta yer almayan bazı öz tüketim amaçlı lisanssız güneş santralleri kapsam dışı kalabilir.

---

## Kurulum

```powershell
git clone https://github.com/mehmetusa1/turkiye-karbon-monitoru.git
cd turkiye-karbon-monitoru
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest -v
```

Test paketi ağırlıklı ortalama hesabını, API hata korumasını, site güvenlik kurallarını ve `site/data/*.json` dosyalarında ham MWh verisi bulunmadığını doğrular.

### Örnek veriyle önizleme (EPİAŞ hesabı olmadan)
```powershell
py scripts/make_sample.py
py -m http.server 8000 --bind 127.0.0.1 -d site
```
`http://127.0.0.1:8000` adresini açın. COP31 özet kartını önizlemek için `?preview` ekleyin.

### Gerçek veri
1. `Copy-Item .env.example .env` ile kopyalayın, `EPTR_USERNAME` ve `EPTR_PASSWORD` alanlarına EPİAŞ Şeffaflık Platformu bilgilerinizi yazın. `.env` Git'e eklenmez.
2. İlk kurulumda son 1 yılı çekin: `py scripts/update_data.py --backfill-year`
3. Sonraki güncellemeler: `py scripts/update_data.py`

`eptr2` kütüphanesi oturum anahtarını proje kökündeki `.eptr2-tgt` dosyasında saklar. Bu dosya da gizlidir ve `.gitignore` ile dışarıda tutulur.

### Tarayıcı testleri
`tests/js/` altındadır ve `site/` dışında tutulur, böylece yayınlanmaz.
```powershell
py -m http.server 8001 --bind 127.0.0.1
```
`http://127.0.0.1:8001/tests/js/` sayfası `PASS n/n` göstermelidir. 390px önizleme: `http://127.0.0.1:8001/tests/js/frame.html`.

---

## Frontend yapısı

```
site/index.html    tek HTML kabuğu (5 görünüm, katı CSP)
site/css/          tokens, base, nav, intro, home, map, panel, sections
site/js/           main, router, state, views, i18n, format, data, intro, hero, reveal,
                   home, map, tooltip, panel, charts, pages, guard
site/fonts/        Manrope (yerel woff2, @fontsource-variable/manrope 5.3.0, SIL OFL 1.1; lisans aynı klasörde)
```
Build adımı veya npm bağımlılığı yoktur; tek dış script Chart.js'tir (SRI hash ile).

---

## İl geçmişi veri formatı (`site/data/province-history.json`)

İl panelindeki aylık geçmiş bu dosyadan okunur. `scripts/make_sample.py` sentetik sürümünü, `scripts/update_data.py` gerçek sürümünü aynı formatta yazar. Son 12 ay tutulur; kayıtlı tam aylar korunur, çekim penceresinin başındaki kısmi ay onları ezmez.

```json
{ "is_sample": false, "updated": "2026-11-01T00:00:00+03:00",
  "provinces": { "Antalya": { "months": [
    { "month": "2025-11", "avg_intensity": 212.4, "renewable_share": 0.71,
      "mix_pct": { "hydro": 41.2, "solar": 22.0, "gas": 19.8, "wind": 9.0, "biomass": 8.0 } } ] } } }
```

- `mix_pct` anahtarları yalnızca `karbon.publish.GROUPS` gruplarıdır, toplamı 100 ± 0,5; il adları `tr-map.json` ile birebir aynıdır.
- Ham MWh yazılmaz (`tests/test_published_data.py` ve `tests/test_province_history.py` doğrular).
- Dosya yoksa veya geçersizse panel, geçmiş bölümünde "henüz yayınlanmadı" mesajı gösterir.

---

## İl santralleri (`site/data/plants.json`)

Liste **WRI Global Power Plant Database v1.3.0** verisinden üretilir (CC BY 4.0, veri 2021 itibarıyla; küçük GES/RES'ler dahil değildir). Her santral koordinatına göre ile eşlenir; il başına kurulu güce göre en büyük 8 santral listelenir.

```powershell
# 1) CSV'yi bir kez indirin (depoya eklemeyin, ~12 MB):
#    https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv
# 2) Listeyi üretin:
py scripts/build_plants.py C:\yol\global_power_plant_database.csv
```

Elle düzeltmeler `data/plants-overrides.json` dosyasındadır:
- `remove`: kaldırılacak santral id'leri (ör. `"WRI1018724"`)
- `move`: yanlış ile düşen santral için `"id": "Doğru İl"`
- `add`: veri setinde olmayan santraller (`province`, `name`, `group`, `capacity_mw`)

Düzeltmeden sonra betiği yeniden çalıştırın. Geçersiz il veya kaynak türü yazılırsa betik hata verir.

---

## Otomatik güncelleme ve güvenlik

Saatlik güncelleme [`.github/workflows/update.yml`](../.github/workflows/update.yml) ile çalışır.

- **Kimlik bilgileri:** Koda yazılmaz. GitHub'da **Settings → Secrets and variables → Actions** altında `EPTR_USERNAME` ve `EPTR_PASSWORD` olarak saklanır.
- **Akış:** Her saatin 12. dakikasında veri çekilir, özetler üretilir, `pytest` çalışır ve yalnızca `site/data/*.json` dosyaları commit'lenir.
- **Frontend:** Katı CSP (`script-src 'self'` + Chart.js SRI, `style-src 'self'`, `'unsafe-inline'` yok). Dinamik içerik yalnızca `textContent` / `createElement` ile yazılır. JSON verileri şemaya göre doğrulanır; URL'deki rota ve il parametresi izin listesiyle kontrol edilir. `tests/test_site_security.py` bu kuralları denetler.
- **Clickjacking:** `<meta>` CSP'de `frame-ancestors` çalışmaz ve GitHub Pages özel HTTP başlığı eklemeye izin vermez. Sitede form veya işlem yapan bir eylem olmadığından risk düşüktür; sayfa başka bir sitenin çerçevesinde açılırsa uyarı bandı gösterilir. Başlık eklenebilen bir barındırmaya geçilirse `Content-Security-Policy: frame-ancestors 'none'` eklenmelidir.
- **GitHub Pages:** [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) yalnızca `site/` klasörünü yayınlar; `tests/`, `scripts/`, `docs/` yayına girmez. `site/` değişince ve her başarılı saatlik veri güncellemesinden sonra çalışır (bot commit'i `push` tetiklemediği için `workflow_run` kullanılır). Depo ayarlarında **Settings → Pages → Source: GitHub Actions** seçili olmalıdır.
