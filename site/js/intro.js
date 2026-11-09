// "Havadan iniş" giriş animasyonu. Oturumda bir kez oynar; reduced-motion'da hiç oynamaz.
// JS çalışmazsa CSS katmanı kendi kendine söner (intro.css → intro-auto-out).

const SVG_NS = "http://www.w3.org/2000/svg";
const DURATION_MS = 2600;
const MAX_WAIT_MS = 5000; // veri bundan uzun sürerse animasyon atlanır
const startedAt = performance.now();

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function alreadySeen() {
  try {
    return sessionStorage.getItem("introSeen") === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    sessionStorage.setItem("introSeen", "1");
  } catch {
    /* depolama yoksa her yüklemede oynar; zararsız */
  }
}

function setInert(on) {
  for (const id of ["site-nav", "view-root"]) {
    const el = document.getElementById(id);
    if (el) el.inert = on;
  }
}

/** Giriş katmanını hemen kaldırır (animasyon yok). */
export function dismissIntroNow() {
  document.getElementById("intro")?.remove();
  setInert(false);
}

/**
 * JS çalışıyorsa katmanın kontrolünü hemen devral: CSS'teki kendiliğinden sönme
 * yedeği yalnızca JS hiç çalışmazsa devrede kalmalı.
 */
export function prepareIntro() {
  const intro = document.getElementById("intro");
  if (!intro) return;
  if (alreadySeen() || reducedMotion()) {
    dismissIntroNow();
    return;
  }
  intro.classList.add("is-waiting");
  // Veri isteği takılırsa katman sonsuza dek ekranı kapatmasın
  setTimeout(() => {
    if (document.getElementById("intro") && !intro.classList.contains("is-playing")) {
      markSeen();
      dismissIntroNow();
    }
  }, MAX_WAIT_MS);
  // Veri beklenirken de atlanabilsin; playIntro katmanı bulamazsa hemen çözülür
  document.getElementById("intro-skip").addEventListener("click", () => {
    if (intro.classList.contains("is-playing")) return; // oynarken playIntro yönetir
    markSeen();
    dismissIntroNow();
  });
}

/** Animasyonu oynatır; bittiğinde veya atlandığında çözülür. */
export function playIntro({ provinces }) {
  const intro = document.getElementById("intro");
  if (!intro) return Promise.resolve();
  if (alreadySeen() || reducedMotion() || performance.now() - startedAt > MAX_WAIT_MS) {
    markSeen();
    dismissIntroNow();
    return Promise.resolve();
  }

  const svg = document.getElementById("intro-map");
  const sorted = [...provinces].sort((a, b) => a.center[0] - b.center[0]); // batıdan doğuya ışıklanır
  sorted.forEach((p, i) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", p.path);
    path.setAttribute("pathLength", "1");
    path.setAttribute("class", "intro-prov");
    path.style.setProperty("--d", `${Math.min(900, i * 11)}ms`);
    svg.append(path);
  });

  setInert(true);
  intro.classList.add("is-playing");

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      markSeen();
      clearTimeout(timer);
      window.removeEventListener("keydown", finish);
      intro.removeEventListener("click", finish);
      intro.classList.add("is-leaving");
      setInert(false);
      const nav = document.getElementById("site-nav");
      nav.classList.add("nav--landing");
      setTimeout(() => nav.classList.remove("nav--landing"), 800);
      setTimeout(() => intro.remove(), 650);
      resolve();
    };
    const timer = setTimeout(finish, DURATION_MS);
    window.addEventListener("keydown", finish);
    intro.addEventListener("click", finish);
    document.getElementById("intro-skip").addEventListener("click", finish);
  });
}
