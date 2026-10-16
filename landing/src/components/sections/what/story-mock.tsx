import Image from "next/image";

type StoryFrame = {
  credit: string;
  src: string;
};

type StoryMockProps = {
  user: string;
  time: string;
  meta: string;
  title: string;
  heroCredit: string;
  note: string;
  frames: StoryFrame[];
  heroSrc: string;
};

export const StoryMock = ({
  user,
  time,
  meta,
  title,
  heroCredit,
  note,
  frames,
  heroSrc,
}: StoryMockProps) => (
  <div className="border-border relative aspect-[9/16] w-[360px] max-w-full overflow-hidden bg-[#0e0e0e] shadow-[0_0_0_1px_var(--border-default)]">
      <div
        aria-hidden
        className="absolute top-0 bottom-0 left-1.5 w-2.5 bg-[repeating-linear-gradient(180deg,#262626_0_12px,transparent_12px_24px)]"
      />
      <div
        aria-hidden
        className="absolute top-0 right-1.5 bottom-0 w-2.5 bg-[repeating-linear-gradient(180deg,#262626_0_12px,transparent_12px_24px)]"
      />
      <div className="absolute top-3.5 right-[26px] left-[26px] h-[3px] bg-[rgba(244,244,244,0.25)]">
        <div className="bg-strong h-full w-2/5" />
      </div>
      <div className="font-sans text-strong absolute top-7 left-[26px] flex items-center gap-2 text-xs font-semibold">
        <span className="bg-border size-[26px] rounded-full" />
        {user}
        <span className="text-edge font-normal">{time}</span>
      </div>
      <div className="absolute top-[84px] right-[26px] bottom-[30px] left-[26px] flex flex-col">
        <div className="font-mono text-edge text-[9.5px] leading-3 font-medium tracking-[0.1em] uppercase">
          {meta}
        </div>
        <div className="font-display relative mt-2 mb-3.5 text-[30px] leading-[0.98] font-semibold tracking-[-0.04em]">
          {title}
          <svg
            viewBox="0 0 100 8"
            preserveAspectRatio="none"
            aria-hidden
            className="pointer-events-none absolute right-[6%] bottom-[-6px] h-2 w-[46%] overflow-visible"
          >
            <path d="M1 5 Q50 8 99 3" fill="none" stroke="#ff4f6d" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="relative">
          <Image
            src={heroSrc}
            alt=""
            width={600}
            height={400}
            className="block aspect-[3/2] w-full object-cover"
          />
          <svg
            viewBox="0 0 100 66"
            preserveAspectRatio="none"
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <path
              d="M57 10 C70 12 73 40 63 56 C54 64 42 58 42 36 C42 20 48 10 58 9 C62 9 64 11 63 14"
              fill="none"
              stroke="#ff4f6d"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="mt-1.5 mb-3 flex items-baseline justify-between">
          <span className="font-mono text-edge text-[8.5px] leading-3 font-medium tracking-[0.1em] uppercase">
            {heroCredit.split("·")[0]}·{" "}
            <b className="text-strong font-semibold">{heroCredit.split("·")[1]?.trim()}</b>
          </span>
          <span className="font-hand text-pencil -rotate-3 text-[22px] leading-none">{note}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {frames.map((frame) => (
            <div key={frame.src}>
              <Image
                src={frame.src}
                alt=""
                width={200}
                height={250}
                className="block aspect-[4/5] w-full object-cover"
              />
              <div className="font-mono text-edge mt-1 text-[8.5px] leading-3 font-medium tracking-[0.1em] uppercase">
                {frame.credit.split("·")[0]}·{" "}
                <b className="text-strong font-semibold">{frame.credit.split("·")[1]?.trim()}</b>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
);
