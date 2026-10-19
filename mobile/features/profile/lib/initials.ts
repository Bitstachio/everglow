/** Up to two initials for a name or "@handle". Code points, so an emoji or accented letter stays whole. */
export const initials = (name: string): string =>
  name
    .replace(/^@/, "")
    .split(/[\s._]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => (Array.from(part)[0] ?? "").toUpperCase())
    .join("");
