import { cn } from "@/lib/cn";

type FaqItemProps = {
  question: string;
  answer: string;
};

export const FaqItem = ({ question, answer }: FaqItemProps) => (
  <details className="group border-border border-b py-5 last:border-b-0">
    <summary
      className={cn(
        "text-strong flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-medium tracking-tight",
        "[&::-webkit-details-marker]:hidden",
      )}
    >
      {question}
      <span
        aria-hidden
        className="text-muted group-open:text-strong shrink-0 text-2xl leading-none font-light transition-transform duration-standard group-open:rotate-45"
      >
        +
      </span>
    </summary>
    <p className="text-muted mt-3 max-w-2xl text-base leading-relaxed sm:text-lg">{answer}</p>
  </details>
);
