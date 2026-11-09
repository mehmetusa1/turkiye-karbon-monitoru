// Paylaşılan arayüz durumu ve küçük bir abonelik mekanizması.

function readStoredLang() {
  try {
    const v = localStorage.getItem("lang");
    return v === "tr" || v === "en" ? v : null;
  } catch {
    return null; // Gizli mod / engellenmiş depolama
  }
}

export function saveLang(value) {
  if (value !== "tr" && value !== "en") return;
  try {
    localStorage.setItem("lang", value);
  } catch {
    /* depolama yoksa yalnızca bu oturumda geçerli */
  }
}

export const state = {
  lang: readStoredLang() ?? (navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en"),
  city: null,          // seçili il adı (panel açıkken)
  hourIndex: 23,       // latest.hours içindeki indeks
  mapMode: "intensity", // "intensity" | "source"
  route: "/",
  params: {},
};

const listeners = [];

/** Durumu günceller; değişen anahtarları dinleyen fonksiyonları çağırır. */
export function set(patch) {
  const changed = Object.keys(patch).filter((k) => state[k] !== patch[k]);
  if (!changed.length) return;
  Object.assign(state, patch);
  for (const { keys, fn } of listeners) {
    if (keys.some((k) => changed.includes(k))) fn(state, changed);
  }
}

/** keys içindeki herhangi bir anahtar değişince fn(state, changedKeys) çağrılır. */
export function subscribe(keys, fn) {
  listeners.push({ keys, fn });
}
