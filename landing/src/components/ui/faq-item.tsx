import { cn } from "@/lib/cn";

type FaqItemProps = {
  question: string;
  answer: string;
};

export const FaqItem = ({ question, answer }: FaqItemProps) => (
  <details className="group border-border-muted border-b">
    <summary
      className={cn(
        "font-display text-strong flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-[22px] leading-[1.25] font-semibold tracking-[-0.02em]",
        "[&::-webkit-details-marker]:hidden",
        "focus-visible:outline-pencil focus-visible:outline-2 focus-visible:outline-offset-2",
      )}
    >
      {question}
      <span
        aria-hidden
        className="font-mono text-edge group-open:text-strong shrink-0 text-[22px] leading-none font-medium"
      >
        <span className="group-open:hidden">+</span>
        <span className="hidden group-open:inline">×</span>
      </span>
    </summary>
    <p className="text-muted max-w-[64ch] pb-6 text-[17px] leading-[1.55]">{answer}</p>
  </details>
);
