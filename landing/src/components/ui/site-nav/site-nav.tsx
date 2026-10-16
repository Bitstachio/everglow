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
      "duration-standard rounded-sm px-4 py-2 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors",
      isActive ? "bg-elevated text-strong font-semibold" : "text-edge hover:text-strong font-medium",
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
          "pointer-events-auto flex items-center gap-0.5 px-1.5 py-1.5 sm:px-2 sm:py-2",
          "border-border bg-rebate/80 border backdrop-blur-md",
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
