"""EPİAŞ Şeffaflık Platformu (rt-gen) veri dönüştürme ve çekme katmanı.

Notlar:
- EPİAŞ `realtime-generation` uç noktası bazı saatlerde duran santrallerin
  iç ihtiyaç tüketimi nedeniyle küçük negatif değerler (ör. -0.5 MWh)
  döndürebilir. Bunlar hesap öncesi 0.0'a sabitlenir.
- Ham MWh değerleri yalnızca bellekte işlenir ve `derive_hour` çıktısına
  dönüştürülür; diske yazılmaz.
"""

from collections.abc import Iterable, Mapping
from datetime import date, timedelta
import math
import os

from karbon.publish import derive_hour

# Her istek için zaman aşımı (sn) ve zaman aşımında yeniden deneme bütçesi
FETCH_TIMEOUT_S = 90.0
FETCH_RETRY_ATTEMPTS = 4
FETCH_RETRY_BACKOFF_S = 5.0

# EPİAŞ realtime-generation JSON alan adları -> karbon.factors anahtarları
EPIAS_FIELD_MAP: dict[str, str] = {
    "lignite": "lignite",
    "blackCoal": "hard_coal",
    "importCoal": "imported_coal",
    "asphaltiteCoal": "asphaltite",
    "naturalGas": "natural_gas",
    "lng": "lng",
    "fueloil": "fuel_oil",
    "naphta": "naphtha",
    "biomass": "biomass",
    "geothermal": "geothermal",
    "dammedHydro": "dam_hydro",
    "river": "river_hydro",
    "wind": "wind",
    "sun": "solar",
    "nuclear": "nuclear",
    "wasteheat": "waste_heat",
}


def parse_epias_row(row: Mapping) -> dict | None:
    """Tek bir EPİAŞ `rt-gen` satırını türetilmiş saatlik özete çevirir.

    Geçersiz veya toplam üretimi 0 olan satırlarda `None` döner.
    """
    time_iso = row.get("date")
    # pandas Timestamp / datetime gelirse ISO metnine çevir
    if time_iso is not None and not isinstance(time_iso, str) and hasattr(time_iso, "isoformat"):
        time_iso = time_iso.isoformat()
    if not time_iso or not isinstance(time_iso, str):
        return None

    generation_mwh: dict[str, float] = {}
    for epias_key, factor_key in EPIAS_FIELD_MAP.items():
        raw_val = row.get(epias_key, 0.0)
        if raw_val is None:
            val = 0.0
        else:
            try:
                val = float(raw_val)
            except (TypeError, ValueError):
                val = 0.0
        if not math.isfinite(val):  # NaN / inf hesapları bozmasın
            val = 0.0
        # Santral iç ihtiyacı kaynaklı küçük negatif değerleri sıfıra çek
        generation_mwh[factor_key] = max(0.0, val)

    if sum(generation_mwh.values()) <= 0:
        return None

    return derive_hour(time_iso, generation_mwh)


def parse_epias_rows(rows: Iterable[Mapping]) -> list[dict]:
    """EPİAŞ satır listesini zaman sırasına göre türetilmiş saatlere çevirir."""
    by_time: dict[str, dict] = {}
    for row in rows:
        parsed = parse_epias_row(row)
        if parsed is not None:
            by_time[parsed["time"]] = parsed
    return [by_time[k] for k in sorted(by_time)]


def _extract_rows(raw_response: object) -> list[Mapping]:
    """eptr2 yanıtından (DataFrame, dict veya list) satır sözlüklerini çıkarır."""
    if raw_response is None:
        return []
    if hasattr(raw_response, "to_dict"):  # pandas DataFrame
        return raw_response.to_dict(orient="records")
    if isinstance(raw_response, list):
        return [r for r in raw_response if isinstance(r, Mapping)]
    if isinstance(raw_response, Mapping):
        body = raw_response.get("body")
        items = raw_response.get("items") or (
            body.get("hourlyGenerations") if isinstance(body, Mapping) else None
        )
        if isinstance(items, list):
            return [r for r in items if isinstance(r, Mapping)]
    return []


def fetch_derived_hours(
    start_date: date,
    end_date: date,
    client: object | None = None,
    chunk_days: int = 30,
) -> list[dict]:
    """EPİAŞ'tan belirtilen tarih aralığını parça parça çekip türetilmiş özet döner.

    1 yıllık geçmiş veriyi çekerken API'yi yormamak için `chunk_days` (varsayılan 30 gün)
    aralıklarla sorgular.
    """
    if client is None:
        from eptr2 import EPTR2

        username = os.getenv("EPTR_USERNAME")
        password = os.getenv("EPTR_PASSWORD")
        client = EPTR2(username=username, password=password, use_dotenv=True)

    all_rows: list[Mapping] = []
    cur = start_date
    while cur <= end_date:
        chunk_end = min(end_date, cur + timedelta(days=chunk_days - 1))
        res = client.call(
            "rt-gen",
            start_date=cur.isoformat(),
            end_date=chunk_end.isoformat(),
            # EPİAŞ yurt dışındaki GitHub sunucularına zaman zaman yavaş yanıt veriyor.
            # eptr2 varsayılan olarak hiç yeniden denemediği için tek bir
            # ReadTimeoutError tüm saatlik güncellemeyi düşürüyordu.
            request_kwargs={"timeout": FETCH_TIMEOUT_S},
            retry_attempts=FETCH_RETRY_ATTEMPTS,
            retry_backoff=FETCH_RETRY_BACKOFF_S,
            retry_backoff_max=30.0,
        )
        all_rows.extend(_extract_rows(res))
        cur = chunk_end + timedelta(days=1)

    return parse_epias_rows(all_rows)
