/// <reference types="node" />

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { scrubDirectory, secretForms } from "./scrub-maestro-results";

const SECRET = 'p@ss "word"/1';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-scrub-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const write = (relative: string, content: string | Buffer): string => {
  const file = path.join(dir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};

test("redacts the secret from Maestro's commands.json", () => {
  const file = write(
    "run/Log in/commands.json",
    JSON.stringify({ env: { E2E_PASSWORD: SECRET, APP_ID: "com.example" } }, null, 2),
  );

  const result = scrubDirectory(dir, [SECRET]);

  const text = fs.readFileSync(file, "utf8");
  expect(text).not.toContain(JSON.stringify(SECRET).slice(1, -1));
  expect(JSON.parse(text).env).toEqual({ E2E_PASSWORD: "***", APP_ID: "com.example" });
  expect(result).toEqual({ redacted: [file], deleted: [], remaining: [] });
});

test("redacts raw and URL-encoded forms in logs", () => {
  const file = write("attempt-1.log", `typed ${SECRET}\nGET /login?p=${encodeURIComponent(SECRET)}\n`);

  scrubDirectory(dir, [SECRET]);

  expect(fs.readFileSync(file, "utf8")).toBe("typed ***\nGET /login?p=***\n");
});

test("deletes a binary file that holds the secret", () => {
  const file = write("screenshot.png", Buffer.concat([Buffer.from([0x89, 0, 0]), Buffer.from(SECRET)]));

  const result = scrubDirectory(dir, [SECRET]);

  expect(fs.existsSync(file)).toBe(false);
  expect(result.deleted).toEqual([file]);
  expect(result.remaining).toEqual([]);
});

test("leaves files without the secret untouched", () => {
  const file = write("report.xml", "<testsuites/>");
  const before = fs.statSync(file).mtimeMs;

  const result = scrubDirectory(dir, [SECRET]);

  expect(fs.readFileSync(file, "utf8")).toBe("<testsuites/>");
  expect(fs.statSync(file).mtimeMs).toBe(before);
  expect(result).toEqual({ redacted: [], deleted: [], remaining: [] });
});

test("ignores an empty secret and a missing directory", () => {
  write("report.xml", "<testsuites/>");
  expect(scrubDirectory(dir, [""])).toEqual({ redacted: [], deleted: [], remaining: [] });
  expect(scrubDirectory(path.join(dir, "missing"), [SECRET]).remaining).toEqual([]);
});

test("lists each distinct form once", () => {
  expect(secretForms("plain")).toEqual(["plain"]);
  expect(secretForms(SECRET)).toHaveLength(3);
});
