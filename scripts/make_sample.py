"""EPİAŞ erişimi gelene kadar arayüz geliştirmek için ÖRNEK veri üretir.

Üretim değerleri uydurmadır (yalnızca gerçekçi bir günlük/mevsimsel şekil için).
Çıktı, gerçek sistemle aynı kurala uyar: site/data/ altına YALNIZCA türetilmiş
değerler yazılır (yoğunluk, yenilenebilir payı, yüzde dağılım). MWh yazılmaz.

Çalıştırma (proje kökünden): py scripts/make_sample.py
"""

import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from karbon.intensity import CLEAN_BELOW, DIRTY_FROM  # noqa: E402
from karbon.provinces import province_history  # noqa: E402
from karbon.publish import derive_hour, monthly, summarize  # noqa: E402

TR = timezone(timedelta(hours=3))
OUT = ROOT / "site" / "data"
COP_START = datetime(2026, 11, 9, tzinfo=TR)
COP_END = datetime(2026, 11, 21, tzinfo=TR)


def fake_mix(t: datetime) -> dict[str, float]:
    """Uydurma ama makul görünen saatlik üretim karışımı (MWh)."""
    h, doy = t.hour, t.timetuple().tm_yday
    summer = math.cos(2 * math.pi * (doy - 172) / 365)          # yaz=1, kış=-1
    spring = math.cos(2 * math.pi * (doy - 120) / 365)          # ilkbahar hidro
    demand = (1 + 0.25 * math.sin(math.pi * (h - 8) / 14)) * (1 + 0.08 * abs(summer))
    sun = max(0.0, math.sin(math.pi * (h - 6) / 13)) if 6 <= h <= 19 else 0.0
    solar = 9000 * sun * (0.8 + 0.3 * summer)
    wind = (4500 + 1500 * math.cos(math.pi * h / 12)) * (1 + 0.25 * math.cos(2 * math.pi * (doy - 220) / 365))
    hydro = 6000 * demand * (1 + 0.45 * spring)
    gas = max(2000.0, 38000 * demand - solar - wind - hydro - 16500)
    return {
        "lignite": 6500, "imported_coal": 9000, "hard_coal": 700,
        "natural_gas": round(gas),
        "dam_hydro": round(hydro * 0.75), "river_hydro": round(hydro * 0.25),
        "wind": round(wind), "solar": round(solar),
        "geothermal": 1600, "biomass": 900,
    }


def hours_between(start: datetime, end: datetime) -> list[dict]:
    out, t = [], start
    while t < end:
        out.append(derive_hour(t.isoformat(), fake_mix(t)))  # ham değer burada kalır
        t += timedelta(hours=1)
    return out


def write(name: str, payload: dict) -> None:
    payload = {"is_sample": True, **payload}
    (OUT / name).write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print("yazıldı:", OUT / name)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    year = hours_between(datetime(2025, 11, 1, tzinfo=TR), datetime(2026, 10, 31, tzinfo=TR))
    last24 = year[-24:]
    write("latest.json", {
        "updated": last24[-1]["time"],
        "thresholds": {"clean_below": CLEAN_BELOW, "dirty_from": DIRTY_FROM},
        "hours": last24,
    })
    write("monthly.json", {"months": monthly(year)})
    # İl bazlı aylık tahmini geçmiş (her 3 saatte bir örnek yeterli; çıktı aylık).
    write("province-history.json", {
        "updated": last24[-1]["time"],
        "provinces": province_history(year[::3]),
    })
    # COP31 özeti: yalnızca tasarımı ?preview ile görmek için uydurma 2 gün.
    write("cop31.json", {
        "start": COP_START.isoformat(),
        "end": COP_END.isoformat(),
        "summary": summarize(hours_between(COP_START, COP_START + timedelta(days=2))),
    })


if __name__ == "__main__":
    main()
