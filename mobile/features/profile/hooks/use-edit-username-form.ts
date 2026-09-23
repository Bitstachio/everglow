import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

const editUsernameSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be 30 characters or fewer")
    .regex(/^[a-z0-9._]+$/, "Use lowercase letters, numbers, periods, or underscores"),
});

export type EditUsernameValues = z.infer<typeof editUsernameSchema>;

type UseEditUsernameFormParams = {
  initialUsername: string;
  onSuccess: (username: string) => void;
};

export const useEditUsernameForm = ({ initialUsername, onSuccess }: UseEditUsernameFormParams) => {
  const form = useForm<EditUsernameValues>({
    resolver: zodResolver(editUsernameSchema),
    defaultValues: { username: initialUsername },
    mode: "onTouched",
  });

  const onSubmit = form.handleSubmit(({ username }) => {
    const normalizedUsername = username.trim();
    form.reset({ username: normalizedUsername });
    onSuccess(normalizedUsername);
  });

  return { form, onSubmit };
};
