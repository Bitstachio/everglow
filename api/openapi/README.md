# OpenAPI contract

`openapi.json` is generated from the NestJS app (controllers, DTOs, and Swagger metadata).

## Regenerate locally

```bash
cd api
npm run openapi:generate
```

Commit `openapi.json` when API routes or request/response shapes change.

## Verify (CI-friendly)

```bash
npm run openapi:check
```

Fails if the committed spec is out of date.

## Interactive docs

With the API running: `http://localhost:3000/api/docs`
