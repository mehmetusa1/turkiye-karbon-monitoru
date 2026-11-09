"""Güvenli veri güncelleme arayüzü.

API çökerse, kimlik doğrulama başarısız olursa veya boş veri dönerse:
- Mevcut `site/data/*.json` dosyalarındaki son geçerli değerler KORUNUR.
- `latest.json` içine `last_fetch_failed: True` ve `last_attempt` zaman damgası
  eklenir; böylece arayüz ziyaretçiye "Veri güncellenemedi, son geçerli değer
  gösteriliyor" uyarısını gösterir.
"""

import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from karbon.epias import fetch_derived_hours  # noqa: E402
from karbon.intensity import CLEAN_BELOW, DIRTY_FROM  # noqa: E402
from karbon.provinces import province_history  # noqa: E402
from karbon.publish import monthly, summarize  # noqa: E402

TR = timezone(timedelta(hours=3))
DATA_DIR = ROOT / "site" / "data"
COP_START = datetime(2026, 11, 9, tzinfo=TR)
COP_END = datetime(2026, 11, 21, tzinfo=TR)


def _read_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _parse_time(value: str) -> datetime | None:
    """ISO zaman damgasını saat dilimli datetime'a çevirir (ofsetsizse TR kabul edilir)."""
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError, AttributeError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=TR)


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")


def mark_fetch_failure(data_dir: Path, attempted_at: str, reason: str) -> bool:
    """API hatasında mevcut `latest.json` verisini koruyup uyarı bayrağı yazar."""
    latest_path = data_dir / "latest.json"
    existing = _read_json(latest_path)
    if not existing or not existing.get("hours"):
        print(f"UYARI: {reason} (korunacak mevcut veri bulunamadı)", file=sys.stderr)
        return False

    existing["last_fetch_failed"] = True
    existing["last_attempt"] = attempted_at
    _write_json(latest_path, existing)
    print(f"UYARI: {reason}. Son geçerli veri korundu ({existing.get('updated')}).", file=sys.stderr)
    return True


def update_site_data(
    new_hours: list[dict],
    data_dir: Path = DATA_DIR,
    attempted_at: str | None = None,
) -> bool:
    """Yeni türetilmiş saatlerle site/data/*.json dosyalarını günceller.

    `new_hours` boşsa mevcut dosyaları bozmaz ve `last_fetch_failed=True` işaretler.
    """
    now_iso = attempted_at or datetime.now(TR).isoformat(timespec="seconds")
    if not new_hours:
        mark_fetch_failure(data_dir, now_iso, "EPİAŞ'tan boş veri döndü")
        return False

    last24 = new_hours[-24:]
    _write_json(
        data_dir / "latest.json",
        {
            "is_sample": False,
            "last_fetch_failed": False,
            "updated": last24[-1]["time"],
            "last_attempt": now_iso,
            "thresholds": {"clean_below": CLEAN_BELOW, "dirty_from": DIRTY_FROM},
            "hours": last24,
        },
    )

    # Aylık trend: mevcut aylık özetleri koruyup yeni gelen ayları güncelle
    existing_monthly = _read_json(data_dir / "monthly.json")
    month_map: dict[str, dict] = {}
    if existing_monthly and not existing_monthly.get("is_sample"):
        for item in existing_monthly.get("months", []):
            month_map[item["month"]] = item
    # Çekilen aralık bir ayın ortasından başlıyorsa o ay için elimizde yalnızca
    # birkaç gün vardır; daha önce kaydedilmiş tam ay ortalamasını ezmeyelim.
    first_time = _parse_time(new_hours[0]["time"])
    partial_month = None
    if first_time is not None and (first_time.day, first_time.hour) != (1, 0):
        partial_month = new_hours[0]["time"][:7]
    for item in monthly(new_hours):
        if item["month"] == partial_month and item["month"] in month_map:
            continue
        month_map[item["month"]] = item
    _write_json(
        data_dir / "monthly.json",
        {
            "is_sample": False,
            "months": [month_map[k] for k in sorted(month_map)[-12:]],
        },
    )

    # İl bazlı aylık tahmini geçmiş (docs/GELISTIRICI.md'deki format). Aylık özetle aynı kural:
    # kayıtlı tam aylar korunur, pencerenin başındaki kısmi ay onları ezmez.
    existing_history = _read_json(data_dir / "province-history.json")
    kept: dict[str, list] = {}
    if existing_history and not existing_history.get("is_sample"):
        kept = {
            name: prov.get("months", [])
            for name, prov in (existing_history.get("provinces") or {}).items()
        }
    provinces_out = {}
    for name, prov in province_history(new_hours).items():
        by_month = {m["month"]: m for m in kept.get(name, [])}
        for m in prov["months"]:
            if m["month"] == partial_month and m["month"] in by_month:
                continue
            by_month[m["month"]] = m
        provinces_out[name] = {"months": [by_month[k] for k in sorted(by_month)[-12:]]}
    _write_json(
        data_dir / "province-history.json",
        {"is_sample": False, "updated": last24[-1]["time"], "provinces": provinces_out},
    )

    # COP31 dönemi (9-20 Kasım 2026) saatleri
    cop_start_iso = COP_START.isoformat()
    cop_end_iso = COP_END.isoformat()
    cop_hours = [
        h for h in new_hours
        if (t := _parse_time(h["time"])) is not None and COP_START <= t < COP_END
    ]
    existing_cop = _read_json(data_dir / "cop31.json")
    summary = summarize(cop_hours) if cop_hours else (
        existing_cop.get("summary") if existing_cop and not existing_cop.get("is_sample") else None
    )
    _write_json(
        data_dir / "cop31.json",
        {
            "is_sample": False,
            "start": cop_start_iso,
            "end": cop_end_iso,
            "summary": summary,
        },
    )
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="EPİAŞ'tan türetilmiş karbon yoğunluğu verisini günceller.")
    parser.add_argument(
        "--backfill-year",
        action="store_true",
        help="Son 365 günün verisini tek seferde (30 günlük parçalarla) çeker.",
    )
    args = parser.parse_args()

    now = datetime.now(TR)
    end_date = now.date()
    # Saatlik çalışmada hem son 24 saati hem de içinde bulunulan ayı + COP31 dönemini
    # eksiksiz tutmak için ay başından (veya en az 15 gün öncesinden) itibaren çekiyoruz.
    start_date = end_date - timedelta(days=365 if args.backfill_year else 35)

    try:
        hours = fetch_derived_hours(start_date=start_date, end_date=end_date)
    except Exception as exc:
        reason = f"API hatası: {type(exc).__name__}"
        mark_fetch_failure(DATA_DIR, now.isoformat(timespec="seconds"), reason)
        # GitHub Actions özetinde sarı uyarı olarak görünsün (iş akışı yine de devam eder).
        # Hata mesajı kimlik bilgisi içerebileceği için yalnızca türü yazılır.
        print(f"::warning title=EPİAŞ verisi alınamadı::{reason}")
        return 0  # GitHub Actions iş akışının son geçerli veriyi koruyabilmesi için kontrollü çıkış

    ok = update_site_data(hours, DATA_DIR, attempted_at=now.isoformat(timespec="seconds"))
    if not ok:
        print("::warning title=EPİAŞ boş veri döndürdü::Son geçerli veri korundu.")
    else:
        print(f"Güncellendi: {len(hours)} saat işlendi, son veri: {hours[-1]['time']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
