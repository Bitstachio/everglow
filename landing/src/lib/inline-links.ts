export type InlineSegment =
  { kind: "text"; text: string } | { kind: "strong"; text: string } | { kind: "link"; text: string; href: string };

// `[label](href)` or `**strong**`; neither nests.
const INLINE_PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

/**
 * Splits legal copy into text, strong and link segments. The only markup the
 * documents use, so they stay plain strings.
 */
export const parseInlineLinks = (source: string): InlineSegment[] => {
  const segments: InlineSegment[] = [];
  let cursor = 0;

  for (const match of source.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ kind: "text", text: source.slice(cursor, start) });
    segments.push(
      match[3] === undefined ? { kind: "link", text: match[1], href: match[2] } : { kind: "strong", text: match[3] },
    );
    cursor = start + match[0].length;
  }

  if (cursor < source.length) segments.push({ kind: "text", text: source.slice(cursor) });
  return segments;
};

/** Paths on this site (`/privacy`) go through the locale-aware Link; everything else is a plain anchor. */
export const isSitePath = (href: string) => href.startsWith("/") && !href.startsWith("//");
