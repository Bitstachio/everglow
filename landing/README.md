# Everglow landing

Marketing site for Everglow. Next.js with static export (`output: "export"`).

## Scripts

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static output in out/
npm run lint
```

## Notes

- Scope is this folder only; it does not talk to the API or mobile app.
- `next-intl` is wired with English as the starting locale. Add locales under `src/messages/` when needed.
