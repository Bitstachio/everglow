"use client";

import { useEffect, useRef, useState } from "react";

const readNavHeight = () => {
  const nav = document.querySelector<HTMLElement>("[data-site-nav]");
  if (!nav) return 52;
  return Math.ceil(nav.getBoundingClientRect().height);
};

const syncFilmNavHeight = () => {
  const height = readNavHeight();
  document.documentElement.style.setProperty("--film-nav-h", `${height}px`);
  return height;
};

const isSectionInView = (element: HTMLElement, probe: number) => {
  const rect = element.getBoundingClientRect();
  return rect.bottom > probe && rect.top < window.innerHeight;
};

/**
 * Tracks which landing section sits under the sticky film-strip.
 * Clicks highlight immediately and stay locked through smooth scroll until
 * the destination reaches the nav line (or the page bottom).
 */
export const useActiveSection = (sectionIds: readonly string[]) => {
  const [activeId, setActiveId] = useState(sectionIds[0] ?? "");
  const lockedIdRef = useRef<string | null>(null);

  useEffect(() => {
    const update = () => {
      const navHeight = syncFilmNavHeight();
      const probe = navHeight + 2;
      const lockedId = lockedIdRef.current;

      const scrollBottom = window.scrollY + window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;
      const atBottom = scrollBottom >= docHeight - 4;

      // Click/hash navigation: keep the chosen section lit while the page scrolls.
      if (lockedId && (sectionIds as readonly string[]).includes(lockedId)) {
        setActiveId(lockedId);
        const lockedEl = document.getElementById(lockedId);
        if (!lockedEl) {
          lockedIdRef.current = null;
          return;
        }
        const reachedNav = lockedEl.getBoundingClientRect().top <= probe + 4;
        const landedAtBottom = atBottom && isSectionInView(lockedEl, probe);
        if (reachedNav || landedAtBottom) {
          lockedIdRef.current = null;
        }
        return;
      }

      let current = sectionIds[0] ?? "";
      for (const id of sectionIds) {
        const element = document.getElementById(id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= probe) {
          current = id;
        }
      }

      if (atBottom) {
        for (const id of sectionIds) {
          const element = document.getElementById(id);
          if (!element) continue;
          if (isSectionInView(element, probe)) {
            current = id;
          }
        }
      }

      setActiveId(current);
    };

    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if ((sectionIds as readonly string[]).includes(hash)) {
        lockedIdRef.current = hash;
        setActiveId(hash);
      }
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("resize", update);

    const nav = document.querySelector("[data-site-nav]");
    const observer = nav ? new ResizeObserver(update) : null;
    if (nav && observer) observer.observe(nav);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [sectionIds]);

  const selectSection = (id: string) => {
    lockedIdRef.current = id;
    setActiveId(id);
  };

  return { activeId, selectSection };
};
