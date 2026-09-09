# Forms

This document covers building forms in the Everglow mobile app. Every form uses React Hook Form with a Zod schema; there is no second approach for "simple" forms.

**Convention hierarchy:** Forms follow [codebase conventions](./code-conventions.md) on top of the rules in this document. Form files use the feature folders from [feature code organization](./feature-code-organization.md); mutations follow [API](./api.md).

**Shared primitive:** `components/ui/form-field.tsx` (`FormField`) is the only place `Controller` should appear. Wrap it, don't repeat it.

**Reference implementation:** `features/profile/` — `hooks/use-edit-profile-form.ts`, `components/edit-profile-modal.tsx`, and `hooks/use-edit-profile-form.test.tsx`. Prefer those files over older form code.

**Migration status:** Profile edit is migrated. Other forms (including `features/events/`) are not; do not copy them.

## Stack

| Package               | Version | Role                                       |
| --------------------- | ------- | ------------------------------------------ |
| `react-hook-form`     | ^7.87.0 | Form state, validation timing, submission  |
| `zod`                 | ^4.5.4  | Schema definition and inferred value types |
| `@hookform/resolvers` | ^5.9.1  | Bridges Zod schemas into React Hook Form   |

## When to use React Hook Form

Use it when a component **collects values and submits them**: to an API, a parent callback, or navigation params. Field count is irrelevant; a one-field form with a validation message still uses React Hook Form.

Use plain `useState` only when an input **is never submitted**: a search box filtering a list, a debounced query feeding `useQuery`, a local text filter. These are inputs, not forms.

Do not decide based on how "simple" a form looks. That judgment is unstable: forms grow validation, and a half-migrated codebase costs more than either approach alone.

## Where form code lives

Forms map onto the existing feature layers. No new folders.

| Piece                         | Location                                 | Notes                                        |
| ----------------------------- | ---------------------------------------- | -------------------------------------------- |
| Zod schema + inferred type    | Same file as the form hook                    | Promote to `schemas.ts` only if shared       |
| `useForm` call and `onSubmit` | `features/<name>/hooks/use-<form>-form.ts`    | Named export `use<Form>Form`, one hook per form |
| Rendered fields               | `features/<name>/components/`                 | Presentational; receives `control` as a prop |
| Mutation                      | `features/<name>/api/mutations.ts`            | Called by the form hook, never the component |

Form value types are inferred from the Zod schema in the form hook file. Do not hand-write a parallel type, and do not put form shapes in `types.ts` unless multiple files share them.

## The pattern

### 1. Schema

Define the schema and infer the value type from it. Never hand-write a parallel `type` for form values.

```ts
const editProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Enter a valid email"),
});

type EditProfileValues = z.infer<typeof editProfileSchema>;
```

Zod 4 notes:

- Use top-level format validators: `z.email()`, `z.url()`, `z.uuid()`. The Zod 3 style `z.string().email()` is deprecated.
- Pass the error message into the Zod rule (e.g., `.min(1, "Name is required")` or `z.email("Enter a valid email")`). The UI should render `fieldState.error?.message`, not invent its own validation copy.
- Chain `.trim()` before `.min(1)` so a whitespace-only value fails.

### 2. Form hook

One hook per form, named after the form. It owns the schema, the `useForm` call, and the submit handler.

```ts
export const useEditProfileForm = ({ user, onSuccess }: UseEditProfileFormParams) => {
  const updateProfileMutation = useUpdateProfileMutation();

  const form = useForm<EditProfileValues>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: { name: user?.details?.name ?? "", email: user?.details?.email ?? "" },
    mode: "onTouched",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await updateProfileMutation.mutateAsync(values);
      form.reset(values);
      onSuccess();
    } catch (error) {
      Alert.alert("Error", getErrorMessage(error, "Failed to update profile"));
    }
  });

  return { form, onSubmit };
};
```

Rules for the hook:

- **Return `form` as one object.** Not `{ name, email, nameError, setName }`. Spreading React Hook Form's state into flat keys means re-threading every feature you later need (`isDirty`, `reset`, `setError`) by hand, with types you wrote instead of types Zod inferred.
- **Call `handleSubmit` inside the hook.** The component receives a plain `() => void` and never touches submit wiring.
- **Always pass `defaultValues`.** `isDirty` and `reset()` are meaningless without them.
- **Use `mode: "onTouched"`.** Errors appear after a field is blurred rather than on the first keystroke. `onSubmit` is acceptable for short forms; avoid `onChange`, which shows an error while the user is still typing.
- **`await mutateAsync`, don't use `mutate`.** `formState.isSubmitting` only stays true while the submit handler's promise is pending, so a fire-and-forget `mutate` leaves the button enabled mid-request.
- Error feedback (`Alert`, `getErrorMessage`) belongs here. ESLint blocks `Alert` in `features/**/screens/**`.

