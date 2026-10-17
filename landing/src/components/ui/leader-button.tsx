import { cn } from "@/lib/cn";
import { ButtonHTMLAttributes, ReactNode } from "react";

const leaderClassName = cn(
  "bg-accent text-accent-foreground inline-flex min-h-[58px] items-center justify-center px-8",
  "font-mono text-[12.5px] font-semibold tracking-[0.12em] uppercase no-underline",
  "hover:bg-accent-hover duration-standard transition-colors",
  "disabled:pointer-events-none disabled:opacity-50",
  "focus-visible:outline-pencil focus-visible:outline-2 focus-visible:outline-offset-2",
);

type LeaderLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
};

type LeaderSubmitProps = {
  type: "submit" | "button";
  children: ReactNode;
  className?: string;
  disabled?: boolean;
} & Pick<ButtonHTMLAttributes<HTMLButtonElement>, "form">;

type LeaderButtonProps = LeaderLinkProps | LeaderSubmitProps;

/** Primary leader action: white rectangle, mono uppercase label. */
export const LeaderButton = (props: LeaderButtonProps) => {
  if ("href" in props) {
    const { href, children, className } = props;
    return (
      <a href={href} className={cn(leaderClassName, className)}>
        {children}
      </a>
    );
  }

  const { type, children, className, disabled, form } = props;
  return (
    <button type={type} form={form} disabled={disabled} className={cn(leaderClassName, className)}>
      {children}
    </button>
  );
};
