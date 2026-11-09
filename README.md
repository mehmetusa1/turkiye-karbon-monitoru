# 🌱 Türkiye Elektrik Şebekesi Karbon Monitörü

Türkiye elektrik şebekesinde **üretilen elektriğin** saatlik karbon yoğunluğunu (`gCO₂eq/kWh`) ve yenilenebilir enerji payını (`%`) hesaplayıp görselleştiren açık kaynaklı web uygulaması.

Antalya'da düzenlenen **COP31 İklim Zirvesi (9–20 Kasım 2026)** boyunca şebekede üretilen elektriğin saatlik emisyon yoğunluğunu ve kaynak dağılımını takip etmek üzere geliştirilmiştir.

> **Sorumluluk ve Veri Notu:** Veri kaynağı **EPİAŞ Şeffaflık Platformu**'dur. Bu proje bağımsız, ticari olmayan ve açık kaynaklı bir çalışmadır; **EPİAŞ'ın resmî bir ürünü değildir.** EPİAŞ kullanım koşullarına uyum kapsamında ham üretim verileri (MWh) bu depoda veya web sitesinde **yeniden dağıtılmaz**; yalnızca bunlardan türetilen karbon yoğunluğu ve yüzde dağılım sonuçları yayınlanır.

---

## 🔍 Özellikler

- **Üretilen Elektriğin Karbon Yoğunluğu:** Saatlik ağırlıklı ortalama `gCO₂eq/kWh` değeri, yenilenebilir üretim payı ve son veri zaman damgası.
- **COP31 Şebeke Özeti:** 9–20 Kasım 2026 zirve dönemi boyunca ortalama karbon yoğunluğu, yenilenebilir payı, en düşük ve en yüksek yoğunluklu saatler (zirve öncesinde geri sayım).
- **Son 24 Saat Kaynak Dağılımı (%):** Kömür, doğalgaz, hidro, rüzgâr, güneş, jeotermal ve biyokütlenin saatlik yüzde payları ile karbon yoğunluğu eğrisi.
- **Son 12 Ay Trendi:** Aylık ortalama karbon yoğunluğu ve yenilenebilir üretim payı.
- **Hata ve Gecikme Koruması:** API erişimi kesilirse veya boş yanıt dönerse son geçerli veri korunur ve arayüzde *"Son veri güncellemesi yapılamadı / gecikti"* uyarısı gösterilir.
- **Menülü Arayüz:** Açılışta "havadan iniş" giriş animasyonu; üst menüden **Ana Sayfa**, **Harita**, **Harita Rehberi**, **Veriler** ve **Yöntem** sekmeleri (sayfa yenilemeden, geri tuşu destekli).
- **81 İl Haritası:** İlin üzerine gelince yoğunluk ve kaynak bazında dağılım (kömür, doğalgaz, hidro, rüzgâr, güneş…); ile tıklayınca son 24 saat, aylık geçmiş ve kurulu güç profilini gösteren yan panel. Paylaşılabilir bağlantı: `#/harita?il=antalya`.
- **Çift Dil ve Erişilebilirlik:** Tek tıkla **TR / EN** dil geçişi, sistem temasına uyumlu açık/koyu mod, klavyeyle tam kullanım, `prefers-reduced-motion` desteği ve renk körlüğüne duyarlı durum etiketleri.

---

## 📐 Metodoloji ve Kapsam Sınırları

Bu proje Türkiye'nin toplam karbon ayak izini **temsil etmez**; yalnızca **Türkiye elektrik şebekesinde üretilen elektriğin** yaklaşık emisyon yoğunluğunu hesaplar:

$$\text{Karbon Yoğunluğu}_t = \frac{\sum_{i} \text{Üretim}_{i,t} \times \text{Katsayı}_i}{\sum_{i} \text{Üretim}_{i,t}}$$

