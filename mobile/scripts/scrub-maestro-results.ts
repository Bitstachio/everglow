/// <reference types="node" />

/**
 * Removes secret values from Maestro results before CI uploads them.
 *
 * Maestro writes every `-e NAME=value` it was given into `commands.json`, so a
 * results directory from the login smoke holds `E2E_PASSWORD` in plain text.
 * The repository is public and so are its workflow artifacts.
 *
 * Usage: pnpm exec tsx scripts/scrub-maestro-results.ts <dir> <ENV_NAME> [<ENV_NAME>...]
 *
 * Text files have each secret replaced with `***`. A binary file that contains
 * a secret is deleted, because rewriting bytes inside it would corrupt it. The
 * directory is scanned again afterwards, and the script exits 1 if any secret
 * is still present, so the workflow can refuse to upload.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REDACTED = "***";

/** Forms a secret can take inside Maestro output: raw, JSON-escaped and URL-encoded. */
export const secretForms = (secret: string): string[] => {
  const forms = new Set([secret, JSON.stringify(secret).slice(1, -1), encodeURIComponent(secret)]);
  return [...forms].filter((form) => form.length > 0);
};

const listFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
};

const isText = (buffer: Buffer): boolean => !buffer.includes(0);

const containsAny = (buffer: Buffer, forms: string[]): boolean => forms.some((form) => buffer.includes(form));

export type ScrubResult = {
  redacted: string[];
  deleted: string[];
  remaining: string[];
};

/** Scrubs every file under `dir`. Empty secret values are ignored. */
export const scrubDirectory = (dir: string, secrets: string[]): ScrubResult => {
  const forms = secrets.filter((secret) => secret && secret.length > 0).flatMap(secretForms);
  // Longest first, so a form that contains another is replaced whole.
  forms.sort((a, b) => b.length - a.length);
  const redacted: string[] = [];
  const deleted: string[] = [];
  if (forms.length === 0) return { redacted, deleted, remaining: [] };

  for (const file of listFiles(dir)) {
    const buffer = fs.readFileSync(file);
    if (!containsAny(buffer, forms)) continue;
    if (isText(buffer)) {
      let text = buffer.toString("utf8");
      for (const form of forms) text = text.split(form).join(REDACTED);
      fs.writeFileSync(file, text);
      redacted.push(file);
    } else {
      fs.rmSync(file, { force: true });
      deleted.push(file);
    }
  }

  const remaining = listFiles(dir).filter((file) => containsAny(fs.readFileSync(file), forms));
  return { redacted, deleted, remaining };
};

const main = (): void => {
  const [dir, ...envNames] = process.argv.slice(2);
  if (!dir || envNames.length === 0) {
    console.error("Usage: pnpm exec tsx scripts/scrub-maestro-results.ts <dir> <ENV_NAME> [<ENV_NAME>...]");
    process.exitCode = 1;
    return;
  }
  const secrets = envNames.map((name) => process.env[name] ?? "");
  const missing = envNames.filter((name, index) => secrets[index] === "");
  if (missing.length > 0) {
    console.log(`Not set, nothing to scrub for: ${missing.join(", ")}`);
  }
  const { redacted, deleted, remaining } = scrubDirectory(dir, secrets);
  const relative = (file: string) => path.relative(dir, file);
  for (const file of redacted) console.log(`Redacted secrets in ${relative(file)}`);
  for (const file of deleted) console.log(`Deleted binary file holding a secret: ${relative(file)}`);
  if (remaining.length > 0) {
    for (const file of remaining) console.error(`Secret still present in ${relative(file)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Scrubbed ${redacted.length + deleted.length} file(s) under ${dir}.`);
};

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) main();
