# Running the API locally

For anyone who needs the API on their own machine, mostly to develop the mobile app against it. One command sets it up; this page covers what it needs, what it does, and what to ask for.

## Quick start

```sh
cd api
npm run setup:local            # prepare everything, then start with npm run start:dev
npm run setup:local -- --start # prepare and start in one go
```

On a fresh clone the first run creates `api/.env` and stops, listing the values to fill in (see [What to ask for](#what-to-ask-for)). Fill them in and run it again. It is safe to re-run at any time: it never overwrites `.env`, and every step does nothing when already done.

## Prerequisites

- **Node 22** or newer (CI runs 22).
- **Docker Desktop**, running, for the database. Without Docker, run PostgreSQL yourself and point `DATABASE_URL` at it; the script then leaves the database alone.

## What the script does

`scripts/setup-local.mjs`, in order, stopping at the first problem with a message saying what to fix:

1. Checks the Node version.
2. Creates `.env` from `.env.example` if there is none, and checks every required value is filled in. It refuses to continue if a reconciler that deletes shared data is switched on (see [The shared dev resources](#the-shared-dev-resources)).
3. Runs `npm ci` when `node_modules` is missing or older than `package-lock.json`.
4. Starts Postgres with `docker compose up db` when `DATABASE_URL` points at the Compose database (`localhost:5433`). Any other `DATABASE_URL` is used as is.
5. Applies migrations with `prisma migrate deploy`.
6. Checks that the Auth0 tenant answers and that the S3 credentials can reach the bucket.
7. Prints the URLs: Swagger, and the `EXPO_PUBLIC_API_URL` to put in `mobile/.env` for a simulator, an emulator, or a phone.

## What to ask for

Get these from the API owner through the team password manager, never through chat or email and never committed. Everything else in `.env` already has a working default.

| Variable                                                       | Secret  | What it is                                                                 | Without it                                             |
| -------------------------------------------------------------- | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`                               | no      | The dev Auth0 tenant and API identifier, the same ones the mobile app uses | The API does not start                                 |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`                   | **yes** | The dev API's S3 key                                                       | The API does not start                                 |
| `AWS_S3_BUCKET`, `AWS_REGION`                                  | no      | The shared dev bucket and its region                                       | The API does not start                                 |
| `AUTH0_MANAGEMENT_CLIENT_ID`, `AUTH0_MANAGEMENT_CLIENT_SECRET` | **yes** | The Auth0 M2M app                                                          | Deleting an account and changing a password answer 500 |
| `AUTH0_NATIVE_CLIENT_ID`                                       | no      | The mobile app's Auth0 client ID (`EXPO_PUBLIC_AUTH0_CLIENT_ID`)           | Changing a password answers 500                        |

The `APPLE_SIWA_*` values are not needed locally. Without them, deleting an account that signed in with Apple still works and logs an error.

`mobile/.env` needs the matching values: `EXPO_PUBLIC_AUTH0_DOMAIN` and `EXPO_PUBLIC_AUTH0_AUDIENCE` equal `AUTH0_DOMAIN` and `AUTH0_AUDIENCE`, or every request is a 401.

## The shared dev resources

Each developer has their **own database**. The **Auth0 tenant and the S3 bucket are shared** by everyone.

- Photos from every developer's database land in one bucket. Object keys contain the user and a random ID, so they never collide.
- Your database only knows your rows. To another developer's database, your objects look like orphans. That is why `PHOTO_ORPHAN_RECONCILER_ENABLED` and `ACCOUNT_DELETION_RECONCILER_ENABLED` must stay off on a developer machine: they delete objects in the bucket and logins in the tenant that no local row explains. The script refuses to run with either set to `true`.
- Deleting your account in the app deletes your Auth0 login in the shared tenant. That is the real login you sign in with; create a test account for trying it.

## Pointing the app at your API

| Where the app runs      | `EXPO_PUBLIC_API_URL`                                         |
| ----------------------- | ------------------------------------------------------------- |
| iOS simulator           | `http://localhost:3000`                                       |
| Android emulator        | `http://10.0.2.2:3000`                                        |
| Phone on the same Wi-Fi | `http://<your computer's LAN IP>:3000` (the script prints it) |

The API listens on every interface, so a phone on the same network can reach it. Uploads go straight from the device to S3 over HTTPS, so they work from a phone as well.

## Troubleshooting

- **Every request is 401**: `AUTH0_AUDIENCE` in `api/.env` differs from `EXPO_PUBLIC_AUTH0_AUDIENCE` in `mobile/.env`, or the app signed in against another tenant.
- **Port 5433 is taken**: set `POSTGRES_HOST_PORT` in `.env` and use the same port in `DATABASE_URL`.
- **Start over with an empty database**: `docker compose down -v` deletes the Compose database; run `npm run setup:local` again.
- **Uploads fail with 403 from S3**: the AWS key or bucket is wrong; the script's S3 check says the same.
