# Everglow API

NestJS, Prisma and PostgreSQL, with Auth0 for sign-in and S3 for photos.

```sh
npm run setup:local -- --start
```

sets up and starts everything on a developer machine. [docs/local-setup.md](./docs/local-setup.md) explains what it needs and what to ask for.

Swagger runs at `http://localhost:3000/api/docs`; the OpenAPI contract is `openapi/openapi.json`. Design notes live in [`docs/`](./docs).
