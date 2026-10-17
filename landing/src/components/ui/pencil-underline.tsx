import { cn } from "@/lib/cn";
import { ReactNode } from "react";

type PencilUnderlineProps = {
  children: ReactNode;
  className?: string;
};

/** Strawberry grease-pencil underline under a phrase. */
export const PencilUnderline = ({ children, className }: PencilUnderlineProps) => (
  <span className={cn("relative inline-block", className)}>
    {children}
    <svg
      viewBox="0 0 300 20"
      preserveAspectRatio="none"
      aria-hidden
      className="pointer-events-none absolute -bottom-1.5 left-[-2%] h-3.5 w-[104%] overflow-visible sm:h-3.5"
    >
      <path d="M4 12 Q150 20 296 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-pencil" />
    </svg>
  </span>
);
