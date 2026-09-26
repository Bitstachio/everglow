import { cn } from "@/lib/cn";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export const SiteNav = async () => {
  const t = await getTranslations("common.nav");

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
        <Link href="/" className="text-strong rounded-full px-4 py-2 text-sm font-semibold tracking-tight">
          {t("brand")}
        </Link>
        <a
          href="#how"
          className="text-strong/70 hover:text-strong rounded-full px-4 py-2 text-sm font-medium tracking-tight transition-colors duration-standard"
        >
          {t("how")}
        </a>
        <a
          href="#faq"
          className="text-strong/70 hover:text-strong rounded-full px-4 py-2 text-sm font-medium tracking-tight transition-colors duration-standard"
        >
          {t("faq")}
        </a>
      </nav>
    </header>
  );
};
