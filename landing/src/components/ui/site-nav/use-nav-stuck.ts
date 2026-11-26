"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * True once the sticky site nav has reached the top of the viewport.
 * Below the hero fold it sits mid-page, so top is well above 0.
 */
export const useNavStuck = (navRef: RefObject<HTMLElement | null>) => {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const update = () => {
      const nav = navRef.current;
      if (!nav) return;
      setStuck(nav.getBoundingClientRect().top <= 1);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [navRef]);

  return stuck;
};
