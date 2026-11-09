// Uygulama girişi: veriyi yükler, görünümleri ve modülleri bağlar.
import { state, set, subscribe, saveLang } from "./state.js";
import { t, applyText } from "./i18n.js";
import { fmtDayHour } from "./format.js";
import { loadRequired, loadOptional, validateHistory, validatePlants, slugify } from "./data.js";
import { startRouter, setValidSlugs, parseHash } from "./router.js";
import { initFrameGuard } from "./guard.js";
import { viewHooks } from "./views.js";
import { prepareIntro, playIntro, dismissIntroNow } from "./intro.js";
import "./home.js";
import "./map.js";
import { focusOpenPanel } from "./panel.js";
import "./pages.js";

const STALE_AFTER_HOURS = 3;
const $ = (id) => document.getElementById(id);
const data = {};
const initialized = new Set();

function renderBanners() {
  const latest = data.latest;
  if (!latest) return;
  const sample = latest.is_sample;
  $("sample-banner").hidden = !sample;
  $("sample-pill").hidden = !sample;

  const last = latest.hours.at(-1);
  const time = fmtDayHour(last.time);
  const ageHours = Math.floor((Date.now() - new Date(last.time).getTime()) / 3_600_000);
  const stale = $("stale-banner");
  if (latest.last_fetch_failed) {
    stale.textContent = t("stale_failed")(time);
    stale.hidden = false;
  } else if (!sample && ageHours > STALE_AFTER_HOURS) {
    stale.textContent = t("stale_old")(time, ageHours);
    stale.hidden = false;
  } else {
    stale.hidden = true;
  }
}

function renderLangButton() {
  const btn = $("lang-btn");
  btn.textContent = state.lang === "tr" ? "EN" : "TR";
  btn.setAttribute("aria-label", t("switch_to"));
}

function showView({ route, params }) {
  const prev = state.route;
  document.querySelectorAll("[data-view]").forEach((v) => {
    v.hidden = v.dataset.view !== route;
  });
  document.querySelectorAll("[data-route]").forEach((a) => {
    if (a.dataset.route === route) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  closeMobileNav();

  if (prev !== route) viewHooks.get(prev)?.hide?.();
  set({ route, params });

  const hooks = viewHooks.get(route);
  if (hooks && (data.latest || hooks.static)) {
    if (!initialized.has(route)) {
      initialized.add(route);
      hooks.init?.(data);
    }
    hooks.show?.(data, params);
  }

  const heading = document.querySelector(`[data-view="${route}"] .view-heading`);
  document.title = route === "/" ? t("doc_title") : `${heading?.textContent ?? ""} | ${t("nav_brand")}`;
  if (prev !== route) {
    window.scrollTo({ top: 0 });
    // Ekran okuyucular için odak yeni görünümün başlığına
    if (document.body.dataset.ready === "1") heading?.focus({ preventScroll: true });
  }
}

function closeMobileNav() {
  $("nav-toggle").setAttribute("aria-expanded", "false");
  $("nav-links").classList.remove("is-open");
}

function setupSkipLink() {
  // Hash router'ı tetiklemeden ana içeriğe odaklan
  document.querySelector(".skip-link").addEventListener("click", (e) => {
    e.preventDefault();
    $("view-root").focus();
  });
}

/** Menü + bantların gerçek yüksekliğini CSS'e aktarır (panel bunun altından başlar). */
function trackHeaderHeight() {
  const header = $("site-nav");
  const apply = () => document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
  apply();
  if ("ResizeObserver" in window) new ResizeObserver(apply).observe(header);
}

function setupNav() {
  const toggle = $("nav-toggle");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    $("nav-links").classList.toggle("is-open", open);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      closeMobileNav();
      toggle.focus();
    }
  });
  const onScroll = () => $("site-nav").classList.toggle("is-scrolled", window.scrollY > 24);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  $("lang-btn").addEventListener("click", () => {
    const next = state.lang === "tr" ? "en" : "tr";
    saveLang(next);
    set({ lang: next });
  });
}

function renderTextAll() {
  applyText();
  renderLangButton();
  renderBanners();
  const heading = document.querySelector(`[data-view="${state.route}"] .view-heading`);
  document.title = state.route === "/" ? t("doc_title") : `${heading?.textContent ?? ""} | ${t("nav_brand")}`;
}

/**
 * Veri yüklenmeden önce yalnızca doğru görünümü göster (örn. #/harita linki ana sayfayı
 * göstermesin). Adres düzeltme ve hook'lar il listesi gelince startRouter ile çalışır.
 */
function showRouteShell() {
  const { route } = parseHash(location.hash, { has: () => true });
  document.querySelectorAll("[data-view]").forEach((v) => {
    v.hidden = v.dataset.view !== route;
  });
  document.querySelectorAll("[data-route]").forEach((a) => {
    if (a.dataset.route === route) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

async function main() {
  prepareIntro();
  initFrameGuard();
  setupNav();
  setupSkipLink();
  trackHeaderHeight();
  renderTextAll();
  subscribe(["lang"], renderTextAll);
  showRouteShell();

  try {
    Object.assign(data, await loadRequired());
  } catch (err) {
    console.error(err);
    $("error").hidden = false;
    dismissIntroNow();
    startRouter(showView); // statik sayfalar (rehber, yöntem) yine de gezilebilir
    return;
  }
  data.history = null;
  data.historyLoaded = false; // yüklenemezse de true olur → panel "henüz yayınlanmadı" der
  data.historyPromise = loadOptional("province-history", validateHistory).then((h) => {
    data.history = h;
    data.historyLoaded = true;
    return h;
  });

  data.plants = null;
  data.plantsLoaded = false; // yüklenemezse de true olur → panel boş durum gösterir
  data.plantsPromise = loadOptional("plants", validatePlants).then((p) => {
    data.plants = p;
    data.plantsLoaded = true;
    return p;
  });

  setValidSlugs(data.map.provinces.map((p) => slugify(p.name)));
  set({ hourIndex: data.latest.hours.length - 1 });
  renderBanners();

  startRouter(showView);
  await playIntro({ provinces: data.map.provinces });
  document.body.dataset.ready = "1";
  focusOpenPanel(); // derin link giriş animasyonu sırasında açıldıysa odak panele
  setInterval(renderBanners, 60_000);
}

main();
