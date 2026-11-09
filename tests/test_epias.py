import json

import pytest

from karbon.epias import parse_epias_row, parse_epias_rows
from scripts.update_data import mark_fetch_failure, update_site_data


def test_parse_epias_row_maps_fields_and_clamps_negatives():
    row = {
        "date": "2026-11-09T14:00:00+03:00",
        "lignite": 400.0,
        "naturalGas": 200.0,
        "wind": 300.0,
        "sun": 100.0,
        "nuclear": -1.2,  # iç ihtiyaç tüketimi (negatif) -> 0'a çekilmeli
    }
    derived = parse_epias_row(row)
    assert derived is not None
    assert derived["time"] == "2026-11-09T14:00:00+03:00"
    assert derived["mix_pct"] == {"coal": 40.0, "gas": 20.0, "wind": 30.0, "solar": 10.0}
    assert derived["renewable_share"] == pytest.approx(0.40)


def test_parse_epias_row_returns_none_on_empty_or_zero_total():
    assert parse_epias_row({}) is None
    assert parse_epias_row({"date": "2026-11-09T14:00:00+03:00", "wind": 0, "sun": -2}) is None


def test_parse_epias_rows_sorts_and_deduplicates():
    rows = [
        {"date": "2026-11-09T15:00:00+03:00", "wind": 100},
        {"date": "2026-11-09T14:00:00+03:00", "sun": 100},
        {"date": "2026-11-09T15:00:00+03:00", "wind": 200},
    ]
    out = parse_epias_rows(rows)
    assert [h["time"] for h in out] == [
        "2026-11-09T14:00:00+03:00",
        "2026-11-09T15:00:00+03:00",
    ]


def test_update_site_data_preserves_last_valid_value_on_empty_fetch(tmp_path):
    valid_hours = [
        {
            "time": "2026-11-09T12:00:00+03:00",
            "intensity": 410.0,
            "renewable_share": 0.45,
            "mix_pct": {"coal": 35.0, "gas": 20.0, "wind": 45.0},
        }
    ]
    assert update_site_data(valid_hours, data_dir=tmp_path, attempted_at="2026-11-09T12:05:00+03:00")

    # Şimdi boş liste (API çökmesi / boş yanıt) ile çağrıldığında eski veri korunmalı
    assert not update_site_data([], data_dir=tmp_path, attempted_at="2026-11-09T13:05:00+03:00")
    latest = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
    assert latest["last_fetch_failed"] is True
    assert latest["last_attempt"] == "2026-11-09T13:05:00+03:00"
    assert latest["updated"] == "2026-11-09T12:00:00+03:00"
    assert latest["hours"][0]["intensity"] == 410.0


def test_mark_fetch_failure_without_existing_file_returns_false(tmp_path):
    assert not mark_fetch_failure(tmp_path, "2026-11-09T13:05:00+03:00", "API hatası")


# --- Hata düzeltmeleri için regresyon testleri ---

def _hour(time_iso, intensity=400.0):
    return {"time": time_iso, "intensity": intensity, "renewable_share": 0.2,
            "mix_pct": {"coal": 50.0, "gas": 50.0}}


def test_partial_month_does_not_overwrite_full_month_average(tmp_path):
    (tmp_path / "monthly.json").write_text(json.dumps({
        "is_sample": False,
        "months": [{"month": "2026-09", "avg_intensity": 500.0, "avg_renewable_share": 0.3}],
    }), encoding="utf-8")
    # 35 günlük pencere Eylül'ün yalnızca son günlerini kapsıyor
    hours = [_hour(f"2026-09-{d:02d}T00:00:00+03:00", 300.0) for d in range(27, 31)]
    hours.append(_hour("2026-10-01T00:00:00+03:00", 400.0))
    update_site_data(hours, tmp_path, attempted_at="2026-10-01T01:12:00+03:00")

    months = {m["month"]: m for m in json.loads((tmp_path / "monthly.json").read_text("utf-8"))["months"]}
    assert months["2026-09"]["avg_intensity"] == 500.0  # tam ay korundu
    assert months["2026-10"]["avg_intensity"] == 400.0


def test_month_starting_at_first_hour_is_updated(tmp_path):
    (tmp_path / "monthly.json").write_text(json.dumps({
        "is_sample": False,
        "months": [{"month": "2026-10", "avg_intensity": 999.0, "avg_renewable_share": 0.3}],
    }), encoding="utf-8")
    update_site_data([_hour("2026-10-01T00:00:00+03:00", 400.0)], tmp_path, attempted_at="x")
    months = json.loads((tmp_path / "monthly.json").read_text("utf-8"))["months"]
    assert months == [{"month": "2026-10", "avg_intensity": 400.0, "avg_renewable_share": 0.2}]


