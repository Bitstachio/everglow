"use client";

import { cn } from "@/lib/cn";
import { useActiveSection } from "@/components/ui/site-nav/use-active-section";
import { useTranslations } from "next-intl";

const SECTION_IDS = ["home", "how", "faq"] as const;

type NavLinkProps = {
  href: string;
  isActive: boolean;
  children: string;
};

const NavLink = ({ href, isActive, children }: NavLinkProps) => (
  <a
    href={href}
    aria-current={isActive ? "true" : undefined}
    className={cn(
      "rounded-full px-4 py-2 text-sm tracking-tight transition-colors duration-standard",
      isActive ? "bg-strong/8 text-strong font-semibold" : "text-strong/70 hover:text-strong font-medium",
    )}
  >
    {children}
  </a>
);

export const SiteNav = () => {
  const t = useTranslations("common.nav");
  const activeId = useActiveSection(SECTION_IDS);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-5 sm:pt-6">
      <nav
        aria-label={t("ariaLabel")}
        className={cn(
          "pointer-events-auto flex items-center gap-0.5 rounded-full px-1.5 py-1.5 sm:px-2 sm:py-2",
          "border border-white/70 bg-white/55 shadow-[0_8px_30px_rgba(26,26,29,0.08)]",
          "ring-1 ring-black/[0.04] backdrop-blur-2xl backdrop-saturate-150",
        )}
      >
        <NavLink href="#home" isActive={activeId === "home"}>
          {t("brand")}
        </NavLink>
        <NavLink href="#how" isActive={activeId === "how"}>
          {t("how")}
        </NavLink>
        <NavLink href="#faq" isActive={activeId === "faq"}>
          {t("faq")}
        </NavLink>
      </nav>
    </header>
  );
};
