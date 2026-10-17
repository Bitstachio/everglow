"use client";

import { scrollToAnchor } from "@/lib/scroll-to-anchor";
import { useEffect } from "react";

/**
 * Same-page hash links get a short custom ease instead of browser scroll-smooth
 * (which has no controllable duration).
 */
export const FastHashScroll = () => {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest?.("a[href^='#']");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const href = anchor.getAttribute("href");
      if (!href || href === "#" || href === "#top") return;

      const id = decodeURIComponent(href.slice(1));
      if (!document.getElementById(id)) return;

      event.preventDefault();
      history.pushState(null, "", href);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      scrollToAnchor(id);
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
};
