import pytest

from karbon.provinces import (
    PROVINCE_CAPACITIES,
    estimate_province_hour,
    normalized_capacity,
)


def test_all_81_provinces_are_defined():
    assert len(PROVINCE_CAPACITIES) == 81
    for name in PROVINCE_CAPACITIES:
        cap = normalized_capacity(name)
        assert sum(cap.values()) == pytest.approx(100.0, abs=0.5), name


def test_solar_province_is_cleaner_at_midday_than_midnight():
    konya = normalized_capacity("Konya")
    midday_national = {"coal": 25.0, "gas": 18.0, "hydro": 20.0, "wind": 12.0, "solar": 22.0, "geothermal": 1.5, "biomass": 1.5}
    midnight_national = {"coal": 34.0, "gas": 28.0, "hydro": 22.0, "wind": 13.0, "solar": 0.0, "geothermal": 1.5, "biomass": 1.5}

    noon = estimate_province_hour(konya, midday_national)
    night = estimate_province_hour(konya, midnight_national)

    assert noon["dominant"] == "solar"
    assert "solar" not in night["mix_pct"]
    assert noon["intensity"] < 200
    assert night["intensity"] > noon["intensity"] + 150


def test_coal_province_has_high_intensity_and_hydro_province_has_low():
    nat = {"coal": 30.0, "gas": 22.0, "hydro": 22.0, "wind": 12.0, "solar": 11.0, "geothermal": 1.5, "biomass": 1.5}
    zonguldak = estimate_province_hour(normalized_capacity("Zonguldak"), nat)
    artvin = estimate_province_hour(normalized_capacity("Artvin"), nat)

    assert zonguldak["intensity"] > 750
    assert artvin["intensity"] < 50
    assert artvin["renewable_share"] > 0.95
