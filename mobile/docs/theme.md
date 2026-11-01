# Theme

Screens and components are styled with NativeWind classes (`className`), the same way a Tailwind web app is. The app is **dark only**: the contact-sheet design ([EV-133](https://linear.app/mehrshadfb/issue/EV-133)) is monochrome film with one strawberry pencil colour, and `app.json` sets `userInterfaceStyle` to `dark`. There are no `dark:` pairs and no light values.

Type size, spacing, radius, and tap targets are a separate scale: [UI scale](./ui-scale.md). Use that document for padding, gaps, font sizes, and control dimensions; this document is color and how tokens are wired.

## Day-to-day usage

```tsx
<View className="bg-background border border-border">
  <Text className="text-foreground">Title</Text>
  <Text className="text-muted">Subtitle</Text>
</View>
```

Use a token, not a raw palette class (`bg-white`, `text-gray-500`).

Spell class names out in full. Tailwind’s scanner cannot see interpolated strings, so `` `text-${color}` `` will not generate a utility. `components/ui/themed-text.tsx` uses a literal lookup table for that reason.

## Conditional `className`

Build conditional or multi-part `className` strings with `cn` from `@/lib/cn` (`clsx` + `tailwind-merge`). Do not use array + `.filter(Boolean).join(" ")`, template-string concatenation, or a second helper.

```tsx
import { cn } from "@/lib/cn";

<Pressable className={cn("min-h-12 flex-row items-center border-b border-line py-4", disabled && "opacity-50")} />;
```

Static single-string `className` values stay as plain strings. Prefer `cn` whenever a class list is conditional, composed from props, or might include conflicting utilities (later arguments win via `twMerge`).

## Safe-area views

Import `SafeAreaView` from `@/components/ui/safe-area-view` when using `className`.
NativeWind v5 automatically adapts core React Native components, but the installed
`react-native-safe-area-context` integration only adapts its provider. Its native
`SafeAreaView` needs the shared `styled` wrapper to map `className` to `style`.
Without it, layout classes such as `flex-1` are ignored and a screen can collapse.

## No `StyleSheet`

Do not import or call React Native `StyleSheet` (`StyleSheet.create`, `StyleSheet.absoluteFill`, …). Layout, color, spacing, and typography belong in `className` with tokens from `global.css`.

ESLint enforces this via `local/no-stylesheet`. A short allowlist of pre-NativeWind files is exempt in `eslint.config.js` until those screens are migrated — do not add new paths to that list.

Animated values (opacity, `translateY`, …) may still use a `style` prop when NativeWind cannot drive the animation. Keep that `style` limited to the animated properties and put everything else on `className`.

```tsx
// Preferred
<View className="absolute inset-0 bg-scrim" />;

// Avoid
const styles = StyleSheet.create({ scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "#0000008c" } });
```

## File map

| Piece            | Location             | Role                                                                                  |
| ---------------- | -------------------- | ------------------------------------------------------------------------------------- |
| CSS tokens       | `app/global.css`     | Registers utilities (`bg-background`, `text-muted`, …) and supplies light/dark values |
| JS tokens        | `theme/tokens.ts`    | Same hex values for native chrome that does not take `className`                      |
| `cn` helper      | `lib/cn.ts`          | Conditional `className` joins (`clsx` + `tailwind-merge`)                             |
| Navigation theme | `theme/provider.tsx` | Feeds JS tokens into Expo Router / React Navigation                                   |
| Root wiring      | `app/_layout.tsx`    | Imports `global.css` and wraps the app in `AppThemeProvider`                          |

`metro.config.js` is only `withNativewind(config)`. There is no exclude list and no JS variable provider for NativeWind.

## Why `global.css` looks like this

NativeWind v5 is Tailwind v4. `@theme` is how you register design tokens so `bg-background` exists. Every token is declared once: the native compiler inlines a custom property declared only once, which is exactly what a single fixed palette wants.

The file holds two sets of colour names for the same palette:

- **Semantic names** (`background`, `foreground`, `muted`, `accent`, …) that the screens built before the redesign use. They are mapped onto the film palette, so those screens turn dark without edits. `accent` is the white leader, `danger` is the pencil.
- **Contact-sheet names** (`ground`, `rebate`, `edge`, `pencil`, `paper`, …) from the design system. New components and rebuilt screens use these.

It also registers the fonts, the type scale and three radii (`rounded-frame`, `rounded-paper`, `rounded-leader`); see [UI scale](./ui-scale.md). Line heights in the type scale are ratios (line ÷ size), because NativeWind multiplies `--text-*--line-height` by the font size; a `px` value there makes lines many times too tall. Sizes such as the 58pt leader use the standard spacing steps (`h-14.5`); don't register `--spacing-*` names.

## Why `theme/tokens.ts` exists

CSS cannot import TypeScript, and some **native APIs do not take `className`**. Those APIs want a color string or a theme object. That is not inline styling (`style={{ backgroundColor: "..." }}` on your views). It is how React Navigation and a few native widgets are configured.

We keep native stack headers and tab bars (swipe-back, platform back, safe areas) and theme them to match `global.css`. `theme/tokens.ts` is the hex map for that. `AppThemeProvider` only builds Expo Router’s `Theme` (`primary`, `background`, `card`, `text`, `border`).

`colorTokens` is the palette itself: read a colour directly (`colorTokens.muted`). There is no colour-scheme hook and nothing branches on light or dark.

The same JS values are valid for props such as `ActivityIndicator` `color` or an icon `color` when `currentColor` is not an option. Prefer a parent `text-*` class and `color="currentColor"` first.

If you change a hex in `global.css`, change the matching key in `theme/tokens.ts` (`--color-background` ↔ `background`).

## Tokens

| Token                                                         | Value                 | Role                                             |
| ------------------------------------------------------------- | --------------------- | ------------------------------------------------ |
| `ground` (`background`)                                       | `#0e0e0e`             | Every screen's ground                            |
| `rebate`                                                      | `#050505`             | Film base: strips, the band under an event title |
| `sheet` (`surface`)                                           | `#151515`             | Panels and sheets over the ground                |
| `frame-empty` (`elevated`)                                    | `#1b1b1b`             | Unexposed frames                                 |
| `sprocket`                                                    | `#262626`             | Sprocket holes                                   |
| `line` (`border-muted`)                                       | `#1f1f1f`             | Hairlines between rows                           |
| `border`                                                      | `#2e2e2e`             | Field and outline borders                        |
| `text` (`strong`, `foreground`)                               | `#f4f4f4`             | Names, titles, body                              |
| `text-2` (`muted`)                                            | `#a3a3a3`             | Secondary lines                                  |
| `edge` (`subtle`)                                             | `#8a8a8a`             | Edge print                                       |
| `leader` / `on-leader` (`accent` / `accent-foreground`)       | `#f4f4f4` / `#0e0e0e` | Leader buttons and their labels                  |
| `pencil` (`danger`)                                           | `#ff4f6d`             | Grease pencil and error text. Never a fill       |
| `stamp`                                                       | `#e11d48`             | The invite's decorative stamp                    |
| `paper`, `paper-ink`, `paper-ink-2`, `paper-rule`, `ink-blue` | `#eee8df` …           | The envelope, ticket and lab card                |
| `viewer`                                                      | `#000000`             | The photo viewer                                 |
| `paper-flap`                                                  | `#e2dbd0`             | The envelope's flap                              |
| `outline` / `outline-soft`                                    | white at 40% / 18%    | Outlined leaders / icon buttons                  |

`shadow-paper` lays paper on the ground. `warning` and `success` stay registered for old call sites and are plain text colour: the design has no status colours.

## Third-party views and `className`

NativeWind maps `className` on core React Native views only. `expo-image` and `react-native-svg`'s `Svg` ignore it, so a size or position class on them does nothing. Use `Photo` (`components/ui/photo.tsx`, a `styled` wrapper) for images, and put an `Svg` inside a `View` that carries the classes. Transform scale classes (`scale-88`) compile to percentages that native rejects; shrink with padding instead.

## Adding a token

1. Add the value to `@theme` in `app/global.css`.
2. Add the same hex to `theme/tokens.ts` if native chrome or a color prop will need it.

## Out of scope (migrate later)

One older screen (`features/events/screens/events-screen.tsx`) still uses `StyleSheet`, with colours read from `colorTokens`. It moves to classes when its chapter is rebuilt; do not extend it.
