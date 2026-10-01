# Everglow mobile

Expo app for iOS and Android. Product and architecture that also apply to the API live in the repo [`docs/`](../docs/) folder. How we write this app lives in [`docs/code-conventions.md`](docs/code-conventions.md).

## Get started

From `mobile/`:

```bash
corepack enable
pnpm install
pnpm start
```

`pnpm-workspace.yaml` sets `nodeLinker: hoisted`. Expo, Metro, and CocoaPods need a flatter `node_modules` than pnpm's default isolated layout.

Point the app at an API with `EXPO_PUBLIC_API_URL` in `mobile/.env`. Local API setup is in [api/docs/local-setup.md](../api/docs/local-setup.md).

## Tests

```bash
pnpm test
pnpm test:e2e:ios      # Maestro; see docs/e2e.md
pnpm test:e2e:android
```

Mobile E2E uses Maestro. Flows live in [`.maestro/`](.maestro/); setup and run instructions are in [docs/e2e.md](docs/e2e.md). After installing the Maestro CLI, building the native app (`pnpm ios` / `pnpm android`), and signing in on a simulator/emulator, run the platform script from `mobile/`.

## Docs

| Topic | Doc |
| ----- | --- |
| Conventions (entry point) | [docs/code-conventions.md](docs/code-conventions.md) |
| Feature folders | [docs/feature-code-organization.md](docs/feature-code-organization.md) |
| API client | [docs/api.md](docs/api.md) |
| Forms | [docs/forms.md](docs/forms.md) |
| Theme / UI scale / icons | [docs/theme.md](docs/theme.md), [docs/ui-scale.md](docs/ui-scale.md), [docs/icons.md](docs/icons.md) |
| Testing / E2E | [docs/testing.md](docs/testing.md), [docs/e2e.md](docs/e2e.md) |
| Shared product docs | [../docs/](../docs/) |
