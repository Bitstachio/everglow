import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { RichText } from "@/components/ui/rich-text";
import { SiteFooter } from "@/components/ui/site-footer";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { formatLegalDate, LegalBlock, LegalDocument, LegalSection } from "@/lib/legal-documents";
import { getTranslations } from "next-intl/server";

type LegalDocumentViewProps = {
  locale: Locale;
  document: LegalDocument;
};

const PendingNote = ({ reason, label }: { reason: string; label: string }) => (
  <span data-pending={reason} className="mb-2 block">
    <EdgeLabel className="text-pencil">{label}</EdgeLabel>
  </span>
);

const Block = ({ block, pendingLabel }: { block: LegalBlock; pendingLabel: string }) => {
  const pending = block.pending ? <PendingNote reason={block.pending} label={pendingLabel} /> : null;

  if (block.kind === "p") {
    return (
      <div className={block.pending ? "border-pencil border-l-2 pl-4" : undefined}>
        {pending}
        <p className="text-foreground max-w-[68ch] text-[17px] leading-[1.6]">
          <RichText text={block.text} />
        </p>
      </div>
    );
  }

  if (block.kind === "list") {
    return (
      <div className={block.pending ? "border-pencil border-l-2 pl-4" : undefined}>
        {pending}
        <ul className="text-foreground max-w-[68ch] list-disc space-y-2 pl-5 text-[17px] leading-[1.6]">
          {block.items.map((item) => (
            <li key={item}>
              <RichText text={item} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={block.pending ? "border-pencil border-l-2 pl-4" : undefined}>
      {pending}
      <div className="border-border overflow-x-auto border-t-2">
        <table className="w-full min-w-[560px] border-collapse text-left text-[15px] leading-[1.5]">
          <caption className="sr-only">{block.caption}</caption>
          <thead>
            <tr className="border-border border-b">
              {block.head.map((cell) => (
                <th key={cell} scope="col" className="text-edge py-3 pr-4 align-bottom font-mono text-[11px] font-medium tracking-[0.12em] uppercase">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row[0]} className="border-border-muted border-b align-top">
                {row.map((cell, index) =>
                  index === 0 ? (
                    <th key={index} scope="row" className="text-strong py-3 pr-4 font-medium">
                      <RichText text={cell} />
                    </th>
                  ) : (
                    <td key={index} className="text-foreground py-3 pr-4">
                      <RichText text={cell} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Section = ({ section, pendingLabel }: { section: LegalSection; pendingLabel: string }) => (
  <section
    id={section.id}
    data-source={section.source}
    className="border-border-muted scroll-mt-8 border-t pt-8"
  >
    <h2 className="font-display text-strong mb-4 text-[24px] leading-[1.2] font-semibold tracking-[-0.02em]">
      {section.heading}
    </h2>
    <div className={section.pending ? "border-pencil space-y-5 border-l-2 pl-4" : "space-y-5"}>
      {section.pending ? <PendingNote reason={section.pending} label={pendingLabel} /> : null}
      {section.blocks.map((block, index) => (
        <Block key={index} block={block} pendingLabel={pendingLabel} />
      ))}
    </div>
  </section>
);

/** One legal page: title, date, contents, sections, then the site footer. */
export const LegalDocumentView = async ({ locale, document }: LegalDocumentViewProps) => {
  const t = await getTranslations("common.legal");

  return (
    <>
      <header className="bg-rebate">
        <Container className="flex items-center justify-between gap-4 py-4">
          <Link
            href="/"
            className="font-display text-strong text-[15px] leading-none font-semibold tracking-[-0.02em] no-underline"
          >
            {t("brand")}
          </Link>
          <EdgeLabel className="text-edge">{t("eyebrow")}</EdgeLabel>
        </Container>
      </header>
      <main>
        <Container className="pt-14">
          <h1 className="font-display text-strong text-[clamp(2.25rem,5vw,3.25rem)] leading-none font-semibold tracking-[-0.035em]">
            {document.title}
          </h1>
          <EdgeLabel className="text-edge mt-4 block">
            {t("updated", { date: formatLegalDate(locale, document.updated) })}
          </EdgeLabel>
          <div className="mt-8 space-y-4">
            {document.intro.map((paragraph) => (
              <p key={paragraph} className="text-muted max-w-[68ch] text-[19px] leading-[1.55]">
                <RichText text={paragraph} />
              </p>
            ))}
          </div>
          <nav aria-label={t("contents")} className="border-strong mt-10 border-t-2 pt-4">
            <EdgeLabel className="text-edge mb-3 block">{t("contents")}</EdgeLabel>
            <ol className="columns-1 gap-8 text-[15px] leading-[1.9] sm:columns-2">
              {document.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-muted hover:text-strong no-underline">
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="mt-12 space-y-12">
            {document.sections.map((section) => (
              <Section key={section.id} section={section} pendingLabel={t("pending")} />
            ))}
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
};
