// Sayı, yüzde ve tarih biçimlendirme (dil durumuna göre).
import { state } from "./state.js";

export const TZ = "Europe/Istanbul";
const locale = () => (state.lang === "tr" ? "tr-TR" : "en-GB");

export const fmtNum = (n, digits = 0) =>
  new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

export const fmtPct = (share) =>
  new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(share);

/** 0–100 aralığındaki yüzde değerini (ör. 38.4) "%38,4" / "38.4%" biçimine çevirir. */
export const fmtPctValue = (pct, digits = 1) =>
  new Intl.NumberFormat(locale(), { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(pct / 100);

export const fmtDate = (iso, opts) =>
  new Intl.DateTimeFormat(locale(), { timeZone: TZ, ...opts }).format(new Date(iso));

export const fmtHour = (iso) => fmtDate(iso, { hour: "2-digit", minute: "2-digit" });
export const fmtDayHour = (iso) =>
  fmtDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const fmtMonth = (month) =>
  fmtDate(`${month}-15T12:00:00+03:00`, { month: "short", year: "2-digit" });