Screen hooks return a flat object of values and handlers. When a screen owns a form, `form` is one entry in that object. Do not flatten React Hook Form's internals into the screen hook return.

### 3. Component

The component takes `control` and renders `FormField`. It stays presentational, which is also required by ESLint: `features/**/components/**` cannot import feature `hooks/` or `api/`.

```tsx
type EditProfileModalProps = {
  visible: boolean;
  control: Control<EditProfileValues>;
  isSubmitting: boolean;
  isDirty: boolean;
  onSubmit: () => void;
  onCancel: () => void;
};

export const EditProfileModal = ({
  visible,
  control,
  isSubmitting,
  isDirty,
  onSubmit,
  onCancel,
}: EditProfileModalProps) => (
  <Modal visible={visible} animationType="slide" transparent>
    <View>
      <FormField control={control} name="name" label="Name" placeholder="Enter your name" />
      <FormField control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" />
      <Button title="Save" onPress={onSubmit} isLoading={isSubmitting} disabled={isSubmitting || !isDirty} />
      <Button title="Cancel" onPress={onCancel} variant="outline" disabled={isSubmitting} />
    </View>
  </Modal>
);
```

`FormField` is generic over the form's value type, so `name` is checked against the schema. A typo like `name="nmae"` is a compile error, not a silent no-op.

Pass `control` as a prop. Reach for `FormProvider` / `useFormContext` only when a form is deep enough that drilling genuinely hurts; context subscribers re-render more broadly than a directly passed `control`.

## Recipes

### Populating a form from server data

Use `reset` in an effect rather than keying the component or assigning `defaultValues` from data that arrives late.

```ts
const { reset } = form;

useEffect(() => {
  if (!user?.details) return;
  reset({ name: user.details.name, email: user.details.email });
}, [user, reset]);
```

### Submitting only changed fields

Use `formState.dirtyFields` instead of comparing values by hand.

```ts
const buildPatch = (values: EditProfileValues, dirtyFields: Partial<Record<keyof EditProfileValues, boolean>>) =>
  Object.fromEntries(Object.entries(values).filter(([key]) => dirtyFields[key as keyof EditProfileValues]));
```

### Field-level errors from the API

Map server validation errors onto fields with `setError` so they render in place instead of in an `Alert`.

```ts
form.setError("email", { type: "server", message: "That email is already taken" });
```

### Cross-field validation

Use `.refine()` on the object schema, and target the field that should display the message.

```ts
const schema = z.object({ startsAt: z.date(), endsAt: z.date() }).refine((values) => values.endsAt > values.startsAt, {
  message: "End time must be after the start time",
  path: ["endsAt"],
});
```

### Non-text inputs

`FormField` only covers string fields. For a date picker or similar, use `Controller` directly in the feature component and adapt the value in `render`. Keep the rest of the form on React Hook Form; one awkward field is not a reason to hand-roll the whole form.

## React Native caveat

React Hook Form's headline optimization (uncontrolled inputs registered by ref) is a DOM feature and does not apply here. In React Native every field goes through `Controller` and is controlled. You still get field-level render isolation, but do not expect the zero-re-render behavior described in web-oriented articles.

## Testing

Read `node_modules/@testing-library/react-native/docs/guides/llm-guidelines.md` before writing form tests, per [AGENTS.md](../AGENTS.md).

**Reference test:** `features/profile/hooks/useEditProfileForm.test.tsx`.

### What to assert

Test forms through the rendered UI:

- Type into fields with `userEvent`, press submit, assert the mutation was called with the expected payload.
- Assert validation messages by their visible text after triggering the invalid state, not by inspecting `formState`.
- Cover at least one valid submission and one validation failure. Add cases for patch/dirty behavior, hydration, and mutation errors when the form has that logic.
- Test a Zod schema directly only when it has non-obvious `.refine()` logic worth isolating.
- Mock the feature mutation (`mutateAsync`), not the generated SDK.

Do not assert on React Hook Form internals. Test what the user sees and what the server receives.

### Why the test file is `.tsx`

Form tests mount JSX: a small probe (or the real form component) with `FormField` / `Button`. That requires TSX. A `.ts` file cannot contain the harness, and `renderHook` alone is a poor fit here (see below).

Name the file next to the form hook: `use-<form>-form.test.tsx` (export remains `use<Form>Form`).

### Why a probe component (not bare `renderHook`)

