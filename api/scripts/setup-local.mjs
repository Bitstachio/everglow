#!/usr/bin/env node
// One-command local setup for the API: npm run setup:local [-- --start]
//
// Prepares a developer machine to run the API against their own Postgres and
// the shared dev bucket. Safe to re-run: it never overwrites .env and every
// step is idempotent. docs/local-setup.md explains each step and where the
// values in .env come from.
//
// Only Node built-ins until dependencies are installed, because this runs
// before `npm ci` on a fresh clone.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(API_DIR, ".env");
const ENV_EXAMPLE_PATH = join(API_DIR, ".env.example");
const MIN_NODE_MAJOR = 22;
const COMPOSE_DB_PORT_DEFAULT = "5433";

// The API does not start without these (see .env.example, "Required").
const REQUIRED = [
  "DATABASE_URL",
  "AUTH0_DOMAIN",
  "AUTH0_AUDIENCE",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_S3_BUCKET",
];

// Optional credentials, and what is missing without them.
const OPTIONAL_FEATURES = [
  {
    keys: ["AUTH0_MANAGEMENT_CLIENT_ID", "AUTH0_MANAGEMENT_CLIENT_SECRET"],
    feature: "account deletion and password change (DELETE /users/me, POST /users/me/password-change-ticket)",
  },
  { keys: ["AUTH0_NATIVE_CLIENT_ID"], feature: "password change (POST /users/me/password-change-ticket)" },
];

// Jobs that delete shared data. On a developer machine they would act on the
// shared Auth0 tenant or bucket from a private database.
const MUST_STAY_OFF = ["ACCOUNT_DELETION_RECONCILER_ENABLED", "PHOTO_ORPHAN_RECONCILER_ENABLED"];

const PLACEHOLDER = /your-/;

const color = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = color(1);
const green = color(32);
const yellow = color(33);
const red = color(31);

const step = (title) => console.log(`\n${bold(title)}`);
const ok = (message) => console.log(`  ${green("✓")} ${message}`);
const warn = (message) => console.log(`  ${yellow("!")} ${message}`);
const fail = (message, hint) => {
  console.error(`  ${red("✗")} ${message}`);
  if (hint) console.error(`    ${hint}`);
  process.exit(1);
};

const run = (command, args, options = {}) =>
  spawnSync(command, args, { cwd: API_DIR, stdio: "inherit", shell: process.platform === "win32", ...options });

const runQuietly = (command, args) => run(command, args, { stdio: "pipe", encoding: "utf8" });

/** KEY=VALUE lines, ignoring comments; surrounding quotes removed. */
function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}

function checkNode() {
  step("Node.js");
  const major = Number(process.versions.node.split(".")[0]);
  if (major < MIN_NODE_MAJOR) {
    fail(`Node ${process.versions.node} is too old.`, `Install Node ${MIN_NODE_MAJOR} (CI uses ${MIN_NODE_MAJOR}).`);
  }
  ok(`Node ${process.versions.node}`);
}

function loadEnv() {
  step("Environment (.env)");
  if (!existsSync(ENV_PATH)) {
    copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
    warn("Created .env from .env.example.");
  }
  const env = parseEnv(readFileSync(ENV_PATH, "utf8"));

  const missing = REQUIRED.filter((key) => !env[key] || PLACEHOLDER.test(env[key]));
  if (missing.length > 0) {
    fail(
      `Fill in these values in api/.env, then run this again: ${missing.join(", ")}`,
      'Ask the API owner for the shared dev values (docs/local-setup.md, "What to ask for").',
    );
  }
  ok("Required values are set");

  const enabled = MUST_STAY_OFF.filter((key) => env[key] === "true");
  if (enabled.length > 0) {
    fail(
      `${enabled.join(", ")} must stay off on a developer machine.`,
      "They delete data in the shared Auth0 tenant or bucket. Remove the line or set it to false.",
    );
  }

  for (const { keys, feature } of OPTIONAL_FEATURES) {
    if (keys.some((key) => !env[key] || PLACEHOLDER.test(env[key]))) {
      warn(`${keys.join(" and ")} not set: ${feature} will answer 500. Everything else works.`);
    }
  }
  return env;
}

