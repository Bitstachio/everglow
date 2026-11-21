"use client";

import { cn } from "@/lib/cn";
import { useActiveSection } from "@/components/ui/site-nav/use-active-section";
import { useScrollActiveChip } from "@/components/ui/site-nav/use-scroll-active-chip";
import { useTranslations } from "next-intl";
import { useRef } from "react";

const SECTION_IDS = ["usual", "what", "gone", "faq"] as const;

type NavItem = {
  id: (typeof SECTION_IDS)[number];
  n: string;
  labelKey: "usual" | "what" | "gone" | "faq";
};

const ITEMS: NavItem[] = [
  { id: "usual", n: "01", labelKey: "usual" },
  { id: "what", n: "02", labelKey: "what" },
  { id: "gone", n: "03", labelKey: "gone" },
  { id: "faq", n: "04", labelKey: "faq" },
];

export const SiteNav = () => {
  const t = useTranslations("common.nav");
  const { activeId, selectSection } = useActiveSection(SECTION_IDS);
  const chipsRef = useRef<HTMLDivElement>(null);
  useScrollActiveChip(activeId, chipsRef);

  return (
    <nav
      data-site-nav
      aria-label={t("ariaLabel")}
      className="border-border-muted bg-background sticky top-0 z-40 shrink-0 border-b"
    >
      <div className="mx-auto flex max-w-[1240px] items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-8">
        <a
          href="#home"
          className="font-display text-strong shrink-0 text-[15px] leading-none font-semibold tracking-[-0.02em] no-underline"
        >
          {t("brand")}
        </a>

        <div className="relative min-w-0 flex-1">
          <div
            ref={chipsRef}
            className={cn(
              "flex items-center gap-1.5 overflow-x-auto whitespace-nowrap",
              "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              "mask-[linear-gradient(90deg,transparent,black_12px,black_calc(100%-16px),transparent)]",
            )}
          >
            {ITEMS.map((item) => {
              const isActive = activeId === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  data-nav-section={item.id}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => selectSection(item.id)}
                  className={cn(
                    "shrink-0 rounded-sm px-2.5 py-[7px] font-mono text-[11px] leading-none font-medium tracking-[0.12em] uppercase no-underline",
                    "duration-standard transition-colors",
                    isActive ? "bg-elevated text-strong" : "text-edge hover:bg-elevated hover:text-strong",
                  )}
                >
                  <span className={cn("text-edge mr-1.5 font-medium", isActive ? "" : "opacity-50")}>{item.n}</span>
                  {t(item.labelKey)}
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};
