# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Base: shared Node runtime and OS deps (Prisma needs OpenSSL on Alpine)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base

WORKDIR /app

RUN apk add --no-cache openssl

# ---------------------------------------------------------------------------
# Dependencies: install all packages (dev + prod) for the build stage
# ---------------------------------------------------------------------------
FROM base AS deps

COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma

RUN npm ci

# ---------------------------------------------------------------------------
# Build: compile TypeScript and generate the Prisma client
# ---------------------------------------------------------------------------
FROM deps AS build

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Production: minimal runtime image (no devDependencies, no source)
# ---------------------------------------------------------------------------
FROM base AS production

ENV NODE_ENV=production

COPY package.json package-lock.json ./

# Skip postinstall (prisma CLI is a devDependency); client is copied from build.
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/generated ./generated
COPY --from=build --chown=node:node /app/prisma ./prisma

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v2').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/main.js"]