function installDependencies() {
  step("Dependencies");
  const marker = join(API_DIR, "node_modules", ".package-lock.json");
  const lockfile = join(API_DIR, "package-lock.json");
  if (existsSync(marker) && statSync(marker).mtimeMs >= statSync(lockfile).mtimeMs) {
    ok("Up to date");
    return;
  }
  // postinstall runs prisma generate.
  if (run("npm", ["ci"]).status !== 0) fail("npm ci failed.");
  ok("Installed");
}

function startDatabase(env) {
  step("Database");
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    fail("DATABASE_URL is not a valid URL.");
  }

  const composePort = env.POSTGRES_HOST_PORT || COMPOSE_DB_PORT_DEFAULT;
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (!isLocal || url.port !== composePort) {
    ok(`Using the Postgres at ${url.hostname}:${url.port || "5432"} (not managed by this script)`);
    return;
  }

  if (runQuietly("docker", ["info"]).status !== 0) {
    fail(
      "DATABASE_URL points at the Docker Compose Postgres, but Docker is not running.",
      "Start Docker Desktop and run this again, or point DATABASE_URL at a Postgres you run yourself.",
    );
  }
  if (run("docker", ["compose", "up", "--detach", "--wait", "db"]).status !== 0) {
    fail("Could not start Postgres with Docker Compose.");
  }
  ok(`Postgres is running on localhost:${composePort}`);
}

function applyMigrations() {
  step("Migrations");
  if (run("npx", ["prisma", "migrate", "deploy"]).status !== 0) {
    fail("prisma migrate deploy failed.", "Check that DATABASE_URL is right and the database is reachable.");
  }
  ok("Database schema is up to date");
}

async function checkAuth0(env) {
  step("Auth0");
  try {
    const response = await fetch(`https://${env.AUTH0_DOMAIN}/.well-known/openid-configuration`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    ok(`Tenant ${env.AUTH0_DOMAIN} is reachable`);
  } catch (error) {
    fail(`Could not reach Auth0 tenant ${env.AUTH0_DOMAIN}: ${error.message}`, "Check AUTH0_DOMAIN.");
  }
}

async function checkS3(env) {
  step("S3");
  // Imported here: the SDK only exists after installDependencies.
  const { S3Client, HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: env.AWS_REGION,
    credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
  });
  try {
    // A key that never exists: 404 proves the credentials, the bucket and the
    // ListBucket permission the upload confirm flow relies on; 403 means one is wrong.
    await client.send(new HeadObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: "setup-local/does-not-exist" }));
    ok(`Bucket ${env.AWS_S3_BUCKET} is reachable`);
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404) {
      ok(`Bucket ${env.AWS_S3_BUCKET} is reachable with these credentials`);
    } else if (status === 403) {
      fail(
        `S3 refused access to ${env.AWS_S3_BUCKET} (403).`,
        "Check AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_S3_BUCKET.",
      );
    } else {
      fail(`Could not reach S3: ${error?.name ?? error}`, "Check AWS_REGION and your network.");
    }
  } finally {
    client.destroy();
  }
}

function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    const found = addresses?.find((address) => address.family === "IPv4" && !address.internal);
    if (found) return found.address;
  }
  return null;
}

function printNextSteps(env, willStart) {
  const port = env.PORT || "3000";
  const lan = lanAddress();
  console.log(`\n${green(bold("Ready."))}${willStart ? " Starting the API..." : ""}\n`);
  if (!willStart) console.log(`  Start the API:      ${bold("npm run start:dev")}`);
  console.log(`  Swagger:            http://localhost:${port}/api/docs`);
  console.log(`\n  EXPO_PUBLIC_API_URL in mobile/.env:`);
  console.log(`    iOS simulator      http://localhost:${port}`);
  console.log(`    Android emulator   http://10.0.2.2:${port}`);
  if (lan) console.log(`    Phone on Wi-Fi     http://${lan}:${port}`);
  console.log("");
}

async function main() {
  const willStart = process.argv.includes("--start");
  console.log(bold("Everglow API local setup"));

  checkNode();
  const env = loadEnv();
  installDependencies();
  startDatabase(env);
  applyMigrations();
  await checkAuth0(env);
  await checkS3(env);
  printNextSteps(env, willStart);

  if (willStart) process.exit(run("npm", ["run", "start:dev"]).status ?? 0);
}

main().catch((error) => fail(error?.stack ?? String(error)));
