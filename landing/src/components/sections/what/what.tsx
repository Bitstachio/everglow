import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { CalendarMock } from "@/components/sections/what/calendar-mock";
import { KeepTiles } from "@/components/sections/what/keep-tiles";
import { StoryMock } from "@/components/sections/what/story-mock";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

const KEEP_TILE_KEYS = [0, 1, 2, 3, 4, 5] as const;
const STORY_FRAME_KEYS = [0, 1, 2] as const;

export const What = async () => {
  const t = await getTranslations("what");

  const keepTiles = KEEP_TILE_KEYS.map((i) => ({
    n: t(`keep.tiles.${i}.n`),
    label: t(`keep.tiles.${i}.label`),
    state: t(`keep.tiles.${i}.state`) as "keep" | "dim" | "reject",
  }));

  const storyFrames = STORY_FRAME_KEYS.map((i) => ({
    credit: t(`share.story.frames.${i}.credit`),
    src: t(`share.story.frames.${i}.src`),
  }));

  return (
    <section id="what" className="scroll-mt-16 pt-24">
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
          <StoryMock
            user={t("share.story.user")}
            time={t("share.story.time")}
            meta={t("share.story.meta")}
            title={t("share.story.title")}
            heroCredit={t("share.story.heroCredit")}
            note={t("share.story.note")}
            frames={storyFrames}
            disclaimer={t("share.story.disclaimer")}
            heroSrc="/design/story-hero.jpg"
          />
        </div>
      </Container>
    </section>
  );
};
