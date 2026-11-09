"""Yayınlanacak (public) veriyi üretir.

KURAL: Buradan çıkan hiçbir şey ham üretim verisi (MWh) içermez.
EPİAŞ'a verilen söz gereği public repoya ve siteye yalnızca türetilmiş
değerler girer: karbon yoğunluğu, yenilenebilir payı, kaynakların yüzde payı.
"""

from collections import defaultdict
from collections.abc import Iterable, Mapping
from statistics import fmean

from karbon.intensity import _validate, carbon_intensity, renewable_share
from karbon.factors import FACTORS

# Grafikte gösterilecek kaynak grupları (sıra grafikteki sıradır).
GROUPS: dict[str, tuple[str, ...]] = {
    "coal": ("lignite", "hard_coal", "imported_coal", "asphaltite"),
    "gas": ("natural_gas", "lng"),
    "hydro": ("dam_hydro", "river_hydro"),
    "wind": ("wind",),
    "solar": ("solar",),
    "geothermal": ("geothermal",),
    "biomass": ("biomass",),
    "nuclear": ("nuclear",),
    "other": ("fuel_oil", "naphtha", "waste_heat"),
}

ALLOWED_HOUR_KEYS = {"time", "intensity", "renewable_share", "mix_pct"}


def mix_percent(generation_mwh: Mapping[str, float]) -> dict[str, float]:
    """Grup bazında yüzde paylar (0-100, 1 ondalık). Sıfır olan gruplar atlanır."""
    total = _validate(generation_mwh, FACTORS)
    out: dict[str, float] = {}
    for group, sources in GROUPS.items():
        share = sum(generation_mwh.get(s, 0) for s in sources) / total * 100
        if share > 0:
            out[group] = round(share, 1)
    return out


def derive_hour(time_iso: str, generation_mwh: Mapping[str, float]) -> dict:
    """Tek saatin yayınlanabilir özeti. Ham MWh değerleri dışarı çıkmaz."""
    return {
        "time": time_iso,
        "intensity": round(carbon_intensity(generation_mwh), 1),
        "renewable_share": round(renewable_share(generation_mwh), 3),
        "mix_pct": mix_percent(generation_mwh),
    }


def summarize(hours: Iterable[Mapping]) -> dict | None:
    """Bir dönemin (ör. COP31) özeti. Ortalama = saatlik değerlerin ortalaması."""
    hours = list(hours)
    if not hours:
        return None
    cleanest = min(hours, key=lambda h: h["intensity"])
    dirtiest = max(hours, key=lambda h: h["intensity"])
    return {
        "hours_counted": len(hours),
        "avg_intensity": round(fmean(h["intensity"] for h in hours), 1),
        "avg_renewable_share": round(fmean(h["renewable_share"] for h in hours), 3),
        "cleanest": {"time": cleanest["time"], "intensity": cleanest["intensity"]},
        "dirtiest": {"time": dirtiest["time"], "intensity": dirtiest["intensity"]},
    }


def monthly(hours: Iterable[Mapping]) -> list[dict]:
    """Aylık ortalamalar (ISO zaman damgasının ilk 7 karakteri: YYYY-MM)."""
    buckets: dict[str, list[Mapping]] = defaultdict(list)
    for h in hours:
        buckets[h["time"][:7]].append(h)
    return [
        {
            "month": month,
            "avg_intensity": round(fmean(h["intensity"] for h in items), 1),
            "avg_renewable_share": round(fmean(h["renewable_share"] for h in items), 3),
        }
        for month, items in sorted(buckets.items())
    ]
