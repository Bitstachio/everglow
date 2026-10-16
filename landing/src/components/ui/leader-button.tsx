import { cn } from "@/lib/cn";
import { ReactNode } from "react";

type LeaderButtonProps = {
  href: string;
  children: ReactNode;
  className?: string;
};

/** Primary leader action: white rectangle, mono uppercase label. */
export const LeaderButton = ({ href, children, className }: LeaderButtonProps) => (
  <a
    href={href}
    className={cn(
      "bg-accent text-accent-foreground inline-flex min-h-[58px] items-center justify-center px-8",
      "font-mono text-[12.5px] font-semibold tracking-[0.12em] uppercase no-underline",
      "hover:bg-accent-hover duration-standard transition-colors",
      className,
    )}
  >
    {children}
  </a>
);
