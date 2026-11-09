"""İl bazlı aylık geçmiş (province-history.json) sözleşmesi."""

import json
from pathlib import Path

from karbon.provinces import PROVINCE_CAPACITIES, province_history
from karbon.publish import GROUPS

HOURS = [  # iki ay, ikişer saat (gece / öğlen)
    {"time": "2026-01-01T00:00:00+03:00", "mix_pct": {"coal": 40, "gas": 30, "hydro": 20, "wind": 10}},
    {"time": "2026-01-01T12:00:00+03:00", "mix_pct": {"coal": 30, "gas": 20, "hydro": 20, "wind": 10, "solar": 20}},
    {"time": "2026-02-01T00:00:00+03:00", "mix_pct": {"coal": 50, "gas": 30, "hydro": 20}},
    {"time": "2026-02-01T12:00:00+03:00", "mix_pct": {"coal": 40, "gas": 20, "hydro": 20, "solar": 20}},
]
PUBLISHED = Path(__file__).resolve().parents[1] / "site" / "data" / "province-history.json"


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


def test_no_solar_in_night_only_month():
    night = [h for h in HOURS if h["time"].endswith("T00:00:00+03:00")]
    assert "solar" not in province_history(night)["Konya"]["months"][0]["mix_pct"]


def test_coal_province_dirtier_than_hydro_province():
    out = province_history(HOURS)
    assert out["Zonguldak"]["months"][0]["avg_intensity"] > out["Artvin"]["months"][0]["avg_intensity"]


def test_empty_input_gives_empty_months():
    out = province_history([])
    assert out["Antalya"] == {"months": []}


def test_published_file_schema():
    d = json.loads(PUBLISHED.read_text(encoding="utf-8"))
    assert set(d) == {"is_sample", "updated", "provinces"}
    assert set(d["provinces"]) == set(PROVINCE_CAPACITIES)
    months = d["provinces"]["Antalya"]["months"]
    # Canlı veri ilk çalışmalarda 1-2 ay içerir (backfill yapılmadıysa); en fazla 12
    assert 1 <= len(months) <= 12
    assert [m["month"] for m in months] == sorted(m["month"] for m in months)
    assert set(months[0]) == {"month", "avg_intensity", "renewable_share", "mix_pct"}
