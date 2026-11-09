"""İl santral listesi (site/data/plants.json) üretimi ve sözleşmesi."""

import json
import re
from pathlib import Path

import pytest

from scripts.build_plants import FUEL_GROUPS, apply_overrides, assign_provinces, load_polygons

ROOT = Path(__file__).resolve().parents[1]
PUBLISHED = ROOT / "site" / "data" / "plants.json"
NAME_RE = re.compile(r"^[\w .,'’()&/+-]{2,80}$")


def row(name, lat, lon, fuel="Hydro", mw="100", gid="WRI1"):
    return {"country": "TUR", "name": name, "gppd_idnr": gid, "capacity_mw": mw,
            "latitude": str(lat), "longitude": str(lon), "primary_fuel": fuel}


@pytest.fixture(scope="module")
def polygons():
    return load_polygons(ROOT / "site" / "data" / "tr-map.json")


def test_known_dams_land_in_expected_provinces(polygons):
    rows = [
        row("Atatürk Dam", 37.4825, 38.3186, mw="2400.0", gid="WRI1018917"),
        row("Keban Dam", 38.8064, 38.7558, mw="1330.0", gid="WRI2"),
    ]
    out = assign_provinces(rows, polygons)
    assert [p["name"] for p in out["Adıyaman"]] == ["Atatürk Dam"]
    assert [p["name"] for p in out["Elazığ"]] == ["Keban Dam"]


def test_fuel_mapping_and_fields(polygons):
    out = assign_provinces([row("Afşin Elbistan", 38.36, 36.98, fuel="Coal", mw="2795.0", gid="WRI9")], polygons)
    plant = out["Kahramanmaraş"][0]
    assert plant == {"id": "WRI9", "name": "Afşin Elbistan", "group": "coal", "capacity_mw": 2795.0}
    assert FUEL_GROUPS["Oil"] == "other"


def test_non_turkish_and_unknown_fuel_rows_are_skipped(polygons):
    rows = [dict(row("X", 39, 32), country="GRC"), row("Y", 39, 32, fuel="Wave")]
    assert assign_provinces(rows, polygons) == {}


def test_sorted_by_capacity_and_capped(polygons):
    rows = [row(f"Santral {i}", 37.4825, 38.3186, mw=str(i * 10), gid=f"W{i}") for i in range(1, 12)]
    plants = assign_provinces(rows, polygons, limit=8)["Adıyaman"]
    assert len(plants) == 8
    assert [p["capacity_mw"] for p in plants] == sorted((p["capacity_mw"] for p in plants), reverse=True)


def test_overrides_remove_move_add(polygons):
    base = assign_provinces([
        row("Santral A", 37.4825, 38.3186, gid="WA"),
        row("Santral B", 37.4825, 38.3186, gid="WB"),
    ], polygons)
    out = apply_overrides(base, {
        "remove": ["WA"],
        "move": {"WB": "Şanlıurfa"},
        "add": [{"province": "Rize", "name": "Yeni HES", "group": "hydro", "capacity_mw": 50}],
    })
    assert "Adıyaman" not in out
    assert [p["name"] for p in out["Şanlıurfa"]] == ["Santral B"]
    assert out["Rize"][0]["id"].startswith("manual-")


def test_overrides_reject_bad_entries(polygons):
    with pytest.raises(ValueError):
        apply_overrides({}, {"add": [{"province": "Atlantis", "name": "X", "group": "hydro", "capacity_mw": 1}]})
    with pytest.raises(ValueError):
        apply_overrides({}, {"add": [{"province": "Rize", "name": "X", "group": "plasma", "capacity_mw": 1}]})


def test_published_file_contract():
    d = json.loads(PUBLISHED.read_text(encoding="utf-8"))
    assert set(d) == {"source", "license", "as_of", "provinces"}
    assert d["license"] == "CC BY 4.0"
    assert [p["name"] for p in d["provinces"]["Adıyaman"]][0] == "Atatürk Dam"
    groups = set(FUEL_GROUPS.values())
    for plants in d["provinces"].values():
        assert 1 <= len(plants) <= 8
        for p in plants:
            assert set(p) == {"id", "name", "group", "capacity_mw"}
            assert NAME_RE.match(p["name"]), p["name"]
            assert p["group"] in groups
            assert 0 < p["capacity_mw"] < 10000


def test_decomposed_unicode_names_are_normalized(polygons):
    # GPPD'de bazı adlar ayrışık (NFD) yazılmış: "o" + U+0308
    out = assign_provinces([row("Kızo\u0308ren", 37.4825, 38.3186, fuel="Solar", gid="WK")], polygons)
    assert out["Adıyaman"][0]["name"] == "Kızören"


def test_removed_overrides_absent_from_published_file():
    overrides = json.loads((ROOT / "data" / "plants-overrides.json").read_text(encoding="utf-8"))
    published_ids = {p["id"] for items in json.loads(PUBLISHED.read_text(encoding="utf-8"))["provinces"].values() for p in items}
    assert "WRI1018724" in overrides["remove"]  # Zonguldak'taki şüpheli "Kütahya" kaydı
    assert not set(overrides["remove"]) & published_ids
