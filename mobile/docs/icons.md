# Icons

UI icons go through `AppIcon`. Prefer Lucide (`lucide-react-native`) for the shared set; use custom `.svg` files in `assets/icons/` when you need something Lucide does not have.

## How it works

- **Lucide:** import a named icon from `lucide-react-native` and pass it to `AppIcon`.
- **Custom SVGs:** `react-native-svg-transformer` turns `assets/icons/*.svg` into components at build time. Author them with `currentColor` fill/stroke.

## Usage

```tsx
import { AppIcon } from "@/components/ui/app-icon";
import { Calendar } from "lucide-react-native";

<AppIcon icon={Calendar} className="text-muted" />
<AppIcon icon={Calendar} size="sm" className="text-accent" />
```

Size tokens live in `constants/icons.ts` (`xs`–`xl`). Prefer a token; use a number only when you need something outside that scale.

Tint with NativeWind `text-*` classes and the default `color="currentColor"`. Do not pull hex from `colorTokens` / `useColorScheme` just to color an icon. Pass an explicit `color` only when NativeWind cannot express the tint (rare).

## Rules

- Route Lucide and custom SVGs through `AppIcon`. Do not render them with raw `width` / `height` / `size`.
- Keep custom SVGs on a consistent `viewBox` (typically `0 0 24 24`).
- Do not add new `@expo/vector-icons` (Ionicons / Material) call sites. Migrate existing ones when you touch a file.

## Related files

| Piece        | Location                     |
| ------------ | ---------------------------- |
| Icon files   | `assets/icons/`              |
| Size tokens  | `constants/icons.ts`         |
| Wrapper      | `components/ui/app-icon.tsx` |
| SVGR config  | `.svgrrc`                    |
| Metro wiring | `metro.config.js`            |
