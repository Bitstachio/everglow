import { CalendarMock } from "@/components/sections/what/calendar-mock";
import { KeepTiles } from "@/components/sections/what/keep-tiles";
import { StoryMock } from "@/components/sections/what/story-mock";
import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

const KEEP_TILE_KEYS = [0, 1, 2, 3, 4, 5] as const;
const STORY_TILE_KEYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const What = async () => {
  const t = await getTranslations("what");

  const keepTiles = KEEP_TILE_KEYS.map((i) => ({
    n: t(`keep.tiles.${i}.n`),
    label: t(`keep.tiles.${i}.label`),
    state: t(`keep.tiles.${i}.state`) as "keep" | "dim" | "reject",
  }));

  const storyTiles = STORY_TILE_KEYS.map((i) => {
    const dateKey = `share.story.tiles.${i}.date` as const;
    return {
      src: t(`share.story.tiles.${i}.src`),
      area: t(`share.story.tiles.${i}.area`),
      position: t(`share.story.tiles.${i}.position`),
      ...(t.has(dateKey) ? { date: t(dateKey) } : {}),
    };
  });

  return (
    <section id="what" className="scroll-mt-[var(--film-nav-h)] pt-24">
      <Container>
        <EdgeLabel className="text-edge mb-3 block">{t("eyebrow")}</EdgeLabel>
        <h2 className="font-display text-strong mb-7 max-w-[20ch] text-[clamp(2rem,4vw,2.75rem)] leading-none font-semibold tracking-[-0.035em]">
          {t("headline")}
        </h2>

        <div className="border-strong grid items-center gap-7 border-t-2 border-b border-b-[var(--border-muted)] py-10 md:grid-cols-2 md:gap-16">
          <div>
            <EdgeLabel className="text-edge mb-2.5 block">{t("find.eyebrow")}</EdgeLabel>
            <h3 className="font-display text-strong mb-3 text-[clamp(1.625rem,3vw,2.125rem)] leading-[1.1] font-semibold tracking-[-0.03em]">
              {t("find.title")}
            </h3>
            <p className="text-muted m-0 max-w-[46ch] leading-[1.55]">{t("find.body")}</p>
          </div>
          <CalendarMock label={t("find.calendarLabel")} />
        </div>

        <div className="grid items-center gap-7 border-b border-b-[var(--border-muted)] py-10 md:grid-cols-2 md:gap-16">
          <div>
            <EdgeLabel className="text-edge mb-2.5 block">{t("keep.eyebrow")}</EdgeLabel>
            <h3 className="font-display text-strong mb-3 text-[clamp(1.625rem,3vw,2.125rem)] leading-[1.1] font-semibold tracking-[-0.03em]">
              {t("keep.title")}
            </h3>
            <p className="text-muted m-0 max-w-[46ch] leading-[1.55]">{t("keep.body")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-7">
            <Image
              src="/design/keep-phone.jpg"
              alt={t("keep.imageAlt")}
              width={420}
              height={860}
              className="border-border block w-[210px] max-w-full rounded-[32px] shadow-[0_0_0_1px_var(--border-default)]"
              sizes="210px"
            />
            <KeepTiles tiles={keepTiles} />
          </div>
        </div>

        <div className="grid items-center gap-7 border-b border-b-[var(--border-muted)] py-10 md:grid-cols-2 md:gap-16">
          <div>
            <EdgeLabel className="text-edge mb-2.5 block">{t("share.eyebrow")}</EdgeLabel>
            <h3 className="font-display text-strong mb-3 text-[clamp(1.625rem,3vw,2.125rem)] leading-[1.1] font-semibold tracking-[-0.03em]">
              {t("share.title")}
            </h3>
            <p className="text-muted m-0 max-w-[46ch] leading-[1.55]">{t("share.body")}</p>
          </div>
          <div>
            <StoryMock
              user={t("share.story.user")}
              time={t("share.story.time")}
              titleLine1={t("share.story.titleLine1")}
              titleLine2={t("share.story.titleLine2")}
              tiles={storyTiles}
            />
            <p className="text-edge mt-3 max-w-[360px] font-mono text-[9px] leading-3 font-medium tracking-[0.1em] uppercase">
              {t("share.story.sample")}
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
};
