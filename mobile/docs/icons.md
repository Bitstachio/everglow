# Custom SVG icons

Custom icons are `.svg` files turned into React components at build time. Use `AppIcon` so size and color stay consistent.

## How it works

`react-native-svg-transformer` runs in Metro. When you import a `.svg`, SVGR converts it into a `react-native-svg` component. You do not import SVGR yourself.

Put shared icons in `assets/icons/`.

## Usage

```tsx
import Calendar from "@/assets/icons/calendar.svg";
import { AppIcon } from "@/components/ui/app-icon";

<AppIcon icon={Calendar} />
<AppIcon icon={Calendar} size="sm" color="#6366F1" />
<AppIcon icon={Calendar} size={28} color={color} />
```

Size tokens live in `constants/icons.ts` (`xs`–`xl`). Prefer a token; use a number only when you need something outside that scale (e.g. tab bar).

## Rules

- Custom SVGs → `AppIcon`. Do not render the imported SVG with raw `width` / `height`.
- Author SVGs with `currentColor` for fill/stroke so `color` on `AppIcon` tints them.
- Keep icons on a consistent `viewBox` (typically `0 0 24 24`).
- Ionicons, Material icons, and `IconSymbol` are separate. Do not route them through `AppIcon`.

## Related files

| Piece        | Location                     |
| ------------ | ---------------------------- |
| Icon files   | `assets/icons/`              |
| Size tokens  | `constants/icons.ts`         |
| Wrapper      | `components/ui/app-icon.tsx` |
| SVGR config  | `.svgrrc`                    |
| Metro wiring | `metro.config.js`            |
