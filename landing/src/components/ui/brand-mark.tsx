import { cn } from "@/lib/cn";

type BrandMarkProps = {
  children: string;
  className?: string;
};

/**
 * Wordmark with a warm glyph-following bloom (light through film, not neon).
 * Animation tokens live in globals `@theme`; styling is Tailwind on this component.
 */
export const BrandMark = ({ children, className }: BrandMarkProps) => (
  <span className={cn("relative inline-block w-fit isolate px-[0.18em] -mx-[0.18em]", className)}>
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-[0.18em] inset-y-0 z-0 text-[#ffb06a]",
        "animate-brand-bloom motion-reduce:animate-none",
      )}
    >
      {children}
    </span>
    <span
      className={cn(
        "relative z-[1]",
        "bg-[linear-gradient(165deg,#ffffff_0%,#fffaf2_28%,#f4f4f4_52%,#ffe0b8_88%,#ffb879_100%)]",
        "bg-size-[100%_140%] bg-position-[50%_0%]",
        "bg-clip-text text-transparent [-webkit-text-fill-color:transparent]",
        "drop-shadow-[0_0_2px_rgba(255,250,242,0.45)]",
        "drop-shadow-[0_0_10px_rgba(255,176,106,0.35)]",
        "drop-shadow-[0_0_22px_rgba(242,142,66,0.22)]",
        "animate-brand-sheen motion-reduce:animate-none",
      )}
    >
      {children}
    </span>
  </span>
);
