# UI scale

This is the spatial and typographic system for the Everglow mobile app. Color lives in [Theme](./theme.md). Size, space, type, radius, and touch targets live here.

Use this document when adding or restyling screens, shared UI, and feature components. Coding agents should follow the recipes and the allowed-class lists, not invent nearby values.

The app is portrait-only on iOS and Android. Layouts do not adapt to landscape.

**Migration:** existing screens mix Tailwind classes, leftover StyleSheet numbers, and one-off padding. New work follows this scale. When you touch a screen, move that surface onto these values. Do not rewrite the whole app in passing.

## Design intent

Slick, dense, content-first. Think Instagram and WhatsApp, not a marketing landing page and not a desktop settings panel.

- Funnel, IBM Plex Mono and Nanum Pen for all text (see [Typeface](#typeface)), on a dark-only film palette ([Theme](./theme.md)).
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

| Token | px  | NativeWind | Role                                                       |
| ----- | --- | ---------- | ---------------------------------------------------------- |
| 0     | 0   | `0`        | Reset                                                      |
| 1     | 4   | `1`        | Hairline stack: input to error, icon optical inset         |
| 2     | 8   | `2`        | Label to input, icon to label, chip gap                    |
| 3     | 12  | `3`        | Inside a compact card, filter row padding, stacked buttons |
| 4     | 16  | `4`        | **Default.** Screen gutter, field-to-field, card padding   |
| 5     | 20  | `5`        | Slightly roomy card or sheet inset (use sparingly)         |
| 6     | 24  | `6`        | Section gap, sheet block gap, title to first field         |
| 8     | 32  | `8`        | Major break, empty-state padding                           |
| 10    | 40  | `10`       | Rare: hero offset on auth / onboarding                     |
| 12    | 48  | `12`       | Control height (`h-12`), large empty-state gap             |
| 16    | 64  | `16`       | Rare: illustration to copy on empty states                 |

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

| Screen kind                        | Bottom treatment                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| Read-only list, no page CTA        | `pb-4` plus home-indicator / tab-bar inset                                     |
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

| Relationship              | Space | Class                 |
| ------------------------- | ----- | --------------------- |
| Label to control          | 8     | `gap-2`               |
| Control to error/helper   | 4     | `gap-1`               |
| Field to field            | 16    | `gap-4`               |
| Section title to fields   | 12    | `gap-3`               |
| Form section to section   | 24    | `gap-6`               |
| Last field to in-flow CTA | 24    | `gap-6` (sheets only) |
| Primary to secondary CTA  | 12    | `gap-3`               |

`Input` owns label, control, and error spacing. Feature forms should wrap fields in `gap-4`, not add extra `mb-*` on each `FormField`.

On **full screens**, do not put `gap-6` before the button in the scroll view. Pin the actions ([Pinned bottom actions](#pinned-bottom-actions)). Helper copy stays with its field (`gap-2` under the input). Empty space between the field block and the footer is flex leftover, not a magic spacer.

On **sheets**, keep the action row in the sheet body with `gap-6` after the last field. A sheet is already a bottom surface; a second pinned footer inside it is redundant.

Placeholder copy uses `text-subtle` (already wired via `placeholderTextColor` on `Input`). Do not restyle placeholders per screen.

### Lists and rows

WhatsApp-style rows, Instagram-style feed cards: dense vertically, 16px from the screen edge.

| Element                      | Value              | Class                               |
| ---------------------------- | ------------------ | ----------------------------------- |
| Row horizontal inset         | 16                 | `px-4`                              |
| Row vertical padding         | 12                 | `py-3`                              |
| Min row height (text only)   | 48                 | `min-h-12`                          |
| Min row height (with avatar) | 56                 | `min-h-14`                          |
| Avatar to text               | 12                 | `gap-3`                             |
| Title to subtitle            | 4                  | `gap-1`                             |
| Row to row                   | 0 + divider, or 12 | `border-b border-border` or `gap-3` |
| Card list gap                | 12                 | `gap-3`                             |

Prefer a 1px `border-border` divider _or_ a gap, not both.

### Cards

| Element        | Value | Class                  |
| -------------- | ----- | ---------------------- |
| Padding        | 16    | `p-4`                  |
| Internal stack | 12    | `gap-3`                |
| Corner         | 16    | `rounded-2xl`          |
| Stroke         | 1     | `border border-border` |

Do not add a drop shadow by default. Instagram and WhatsApp separate surfaces with stroke and background (`bg-background` vs `bg-surface`), not elevation. If a floating control truly needs a shadow, add a shared token later; do not inline `shadow-*` ad hoc.

### Sheets and modal panels

| Element              | Value          | Class                   |
| -------------------- | -------------- | ----------------------- |
| Horizontal inset     | 16             | `px-4`                  |
| Top (handle)         | 12             | `pt-3`                  |
| Bottom               | 24 + safe area | `pb-6` plus inset       |
| Handle               | 4 x 40         | `h-1 w-10 rounded-full` |
| Handle to title      | 16             | `gap-4`                 |
| Title to body        | 16             | `gap-4`                 |
| Body blocks          | 24             | `gap-6`                 |
| Top corners          | 24             | `rounded-t-3xl`         |
| Grab-handle contrast | border token   | `bg-border`             |

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

| Element                     | Value          | Class                                                                    |
| --------------------------- | -------------- | ------------------------------------------------------------------------ |
| Footer horizontal inset     | 16             | `px-4`                                                                   |
| Footer top padding          | 12             | `pt-3`                                                                   |
| Footer bottom padding       | 16 + safe area | `pb-4` plus bottom inset (home indicator). Do not guess `pb-8` / `pb-10` |
| Button height / radius      | 48 / 16        | `h-12 rounded-2xl`, full width                                           |
| Stacked footer buttons      | 12             | `gap-3`                                                                  |
| Scroll content above footer | 24             | `pb-6` on the scroll content (breathing room, not a fake footer)         |

Layout structure: a `flex-1` column. The scroll view is `flex-1`. The footer is a sibling **below** the scroll view, not `absolute`/`fixed` over the content. That way fields never hide under the button and you do not have to compute footer height.

**When the footer gets a top border.** Short forms (edit username, create event) have a large empty region; no divider, no shadow. If the body can scroll far enough that fields would meet the footer, add `border-t border-border` on the footer so the pin is obvious. Still no drop shadow.

**Button order in a stack.** Reading order from the content down: primary first, then secondary, then dismiss (Share, Create Another, Done). Header Back is the cancel for edit/create screens; do not add a footer Cancel unless there is no stack header.

**Tab bars.** Do not pin a page footer on top of a tab bar. Tab-root screens either have no page-level CTA or place the action in the header / a row. Stack screens pushed from a tab (create event, edit profile) pin as usual; the tab bar is hidden behind the stack.

**Keyboard.** The avoiding view wraps scroll + footer together so Save stays visible while typing.

**Completion / success screens.** Hero (icon, title, share link, QR) sits in the scroll region, top or optically upper-middle with `pt-8` above a large icon. Actions still pin. Do not vertically center the hero _and_ the buttons as one group.

### Toolbar chips and compact controls

Filter chips, sort buttons, inline pills:

| Element  | Value | Class                                            |
| -------- | ----- | ------------------------------------------------ |
| Height   | 36-44 | `h-9` to `h-11` (pad with `hitSlop` to 44)       |
| Padding  | 12-16 | `px-3` or `px-4` (set height; skip extra `py-*`) |
| Corner   | 12    | `rounded-xl`                                     |
| Chip gap | 8     | `gap-2`                                          |
| Icon gap | 8     | `gap-2`                                          |
| Label    | 14    | `text-sm font-medium`                            |

### Empty states

Center the illustration and copy in the remaining viewport **above** the footer. `gap-3` between illustration, title, and body. If the empty state has a page-level CTA, pin it; do not `gap-6` the button under the copy so it floats in the middle. Title is `H3` or `text-lg font-semibold`; body is `text-sm` / `text-muted`.

## Typeface

Four families from the contact-sheet design ([EV-133](https://linear.app/mehrshadfb/issue/EV-133)), all SIL OFL 1.1, bundled as static files in `assets/fonts/` and embedded by the `expo-font` config plugin (`app.json`). Each weight is its own family, because custom fonts can't be bolded with `fontWeight` on Android.

| Class                | Family (PostScript name) | Use                                                                     |
| -------------------- | ------------------------ | ----------------------------------------------------------------------- |
| `font-display`       | `FunnelDisplay-SemiBold` | Names and titles: event titles, screen titles, roll names, the wordmark |
| `font-sans`          | `FunnelSans-Regular`     | Running text                                                            |
| `font-sans-medium`   | `FunnelSans-Medium`      | People's names in lists                                                 |
| `font-sans-semibold` | `FunnelSans-SemiBold`    | Emphasis inside running text                                            |
| `font-mono`          | `IBMPlexMono-Medium`     | Edge print: frame numbers, counts, dates, labels (uppercase)            |
| `font-mono-semibold` | `IBMPlexMono-SemiBold`   | Leader and text-button labels, the frame counter                        |
| `font-hand`          | `NanumPen-Regular`       | Grease-pencil notes and details filled in on paper                      |

Do not combine these classes with `font-medium`, `font-semibold` or `font-bold`: the weight is in the family. Changing a font means a native rebuild (`expo prebuild`), not a reload.

The Funnel files are static weights cut from the variable fonts; IBM Plex Mono and Nanum Pen are the upstream files unmodified (both have Reserved Font Names, so they can't be subset without renaming). Licences are beside each file.

## Type scale

Registered in `app/global.css` as `--text-*`, with line height and letter spacing built in, so one class sets all three. Letter spacing is in px because native has no `em`.

| Class               | Size | Line | Tracking | Family        | Use                                             |
| ------------------- | ---- | ---- | -------- | ------------- | ----------------------------------------------- |
| `text-title-event`  | 40   | 40   | -1.4     | display       | Event title over the cover                      |
| `text-title-screen` | 34   | 36   | -1       | display       | Screen titles; the second line in `text-text-2` |
| `text-title-roll`   | 24   | 28   | -0.6     | display       | Event names on Home rolls                       |
| `text-wordmark`     | 22   | 24   | -0.4     | display       | "Everglow" in the header                        |
| `text-name`         | 16   | 20   | 0        | sans-medium   | People in a roll call                           |
| `text-body`         | 15   | 20   | 0        | sans          | Running text, list names                        |
| `text-leader-label` | 13.5 | 16   | 1.35     | mono-semibold | Leader button labels, uppercase                 |
| `text-text-button`  | 12.5 | 16   | 1.5      | mono-semibold | Text buttons, uppercase                         |
| `text-edge-print`   | 10.5 | 14   | 1.26     | mono          | Edge print, uppercase                           |
| `text-frame-label`  | 9.5  | 12   | 0.95     | mono          | Labels under frames, uppercase                  |
| `text-counter`      | 64   | 64   | 0        | mono-semibold | The frame counter                               |
| `text-note`         | 28   | 26   | 0        | hand          | Pencil notes, at most one per screen            |
| `text-filled-in`    | 30   | 26   | 0        | hand          | Details written on paper                        |
| `text-input-name`   | 40   | none | -1.4     | display       | The name field in onboarding                    |
| `text-input-handle` | 28   | none | -0.8     | display       | The username field in onboarding                |

Text inputs use the `text-input-*` sizes, which set no line height: on iOS a line height on a `TextInput` makes the first typed letter jump. Give the input a fixed height instead.

A size name must never repeat a colour name: `text-edge` would mean both the 10.5pt size and the `edge` colour, and the colour wins. Hence `text-edge-print` and `text-leader-label`.

The older `text-xs` … `text-3xl` steps still work for screens not rebuilt yet; new work uses the scale above.

### Which component to use

| Need                        | Component                                                                  |
| --------------------------- | -------------------------------------------------------------------------- |
| Event title, screen title   | `Display` (`variant="event"` / `"screen"`; `dim` for the grey second line) |
| A roll's name on Home       | `Display variant="roll"`                                                   |
| "Everglow" in a header      | `Wordmark`                                                                 |
| Running text                | `ThemedText` with `text-body` (Funnel Sans by default)                     |
| Counts, dates, labels       | `EdgePrint`, with the key value in `EdgeValue`                             |
| A label under a frame       | `EdgePrint size="frame-label"`                                             |
| A handwritten note          | `PencilNote` (at most one per screen; `tone="ink"` on paper)               |
| Circle, tick, cross, strike | `GreasePencil`                                                             |
| Any action                  | `Button` (the leader)                                                      |
| A top-bar icon              | `IconButton` around an `AppIcon`                                           |
| The ground's grain          | `FilmGrain`, last child of a full-screen container                         |
| An event on Home            | `FilmStrip` (frames are photos, blank numbered frames, or dimmed)          |
| A photo in the gallery      | `ContactFrame`, three to a row; `selected` circles it, `isNew` ticks it    |
| Adding photos               | `Shutter`                                                                  |
| The gallery opening         | `FrameCounter`                                                             |
| Choosing the gallery length | `FilmBox`, four in a row                                                   |
| The invite                  | `LabEnvelope`, with a `Stamp` beside it                                    |
| Reporting                   | `LabTicket`                                                                |
| The account                 | `LabCard`                                                                  |
| A confirmation              | `Slip` inside a `BottomSheet` with no sheet title                          |
| One choice among several    | `OptionRow`, grouped in a `radiogroup` view                                |
| A person on the roll call   | `RollCallRow`                                                              |
| Any photo                   | `Photo` (expo-image with `className` support)                              |
| Native stack header title   | Leave to Expo Router; the navigation theme sets Funnel Sans                |

`H1`, `H2` and `H3` remain for screens not rebuilt yet; they now set Funnel Display (H1, H2) and Funnel Sans SemiBold (H3). Every component can be seen on a device at `everglowmobile://design-kit` in development builds (`?only=<section>` shows one section). Paper components take every string from the caller, so screens pass translated copy.

### Weight rules

The weight is in the family (see [Typeface](#typeface)). Use `font-sans-medium` for a name, `font-sans-semibold` for emphasis in running text, and `font-mono-semibold` for an edge-print value. Do not add `font-bold` or `font-semibold` to these families.

## Radius

| Class            | px   | Use                                    |
| ---------------- | ---- | -------------------------------------- |
| `rounded-frame`  | 2    | Photo frames in strips and the grid    |
| `rounded-paper`  | 4    | Envelope, ticket, lab card, film boxes |
| `rounded-leader` | 6    | Leader buttons                         |
| `rounded-full`   | 9999 | Only the shutter and 40pt icon buttons |

Nothing else is rounded: no pills, no rounded cards. The older `rounded-xl` … `rounded-3xl` steps remain only on screens not rebuilt yet.

## Control sizes and tap targets

Apple asks for 44pt minimum. Material asks for 48dp.

| Control           | Size | Class       | Notes                                                   |
| ----------------- | ---- | ----------- | ------------------------------------------------------- |
| Leader (`Button`) | 58   | `h-14.5`    | Full width; `px-5`; label left, optional end mark right |
| Text button       | 44   | `h-11`      | `Button variant="ghost"`                                |
| Icon button       | 40   | `size-10`   | Round outline; `hitSlop={8}` makes the hit box 56       |
| The shutter       | 78   | `size-19.5` | The only other round control                            |
| List row          | 48+  | `min-h-12`  | Tappable row, not only the trailing icon                |

Disabled controls keep layout size and use `opacity-50`. Inline `Pressable` text still needs a 44pt hit box: wrap to `min-h-11` or set `hitSlop`.

## Icons

Icon pixel sizes stay in `constants/icons.ts` (`xs` 16, `sm` 20, `md` 24, `lg` 32, `xl` 48). See [Icons](./icons.md).

Pairing:

| Next to                  | Icon token             | Gap          |
| ------------------------ | ---------------------- | ------------ |
| `text-xs` / `text-sm`    | `xs` or `sm` (16/20)   | `gap-2` (8)  |
| `text-base` button / row | `sm` or `md` (20/24)   | `gap-2` (8)  |
| Empty state              | `lg` (32) or `xl` (48) | `gap-3` (12) |

Tint with color tokens (`text-foreground`, `color="currentColor"`, or `colorTokens.text`). Do not hardcode hex.

## Color pairing (quick)

Use [Theme](./theme.md) tokens. Typical mapping:

| Text role         | Tone                |
| ----------------- | ------------------- |
| Headings          | `strong`            |
| Body              | `foreground`        |
| Labels            | `foreground`        |
| Helper, meta      | `muted`             |
| Placeholder, time | `subtle`            |
| Error             | `danger`            |
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

| Don't                                                   | Do instead                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `p-5` on every screen because it "looks airy"           | `px-4` gutter; add air with `gap-6` between sections                                                 |
| Save/Create in the scroll view under the last field     | Pinned footer sibling; leftover space is flex, not `mt-auto` on a lone button inside the scroll view |
| `absolute bottom-0` footer over scrolling fields        | Column: `ScrollView` `flex-1`, then footer                                                           |
| Footer `pb-10` to clear the home indicator              | `pb-4` plus the system bottom inset                                                                  |
| Footer Cancel plus header Back                          | Header Back only                                                                                     |
| `gap-2` between form fields (too tight)                 | `gap-4` between fields; `gap-2` only for label to input                                              |
| Extra `mb-2` on a label that `Input` already spaces     | Let `Input` / `FormField` own internal rhythm                                                        |
| `text-3xl` for an in-app screen title                   | `H1` (`text-2xl`)                                                                                    |
| `font-bold` on body copy                                | `font-normal` body, weight on headings and buttons                                                   |
| `h-10` primary button                                   | `h-12`                                                                                               |
| `rounded-md` or `rounded-lg` on inputs                  | `rounded-2xl`                                                                                        |
| `shadow-lg` on cards                                    | `border border-border` and surface tokens                                                            |
| `pt-12` to clear the status bar                         | Safe area inset                                                                                      |
| `className={`p-${n}`}`                                  | Literal `p-4`                                                                                        |
| Arbitrary `top-[18px]` to align an icon                 | Allowed gap + `items-center`; `hitSlop` if the tap target is short                                   |
| Different padding on iOS vs Android for the same screen | One token; safe area handles the rest                                                                |

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
  <ThemedText tone="muted" className="text-sm">
    Saturday, 7:00 PM
  </ThemedText>
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
