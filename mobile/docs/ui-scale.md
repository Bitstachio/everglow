# UI scale

This is the spatial and typographic system for the Everglow mobile app. Color lives in [Theme](./theme.md). Size, space, type, radius, and touch targets live here.

Use this document when adding or restyling screens, shared UI, and feature components. Coding agents should follow the recipes and the allowed-class lists, not invent nearby values.

The app is portrait-only on iOS and Android. Layouts do not adapt to landscape.

**Migration:** existing screens mix Tailwind classes, leftover StyleSheet numbers, and one-off padding. New work follows this scale. When you touch a screen, move that surface onto these values. Do not rewrite the whole app in passing.

## Design intent

Slick, dense, content-first. Think Instagram and WhatsApp, not a marketing landing page and not a desktop settings panel.

- Inter for all UI text (see [Typeface](#typeface)). Until Inter is loaded via `expo-font`, the system UI sans is the stand-in; sizes and weights below still apply.
- Same tokens on iOS and Android. Native chrome (stack headers, tab bars, date pickers, keyboards) stays platform-native.
- Tight grouping, open sectioning: related items sit 8-12px apart; separate sections sit 24px apart.
- 16px page gutters. Full-width primary buttons. Soft rounding (16px on controls), not pills on every block and not sharp 4px rectangles.
- Page-level submit, save, and completion actions sit in a **pinned footer** (thumb zone), not under the last field. That matches Instagram/WhatsApp create flows and the product's form screens. Sheets keep actions in-flow at the bottom of the sheet.

## Non-negotiables

1. Style with NativeWind `className` and tokens from `app/global.css`. No new `StyleSheet` (see [Theme](./theme.md#no-stylesheet)).
2. Use the **allowed steps** below. Do not use arbitrary values (`p-[13px]`, `text-[15px]`, `h-[47px]`) and do not use off-scale steps (`p-7`, `gap-9`, `text-4xl`).
3. Prefer `gap-*` on a parent over `margin-*` on each child.
4. Spell class names in full. Do not interpolate (`text-${size}` will not generate a utility).
5. Put spacing in shared primitives (`Button`, `Input`, `FormField`, `BottomSheet`, `H1`/`H2`/`H3`) whenever the pattern is repeating. Feature JSX should mostly choose screen gutter, section gap, and composition.
6. Respect safe areas with `SafeAreaView` or `useSafeAreaInsets`. Do not fake a status bar or home indicator with guessed `pt-*` / `pb-*`.
7. Leave `allowFontScaling` on (React Native default). Layouts must wrap, not clip, when the user enlarges text.
8. Minimum tap target is 44pt. Primary controls are 48pt tall (`h-12`).
9. On full screens, put the primary action in a pinned bottom footer. Do not leave Save/Create/Done sitting mid-canvas under the last field.

## 4-point grid

All space, padding, and control sizes snap to **4px**. 8px is the default rhythm (two grid units).

| Token | px | NativeWind | Role |
| ----- | -- | ---------- | ---- |
| 0     | 0  | `0`        | Reset |
| 1     | 4  | `1`        | Hairline stack: input to error, icon optical inset |
| 2     | 8  | `2`        | Label to input, icon to label, chip gap |
| 3     | 12 | `3`        | Inside a compact card, filter row padding, stacked buttons |
| 4     | 16 | `4`        | **Default.** Screen gutter, field-to-field, card padding |
| 5     | 20 | `5`        | Slightly roomy card or sheet inset (use sparingly) |
| 6     | 24 | `6`        | Section gap, sheet block gap, title to first field |
| 8     | 32 | `8`        | Major break, empty-state padding |
| 10    | 40 | `10`       | Rare: hero offset on auth / onboarding |
| 12    | 48 | `12`       | Control height (`h-12`), large empty-state gap |
| 16    | 64 | `16`       | Rare: illustration to copy on empty states |

Do not use `0.5` (2px) except to optically center a 1px border or an icon that otherwise looks off. Do not use 7, 9, 11, 13, 14 for padding, margin, or gap. `h-11` (44) is allowed as the minimum tap-target height.

Until semantic spacing names are registered in `app/global.css`, write the numeric classes (`px-4`, `gap-6`). The [token registration](#token-registration-follow-up) section is the follow-up mapping.

## Spacing recipes

These are the values to reach for. If a recipe does not match, pick the nearest smaller allowed step, not a custom number.

### Screen

```
Safe area (system)
  px-4          16  horizontal gutter
  pt-4          16  below a native stack header
  pt-6          24  when the screen has no header (in-content H1)
  gap-6         24  between page sections
```

Bottom inset depends on chrome:

| Screen kind | Bottom treatment |
| ----------- | ---------------- |
| Read-only list, no page CTA | `pb-4` plus home-indicator / tab-bar inset |
| Form or completion with a page CTA | Pinned footer owns the inset ([Pinned bottom actions](#pinned-bottom-actions)) |

- Content is full width of the phone. Do not add `max-w-*` on portrait screens.
- Native stack headers already inset the title. Do not wrap the screen in a second header-sized spacer.
- Scroll views that contain forms use `keyboardShouldPersistTaps="handled"`. Wrap the **column** (scroll view + footer) in `KeyboardAvoidingView` (`padding` on iOS, `height` on Android) so the footer rides above the keyboard.

### Form

Canonical labeled field (Material-style stack, WhatsApp/Instagram density):

```
[ Label ]                 text-sm font-medium, tone foreground
      8px  gap-2
[ Input, 48 tall ]        h-12, text-base, rounded-2xl, px-4
      4px  gap-1
[ Error / helper ]        text-xs, tone danger or muted
```

Between siblings:

| Relationship              | Space | Class    |
| ------------------------- | ----- | -------- |
| Label to control          | 8     | `gap-2`  |
| Control to error/helper   | 4     | `gap-1`  |
| Field to field            | 16    | `gap-4`  |
| Section title to fields   | 12    | `gap-3`  |
| Form section to section   | 24    | `gap-6`  |
| Last field to in-flow CTA | 24    | `gap-6` (sheets only) |
| Primary to secondary CTA  | 12    | `gap-3`  |

`Input` owns label, control, and error spacing. Feature forms should wrap fields in `gap-4`, not add extra `mb-*` on each `FormField`.

On **full screens**, do not put `gap-6` before the button in the scroll view. Pin the actions ([Pinned bottom actions](#pinned-bottom-actions)). Helper copy stays with its field (`gap-2` under the input). Empty space between the field block and the footer is flex leftover, not a magic spacer.

On **sheets**, keep the action row in the sheet body with `gap-6` after the last field. A sheet is already a bottom surface; a second pinned footer inside it is redundant.

Placeholder copy uses `text-subtle` (already wired via `placeholderTextColor` on `Input`). Do not restyle placeholders per screen.

### Lists and rows

WhatsApp-style rows, Instagram-style feed cards: dense vertically, 16px from the screen edge.

| Element                    | Value        | Class                          |
| -------------------------- | ------------ | ------------------------------ |
| Row horizontal inset       | 16           | `px-4`                         |
| Row vertical padding       | 12           | `py-3`                         |
| Min row height (text only) | 48           | `min-h-12`                     |
| Min row height (with avatar) | 56         | `min-h-14`                     |
| Avatar to text             | 12           | `gap-3`                        |
| Title to subtitle          | 4            | `gap-1`                        |
| Row to row                 | 0 + divider, or 12 | `border-b border-border` or `gap-3` |
| Card list gap              | 12           | `gap-3`                        |

Prefer a 1px `border-border` divider *or* a gap, not both.

### Cards

| Element        | Value | Class         |
| -------------- | ----- | ------------- |
| Padding        | 16    | `p-4`         |
| Internal stack | 12    | `gap-3`       |
| Corner         | 16    | `rounded-2xl` |
| Stroke         | 1     | `border border-border` |

Do not add a drop shadow by default. Instagram and WhatsApp separate surfaces with stroke and background (`bg-background` vs `bg-surface`), not elevation. If a floating control truly needs a shadow, add a shared token later; do not inline `shadow-*` ad hoc.

### Sheets and modal panels

| Element              | Value | Class                          |
| -------------------- | ----- | ------------------------------ |
| Horizontal inset     | 16    | `px-4`                         |
| Top (handle)         | 12    | `pt-3`                         |
| Bottom               | 24 + safe area | `pb-6` plus inset     |
| Handle               | 4 x 40 | `h-1 w-10 rounded-full`      |
| Handle to title      | 16    | `gap-4`                        |
| Title to body        | 16    | `gap-4`                        |
| Body blocks          | 24    | `gap-6`                        |
| Top corners          | 24    | `rounded-t-3xl`                |
| Grab-handle contrast | border token | `bg-border`               |

Center dialogs (edit profile, confirms) use `p-6` (24) inside a `rounded-2xl` panel, with 16px of overlay margin (`p-4` on the overlay). Keep the panel full width minus that overlay margin; do not cap at a tablet `max-w`. Dialogs are short; keep their actions in-flow at the bottom of the panel, not as a screen-level pinned footer.

### Pinned bottom actions

Default for Save, Create, Join, Share, Done, and other **page-level** submits. Content stays top-aligned; the footer stays on the bottom edge. Do not insert a flex spacer `View` with a hardcoded height to push the button down.

```
┌─────────────────────────┐
│  Native header          │
│  px-4 pt-4              │
│  Fields / hero          │  ← ScrollView flex-1, content at top
│                         │
│                         │  ← leftover space (not a spacer component)
├─────────────────────────┤  ← optional border-t only if content scrolls under
│  px-4 pt-3              │
│  [ Primary, h-12 ]      │
│  gap-3                  │
│  [ Secondary, h-12 ]    │
│  pb-4 + bottom inset    │
└─────────────────────────┘
```

| Element | Value | Class |
| ------- | ----- | ----- |
| Footer horizontal inset | 16 | `px-4` |
| Footer top padding | 12 | `pt-3` |
| Footer bottom padding | 16 + safe area | `pb-4` plus bottom inset (home indicator). Do not guess `pb-8` / `pb-10` |
| Button height / radius | 48 / 16 | `h-12 rounded-2xl`, full width |
| Stacked footer buttons | 12 | `gap-3` |
| Scroll content above footer | 24 | `pb-6` on the scroll content (breathing room, not a fake footer) |

Layout structure: a `flex-1` column. The scroll view is `flex-1`. The footer is a sibling **below** the scroll view, not `absolute`/`fixed` over the content. That way fields never hide under the button and you do not have to compute footer height.

**When the footer gets a top border.** Short forms (edit username, create event) have a large empty region; no divider, no shadow. If the body can scroll far enough that fields would meet the footer, add `border-t border-border` on the footer so the pin is obvious. Still no drop shadow.

**Button order in a stack.** Reading order from the content down: primary first, then secondary, then dismiss (Share, Create Another, Done). Header Back is the cancel for edit/create screens; do not add a footer Cancel unless there is no stack header.

**Tab bars.** Do not pin a page footer on top of a tab bar. Tab-root screens either have no page-level CTA or place the action in the header / a row. Stack screens pushed from a tab (create event, edit profile) pin as usual; the tab bar is hidden behind the stack.

**Keyboard.** The avoiding view wraps scroll + footer together so Save stays visible while typing.

**Completion / success screens.** Hero (icon, title, share link, QR) sits in the scroll region, top or optically upper-middle with `pt-8` above a large icon. Actions still pin. Do not vertically center the hero *and* the buttons as one group.

### Toolbar chips and compact controls

Filter chips, sort buttons, inline pills:

| Element    | Value | Class                                      |
| ---------- | ----- | ------------------------------------------ |
| Height     | 36-44 | `h-9` to `h-11` (pad with `hitSlop` to 44) |
| Padding    | 12-16 | `px-3` or `px-4` (set height; skip extra `py-*`) |
| Corner     | 12    | `rounded-xl`                               |
| Chip gap   | 8     | `gap-2`                                    |
| Icon gap   | 8     | `gap-2`                                    |
| Label      | 14    | `text-sm font-medium`                      |

### Empty states

Center the illustration and copy in the remaining viewport **above** the footer. `gap-3` between illustration, title, and body. If the empty state has a page-level CTA, pin it; do not `gap-6` the button under the copy so it floats in the middle. Title is `H3` or `text-lg font-semibold`; body is `text-sm` / `text-muted`.

## Typeface

**Inter**, with system UI sans as fallback.

Load four weights only: 400 Regular, 500 Medium, 600 Semibold, 700 Bold. Do not load Thin, ExtraLight, ExtraBold, or Black. Do not italicize UI copy.

Inter is a screen font: large x-height, clear at 14-16px. That is why body stays at 16 and captions never drop below 12 (Apple's floor is 11; 12 is the readable default for Inter captions).

When Inter is wired, register it as `--font-sans` in `app/global.css` and apply `font-sans` at the root. Do not set `fontFamily` on individual screens.

## Type scale

Sizes are in density-independent pixels. Line heights are explicit px, not unitless CSS, so NativeWind and React Native agree.

| Role        | Size | Line | Weight    | Class                         | Use |
| ----------- | ---- | ---- | --------- | ----------------------------- | --- |
| Caption     | 12   | 16   | 400 / 500 | `text-xs`                     | Timestamps, helper, error, badges |
| Label / meta| 14   | 20   | 500       | `text-sm font-medium`         | Field labels, chip labels, list meta |
| Body        | 16   | 24   | 400       | `text-base`                   | Default reading text, input value, empty-state body |
| Body emphasis | 16 | 24   | 600       | `text-base font-semibold`     | Button labels, list titles |
| Subtitle (H3) | 18 | 24   | 600       | `text-lg font-semibold`     | Subsection titles, empty-state titles |
| Title (H2)  | 20   | 28   | 700       | `text-xl font-bold`           | Sheet titles, in-screen section headers |
| Page title (H1) | 24 | 32 | 700     | `text-2xl font-bold`          | In-content screen titles (no native header) |
| Display     | 30   | 36   | 700       | `text-3xl font-bold`          | Auth / onboarding hero only |

Do not use `text-4xl` or larger. Do not use `text-[11px]` or `text-[13px]`. If 14 feels large for a timestamp, use `text-xs` (12), not a custom 13.

Letter spacing stays default for 12-18px. `tracking-tight` is allowed only on `text-2xl` / `text-3xl`.

### Which component to use

| Need                         | Component / class |
| ---------------------------- | ----------------- |
| Page title in the body       | `H1`              |
| Sheet or section title       | `H2`              |
| Subsection                   | `H3`              |
| Native stack header title    | Leave to Expo Router / React Navigation (about 17pt, platform chrome). Do not put `H1` in the header. |
| Body copy                    | `ThemedText` (default `tone="foreground"`, `text-base`) |
| Secondary / supporting       | `ThemedText tone="muted"` plus `text-sm` |
| Placeholder, timestamp       | `tone="subtle"` plus `text-xs` or `text-sm` |
| Destructive                  | `tone="danger"`   |
| Button label                 | Owned by `Button` (`text-base font-semibold`) |
| Field label / error          | Owned by `Input`  |

Headings use `tone="strong"`. Body uses `foreground`. Do not pick a type size to fake hierarchy when a heading component exists.

### Weight rules

| Weight | Token           | Use |
| ------ | --------------- | --- |
| 400    | `font-normal`   | Body, captions |
| 500    | `font-medium`   | Labels, chips, secondary actions as text |
| 600    | `font-semibold` | Buttons, H3, list titles |
| 700    | `font-bold`     | H1, H2, display |

Two nearby sizes should not share the same weight and color. If an H3 and a body line sit together, the H3 is semibold/strong and the body is regular/foreground.

## Radius

Keep Tailwind's default radius scale. Only these steps are in bounds:

| Token | px | Class         | Use |
| ----- | -- | ------------- | --- |
| sm    | 4  | `rounded-sm`  | Avoid in UI chrome |
| lg    | 8  | `rounded-lg`  | Small chips, nested controls |
| xl    | 12 | `rounded-xl`  | Filter chips, compact tiles |
| 2xl   | 16 | `rounded-2xl` | **Default.** Inputs, buttons, cards |
| 3xl   | 24 | `rounded-3xl` | Sheet top corners, large media tiles |
| full  | 9999 | `rounded-full` | Avatars, icon buttons, pills, sheet handle |

Inputs and primary buttons are `rounded-2xl` and 48px tall. That pairing is the product look. Do not mix `rounded-md` (6px) or `rounded-none` on controls. Images that bleed to a card edge may use the card's radius; full-bleed photos in a feed can be square (`rounded-none`) like Instagram posts.

## Control sizes and tap targets

Apple asks for 44pt minimum. Material asks for 48dp. Cross-platform default: **48px for primary controls, 44px absolute minimum.**

| Control            | Size | Class | Notes |
| ------------------ | ---- | ----- | ----- |
| Primary / secondary button | 48 | `h-12` | Full width (`w-full`) on screens and sheets |
| Text input         | 48   | `h-12` | Horizontal padding `px-4` |
| Icon button (visual) | 36 | `h-9 w-9` | Add `hitSlop={8}` so the hit box is 52 |
| Close / sheet icon | 36   | `h-9 w-9` | Same hitSlop |
| Compact chip       | 36-44 | `h-9` / `h-11` | hitSlop if below 44 |
| List row           | 48-56 | `min-h-12` / `min-h-14` | Tappable row, not only the trailing icon |
| Avatar sm / md / lg | 32 / 40 / 48 | `h-8 w-8` / `h-10 w-10` / `h-12 w-12` | Always `rounded-full` |
| Tab bar / stack header | system |  | Do not restyle to this scale |

Disabled controls keep layout size and use `opacity-50`. Do not shrink a disabled button.

Inline `Pressable` text (not a `Button`) still needs a 44pt hit box: wrap to `min-h-11` or set `hitSlop`.

## Icons

Icon pixel sizes stay in `constants/icons.ts` (`xs` 16, `sm` 20, `md` 24, `lg` 32, `xl` 48). See [Icons](./icons.md).

Pairing:

| Next to            | Icon token | Gap    |
| ------------------ | ---------- | ------ |
| `text-xs` / `text-sm` | `xs` or `sm` (16/20) | `gap-2` (8) |
| `text-base` button / row | `sm` or `md` (20/24) | `gap-2` (8) |
| Empty state        | `lg` (32) or `xl` (48) | `gap-3` (12) |

Tint with color tokens (`text-foreground`, `color="currentColor"`, or `colorTokens[scheme].muted`). Do not hardcode hex.

## Color pairing (quick)

Use [Theme](./theme.md) tokens. Typical mapping:

| Text role     | Tone        |
| ------------- | ----------- |
| Headings      | `strong`    |
| Body          | `foreground`|
| Labels        | `foreground`|
| Helper, meta  | `muted`     |
| Placeholder, time | `subtle` |
| Error         | `danger`    |
| On primary button | `accent-foreground` |

Do not introduce a new gray. If contrast fails, change the role (muted vs foreground), not the hex.

## Portrait and platform

- Design against a 390pt-wide phone (iPhone 14/15/16 class). Spot-check 320 (SE) and 430 (Pro Max). Nothing important may clip at 320 with default font size.
- No two-column page layouts, no landscape breakpoints, no `landscape:` classes.
- Safe areas differ (notch, Dynamic Island, Android gesture bar, three-button nav). Insets come from the system, never from a platform `if` that hardcodes 44 or 24.
- Hairlines are `border` (1px). Do not bring back `StyleSheet.hairlineWidth`.
- Keyboards, pickers, action sheets, and alerts stay native.

## Allowed classes (agents)

Copy from this list unless a primitive already wraps the choice.

**Type:** `text-xs` `text-sm` `text-base` `text-lg` `text-xl` `text-2xl` `text-3xl` (hero only) · `font-normal` `font-medium` `font-semibold` `font-bold`

**Space (padding, margin, gap):** `0` `1` `2` `3` `4` `5` `6` `8` `10` `12` `16` with `p` / `px` / `py` / `pt` / `pr` / `pb` / `pl` / `m` / `mx` / `my` / `mt` / `mb` / `gap` / `gap-x` / `gap-y`

**Radius:** `rounded-lg` `rounded-xl` `rounded-2xl` `rounded-3xl` `rounded-full` plus `rounded-t-3xl` on sheets

**Height:** `h-1` (handle) `h-8` `h-9` `h-10` `h-11` `h-12` `h-14` `min-h-12` `min-h-14`

**Width helpers:** `w-full` `w-8` `w-9` `w-10` `w-12` · `flex-1` for shared rows

**Default screen shell:** `flex-1 bg-background` with `px-4` on the body and on the footer separately

**Default form screen:** scroll `flex-1` + pinned footer sibling (see [Pinned bottom actions](#pinned-bottom-actions))

## Anti-patterns

| Don't | Do instead |
| ----- | ---------- |
| `p-5` on every screen because it "looks airy" | `px-4` gutter; add air with `gap-6` between sections |
| Save/Create in the scroll view under the last field | Pinned footer sibling; leftover space is flex, not `mt-auto` on a lone button inside the scroll view |
| `absolute bottom-0` footer over scrolling fields | Column: `ScrollView` `flex-1`, then footer |
| Footer `pb-10` to clear the home indicator | `pb-4` plus the system bottom inset |
| Footer Cancel plus header Back | Header Back only |
| `gap-2` between form fields (too tight) | `gap-4` between fields; `gap-2` only for label to input |
| Extra `mb-2` on a label that `Input` already spaces | Let `Input` / `FormField` own internal rhythm |
| `text-3xl` for an in-app screen title | `H1` (`text-2xl`) |
| `font-bold` on body copy | `font-normal` body, weight on headings and buttons |
| `h-10` primary button | `h-12` |
| `rounded-md` or `rounded-lg` on inputs | `rounded-2xl` |
| `shadow-lg` on cards | `border border-border` and surface tokens |
| `pt-12` to clear the status bar | Safe area inset |
| `className={`p-${n}`}` | Literal `p-4` |
| Arbitrary `top-[18px]` to align an icon | Allowed gap + `items-center`; `hitSlop` if the tap target is short |
| Different padding on iOS vs Android for the same screen | One token; safe area handles the rest |

## Worked examples

Screen with a native header, a filter row, and a list:

```tsx
<View className="flex-1 bg-background">
  <View className="px-4 pt-4 gap-6">
    <View className="flex-row flex-wrap items-center gap-2">{/* chips */}</View>
    <View className="gap-3">{/* cards */}</View>
  </View>
</View>
```

Form screen with pinned Save (keyboard-avoiding column):

```tsx
<KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === "ios" ? "padding" : "height"}>
  <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
    <View className="px-4 pt-4 pb-6">
      <View className="gap-2">
        <FormField control={control} name="username" label="Username" />
        <ThemedText tone="muted" className="text-sm">
          You can edit your username up to 5 times in 30 minutes.
        </ThemedText>
      </View>
    </View>
  </ScrollView>
  <View className="px-4 pt-3 pb-4">
    <Button title="Save" onPress={onSubmit} isLoading={isSubmitting} />
  </View>
</KeyboardAvoidingView>
```

Add the bottom safe-area inset to that footer `pb-4` (padding, not a guessed class). Form in a sheet stays in-flow:

```tsx
<View className="gap-6">
  <View className="gap-4">
    <FormField control={control} name="name" label="Name" />
    <FormField control={control} name="email" label="Email" />
  </View>
  <View className="gap-3">
    <Button title="Save" onPress={onSubmit} isLoading={isSubmitting} />
    <Button title="Cancel" onPress={onCancel} variant="outline" />
  </View>
</View>
```

Card:

```tsx
<View className="gap-3 rounded-2xl border border-border bg-background p-4">
  <H3>Event name</H3>
  <ThemedText tone="muted" className="text-sm">Saturday, 7:00 PM</ThemedText>
</View>
```

## Token registration (follow-up)

Do not block UI work on this. Numeric classes above already match Tailwind's 4px spacing and default type/radius scales.

When we register tokens in `app/global.css` `@theme`, use these names so semantic classes exist (`px-gutter`, `gap-section`, `text-base` with our line heights):

```css
@theme {
  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;

  --text-xs: 12px;
  --text-xs--line-height: 16px;
  --text-sm: 14px;
  --text-sm--line-height: 20px;
  --text-base: 16px;
  --text-base--line-height: 24px;
  --text-lg: 18px;
  --text-lg--line-height: 24px;
  --text-xl: 20px;
  --text-xl--line-height: 28px;
  --text-2xl: 24px;
  --text-2xl--line-height: 32px;
  --text-3xl: 30px;
  --text-3xl--line-height: 36px;

  --spacing-gutter: 16px;
  --spacing-section: 24px;
  --spacing-field: 16px;
  --spacing-label: 8px;
  --spacing-error: 4px;
}
```

Radius can stay on Tailwind defaults (`rounded-2xl` = 16px). After this lands, prefer `px-gutter` and `gap-section` / `gap-field` in new code. Keep the numeric recipes in this document as the source of truth for the pixel values.

If a JS consumer needs a px number (icon `size`, `hitSlop`, a third-party prop), add a small `theme/scale.ts` next to `theme/tokens.ts`. Do not sprinkle raw `16` in feature code once that file exists.

## Review checklist

- [ ] Screen uses `px-4` gutters and safe-area insets, not guessed top padding
- [ ] Page-level Save/Create/Done is a pinned footer sibling, not mid-scroll under the last field
- [ ] Footer uses `pt-3 pb-4` plus bottom inset; no shadow; `border-t` only if content scrolls into it
- [ ] Form fields are `gap-4` apart; label/error spacing is inside `Input`
- [ ] Primary buttons and inputs are `h-12` and `rounded-2xl`
- [ ] Type is one of the seven roles; no arbitrary font sizes
- [ ] Headings go through `H1` / `H2` / `H3` (or the same classes)
- [ ] Tap targets are at least 44pt (48 for primary); icon-only controls have `hitSlop`
- [ ] Gaps use allowed 4px steps; parent `gap-*` rather than per-child margins
- [ ] No new `StyleSheet`, no interpolated class names, no iOS/Android padding split
- [ ] Portrait only: no landscape layout branch
