import { z } from "zod";

const emailSchema = z.string().trim().email("Enter a valid email address");

export type ForgotPasswordValidation =
  | { ok: true; email: string }
  | { ok: false; error: string };

/** Pure email validation for the signed-out forgot-password form. */
export const validateForgotPasswordEmail = (email: string): ForgotPasswordValidation => {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email address" };
  }
  return { ok: true, email: parsed.data };
};
