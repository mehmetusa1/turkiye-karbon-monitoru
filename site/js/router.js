// Hash tabanlı yönlendirme. Yalnızca izinli rotalar ve izinli il slug'ları kabul edilir;
// hash içeriği hiçbir zaman DOM'a yazılmaz.

export const ROUTES = ["/", "/harita", "/rehber", "/veriler", "/yontem"];

let validSlugs = new Set();
let onChangeFn = null;

/** "#/harita?il=antalya" → { route: "/harita", params: { il: "antalya" } } */
export function parseHash(hash, slugs = validSlugs) {
  const raw = String(hash ?? "").replace(/^#/, "");
  const [path, query = ""] = raw.split("?", 2);
  const route = path === "" ? "/" : path;
  if (!ROUTES.includes(route)) return { route: "/", params: {} };

  const params = {};
  if (route === "/harita" && query) {
    const il = new URLSearchParams(query).get("il");
    if (il && slugs.has(il)) params.il = il;
  }
  return { route, params };
}

/** parseHash çıktısını (zaten doğrulanmış) adres biçimine çevirir. */
export function canonicalHash({ route, params = {} }) {
  return `#${route}${params.il ? `?il=${encodeURIComponent(params.il)}` : ""}`;
}

export function setValidSlugs(slugs) {
  validSlugs = new Set(slugs);
}

function buildHash(route, params = {}) {
  const r = ROUTES.includes(route) ? route : "/";
  const il = params.il && validSlugs.has(params.il) ? `?il=${encodeURIComponent(params.il)}` : "";
  return `#${r}${il}`;
}

/**
 * Rotaya gider. replace=true ise geçmişe yeni kayıt eklemez
 * (örn. panelde il değiştirirken geri tuşu her ili tek tek gezmesin).
 */
export function navigate(route, params = {}, { replace = false } = {}) {
  const hash = buildHash(route, params);
  if (hash === location.hash) return;
  if (replace) {
    // Kaydın "nereden gelindi" bilgisi korunur (panelde il değiştirmek onu silmesin)
    history.replaceState(history.state, "", hash);
  } else {
    history.pushState({ from: canonicalHash(parseHash(location.hash)) }, "", hash);
  }
  onChangeFn?.(parseHash(hash)); // pushState/replaceState hashchange tetiklemez
}

/**
 * Hedefe döner. Bu kayıt hedeften navigate ile açıldıysa geri gider; böylece
 * geçmişte işe yaramayan bir "geri" adımı kalmaz. Aksi halde (derin link) yerinde değiştirir.
 */
export function leaveTo(route, params = {}) {
  const hash = buildHash(route, params);
  if (history.state?.from === hash) history.back();
  else navigate(route, params, { replace: true });
}

export function startRouter(onChange) {
  onChangeFn = onChange;
  const handle = () => {
    const parsed = parseHash(location.hash);
    // Geçersiz/bilinmeyen hash adres çubuğunda kalmasın (geçmişe kayıt eklemeden düzelt)
    if (location.hash && location.hash !== canonicalHash(parsed)) {
      history.replaceState(null, "", canonicalHash(parsed));
    }
    onChange(parsed);
  };
  window.addEventListener("hashchange", handle);
  handle();
}
