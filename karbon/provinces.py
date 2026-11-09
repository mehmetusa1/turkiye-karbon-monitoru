"""81 il için kurulu güç profili ve saatlik bölgesel karbon yoğunluğu tahmini.

Yöntem notu:
EPİAŞ gerçek zamanlı üretim verisi ulusal toplam olarak yayınlanır. Bu modül,
her ilin kurulu güç profilini (kömür, doğalgaz, hidro, rüzgâr, güneş, jeotermal,
biyokütle ağırlıkları) o saatteki ulusal kaynak kullanılabilirlik çarpanıyla
birleştirerek il bazında "yerel üretim profili karbon yoğunluğu" (gCO2eq/kWh)
tahmini üretir. Örneğin gece saatlerinde ulusal güneş üretimi 0 olduğunda tüm
illerde güneş katkısı 0'a iner; öğlen güneş yükseldiğinde GES ağırlıklı illerde
(Konya, Karaman, Şanlıurfa, Antalya vb.) güneş payı artar ve yoğunluk düşer.
"""

from collections import defaultdict
from collections.abc import Iterable, Mapping

# Grup bazında yaşam döngüsü emisyon katsayıları (gCO2eq/kWh, IPCC AR5 medyan)
GROUP_FACTORS: dict[str, float] = {
    "coal": 900.0,       # Yerli linyit (1000) ve taş/ithal kömür (820) karma ortalaması
    "gas": 490.0,
    "other": 650.0,
    "biomass": 230.0,
    "solar": 41.0,
    "geothermal": 38.0,
    "hydro": 24.0,
    "nuclear": 12.0,
    "wind": 11.0,
}

RENEWABLE_GROUPS: frozenset[str] = frozenset(
    {"hydro", "wind", "solar", "geothermal", "biomass"}
)

# Ulusal referans kurulu güç payları (normalize edilmiş, toplam = 100)
NATIONAL_BASELINE_PCT: dict[str, float] = {
    "coal": 21.0,
    "gas": 24.0,
    "hydro": 29.0,
    "wind": 12.0,
    "solar": 11.0,
    "geothermal": 1.6,
    "biomass": 1.4,
}

