# Icons

UI icons go through `AppIcon`. The contact-sheet design uses **Phosphor** (`phosphor-react-native`, MIT), regular weight. Screens not rebuilt yet still use Lucide (`lucide-react-native`); move a screen to Phosphor when you rebuild it, and don't add new Lucide call sites. Use custom `.svg` files in `assets/icons/` for anything Phosphor does not have.

## How it works

- **Phosphor:** import a named icon from `phosphor-react-native` and pass it to `AppIcon`. Phosphor icons don't read NativeWind classes; pass `color` from `colorTokens.dark`.
- **Lucide (legacy):** import a named icon from `lucide-react-native` and pass it to `AppIcon`.
- **Custom SVGs:** `react-native-svg-transformer` turns `assets/icons/*.svg` into components at build time. Author them with `currentColor` fill/stroke.

## Usage

```tsx
import { AppIcon } from "@/components/ui/app-icon";
import { colorTokens } from "@/theme/tokens";
import { CaretLeft } from "phosphor-react-native";

<AppIcon icon={CaretLeft} size="sm" color={colorTokens.dark.text} />;
```

Size tokens live in `constants/icons.ts` (`xs`–`xl`). Prefer a token; use a number only when you need something outside that scale.

Lucide icons take NativeWind `text-*` classes with the default `color="currentColor"`. Phosphor icons need an explicit `color` from `colorTokens.dark` (`text`, `edge`, `onLeader`). Do not hardcode hex.

## Rules

- Route Phosphor, Lucide and custom SVGs through `AppIcon`. Do not render them with raw `width` / `height` / `size`.
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
