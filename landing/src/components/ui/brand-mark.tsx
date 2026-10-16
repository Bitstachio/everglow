import { cn } from "@/lib/cn";

type BrandMarkProps = {
  children: string;
  className?: string;
};

/**
 * Wordmark with a warm, layered light bloom — light through film, not neon.
 * Glow sits behind crisp type; respects reduced motion.
 */
export const BrandMark = ({ children, className }: BrandMarkProps) => (
  <span className={cn("brand-mark w-fit", className)}>
    <span className="brand-mark__bloom" aria-hidden>
      {children}
    </span>
    <span className="brand-mark__text">{children}</span>
  </span>
);
