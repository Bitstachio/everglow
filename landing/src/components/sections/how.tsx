import { PhoneFrame } from "@/components/ui/phone-frame";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import { getTranslations } from "next-intl/server";

type HowRowProps = {
  title: string;
  body: string;
  phone: string;
  reverse?: boolean;
  lead?: boolean;
};

const HowRow = ({ title, body, phone, reverse = false, lead = false }: HowRowProps) => {
  const Heading = lead ? "h2" : "h3";

  return (
    <div
      className={cn(
        "grid items-center gap-10 md:grid-cols-2 md:gap-16",
        reverse && "md:[&>div:first-child]:order-2",
      )}
    >
      <div className="max-w-md">
        <Heading
          className={cn(
            "text-strong font-semibold tracking-tight",
            lead ? "text-3xl sm:text-4xl" : "text-2xl sm:text-[1.7rem]",
          )}
        >
          {title}
        </Heading>
        <p className={cn("text-muted mt-4 leading-relaxed", lead ? "text-lg sm:text-xl" : "text-lg")}>{body}</p>
      </div>
      <PhoneFrame caption={phone} />
    </div>
  );
};

const HowCopy = ({ title, body }: { title: string; body: string }) => (
  <div className="max-w-xl">
    <h3 className="text-strong text-2xl font-semibold tracking-tight sm:text-[1.7rem]">{title}</h3>
    <p className="text-muted mt-4 text-lg leading-relaxed">{body}</p>
  </div>
);

export const How = async () => {
  const t = await getTranslations("how");

  return (
    <section id="how" className="scroll-mt-28 border-t border-border bg-surface">
      <Container className="flex flex-col gap-24 py-24 sm:gap-28 sm:py-32">
        <HowRow
          title={t("discovery.title")}
          body={t("discovery.body")}
          phone={t("discovery.phone")}
          lead
        />
        <HowRow title={t("gallery.title")} body={t("gallery.body")} phone={t("gallery.phone")} reverse />
        <HowCopy title={t("storage.title")} body={t("storage.body")} />
      </Container>
    </section>
  );
};
