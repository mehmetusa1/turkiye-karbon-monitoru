import pytest

from karbon.factors import FACTORS
from karbon.intensity import carbon_intensity, classify, renewable_share


def test_single_source_equals_its_factor():
    assert carbon_intensity({"wind": 100}) == pytest.approx(11)


def test_weighted_average_of_two_sources():
    # 50 MWh kömür (820) + 50 MWh rüzgâr (11) -> (820 + 11) / 2
    assert carbon_intensity({"hard_coal": 50, "wind": 50}) == pytest.approx(415.5)


def test_weights_follow_generation_amounts():
    # 300 MWh gaz (490) + 100 MWh güneş (41) -> (300*490 + 100*41) / 400
    assert carbon_intensity({"natural_gas": 300, "solar": 100}) == pytest.approx(377.75)


def test_zero_sources_are_ignored_in_weighting():
    assert carbon_intensity({"wind": 100, "lignite": 0}) == pytest.approx(11)


def test_unknown_source_raises():
    with pytest.raises(ValueError, match="Bilinmeyen"):
        carbon_intensity({"unicorn_power": 10})


def test_zero_total_raises():
    with pytest.raises(ValueError, match="sıfır"):
        carbon_intensity({"wind": 0, "solar": 0})


def test_negative_generation_raises():
    with pytest.raises(ValueError, match="Negatif"):
        carbon_intensity({"wind": -5, "solar": 10})


def test_renewable_share():
    gen = {"natural_gas": 60, "wind": 25, "solar": 15}
    assert renewable_share(gen) == pytest.approx(0.40)


def test_nuclear_is_not_counted_as_renewable():
    assert renewable_share({"nuclear": 50, "wind": 50}) == pytest.approx(0.5)


@pytest.mark.parametrize(
    ("value", "expected"),
    [(0, "temiz"), (299.9, "temiz"), (300, "orta"), (449.9, "orta"), (450, "kirli"), (1000, "kirli")],
)
def test_classify_thresholds(value, expected):
    assert classify(value) == expected


def test_every_factor_is_non_negative_and_documented():
    for name, factor in FACTORS.items():
        assert factor.g_per_kwh >= 0, name
        assert factor.source, name