RHF form behavior is driven by field events (change, blur, submit). Asserting `result.current.form.formState` after manually calling `onSubmit` skips that path and couples tests to library internals.

Put a thin **probe** in the test file that:

1. Calls the form hook with controllable props (`user`, `onSuccess`, …).
2. Renders `FormField` for each string field and a Save `Button` wired to `onSubmit`.
3. Omits modal chrome, theming, and screen orchestration so failures stay about the form.

That is a shallow integration test of hook + fields + submit wiring, which is what you want for RHF. Prefer the probe over mounting the full feature modal when the modal adds noise (visibility, keyboard avoiding, cancel layout) unrelated to schema/submit.

`renderHook` remains appropriate for non-form hooks, or for pure helpers extracted from a form hook (for example, a patch builder with no UI). Do not use it as the primary way to test `use<Form>Form`.

### Probe sketch

```tsx
const EditProfileFormProbe = ({ user, onSuccess }: Props) => {
  const { form, onSubmit } = useEditProfileForm({ user, onSuccess });

  return (
    <View>
      <FormField control={form.control} name="name" label="Name" placeholder="Enter your name" />
      <FormField control={form.control} name="email" label="Email" placeholder="Enter your email" />
      <Button
        title="Save"
        onPress={onSubmit}
        isLoading={form.formState.isSubmitting}
        disabled={form.formState.isSubmitting || !form.formState.isDirty}
      />
    </View>
  );
};
```

Mock `useUpdateProfileMutation` at the feature `api/` boundary, then drive the probe with `userEvent`.

## Anti-patterns

| Don't                                                     | Why                                                                                                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A generic `useAppForm()` wrapping `useForm`               | Every form needs an option you didn't forward; it degrades into a pass-through with worse types. React Hook Form has no `createFormHook` equivalent; that's TanStack Form. |
| Returning `{ name, setName, nameError }` from a form hook | Re-implements the library one property at a time and loses render isolation                                                                                                |
| A hand-written `type` for form values                     | Duplicates the schema; renames stop being compile errors                                                                                                                   |
| `useState` for a form because it "only has one field"     | Field count doesn't predict complexity; every such form is a future migration                                                                                              |
| `Controller` inline in feature components                 | Use `FormField`; keep the React Hook Form seam in one place                                                                                                                |
| `z.string().email()`                                      | Deprecated in Zod 4; use `z.email()`                                                                                                                                       |
| Validation messages built in the component                | Copy belongs in the schema, next to the rule                                                                                                                               |
| Primary form tests via `renderHook` only                  | Misses field events; assert visible errors and mutation payloads through a `.tsx` probe instead                                                                            |

## Enforcement

There are no forms-specific ESLint rules. Existing layer rules already constrain the pattern:

| Existing rule                              | Effect on forms                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `features/**/components/**` import bans    | Form components can't reach `api/` or feature `hooks/`; they must take `control` as a prop |
| `features/**/hooks/**` named exports       | Form hooks are named exports                                                               |
| `Alert` banned in `features/**/screens/**` | Submit-error feedback lives in the form hook                                               |
| `func-style: expression`                   | `FormField` and form hooks are arrow `const` bindings                                      |

Everything else here is review-only. Use the [code review checklist](./code-review-checklist.md) alongside this document.

## Adding a new form

1. Define the Zod schema and `z.infer` the value type in the form hook file.
2. Create `features/<name>/hooks/use<Form>Form.ts` with `useForm`, `zodResolver`, `defaultValues`, and `mode: "onTouched"`.
3. Wrap the mutation in `handleSubmit` inside the hook; handle errors with `getErrorMessage`.
4. Return `{ form, onSubmit }`.
5. Build the component to accept `control` plus `isSubmitting`, `isDirty`, and callbacks.
6. Render each string field with `FormField`; use `Controller` directly only for non-text inputs.
7. Add `use-<form>-form.test.tsx` with a probe: one valid submission and one validation failure (see [Testing](#testing)).
8. Run `npm run lint` and `npx tsc --noEmit`.

## Review checklist

- [ ] Schema is the only definition of the form's shape; the type is inferred
- [ ] Validation messages live in the schema
- [ ] Hook returns `form` whole, not destructured field state
- [ ] `defaultValues` provided for every field
- [ ] Submit uses `mutateAsync` and awaits it
- [ ] Submit button disabled while `isSubmitting`
- [ ] Component receives `control` and imports no feature `hooks/` or `api/`
- [ ] String fields use `FormField` rather than an inline `Controller`
- [ ] Form tests are `.tsx`, drive a probe (or the real form) with `userEvent`, and mock the feature mutation
