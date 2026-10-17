import { EdgeLabel } from "@/components/ui/edge-label";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** Oct 2026 calendar: event days 3, 10, 18, 24 circled in pencil. */
const DAYS: Array<{ day: number | null; event?: boolean }> = [
  ...Array.from({ length: 4 }, () => ({ day: null })),
  ...Array.from({ length: 31 }, (_, i) => {
    const day = i + 1;
    return { day, event: day === 3 || day === 10 || day === 18 || day === 24 };
  }),
];

type CalendarMockProps = {
  label: string;
};

export const CalendarMock = ({ label }: CalendarMockProps) => (
  <div className="bg-surface max-w-[360px] p-5">
    <EdgeLabel className="text-strong mb-2.5 block">{label}</EdgeLabel>
    <div className="grid grid-cols-7 gap-y-1">
      {WEEKDAYS.map((d, i) => (
        <span
          key={`${d}-${i}`}
          className="font-mono text-edge text-center text-[11px] leading-[30px] font-medium"
        >
          {d}
        </span>
      ))}
      {DAYS.map((cell, i) =>
        cell.day === null ? (
          <span key={`e-${i}`} />
        ) : (
          <span
            key={cell.day}
            className={cn(
              "font-mono mx-auto flex size-[30px] items-center justify-center text-center text-[13px] leading-[30px] font-medium",
              cell.event
                ? "text-strong border-pencil box-border rounded-full border-2 font-semibold leading-[26px]"
                : "text-muted",
            )}
          >
            {cell.day}
          </span>
        ),
      )}
    </div>
  </div>
);
