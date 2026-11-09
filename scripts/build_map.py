"""81 il GeoJSON verisini hafif SVG yollarına ve kurulu güç profillerine dönüştürür.

Çıktı: `site/data/tr-map.json`
"""

import json
from pathlib import Path
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from karbon.provinces import PROVINCE_CAPACITIES, normalized_capacity  # noqa: E402

GEOJSON_URL = "https://raw.githubusercontent.com/cihadturhan/tr-geojson/master/geo/tr-cities-utf8.json"
OUT = ROOT / "site" / "data" / "tr-map.json"

# Türkiye coğrafi sınırları (boylam 25.6..44.9, enlem 35.8..42.2) -> SVG 1000x460
LON_MIN, LON_MAX = 25.6, 44.9
LAT_MIN, LAT_MAX = 35.8, 42.2
WIDTH, HEIGHT = 1000, 460


def project(lon: float, lat: float) -> tuple[float, float]:
    x = (lon - LON_MIN) / (LON_MAX - LON_MIN) * WIDTH
    y = (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * HEIGHT
    return round(x, 1), round(y, 1)


def simplify_ring(ring: list[list[float]], step: int = 2) -> list[tuple[float, float]]:
    pts = [project(lon, lat) for lon, lat in ring]
    if len(pts) <= 12:
        return pts
    sampled = pts[::step]
    if sampled[-1] != pts[-1]:
        sampled.append(pts[-1])
    # Ardışık aynı noktaları temizle
    dedup = [sampled[0]]
    for pt in sampled[1:]:
        if pt != dedup[-1]:
            dedup.append(pt)
    return dedup


def ring_to_svg(pts: list[tuple[float, float]]) -> str:
    if len(pts) < 3:
        return ""
    head = f"M{pts[0][0]},{pts[0][1]}"
    body = "L".join(f"{x},{y}" for x, y in pts[1:])
    return f"{head}L{body}Z"


def geometry_to_svg_and_centroid(geom: dict) -> tuple[str, list[float]]:
    gtype = geom["type"]
    coords = geom["coordinates"]
    polys = [coords] if gtype == "Polygon" else coords

    paths: list[str] = []
    biggest_ring: list[tuple[float, float]] = []
    for poly in polys:
        for i, ring in enumerate(poly):
            pts = simplify_ring(ring, step=2)
            svg = ring_to_svg(pts)
            if svg:
                paths.append(svg)
            if i == 0 and len(pts) > len(biggest_ring):
                biggest_ring = pts

    cx = round(sum(p[0] for p in biggest_ring) / len(biggest_ring), 1)
    cy = round(sum(p[1] for p in biggest_ring) / len(biggest_ring), 1)
    return "".join(paths), [cx, cy]


def main() -> None:
    raw = json.loads(urllib.request.urlopen(GEOJSON_URL, timeout=15).read().decode("utf-8"))
    provinces = []
    for idx, feat in enumerate(raw["features"], start=1):
        name = feat["properties"]["name"]
        if name not in PROVINCE_CAPACITIES:
            raise KeyError(f"Profil eksik: {name}")
        svg_path, center = geometry_to_svg_and_centroid(feat["geometry"])
        provinces.append({
            "id": idx,
            "name": name,
            "center": center,
            "path": svg_path,
            "capacity_pct": normalized_capacity(name),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"viewBox": f"0 0 {WIDTH} {HEIGHT}", "provinces": provinces}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"{len(provinces)} il yazıldı ({OUT.stat().st_size // 1024} KB): {OUT}")


if __name__ == "__main__":
    main()
