"use client";

import { RefObject, useEffect } from "react";

/** Keeps the active nav chip in view when the section changes. */
export const useScrollActiveChip = (activeId: string, chipsRef: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const track = chipsRef.current;
    if (!track || !activeId) return;

    const chip = track.querySelector<HTMLElement>(`[data-nav-section="${activeId}"]`);
    if (!chip) return;

    const trackRect = track.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const nextLeft = track.scrollLeft + (chipRect.left - trackRect.left) - trackRect.width / 2 + chipRect.width / 2;
    const maxLeft = track.scrollWidth - track.clientWidth;
    const left = Math.max(0, Math.min(nextLeft, maxLeft));

    if (Math.abs(track.scrollLeft - left) < 2) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left, behavior: reduceMotion ? "instant" : "smooth" });
  }, [activeId, chipsRef]);
};
