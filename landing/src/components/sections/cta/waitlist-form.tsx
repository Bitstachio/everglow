"use client";

import { LeaderButton } from "@/components/ui/leader-button";
import { cn } from "@/lib/cn";
import { useId } from "react";
import { useWaitlistForm, WaitlistFormCopy } from "./use-waitlist-form";

type WaitlistFormProps = {
  emailLabel: string;
  emailPlaceholder: string;
  button: string;
  submitting: string;
  consent: string;
  copy: WaitlistFormCopy;
};

/** Email-only waitlist signup. Posts to `NEXT_PUBLIC_WAITLIST_URL`. */
export const WaitlistForm = ({
  emailLabel,
  emailPlaceholder,
  button,
  submitting,
  consent,
  copy,
}: WaitlistFormProps) => {
  const inputId = useId();
  const statusId = useId();
  const { email, setEmail, status, message, onSubmit, isSubmitting, isSuccess } = useWaitlistForm({
    copy,
  });

  return (
    <form onSubmit={onSubmit} className="mt-8 flex max-w-xl flex-col gap-4" noValidate>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <label htmlFor={inputId} className="sr-only">
          {emailLabel}
        </label>
        <input
          id={inputId}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          disabled={isSubmitting}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={emailPlaceholder}
          aria-invalid={status === "error"}
          aria-describedby={message ? statusId : undefined}
          className={cn(
            "border-border bg-surface text-strong placeholder:text-edge min-h-[58px] flex-1 border px-4",
            "font-sans text-base leading-none outline-none",
            "focus-visible:border-strong focus-visible:outline-pencil focus-visible:outline-2 focus-visible:outline-offset-2",
            "disabled:opacity-50",
          )}
        />
        <LeaderButton type="submit" disabled={isSubmitting} className="sm:shrink-0">
          {isSubmitting ? submitting : button}
        </LeaderButton>
      </div>
      <p className="text-edge text-sm leading-snug">{consent}</p>
      {message ? (
        <p
          id={statusId}
          role="status"
          aria-live="polite"
          className={cn("text-sm leading-snug", isSuccess ? "text-success" : "text-pencil")}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
};
