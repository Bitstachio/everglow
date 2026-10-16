import { EdgeLabel } from "@/components/ui/edge-label";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

const FRAMES = [
  { key: 0, src: "/photos/barbod.jpg", position: "center 28%" },
  { key: 1, src: "/photos/mehrshad.jpg", position: "center top" },
  { key: 2, src: "/photos/amir.jpg", position: "center 48%" },
  { key: 3, src: "/photos/peashoo.jpg", position: "center 68%" },
] as const;

/** Contact-sheet frames. Captions sit under the print, not on it. */
export const PhotoStrip = async () => {
  const t = await getTranslations("common.photos");

  return (
    <div className="bg-rebate w-full py-5 sm:py-6">
      <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-x-3 gap-y-6 px-4 sm:px-6 md:grid-cols-4 md:gap-x-4 lg:px-8">
        {FRAMES.map((frame) => (
          <figure key={frame.key} className="min-w-0">
            <div className="bg-elevated relative aspect-square overflow-hidden">
              <Image
                src={frame.src}
                alt={t(`frames.${frame.key}.alt`)}
                fill
                sizes="(min-width: 768px) 22vw, 46vw"
                className="object-cover"
                style={{ objectPosition: frame.position }}
              />
            </div>
            <figcaption className="mt-2.5">
              <EdgeLabel className="text-edge mb-1 block text-[10px] leading-[14px] tracking-[0.1em]">
                {t(`frames.${frame.key}.label`)}
              </EdgeLabel>
              <span className="text-muted block font-mono text-[11px] leading-[1.45] font-medium">
                {t(`frames.${frame.key}.caption`)}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
};
