import { cn } from "@/lib/cn";
import Image from "next/image";

type StoryTile = {
  src: string;
  /** CSS grid-area: rowStart / colStart / rowEnd / colEnd */
  area: string;
  position?: string;
  date?: string;
};

type StoryMockProps = {
  user: string;
  time: string;
  titleLine1: string;
  titleLine2: string;
  tiles: StoryTile[];
};

/** Instagram-story phone: profile chrome + handwritten title + bento of the night. */
export const StoryMock = ({ user, time, titleLine1, titleLine2, tiles }: StoryMockProps) => (
  <div className="border-border relative aspect-[9/16] w-[360px] max-w-full overflow-hidden bg-[#0e0e0e] text-[#eee8df] shadow-[0_0_0_1px_var(--border-default)]">
    <div className="absolute inset-x-4 top-3.5 z-10 flex gap-1">
      <span className="bg-strong h-[3px] flex-1 rounded-full" />
      <span className="h-[3px] flex-1 rounded-full bg-[rgba(244,244,244,0.28)]" />
      <span className="h-[3px] flex-1 rounded-full bg-[rgba(244,244,244,0.28)]" />
    </div>

    <div className="absolute top-7 left-4 z-10 flex items-center gap-2">
      <span className="bg-border size-[26px] shrink-0 rounded-full" aria-hidden />
      <span className="text-strong font-sans text-xs font-semibold">{user}</span>
      <span className="text-edge text-xs font-normal">{time}</span>
    </div>

    <div className="absolute inset-x-4 top-[58px] bottom-4 flex flex-col">
      <p className="font-hand shrink-0 -rotate-2 text-[42px] leading-[0.92]">
        <span className="block">{titleLine1}</span>
        <span className="block">{titleLine2}</span>
      </p>

      <div className="mt-3 grid min-h-0 flex-1 grid-cols-6 grid-rows-8 gap-1.5">
        {tiles.map((tile) => (
          <div
            key={`${tile.src}-${tile.area}`}
            className="bg-elevated relative overflow-hidden rounded-[10px]"
            style={{ gridArea: tile.area }}
          >
            <Image
              src={tile.src}
              alt=""
              fill
              sizes="(min-width: 768px) 220px, 46vw"
              className="object-cover"
              style={{ objectPosition: tile.position ?? "center" }}
            />
            {tile.date ? (
              <span
                className={cn(
                  "text-pencil absolute right-2 bottom-1.5 font-mono text-[9px] leading-none font-semibold tracking-[0.06em]",
                )}
              >
                {tile.date}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  </div>
);
