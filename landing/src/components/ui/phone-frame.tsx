import { cn } from "@/lib/cn";

type PhoneFrameProps = {
  caption: string;
  className?: string;
};

/** iPhone-shaped slot. Drop a screenshot into `public/screenshots/` later and pass it as `src` if needed. */
export const PhoneFrame = ({ caption, className }: PhoneFrameProps) => (
  <figure className={cn("mx-auto w-[min(100%,17.5rem)]", className)}>
    <div className="border-strong/85 bg-strong relative aspect-[9/19.4] overflow-hidden rounded-[2.6rem] border-[10px] shadow-[0_24px_50px_rgba(26,26,29,0.14)]">
      <div className="bg-background flex h-full flex-col">
        <div className="flex justify-center pt-3 pb-2">
          <div className="bg-strong/80 h-[1.15rem] w-[5.5rem] rounded-full" />
        </div>
        <div className="border-border mx-3 mb-3 flex flex-1 flex-col items-center justify-center rounded-[1.4rem] border border-dashed bg-accent-soft/40 px-4 text-center">
          <p className="text-muted text-[0.65rem] font-medium tracking-[0.18em] uppercase">{caption}</p>
          <p className="text-muted mt-2 text-sm">Screenshot</p>
        </div>
      </div>
    </div>
  </figure>
);
