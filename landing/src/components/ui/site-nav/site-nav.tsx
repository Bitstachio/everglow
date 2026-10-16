"use client";

import { cn } from "@/lib/cn";
import { useActiveSection } from "@/components/ui/site-nav/use-active-section";
import { useTranslations } from "next-intl";

const SECTION_IDS = ["usual", "what", "gone", "faq", "start"] as const;

type NavItem = {
  id: (typeof SECTION_IDS)[number];
  n: string;
  labelKey: "usual" | "what" | "gone" | "faq" | "start";
};

const ITEMS: NavItem[] = [
  { id: "usual", n: "01", labelKey: "usual" },
  { id: "what", n: "02", labelKey: "what" },
  { id: "gone", n: "03", labelKey: "gone" },
  { id: "faq", n: "04", labelKey: "faq" },
  { id: "start", n: "05", labelKey: "start" },
];

export const SiteNav = () => {
  const t = useTranslations("common.nav");
  const { activeId, selectSection } = useActiveSection(SECTION_IDS);

  return (
    <nav
      data-site-nav
      aria-label={t("ariaLabel")}
      className={cn(
        "bg-rebate sticky top-0 z-40 shrink-0",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-[3px] before:h-[5px]",
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-[3px] after:h-[5px]",
        "before:bg-[repeating-linear-gradient(90deg,#262626_0_9px,transparent_9px_18px)]",
        "after:bg-[repeating-linear-gradient(90deg,#262626_0_9px,transparent_9px_18px)]",
      )}
    >
      <div className="mx-auto flex max-w-[1240px] items-center gap-1.5 overflow-x-auto px-4 py-3 whitespace-nowrap sm:px-6 lg:px-8">
        <a
          href="#home"
          className="font-display text-strong mr-3 shrink-0 text-[15px] leading-none font-semibold tracking-[-0.02em] no-underline"
        >
          {t("brand")}
        </a>
        {ITEMS.map((item) => {
          const isActive = activeId === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={isActive ? "true" : undefined}
              onClick={() => selectSection(item.id)}
              className={cn(
                "font-mono rounded-sm px-2.5 py-[7px] text-[11px] leading-none font-medium tracking-[0.12em] uppercase no-underline",
                "duration-standard transition-colors",
                isActive ? "bg-[#1a1a1a] text-strong" : "text-edge hover:bg-[#1a1a1a] hover:text-strong",
              )}
            >
              <span className={cn("mr-1.5 font-medium", isActive ? "text-edge" : "text-[#5e5e5e]")}>{item.n}</span>
              {t(item.labelKey)}
            </a>
          );
        })}
      </div>
    </nav>
  );
};
