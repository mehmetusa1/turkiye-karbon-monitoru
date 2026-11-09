"""İl bazında büyük santral listesini (site/data/plants.json) üretir.

Kaynak: WRI Global Power Plant Database v1.3.0 (CC BY 4.0, 2021 itibarıyla).
CSV bir kez elle indirilir ve depoya EKLENMEZ; yalnızca türetilmiş küçük JSON yayınlanır:
    https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv

Her santral koordinatına göre il poligonuna (tr-map.json, build_map ile aynı projeksiyon)
eşlenir; ardından data/plants-overrides.json içindeki elle düzeltmeler uygulanır.

Çalıştırma (proje kökünden):
    py scripts/build_plants.py <global_power_plant_database.csv>
"""

import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from collections.abc import Iterable, Mapping
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.build_map import project  # noqa: E402

MAP_FILE = ROOT / "site" / "data" / "tr-map.json"
OVERRIDES_FILE = ROOT / "data" / "plants-overrides.json"
OUT_FILE = ROOT / "site" / "data" / "plants.json"
LIMIT = 8

# GPPD primary_fuel → sitedeki kaynak grubu
FUEL_GROUPS: dict[str, str] = {
    "Coal": "coal",
    "Gas": "gas",
    "Oil": "other",
    "Hydro": "hydro",
    "Wind": "wind",
    "Solar": "solar",
    "Geothermal": "geothermal",
    "Biomass": "biomass",
    "Waste": "biomass",
    "Nuclear": "nuclear",
}
NAME_RE = re.compile(r"^[\w .,'’()&/+-]{2,80}$")
_POINT_RE = re.compile(r"(-?[\d.]+),(-?[\d.]+)")

Ring = list[tuple[float, float]]


def load_polygons(map_file: Path) -> list[tuple[str, list[Ring]]]:
    """tr-map.json'daki her il yolunu halkalara (M ... Z) ayırır."""
    data = json.loads(Path(map_file).read_text(encoding="utf-8"))
    polys = []
    for prov in data["provinces"]:
        rings = []
        for part in prov["path"].split("M"):
            pts = [(float(x), float(y)) for x, y in _POINT_RE.findall(part)]
            if len(pts) >= 3:
                rings.append(pts)
        polys.append((prov["name"], rings))
    return polys


def _inside(x: float, y: float, ring: Ring) -> bool:
    hit = False
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def find_province(lat: float, lon: float, polys: list[tuple[str, list[Ring]]]) -> str:
    """Noktayı içeren il; hiçbir poligona düşmezse (kıyı/sadeleştirme payı) en yakın il."""
    x, y = project(lon, lat)
    for name, rings in polys:
        if sum(_inside(x, y, r) for r in rings) % 2:
            return name
    return min(
        ((min((x - a) ** 2 + (y - b) ** 2 for a, b in ring), name) for name, rings in polys for ring in rings)
    )[1]


def _clean_name(name: str) -> str:
    # GPPD'de bazı adlar ayrışık (NFD) yazılmış; birleşik biçime çevir
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", name)).strip()


def _sorted_capped(by_prov: Mapping[str, list[dict]], limit: int) -> dict[str, list[dict]]:
    return {
        prov: sorted(plants, key=lambda p: (-p["capacity_mw"], p["name"]))[:limit]
        for prov, plants in sorted(by_prov.items())
        if plants
    }


def assign_provinces(rows: Iterable[Mapping], polys, limit: int = LIMIT) -> dict[str, list[dict]]:
    """GPPD satırlarından il → santral listesi (kurulu güce göre azalan, en fazla `limit`)."""
    by_prov: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        group = FUEL_GROUPS.get(r.get("primary_fuel", ""))
        name = _clean_name(r.get("name", ""))
        try:
            mw = float(r["capacity_mw"])
            lat, lon = float(r["latitude"]), float(r["longitude"])
        except (KeyError, ValueError):
            continue
        if r.get("country") != "TUR" or not group or not NAME_RE.match(name) or not 0 < mw < 10000:
            continue
        prov = find_province(lat, lon, polys)
        by_prov[prov].append({"id": r["gppd_idnr"], "name": name, "group": group, "capacity_mw": round(mw, 1)})
    return _sorted_capped(by_prov, limit)


def apply_overrides(plants: Mapping[str, list[dict]], overrides: Mapping, limit: int = LIMIT) -> dict[str, list[dict]]:
    """Elle düzeltmeler: remove (id listesi), move (id → il), add (yeni santral)."""
    provinces = {name for name, _ in load_polygons(MAP_FILE)}
    groups = set(FUEL_GROUPS.values())
    remove = set(overrides.get("remove", []))
    move = dict(overrides.get("move", {}))
    for target in move.values():
        if target not in provinces:
            raise ValueError(f"move: bilinmeyen il {target!r}")

    out: dict[str, list[dict]] = defaultdict(list)
    for prov, items in plants.items():
        for p in items:
            if p["id"] in remove:
                continue
            out[move.get(p["id"], prov)].append(dict(p))

    for i, a in enumerate(overrides.get("add", []), start=1):
        name = _clean_name(str(a.get("name", "")))
        mw = a.get("capacity_mw")
        if a.get("province") not in provinces:
            raise ValueError(f"add: bilinmeyen il {a.get('province')!r}")
        if a.get("group") not in groups:
            raise ValueError(f"add: bilinmeyen kaynak {a.get('group')!r}")
        if not NAME_RE.match(name) or not isinstance(mw, (int, float)) or not 0 < mw < 10000:
            raise ValueError(f"add: geçersiz kayıt {a!r}")
        out[a["province"]].append({"id": f"manual-{i}", "name": name, "group": a["group"], "capacity_mw": round(float(mw), 1)})
    return _sorted_capped(out, limit)


def main(csv_path: str) -> None:
    polys = load_polygons(MAP_FILE)
    with open(csv_path, encoding="utf-8", newline="") as f:
        # Tüm satırları ayrıştırmak gerekmez; yalnızca Türkiye
        plants = assign_provinces((r for r in csv.DictReader(f) if r["country"] == "TUR"), polys, limit=10_000)
    overrides = json.loads(OVERRIDES_FILE.read_text(encoding="utf-8")) if OVERRIDES_FILE.exists() else {}
    plants = apply_overrides(plants, overrides)
    payload = {
        "source": "WRI Global Power Plant Database v1.3.0",
        "license": "CC BY 4.0",
        "as_of": "2021",
        "provinces": plants,
    }
    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(len(v) for v in plants.values())
    print(f"yazıldı: {OUT_FILE} ({len(plants)} il, {total} santral)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("kullanım: py scripts/build_plants.py <global_power_plant_database.csv>")
    main(sys.argv[1])