def test_cop31_hours_matched_regardless_of_offset_format(tmp_path):
    # 2026-11-09 00:00 TR = 2026-11-08 21:00 UTC
    hours = [_hour("2026-11-08T21:00:00Z", 300.0), _hour("2026-11-08T20:00:00Z", 900.0)]
    update_site_data(hours, tmp_path, attempted_at="x")
    summary = json.loads((tmp_path / "cop31.json").read_text("utf-8"))["summary"]
    assert summary["hours_counted"] == 1
    assert summary["avg_intensity"] == 300.0


def test_parse_epias_row_accepts_datetime_and_ignores_nan():
    from datetime import datetime, timedelta, timezone

    ts = datetime(2026, 11, 1, 10, tzinfo=timezone(timedelta(hours=3)))
    out = parse_epias_row({"date": ts, "naturalGas": 100.0, "wind": float("nan"), "sun": float("inf")})
    assert out is not None
    assert out["time"] == "2026-11-01T10:00:00+03:00"
    assert out["mix_pct"] == {"gas": 100.0}


def test_extract_rows_handles_null_body():
    from karbon.epias import _extract_rows

    assert _extract_rows({"body": None}) == []
    assert _extract_rows({"body": {"hourlyGenerations": [{"date": "x"}]}}) == [{"date": "x"}]


# --- İl geçmişi (province-history.json) API çıktısı ---

def _history(tmp_path):
    return json.loads((tmp_path / "province-history.json").read_text("utf-8"))


def test_update_writes_province_history_in_published_schema(tmp_path):
    hours = [_hour("2026-10-01T00:00:00+03:00"), _hour("2026-10-01T12:00:00+03:00")]
    update_site_data(hours, tmp_path, attempted_at="x")
    d = _history(tmp_path)
    assert set(d) == {"is_sample", "updated", "provinces"}
    assert d["is_sample"] is False
    assert d["updated"] == "2026-10-01T12:00:00+03:00"
    assert len(d["provinces"]) == 81
    months = d["provinces"]["Antalya"]["months"]
    assert [m["month"] for m in months] == ["2026-10"]
    assert set(months[0]) == {"month", "avg_intensity", "renewable_share", "mix_pct"}


def test_province_history_keeps_full_months_and_skips_partial(tmp_path):
    old = {"month": "2026-09", "avg_intensity": 1.0, "renewable_share": 0.5, "mix_pct": {"hydro": 100.0}}
    older = {"month": "2026-08", "avg_intensity": 2.0, "renewable_share": 0.5, "mix_pct": {"hydro": 100.0}}
    (tmp_path / "province-history.json").write_text(json.dumps({
        "is_sample": False, "updated": "x",
        "provinces": {"Antalya": {"months": [older, old]}},
    }), encoding="utf-8")
    hours = [_hour(f"2026-09-{d:02d}T00:00:00+03:00") for d in range(27, 31)]
    hours.append(_hour("2026-10-01T00:00:00+03:00"))
    update_site_data(hours, tmp_path, attempted_at="x")
    months = _history(tmp_path)["provinces"]["Antalya"]["months"]
    assert [m["month"] for m in months] == ["2026-08", "2026-09", "2026-10"]
    assert months[1] == old  # kısmi Eylül, kayıtlı tam Eylül'ü ezmedi


def test_province_history_ignores_sample_file(tmp_path):
    (tmp_path / "province-history.json").write_text(json.dumps({
        "is_sample": True, "updated": "x",
        "provinces": {"Antalya": {"months": [
            {"month": "2026-08", "avg_intensity": 2.0, "renewable_share": 0.5, "mix_pct": {"hydro": 100.0}}]}},
    }), encoding="utf-8")
    update_site_data([_hour("2026-10-01T00:00:00+03:00")], tmp_path, attempted_at="x")
    months = _history(tmp_path)["provinces"]["Antalya"]["months"]
    assert [m["month"] for m in months] == ["2026-10"]  # örnek veri gerçeğe karışmadı


def test_province_history_keeps_last_12_months(tmp_path):
    hours = [_hour(f"2025-{m:02d}-01T00:00:00+03:00") for m in range(1, 13)]
    hours += [_hour(f"2026-{m:02d}-01T00:00:00+03:00") for m in range(1, 3)]
    update_site_data(hours, tmp_path, attempted_at="x")
    months = _history(tmp_path)["provinces"]["Antalya"]["months"]
    assert len(months) == 12 and months[0]["month"] == "2025-03" and months[-1]["month"] == "2026-02"
