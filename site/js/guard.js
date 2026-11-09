// Sayfa başka bir sitenin çerçevesi içinde açılırsa uyarı gösterir.
// (Meta CSP'de frame-ancestors çalışmaz ve GitHub Pages özel başlık eklemeye izin vermez.)

export function isFramed() {
  try {
    return window.top !== window.self;
  } catch {
    return true; // Farklı kökenli üst pencere erişimi engeller → çerçeve içindeyiz
  }
}

export function initFrameGuard() {
  if (!isFramed()) return;
  const banner = document.getElementById("framed-banner");
  const link = document.getElementById("framed-link");
  link.href = location.href.split("#")[0];
  banner.hidden = false;
  document.documentElement.classList.add("is-framed");
}
