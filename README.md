# 🌱 Türkiye Elektrik Şebekesi Karbon Monitörü

Türkiye'de üretilen elektriğin **ne kadar temiz ya da kirli olduğunu** saat saat gösteren açık kaynaklı bir web sitesi.

Her saat, elektriğin hangi kaynaklardan (kömür, doğalgaz, baraj, rüzgâr, güneş…) üretildiğine bakılır ve **1 kWh elektrik başına salınan CO₂ miktarı** (`gCO₂eq/kWh`) hesaplanır. Sayı ne kadar düşükse elektrik o kadar temizdir.

Antalya'daki **COP31 İklim Zirvesi (9–20 Kasım 2026)** için geliştirilmiştir.

**🔗 Siteyi aç: https://mehmetusa1.github.io/turkiye-karbon-monitoru/**

---

## Sitede neler var

- **Şu anki durum:** Son saatin karbon yoğunluğu ve yenilenebilir enerji payı
- **Son 24 saat:** Saat saat kaynak dağılımı ve karbon eğrisi
- **Son 12 ay:** Aylık ortalamalar; mevsim farkları (kışın kömür, baharda baraj) açıkça görülür
- **81 il haritası:** İle tıklayınca o ilin üretim profili, aylık geçmişi ve büyük santralleri
- **COP31 özeti:** Zirve boyunca şebekenin ortalama değerleri
- **Türkçe / İngilizce**, açık / koyu tema, klavyeyle tam kullanım, renk körlüğüne duyarlı etiketler

Veri her saat otomatik olarak güncellenir.

---

## Veri kaynakları

- **Elektrik üretimi:** [EPİAŞ Şeffaflık Platformu](https://seffaflik.epias.com.tr). Ham üretim verisi yeniden yayınlanmaz; sitede yalnızca bu veriden hesaplanan sonuçlar yer alır.
- **Santral listesi:** [WRI Global Power Plant Database](https://datasets.wri.org/dataset/globalpowerplantdatabase) v1.3.0 (CC BY 4.0, veri 2021 itibarıyla).
- **Emisyon katsayıları:** IPCC AR5 (2014) yaşam döngüsü değerleri.

> Bu proje bağımsız ve ticari olmayan bir çalışmadır; **EPİAŞ'ın resmî bir ürünü değildir.**

**Kapsam:** Yalnızca Türkiye'de *üretilen* elektriği hesaplar. Ülkenin toplam karbon ayak izini, elektrik ithalatı/ihracatını ve şebeke kayıplarını kapsamaz.

---

## Kendi bilgisayarında çalıştırma

```powershell
git clone https://github.com/mehmetusa1/turkiye-karbon-monitoru.git
cd turkiye-karbon-monitoru
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
py scripts/make_sample.py
py -m http.server 8000 --bind 127.0.0.1 -d site
```

Ardından tarayıcıda `http://127.0.0.1:8000` adresini açın. Bu komutlar örnek veriyle çalışır; gerçek veri, katsayı tablosu ve teknik ayrıntılar için [Geliştirici Notları](docs/GELISTIRICI.md) dosyasına bakın.

---

## Lisans

Kaynak kodu [MIT Lisansı](LICENSE) altındadır.
