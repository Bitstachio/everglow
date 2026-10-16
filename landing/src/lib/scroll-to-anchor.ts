const DEFAULT_DURATION_MS = 320;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

const navOffsetPx = () => {
  const nav = document.querySelector<HTMLElement>("[data-site-nav]");
  if (!nav) return 0;
  return Math.ceil(nav.getBoundingClientRect().height);
};

/** Smooth-scroll to an in-page id. Faster than browser `scroll-smooth`; instant if reduced motion. */
export const scrollToAnchor = (id: string, durationMs = DEFAULT_DURATION_MS) => {
  const element = document.getElementById(id);
  if (!element) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const targetY = Math.max(0, window.scrollY + element.getBoundingClientRect().top - navOffsetPx());

  if (reduceMotion || durationMs <= 0) {
    window.scrollTo(0, targetY);
    return;
  }

  const startY = window.scrollY;
  const distance = targetY - startY;
  if (Math.abs(distance) < 1) return;

  const startedAt = performance.now();

  const tick = (now: number) => {
    const t = Math.min(1, (now - startedAt) / durationMs);
    window.scrollTo(0, startY + distance * easeOutCubic(t));
    if (t < 1) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
};