1. **Yaşam Döngüsü (Life-Cycle) Katsayıları:** Yalnızca doğrudan baca gazı emisyonları değil, santral kurulumu ve yakıt tedarik zincirini içeren **IPCC AR5 WGIII (2014) Annex III, Tablo A.III.2** medyan değerleri (`gCO₂eq/kWh`) esas alınır:
   - Linyit: `1000` (literatür aralığı ~950–1150; düşük kalorili yerli linyit)
   - Taş kömürü / İthal kömür: `820` (IPCC medyan)
   - Doğalgaz / LNG: `490` (IPCC kombine çevrim medyan)
   - Fuel-oil / Nafta: `650`
   - Biyokütle: `230` (IPCC medyan)
   - Güneş (PV): `41` (IPCC medyan)
   - Jeotermal: `38` (IPCC küresel medyan — *Not: Türkiye'deki bazı jeotermal sahalarda doğal akışkan kaynaklı CO₂ salımı küresel medyandan belirgin biçimde yüksektir*)
   - Hidroelektrik (Barajlı / Akarsu): `24` (IPCC medyan)
   - Nükleer: `12` (IPCC medyan)
   - Rüzgâr: `11` (IPCC kara rüzgârı medyan)
2. **Üretim Bazlı Hesap:** Hesaplama yalnızca şebekeye verilen üretimi kapsar.
3. **İthalat, İhracat ve Şebeke Kayıpları Hariçtir:** Komşu ülkelerle yapılan elektrik ticareti ile iletim ve dağıtım kayıpları hesaba dahil değildir.
4. **Veri Kapsamı:** EPİAŞ gerçek zamanlı üretim (`realtime-generation`) uç noktasına dayanır; gerçek zamanlı akışta yer almayan bazı öz tüketim amaçlı lisanssız güneş santralleri kapsam dışı kalabilir.

---

## 🛠️ Kurulum ve Çalıştırma

### 1. Ortamı hazırlayın
```powershell
git clone https://github.com/<kullanici-adiniz>/turkiye-karbon-monitoru.git
cd turkiye-karbon-monitoru
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Testleri çalıştırın
```powershell
pytest -v
```
Test paketi ([tests/](tests/)) hem ağırlıklı ortalama hesabını hem API hata korumasını hem de `site/data/*.json` dosyalarında ham MWh verisi bulunmadığını doğrular.

### 3. Örnek veriyle yerel önizleme (API anahtarı olmadan)
```powershell
py scripts/make_sample.py
py -m http.server 8000 --bind 127.0.0.1 -d site
```
Tarayıcıda `http://127.0.0.1:8000` adresini açın. (COP31 özet kartını önizlemek için: `http://127.0.0.1:8000/?preview`)

Tarayıcı tarafı birim testleri (bağımlılıksız) `tests/js/` altındadır ve `site/` dışında tutulur, böylece GitHub Pages'te yayınlanmaz. Çalıştırmak için sunucuyu proje kökünden başlatın (yalnızca `127.0.0.1`):
```powershell
py -m http.server 8001 --bind 127.0.0.1
```
`http://127.0.0.1:8001/tests/js/` sayfası `PASS n/n` göstermelidir. 390px önizleme: `http://127.0.0.1:8001/tests/js/frame.html`.

### Frontend yapısı
```
site/index.html    tek HTML kabuğu (5 görünüm, katı CSP)
site/css/          tokens, base, nav, intro, home, map, panel, sections
site/js/           main, router, state, views, i18n, format, data, intro, hero, reveal,
                   home, map, tooltip, panel, charts, pages, guard
site/fonts/        Space Grotesk + Inter (yerel woff2, SIL OFL 1.1; lisans dosyaları aynı klasörde)
```
Build adımı veya npm bağımlılığı yoktur; tek dış script Chart.js'tir (SRI hash ile).

### 4. EPİAŞ API ile gerçek veri çekme
1. `.env.example` dosyasını `.env` adıyla kopyalayın:
   ```powershell
   Copy-Item .env.example .env
   ```
2. `.env` dosyasının içine EPİAŞ Şeffaflık Platformu kullanıcı adı ve şifrenizi yazın (`EPTR_USERNAME` ve `EPTR_PASSWORD`). `.env` dosyası `.gitignore` içindedir, **asla** Git'e eklenmez.
3. Veriyi güncelleyin:
   ```powershell
   # İlk kurulumda 1 yıllık geçmişi (30 günlük parçalar halinde) çekmek için:
   py scripts/update_data.py --backfill-year

   # Normal saatlik güncelleme için:
   py scripts/update_data.py
   ```

---

## 🗂️ İl Geçmişi Veri Sözleşmesi (`site/data/province-history.json`)

İl yan panelindeki aylık geçmiş bu dosyadan okunur. `scripts/make_sample.py` sentetik bir sürüm üretir; `scripts/update_data.py` canlı veriyi **aynı formatta** yazar (son 12 ay; kayıtlı tam aylar korunur, çekim penceresinin başındaki kısmi ay onları ezmez). Tam 12 ay için ilk kurulumda `--backfill-year` ile bir kez çalıştırın. Biçim:

```json
{ "is_sample": false, "updated": "2026-11-01T00:00:00+03:00",
  "provinces": { "Antalya": { "months": [
    { "month": "2025-11", "avg_intensity": 212.4, "renewable_share": 0.71,
      "mix_pct": { "hydro": 41.2, "solar": 22.0, "gas": 19.8, "wind": 9.0, "biomass": 8.0 } } ] } } }
```

- `mix_pct` anahtarları yalnızca `karbon.publish.GROUPS` grupları, toplamı 100 ± 0,5; il adları `tr-map.json` ile birebir aynı.
- Ham MWh yazılmaz (`tests/test_published_data.py` ve `tests/test_province_history.py` doğrular).
- Dosya yoksa veya geçersizse panel yalnızca geçmiş bölümünde "henüz yayınlanmadı" mesajı gösterir.

---

## 🏭 İl Santralleri (`site/data/plants.json`)

İl panelindeki "Bu ildeki büyük santraller" listesi **WRI Global Power Plant Database v1.3.0** verisinden üretilir (lisans: **CC BY 4.0**, veri 2021 itibarıyla; küçük GES/RES'ler dahil değildir). Her santral koordinatına göre il sınırına eşlenir; il başına kurulu güce göre en büyük 8 santral listelenir.

```powershell
# 1) CSV'yi bir kez indirin (depoya eklemeyin, ~12 MB):
#    https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv
# 2) Listeyi üretin:
py scripts/build_plants.py C:\yol\global_power_plant_database.csv
```

**Elle düzeltme:** `data/plants-overrides.json` dosyasında
- `remove`: kaldırılacak santral id'leri (ör. `"WRI1018724"`),
- `move`: yanlış ile düşen santral için `"id": "Doğru İl"`,
- `add`: veri setinde olmayan santraller (`province`, `name`, `group`, `capacity_mw`).

Düzeltmeden sonra betiği yeniden çalıştırın. Geçersiz il veya kaynak türü yazılırsa betik hata verir.

---

## 🔐 Güvenlik ve GitHub Actions Otomasyonu

Saatlik otomatik güncelleme [`.github/workflows/update.yml`](.github/workflows/update.yml) iş akışı ile çalışır:

1. **Kimlik Bilgileri:** EPİAŞ kullanıcı adı ve şifresi koda **yazılmaz**. GitHub deposunda **Settings → Secrets and variables → Actions** altında `EPTR_USERNAME` ve `EPTR_PASSWORD` olarak saklanır.
2. **Otomatik Doğrulama:** İş akışı her saat başı veriyi çeker, türetilmiş özetleri üretir, `pytest` ile ham veri sızıntısı olmadığını doğrular ve yalnızca `site/data/*.json` dosyalarını günceller.
3. **Frontend güvenliği:** Katı CSP (`script-src 'self'` + Chart.js SRI, `style-src 'self'`, `'unsafe-inline'` yok); dinamik içerik yalnızca `textContent` / `createElement` ile yazılır; tüm JSON verileri şemaya göre doğrulanır; URL'deki rota ve il parametresi izin listesiyle kontrol edilir. `tests/test_site_security.py` bu kuralları her `pytest` çalışmasında denetler.
4. **Clickjacking notu:** `<meta>` ile verilen CSP'de `frame-ancestors` çalışmaz ve GitHub Pages özel HTTP başlığı eklemeye izin vermez. Sitede form veya işlem yapan bir eylem bulunmadığından risk düşüktür; sayfa başka bir sitenin çerçevesinde açılırsa uyarı bandı gösterilir. Başlık eklenebilen bir barındırmaya geçilirse `Content-Security-Policy: frame-ancestors 'none'` eklenmelidir.
5. **GitHub Pages Yayını:** GitHub deposunda **Settings → Pages** bölümünden kaynak dalı (`main`) ve klasörü (`/site` veya kök yönlendirmesi) seçilerek ücretsiz yayınlanır.

---

## 📄 Lisans

Bu projenin kaynak kodu [MIT Lisansı](LICENSE) altında lisanslanmıştır.