# 81 ilin kurulu güç/üretim karakteristiği ağırlıkları (toplamları otomatik normalize edilir)
# Anahtarlar: GeoJSON 'name' alanı ile birebir eşleşir.
PROVINCE_CAPACITIES: dict[str, dict[str, float]] = {
    "Adana": {"hydro": 45, "coal": 30, "solar": 12, "wind": 8, "biomass": 5},
    "Adıyaman": {"hydro": 55, "solar": 28, "gas": 10, "wind": 7},
    "Afyon": {"solar": 38, "wind": 28, "geothermal": 16, "biomass": 12, "gas": 6},
    "Ağrı": {"hydro": 55, "solar": 35, "wind": 10},
    "Aksaray": {"solar": 58, "hydro": 15, "wind": 15, "biomass": 7, "gas": 5},
    "Amasya": {"hydro": 48, "wind": 28, "solar": 16, "biomass": 8},
    "Ankara": {"gas": 42, "coal": 22, "solar": 18, "hydro": 12, "biomass": 6},
    "Antalya": {"hydro": 52, "solar": 28, "gas": 12, "wind": 5, "biomass": 3},
    "Ardahan": {"hydro": 78, "solar": 15, "wind": 7},
    "Artvin": {"hydro": 92, "solar": 5, "wind": 3},
    "Aydın": {"geothermal": 58, "wind": 22, "solar": 12, "hydro": 5, "biomass": 3},
    "Balıkesir": {"wind": 58, "gas": 18, "hydro": 8, "solar": 10, "biomass": 6},
    "Bartın": {"coal": 65, "hydro": 22, "solar": 8, "biomass": 5},
    "Batman": {"hydro": 68, "solar": 20, "gas": 12},
    "Bayburt": {"hydro": 72, "solar": 20, "wind": 8},
    "Bilecik": {"hydro": 38, "wind": 30, "gas": 18, "solar": 10, "biomass": 4},
    "Bingöl": {"hydro": 76, "solar": 18, "wind": 6},
    "Bitlis": {"hydro": 55, "solar": 32, "wind": 13},
    "Bolu": {"coal": 45, "hydro": 30, "solar": 12, "biomass": 13},
    "Burdur": {"solar": 48, "hydro": 30, "wind": 14, "biomass": 8},
    "Bursa": {"gas": 48, "wind": 22, "hydro": 14, "coal": 8, "solar": 5, "biomass": 3},
    "Çanakkale": {"coal": 52, "wind": 34, "gas": 8, "solar": 4, "biomass": 2},
    "Çankırı": {"solar": 45, "hydro": 25, "coal": 15, "wind": 15},
    "Çorum": {"hydro": 46, "solar": 30, "wind": 14, "coal": 10},
    "Denizli": {"geothermal": 46, "hydro": 20, "solar": 18, "wind": 10, "gas": 6},
    "Diyarbakır": {"hydro": 66, "solar": 24, "biomass": 5, "gas": 5},
    "Düzce": {"hydro": 58, "solar": 18, "biomass": 14, "gas": 10},
    "Edirne": {"wind": 54, "gas": 18, "solar": 14, "coal": 10, "biomass": 4},
    "Elazığ": {"hydro": 78, "solar": 16, "wind": 6},
    "Erzincan": {"hydro": 74, "solar": 20, "wind": 6},
    "Erzurum": {"hydro": 68, "solar": 24, "wind": 8},
    "Eskişehir": {"gas": 32, "coal": 25, "solar": 24, "wind": 12, "biomass": 7},
    "Gaziantep": {"solar": 46, "wind": 22, "hydro": 14, "gas": 12, "biomass": 6},
    "Giresun": {"hydro": 86, "wind": 8, "solar": 6},
    "Gümüşhane": {"hydro": 82, "solar": 12, "wind": 6},
    "Hakkari": {"hydro": 75, "solar": 20, "wind": 5},
    "Hatay": {"wind": 42, "coal": 28, "hydro": 14, "solar": 12, "gas": 4},
    "Iğdır": {"solar": 62, "hydro": 30, "wind": 8},
    "Isparta": {"solar": 45, "hydro": 32, "wind": 16, "biomass": 7},
    "İstanbul": {"gas": 54, "wind": 26, "biomass": 12, "solar": 8},
    "İzmir": {"wind": 44, "gas": 28, "coal": 10, "solar": 10, "geothermal": 5, "biomass": 3},
    "Kahramanmaraş": {"coal": 54, "hydro": 30, "solar": 10, "wind": 6},
    "Karabük": {"coal": 42, "hydro": 36, "solar": 14, "biomass": 8},
    "Karaman": {"solar": 56, "hydro": 26, "wind": 14, "biomass": 4},
    "Kars": {"hydro": 68, "solar": 24, "wind": 8},
    "Kastamonu": {"hydro": 62, "solar": 20, "wind": 10, "biomass": 8},
    "Kayseri": {"solar": 44, "wind": 26, "hydro": 18, "gas": 8, "biomass": 4},
    "Kilis": {"solar": 58, "wind": 28, "gas": 10, "biomass": 4},
    "Kırıkkale": {"gas": 56, "solar": 24, "hydro": 15, "coal": 5},
    "Kırklareli": {"gas": 46, "wind": 38, "solar": 10, "biomass": 6},
    "Kırşehir": {"solar": 48, "wind": 28, "hydro": 16, "biomass": 8},
    "Kocaeli": {"gas": 58, "wind": 18, "solar": 12, "biomass": 8, "coal": 4},
    "Konya": {"solar": 66, "wind": 12, "hydro": 6, "gas": 8, "coal": 4, "biomass": 4},
    "Kütahya": {"coal": 68, "solar": 16, "wind": 10, "geothermal": 6},
    "Malatya": {"solar": 48, "hydro": 36, "wind": 10, "biomass": 6},
    "Manisa": {"coal": 42, "wind": 24, "geothermal": 18, "solar": 10, "hydro": 6},
    "Mardin": {"solar": 62, "hydro": 22, "wind": 10, "gas": 6},
    "Mersin": {"hydro": 34, "solar": 28, "wind": 22, "gas": 10, "biomass": 6},
    "Muğla": {"coal": 64, "hydro": 16, "solar": 12, "wind": 8},
    "Muş": {"hydro": 64, "solar": 28, "wind": 8},
    "Nevşehir": {"solar": 62, "hydro": 22, "wind": 10, "biomass": 6},
    "Niğde": {"solar": 64, "hydro": 18, "wind": 12, "biomass": 6},
    "Ordu": {"hydro": 78, "wind": 12, "solar": 6, "biomass": 4},
    "Osmaniye": {"wind": 44, "hydro": 38, "solar": 14, "biomass": 4},
    "Rize": {"hydro": 90, "solar": 6, "wind": 4},
    "Sakarya": {"gas": 44, "hydro": 28, "wind": 14, "solar": 8, "biomass": 6},
    "Samsun": {"gas": 34, "hydro": 38, "wind": 14, "solar": 8, "biomass": 6},
    "Şanlıurfa": {"hydro": 56, "solar": 34, "gas": 6, "biomass": 4},
    "Siirt": {"hydro": 82, "solar": 14, "wind": 4},
    "Sinop": {"hydro": 68, "wind": 18, "solar": 10, "biomass": 4},
    "Şırnak": {"coal": 72, "solar": 18, "hydro": 10},
    "Sivas": {"coal": 38, "hydro": 28, "wind": 18, "solar": 16},
    "Tekirdağ": {"gas": 48, "wind": 32, "coal": 10, "solar": 6, "biomass": 4},
    "Tokat": {"hydro": 58, "wind": 22, "solar": 16, "biomass": 4},
    "Trabzon": {"hydro": 86, "solar": 8, "wind": 6},
    "Tunceli": {"hydro": 84, "solar": 12, "wind": 4},
    "Uşak": {"solar": 50, "wind": 26, "geothermal": 10, "biomass": 8, "gas": 6},
    "Van": {"solar": 56, "hydro": 32, "wind": 8, "geothermal": 4},
    "Yalova": {"wind": 56, "gas": 24, "solar": 12, "biomass": 8},
    "Yozgat": {"solar": 46, "wind": 28, "hydro": 18, "biomass": 8},
    "Zonguldak": {"coal": 86, "hydro": 6, "solar": 4, "wind": 4},
}


