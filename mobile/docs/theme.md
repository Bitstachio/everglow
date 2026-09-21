# Theme

Screens and components are styled with NativeWind classes (`className`), the same way a Tailwind web app is. Light and dark come from semantic tokens, not from `dark:` pairs on every element.

## Day-to-day usage

```tsx
<View className="bg-background border border-border">
  <Text className="text-foreground">Title</Text>
  <Text className="text-muted">Subtitle</Text>
</View>
```

Use a token, not a raw palette class (`bg-white`, `text-gray-500`) and not `bg-white dark:bg-slate-950`. The token already flips with the system appearance.

Spell class names out in full. Tailwind’s scanner cannot see interpolated strings, so `` `text-${color}` `` will not generate a utility. `components/ui/themed-text.tsx` uses a literal lookup table for that reason.

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
| Navigation theme | `theme/provider.tsx` | Feeds JS tokens into Expo Router / React Navigation                                   |
| Root wiring      | `app/_layout.tsx`    | Imports `global.css` and wraps the app in `AppThemeProvider`                          |

`metro.config.js` is only `withNativewind(config)`. There is no exclude list and no JS variable provider for NativeWind.

## Why `global.css` looks like this

NativeWind v5 is Tailwind v4. `@theme` is how you register design tokens so `bg-background` exists.

Dark mode in NativeWind is `prefers-color-scheme`, mapped to React Native `Appearance`. The documented class-level form is `bg-white dark:bg-gray-900`. We do not use that for theme colors: the strings get long, and every new surface has to remember both sides.

Instead we override the same tokens in a dark media query:

```css
@theme {
  --color-background: #ffffff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-background: #0b1220;
  }
}
```

`@theme` is the token registry (light / default). The media query is the dark value. NativeWind re-evaluates the media query when the system theme changes, so `className="bg-background"` is enough.

That dark block is also what keeps the variables alive. The native compiler inlines any custom property declared only once; a second declaration under `prefers-color-scheme` prevents `bg-background` from baking to `#ffffff`.

This is the CSS form of NativeWind’s dark-mode mechanism, not a JS theme switcher. We are not using `VariableContextProvider` or a duplicated `:root` copy of the light values — those are for runtime palettes (brand vs seasonal), which we do not have.

## Why `theme/tokens.ts` exists

CSS cannot import TypeScript, and some **native APIs do not take `className`**. Those APIs want a color string or a theme object. That is not inline styling (`style={{ backgroundColor: "..." }}` on your views). It is how React Navigation and a few native widgets are configured.

We keep native stack headers and tab bars (swipe-back, platform back, safe areas) and theme them to match `global.css`. `theme/tokens.ts` is the hex map for that. `AppThemeProvider` only builds Expo Router’s `Theme` (`primary`, `background`, `card`, `text`, `border`).

The same JS values are valid for props such as `ActivityIndicator` `color` or an icon `color` when `currentColor` is not an option. Prefer a parent `text-*` class and `color="currentColor"` first.

If you change a hex in `global.css`, change the matching key in `theme/tokens.ts` (`--color-background` ↔ `background`).

## Tokens

| Token                                                             | Typical class     | Role                        |
| ----------------------------------------------------------------- | ----------------- | --------------------------- |
| `background` / `surface` / `elevated`                             | `bg-background`   | Page, card, raised surfaces |
| `strong` / `foreground` / `muted` / `subtle`                      | `text-foreground` | Text hierarchy              |
| `accent` / `accent-hover` / `accent-active` / `accent-foreground` | `bg-accent`       | Brand and on-accent text    |
| `border` / `border-muted`                                         | `border-border`   | Dividers                    |
| `danger` / `warning` / `success`                                  | `text-danger`     | Status                      |

## Adding a token

1. Add the light value to `@theme` in `app/global.css`.
2. Add the dark value in the `prefers-color-scheme: dark` `:root` block.
3. Add the same hex pair to `theme/tokens.ts` if native chrome or a color prop will need it.

## Out of scope (migrate later)

Shared UI under `components/ui/` still uses the old palette class names (`bg-brand-primary`, `border-ui-border`, `text-text-main`, …). `tailwind.config.ts` remains only as the `textColors` export for `themed-text`; it is not the Tailwind theme. New UI should use `global.css` tokens via `className`, and `theme/tokens.ts` only for native chrome / color props. Expo starter leftovers (`constants/theme.ts`, template `button` / `input`) are the same story.
