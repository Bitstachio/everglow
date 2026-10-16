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
  note: string;
  copy: WaitlistFormCopy;
};

/** Email-only waitlist signup. Posts to `NEXT_PUBLIC_WAITLIST_URL`. */
export const WaitlistForm = ({ emailLabel, emailPlaceholder, button, submitting, note, copy }: WaitlistFormProps) => {
  const inputId = useId();
  const statusId = useId();
  const { email, setEmail, status, message, onSubmit, isSubmitting, isSuccess } = useWaitlistForm({
    copy,
  });

  return (
    <form onSubmit={onSubmit} className="mt-5 max-w-[36rem] sm:mt-6" noValidate>
      <div className="flex items-stretch gap-2.5 sm:gap-3">
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
            "border-border bg-surface text-strong placeholder:text-edge min-h-12 min-w-0 flex-1 border px-3 sm:min-h-[58px] sm:px-4",
            "font-sans text-base leading-none outline-none",
            "focus-visible:border-strong focus-visible:outline-pencil focus-visible:outline-2 focus-visible:outline-offset-2",
            "disabled:opacity-50",
          )}
        />
        <LeaderButton
          type="submit"
          disabled={isSubmitting}
          className="min-h-12 shrink-0 px-3 tracking-[0.08em] whitespace-nowrap sm:min-h-[58px] sm:px-6 sm:tracking-[0.12em]"
        >
          {isSubmitting ? submitting : button}
        </LeaderButton>
      </div>
      {message ? (
        <p
          id={statusId}
          role="status"
          aria-live="polite"
          className={cn("mt-3 text-sm leading-snug", isSuccess ? "text-success" : "text-pencil")}
        >
          {message}
        </p>
      ) : null}
      <p className="font-hand text-pencil mt-3 text-[1.45rem] leading-none sm:mt-3.5 sm:text-[1.7rem]">{note}</p>
    </form>
  );
};
