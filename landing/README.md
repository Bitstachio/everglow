# Everglow Landing

Marketing site for Everglow. Next.js with static export (`output: "export"`).

## Scripts

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # static output in out/
pnpm lint
```

## Notes

- Scope is this folder only; it does not talk to the API or mobile app.
- `next-intl` is wired with English as the starting locale. Add locales under `src/messages/` when needed.
- TypeScript and React conventions: [docs/code-conventions.md](./docs/code-conventions.md).
