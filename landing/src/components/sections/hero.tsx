import { WaitlistForm } from "@/components/sections/cta/waitlist-form";
import { BrandMark } from "@/components/ui/brand-mark";
import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { PencilUnderline } from "@/components/ui/pencil-underline";
import { cn } from "@/lib/cn";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

const enter = "animate-hero-enter motion-reduce:animate-none";

/** Fills the opening viewport above the film-strip nav. */
export const Hero = async () => {
  const t = await getTranslations("common.hero");
  const waitlist = await getTranslations("cta");

  return (
    <section id="home" className="flex min-h-0 flex-1 flex-col">
      <Container className="grid min-h-0 flex-1 items-center gap-8 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-stretch md:gap-6 md:py-5 lg:gap-8">
        <div className="flex min-w-0 flex-col justify-center">
          <BrandMark
            className={cn(
              "font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-none font-semibold tracking-[-0.03em]",
              enter,
            )}
          >
            {t("brand")}
          </BrandMark>
          <EdgeLabel className={cn("text-edge mt-4 mb-3 block sm:mt-5 sm:mb-4", enter, "[animation-delay:120ms]")}>
            {t("eyebrow")}
          </EdgeLabel>
          <h1
            className={cn(
              "font-display text-strong max-w-[11ch] text-[clamp(2.25rem,6.5vw,4.75rem)] leading-[0.95] font-semibold tracking-[-0.045em]",
              enter,
              "[animation-delay:220ms]",
            )}
          >
            {t("headlineBefore")} <PencilUnderline>{t("headlineMark")}</PencilUnderline>
          </h1>
          <p
            className={cn(
              "text-muted mt-4 max-w-[54ch] text-base leading-[1.55] sm:mt-5 sm:text-lg md:text-xl",
              enter,
              "[animation-delay:280ms]",
            )}
          >
            {t("body")}
          </p>
          <div className={cn(enter, "[animation-delay:340ms]")}>
            <WaitlistForm
              emailLabel={waitlist("emailLabel")}
              emailPlaceholder={waitlist("emailPlaceholder")}
              button={waitlist("button")}
              submitting={waitlist("submitting")}
              note={t("note")}
              copy={{
                invalidEmail: waitlist("invalidEmail"),
                notConfigured: waitlist("notConfigured"),
                error: waitlist("error"),
                success: waitlist("success"),
              }}
            />
          </div>
        </div>
        <div className={cn("relative hidden min-h-0 md:block", enter, "[animation-delay:200ms]")}>
          <Image
            src="/design/hero-phone.jpg"
            alt={t("imageAlt")}
            width={600}
            height={1200}
            priority
            className="border-border absolute top-0 left-1/2 h-full w-auto max-w-full -translate-x-1/2 rounded-[36px] object-contain shadow-[0_0_0_1px_var(--border-default)] lg:rounded-[40px]"
            sizes="(min-width: 1024px) 45vw, 42vw"
          />
        </div>
      </Container>
    </section>
  );
};
