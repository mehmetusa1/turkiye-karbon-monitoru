"""Karbon yoğunluğu hesapları (üretim bazlı; ithalat/ihracat dahil değil)."""

from collections.abc import Mapping

from karbon.factors import FACTORS, RENEWABLE_SOURCES, Factor

# Gösterge renk eşikleri (gCO2/kWh). Türkiye ortalaması kabaca 400'ler civarında;
# eşikler gerçek veri görüldükten sonra ayarlanabilir.
CLEAN_BELOW = 300
DIRTY_FROM = 450


def _validate(generation_mwh: Mapping[str, float], factors: Mapping[str, Factor]) -> float:
    unknown = set(generation_mwh) - set(factors)
    if unknown:
        raise ValueError(f"Bilinmeyen kaynak(lar): {sorted(unknown)}")
    for source, mwh in generation_mwh.items():
        if mwh < 0:
            raise ValueError(f"Negatif üretim: {source}={mwh}")
    total = sum(generation_mwh.values())
    if total == 0:
        raise ValueError("Toplam üretim sıfır")
    return total


def carbon_intensity(
    generation_mwh: Mapping[str, float],
    factors: Mapping[str, Factor] = FACTORS,
) -> float:
    """Üretim ağırlıklı ortalama karbon yoğunluğu (gCO2eq/kWh)."""
    total = _validate(generation_mwh, factors)
    weighted = sum(mwh * factors[src].g_per_kwh for src, mwh in generation_mwh.items())
    return weighted / total


def renewable_share(
    generation_mwh: Mapping[str, float],
    factors: Mapping[str, Factor] = FACTORS,
) -> float:
    """Yenilenebilir kaynakların toplam üretimdeki payı (0-1)."""
    total = _validate(generation_mwh, factors)
    renewable = sum(mwh for src, mwh in generation_mwh.items() if src in RENEWABLE_SOURCES)
    return renewable / total


def classify(intensity: float) -> str:
    """Gösterge için durum: 'temiz', 'orta' veya 'kirli'."""
    if intensity < CLEAN_BELOW:
        return "temiz"
    if intensity < DIRTY_FROM:
        return "orta"
    return "kirli"
