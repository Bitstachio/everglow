import { Link } from "@/i18n/navigation";
import { isSitePath, parseInlineLinks } from "@/lib/inline-links";

type RichTextProps = {
  text: string;
};

const LINK_CLASS =
  "text-strong decoration-edge hover:decoration-pencil underline underline-offset-[3px] focus-visible:outline-pencil focus-visible:outline-2 focus-visible:outline-offset-2";

/** Plain copy with `[label](href)` links and `**strong**` lead-ins. */
export const RichText = ({ text }: RichTextProps) => (
  <>
    {parseInlineLinks(text).map((segment, index) => {
      if (segment.kind === "text") return segment.text;
      if (segment.kind === "strong") {
        return (
          <strong key={index} className="text-strong font-semibold">
            {segment.text}
          </strong>
        );
      }
      if (isSitePath(segment.href)) {
        return (
          <Link key={index} href={segment.href} className={LINK_CLASS}>
            {segment.text}
          </Link>
        );
      }
      // An anchor on this page, a mailto: address, or another site.
      const external = segment.href.startsWith("http");
      return (
        <a
          key={index}
          href={segment.href}
          className={LINK_CLASS}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {segment.text}
        </a>
      );
    })}
  </>
);