def normalized_capacity(province: str) -> dict[str, float]:
    """İlin kurulu güç ağırlıklarını toplamı 100 olacak şekilde normalize eder."""
    raw = PROVINCE_CAPACITIES[province]
    total = sum(raw.values())
    return {k: round(v / total * 100, 1) for k, v in raw.items() if v > 0}


def estimate_province_hour(
    capacity_pct: Mapping[str, float],
    national_mix_pct: Mapping[str, float],
) -> dict:
    """İlin kurulu güç profili ve o saatteki ulusal üretim payından il tahmini üretir."""
    weighted: dict[str, float] = {}
    for group, cap in capacity_pct.items():
        if cap <= 0:
            continue
        base = NATIONAL_BASELINE_PCT.get(group, 5.0)
        avail = national_mix_pct.get(group, 0.0) / base
        weighted[group] = cap * avail

    total = sum(weighted.values())
    if total <= 0:
        # Yedek: tüm çarpanlar sıfırsa kurulu güç oranlarını kullan
        weighted = {g: c for g, c in capacity_pct.items() if c > 0}
        total = sum(weighted.values())

    mix_pct = {g: round(v / total * 100, 1) for g, v in weighted.items() if v > 0}
    intensity = sum((v / total) * GROUP_FACTORS[g] for g, v in weighted.items())
    ren_share = sum(v / total for g, v in weighted.items() if g in RENEWABLE_GROUPS)
    dominant = max(weighted, key=weighted.get)

    return {
        "intensity": round(intensity, 1),
        "renewable_share": round(ren_share, 3),
        "dominant": dominant,
        "mix_pct": mix_pct,
    }


def province_history(hours: Iterable[Mapping]) -> dict[str, dict]:
    """81 il için aylık tahmini üretim profili (yalnızca yüzde ve yoğunluk; MWh yok).

    `hours` öğeleri `derive_hour` çıktısıdır (`time`, `mix_pct`). Her saat her il
    için `estimate_province_hour` ile hesaplanır; aylık kovada ortalama alınır.
    """
    buckets: dict[str, list[Mapping]] = defaultdict(list)
    for h in hours:
        buckets[h["time"][:7]].append(h["mix_pct"])

    out: dict[str, dict] = {}
    for province in PROVINCE_CAPACITIES:
        capacity = normalized_capacity(province)
        months = []
        for month, mixes in sorted(buckets.items()):
            ests = [estimate_province_hour(capacity, mix) for mix in mixes]
            n = len(ests)
            sums: dict[str, float] = defaultdict(float)
            for e in ests:
                for g, v in e["mix_pct"].items():
                    sums[g] += v
            total = sum(sums.values())
            mix_pct = {g: round(v / total * 100, 1) for g, v in sums.items() if v > 0}
            months.append({
                "month": month,
                "avg_intensity": round(sum(e["intensity"] for e in ests) / n, 1),
                "renewable_share": round(sum(e["renewable_share"] for e in ests) / n, 3),
                "mix_pct": {g: v for g, v in mix_pct.items() if v > 0},
            })
        out[province] = {"months": months}
    return out
