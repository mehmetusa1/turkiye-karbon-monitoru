"""Elektrik üretim kaynaklarının emisyon katsayıları.

Birim: gCO2eq/kWh, yaşam döngüsü (üretim + inşaat + yakıt zinciri).
Ana kaynak: IPCC AR5 WGIII (2014), Annex III, Tablo A.III.2 medyan değerleri.

`verified=False` olan değerler henüz yer tutucudur. Yayından önce bir
kaynakla doğrulanmalı ve Yöntem sayfasına yazılmalıdır.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Factor:
    g_per_kwh: float
    source: str
    verified: bool
    note: str = ""


IPCC = "IPCC AR5 WGIII Annex III (2014), medyan"

FACTORS: dict[str, Factor] = {
    # Fosil
    "lignite": Factor(1000, "Literatür aralığı ~950-1150", False,
                      "Türk linyiti düşük kalorili; IPCC kömürü ayırmıyor."),
    "hard_coal": Factor(820, IPCC + " (pulverize kömür)", True),
    "imported_coal": Factor(820, IPCC + " (pulverize kömür)", True),
    "asphaltite": Factor(1000, "Linyit varsayımı", False),
    "natural_gas": Factor(490, IPCC + " (kombine çevrim)", True),
    "lng": Factor(490, IPCC + " (kombine çevrim)", False,
                  "LNG'nin sıvılaştırma ve taşıma emisyonları daha yüksek olabilir."),
    "fuel_oil": Factor(650, "Yer tutucu", False),
    "naphtha": Factor(650, "Yer tutucu", False),
    # Yenilenebilir ve düşük karbonlu
    "biomass": Factor(230, IPCC + " (özel biyokütle)", True),
    "geothermal": Factor(38, IPCC, True,
                         "Bazı Türk sahalarında ölçülen CO2 salımı çok daha yüksek; "
                         "Yöntem sayfasında belirtilmeli."),
    "dam_hydro": Factor(24, IPCC, True),
    "river_hydro": Factor(24, IPCC, True),
    "wind": Factor(11, IPCC + " (karada)", True),
    "solar": Factor(41, IPCC + " (çatı GES; büyük ölçekli GES 48)", True),
    "nuclear": Factor(12, IPCC, True),
    "waste_heat": Factor(0, "Yer tutucu", False),
}

RENEWABLE_SOURCES: frozenset[str] = frozenset(
    {"biomass", "geothermal", "dam_hydro", "river_hydro", "wind", "solar"}
)
