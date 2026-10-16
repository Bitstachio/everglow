import { EdgeLabel } from "@/components/ui/edge-label";
import { getTranslations } from "next-intl/server";

const FRAME_KEYS = [0, 1, 2, 3] as const;

/** Empty contact-sheet frames — photos filled in later. */
export const PhotoStrip = async () => {
  const t = await getTranslations("common.photos");

  return (
    <div className="bg-rebate w-full py-4.5">
      <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-1.5 px-4 sm:px-6 md:grid-cols-4 lg:px-8">
        {FRAME_KEYS.map((i) => (
          <div
            key={i}
            className="bg-elevated flex aspect-[3/2] flex-col justify-between p-2.5"
            aria-label={t(`frames.${i}.caption`)}
          >
            <EdgeLabel className="text-edge text-[10px] leading-[14px] tracking-[0.1em]">
              {t(`frames.${i}.label`)}
            </EdgeLabel>
            <span className="font-mono text-muted text-[11px] leading-[15px] font-medium">
              {t(`frames.${i}.caption`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
