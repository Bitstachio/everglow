"use client";

import { RefObject, useEffect } from "react";

/** Keeps the active film-strip chip in view when the section changes. */
export const useScrollActiveChip = (
  activeId: string,
  tapeRef: RefObject<HTMLElement | null>,
) => {
  useEffect(() => {
    const tape = tapeRef.current;
    if (!tape || !activeId) return;

    const chip = tape.querySelector<HTMLElement>(`[data-nav-section="${activeId}"]`);
    if (!chip) return;

    const tapeRect = tape.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const nextLeft =
      tape.scrollLeft + (chipRect.left - tapeRect.left) - tapeRect.width / 2 + chipRect.width / 2;
    const maxLeft = tape.scrollWidth - tape.clientWidth;
    const left = Math.max(0, Math.min(nextLeft, maxLeft));

    if (Math.abs(tape.scrollLeft - left) < 2) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tape.scrollTo({ left, behavior: reduceMotion ? "instant" : "smooth" });
  }, [activeId, tapeRef]);
};
