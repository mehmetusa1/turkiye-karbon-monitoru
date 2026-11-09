// Kaydırınca beliren öğeler: [data-reveal] görünür alana girince .is-visible alır.
// JS yoksa veya reduced-motion açıksa öğeler doğrudan görünür kalır.

let observer = null;

export function observeReveal(root = document) {
  const items = root.querySelectorAll("[data-reveal]:not(.is-visible)");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  document.documentElement.classList.add("js-reveal");
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
  items.forEach((el, i) => {
    el.style.setProperty("--reveal-delay", `${(i % 4) * 70}ms`);
    observer.observe(el);
  });
}
