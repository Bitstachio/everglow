"use client";

import { isValidEmail, submitWaitlistEmail, WaitlistSubmitResult } from "@/lib/waitlist";
import { FormEvent, useState } from "react";

export type WaitlistFormCopy = {
  invalidEmail: string;
  notConfigured: string;
  error: string;
  success: string;
};

type WaitlistStatus = "idle" | "submitting" | "success" | "error";

type UseWaitlistFormArgs = {
  copy: WaitlistFormCopy;
};

export const useWaitlistForm = ({ copy }: UseWaitlistFormArgs) => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<WaitlistStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const messageReason = (result: Extract<WaitlistSubmitResult, { ok: false }>) => {
    switch (result.reason) {
      case "invalid_email":
        return copy.invalidEmail;
      case "not_configured":
        return copy.notConfigured;
      case "network":
      case "upstream":
        return copy.error;
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (status === "submitting") return;

    if (!isValidEmail(email)) {
      setStatus("error");
      setMessage(copy.invalidEmail);
      return;
    }

    setStatus("submitting");
    setMessage(null);

    const result = await submitWaitlistEmail(email);
    if (result.ok) {
      setStatus("success");
      setMessage(copy.success);
      setEmail("");
      return;
    }

    setStatus("error");
    setMessage(messageReason(result));
  };

  return {
    email,
    setEmail,
    status,
    message,
    onSubmit,
    isSubmitting: status === "submitting",
    isSuccess: status === "success",
  };
};
