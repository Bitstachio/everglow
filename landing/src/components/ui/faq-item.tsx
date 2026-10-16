"use client";

import { cn } from "@/lib/cn";
import { useId, useState } from "react";

type FaqItemProps = {
  question: string;
  answer: string;
};

/** Accordion row with a short height + fade transition (respects reduced motion). */
export const FaqItem = ({ question, answer }: FaqItemProps) => {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border-border-muted border-b">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "font-display text-strong flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 py-5 text-left text-[22px] leading-[1.25] font-semibold tracking-[-0.02em]",
          "focus-visible:outline-pencil focus-visible:outline-2 focus-visible:outline-offset-2",
        )}
      >
        {question}
        <span
          aria-hidden
          className={cn(
            "font-mono shrink-0 text-[22px] leading-none font-medium",
            open ? "text-strong" : "text-edge",
          )}
        >
          {open ? "×" : "+"}
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <p
            className={cn(
              "text-muted max-w-[64ch] pb-6 text-[17px] leading-[1.55]",
              "transition-opacity duration-200 ease-out motion-reduce:transition-none",
              open ? "opacity-100" : "opacity-0",
            )}
          >
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
};
