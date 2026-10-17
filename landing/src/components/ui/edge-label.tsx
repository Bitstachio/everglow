import { cn } from "@/lib/cn";
import { ReactNode } from "react";

type EdgeLabelProps = {
  children: ReactNode;
  className?: string;
};

/** Film edge-print label: mono, uppercase, tracked. */
export const EdgeLabel = ({ children, className }: EdgeLabelProps) => (
  <span
    className={cn(
      "font-mono text-[11px] leading-[15px] font-medium tracking-[0.12em] uppercase",
      className,
    )}
  >
    {children}
  </span>
);
