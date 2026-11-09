"""Güvenlik ağı: siteye giden JSON dosyalarında ham üretim verisi olmamalı."""

import json
from pathlib import Path

import pytest

from karbon.factors import FACTORS
from karbon.publish import ALLOWED_HOUR_KEYS, GROUPS

DATA = Path(__file__).resolve().parents[1] / "site" / "data"
FILES = sorted(DATA.glob("*.json"))
RAW_ONLY_SOURCES = set(FACTORS) - set(GROUPS)


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_published_file_has_no_raw_generation(path):
    text = path.read_text(encoding="utf-8").lower()
    assert "generation" not in text
    assert "mwh" not in text
    for source in RAW_ONLY_SOURCES:  # alt kaynak kırılımları (lignite, imported_coal, dam_hydro...)
        assert f'"{source}"' not in text, source

    payload = json.loads(text)
    for hour in payload.get("hours", []):
        assert set(hour) <= ALLOWED_HOUR_KEYS
        assert set(hour.get("mix_pct", {})) <= set(GROUPS)
        assert sum(hour.get("mix_pct", {}).values()) == pytest.approx(100, abs=0.5)
