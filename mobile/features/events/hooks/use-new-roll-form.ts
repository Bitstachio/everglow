import { zodResolver } from "@hookform/resolvers/zod";
import { getErrorCode, getErrorMessage } from "@/lib/api/errors";
import type { TFunction } from "i18next";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useCreateEventMutation } from "../api/mutations";
import { defaultRollDate } from "../lib/new-roll";
import type { EventResponseDto, NewEventResponseDto } from "../types";

const makeNewRollSchema = (t: TFunction<"create">) =>
  z.object({
    title: z.string().trim().min(1, t("validation.nameRequired")).max(100, t("validation.nameTooLong")),
    description: z.string().trim().max(255, t("validation.lineTooLong")),
    date: z.date(),
    /** The film the host picked from the plan's `galleryWindowOptions`; null keeps the plan's default. */
    galleryWindowDays: z.number().int().positive().nullable(),
  });

export type NewRollValues = z.infer<ReturnType<typeof makeNewRollSchema>>;

type UseNewRollFormParams = {
  /** What the API offers a new roll (`GET /users/me/limits`); undefined until it has loaded. */
  newEvent: NewEventResponseDto | undefined;
  /** Runs once the roll exists, before the form stops submitting; it must not throw. */
  onCreated: (event: EventResponseDto) => void | Promise<void>;
  /** The account is already running as many rolls as its plan allows (04.8). */
  onLimitReached?: () => void;
};

/** 04.1–04.4 The new roll's label, time and film, created on Load the roll. */
export const useNewRollForm = ({ newEvent, onCreated, onLimitReached }: UseNewRollFormParams) => {
  const { t } = useTranslation("create");
  const mutation = useCreateEventMutation();
  const submitting = useRef(false);
  const schema = useMemo(() => makeNewRollSchema(t), [t]);
  const [defaultValues] = useState<NewRollValues>(() => ({
    title: "",
    description: "",
    date: defaultRollDate(),
    galleryWindowDays: null,
  }));
  const form = useForm<NewRollValues>({ resolver: zodResolver(schema), defaultValues, mode: "onTouched" });
  // Until the host picks a film, the plan's default is the one chosen. Null on a plan that never closes.
  const film = (picked: number | null) => picked ?? newEvent?.defaultGalleryWindowDays ?? null;

  const onSubmit = () =>
    form.handleSubmit(async ({ title, description, date, galleryWindowDays: picked }) => {
      if (submitting.current) return;
      submitting.current = true;
      form.clearErrors("root");
      const galleryWindowDays = film(picked);
      try {
        const event = await mutation
          .mutateAsync({
            title,
            ...(description ? { description } : {}),
            date: date.toISOString(),
            ...(galleryWindowDays === null ? {} : { galleryWindowDays }),
          })
          .catch((error: unknown) => {
            form.setError("root.server", { message: getErrorMessage(error, t("failed")) });
            if (getErrorCode(error) === "ACTIVE_EVENT_LIMIT_REACHED") onLimitReached?.();
            return null;
          });
        if (event) await onCreated(event);
      } finally {
        submitting.current = false;
      }
    })();

  return { form, onSubmit, film };
};
