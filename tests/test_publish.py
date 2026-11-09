import json

import pytest

from karbon.publish import ALLOWED_HOUR_KEYS, derive_hour, mix_percent, monthly, summarize

GEN = {"lignite": 300, "natural_gas": 200, "wind": 300, "solar": 200}


def test_derived_hour_contains_only_allowed_keys():
    out = derive_hour("2026-11-09T12:00:00+03:00", GEN)
    assert set(out) == ALLOWED_HOUR_KEYS


def test_derived_hour_leaks_no_raw_mwh_values():
    out = json.dumps(derive_hour("2026-11-09T12:00:00+03:00", GEN))
    assert "generation" not in out
    assert "lignite" not in out  # kaynak adları değil, yalnızca grup payları
    for raw in ("300", "200"):
        assert f": {raw}" not in out and f":{raw}" not in out


def test_mix_percent_groups_and_sums_to_100():
    pct = mix_percent(GEN)
    assert pct == {"coal": 30.0, "gas": 20.0, "wind": 30.0, "solar": 20.0}
    assert sum(pct.values()) == pytest.approx(100)


def test_mix_percent_merges_sources_into_groups():
    pct = mix_percent({"lignite": 50, "imported_coal": 25, "dam_hydro": 25})
    assert pct == {"coal": 75.0, "hydro": 25.0}


def _h(time, intensity, share):
    return {"time": time, "intensity": intensity, "renewable_share": share, "mix_pct": {}}


def test_summarize_picks_cleanest_and_dirtiest():
    hours = [_h("2026-11-09T01:00", 500, 0.3), _h("2026-11-09T13:00", 350, 0.5), _h("2026-11-09T20:00", 450, 0.4)]
    s = summarize(hours)
    assert s["hours_counted"] == 3
    assert s["avg_intensity"] == pytest.approx(433.3)
    assert s["avg_renewable_share"] == pytest.approx(0.4)
    assert s["cleanest"] == {"time": "2026-11-09T13:00", "intensity": 350}
    assert s["dirtiest"] == {"time": "2026-11-09T01:00", "intensity": 500}


def test_summarize_empty_returns_none():
    assert summarize([]) is None


def test_monthly_groups_by_month_in_order():
    hours = [_h("2026-02-01T00:00", 400, 0.4), _h("2026-01-05T00:00", 500, 0.2), _h("2026-01-06T00:00", 300, 0.4)]
    assert monthly(hours) == [
        {"month": "2026-01", "avg_intensity": 400.0, "avg_renewable_share": 0.3},
        {"month": "2026-02", "avg_intensity": 400.0, "avg_renewable_share": 0.4},
    ]
