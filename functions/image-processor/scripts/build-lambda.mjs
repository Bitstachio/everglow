import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const stage = path.join(dist, "lambda");
const zipPath = path.join(dist, "function.zip");

rmSync(dist, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

execFileSync(
  path.join(root, "node_modules", ".bin", "esbuild"),
  [
    path.join(root, "src", "index.ts"),
    "--bundle",
    "--platform=node",
    "--target=node22",
    "--format=cjs",
    "--external:sharp",
    `--outfile=${path.join(stage, "index.js")}`,
  ],
  { stdio: "inherit", cwd: root },
);

writeFileSync(
  path.join(stage, "package.json"),
  JSON.stringify(
    {
      name: "everglow-image-processor-lambda",
      private: true,
      dependencies: {
        sharp: "^0.34.4",
      },
    },
    null,
    2,
  ),
);

// Lambda is nodejs22.x on arm64 (Amazon Linux). Install matching sharp binaries.
execFileSync(
  "npm",
  ["install", "--omit=dev", "--os=linux", "--cpu=arm64", "--libc=glibc"],
  { stdio: "inherit", cwd: stage, env: { ...process.env, npm_config_ignore_scripts: "false" } },
);

rmSync(zipPath, { force: true });
execFileSync("zip", ["-r", "-q", zipPath, "."], { stdio: "inherit", cwd: stage });

const bytes = execFileSync("wc", ["-c", zipPath], { encoding: "utf8" }).trim();
console.log(`wrote ${zipPath} (${bytes.split(/\s+/)[0]} bytes)`);

// Keep a copy of the staged tree out of the way; zip is what Terraform deploys.
cpSync(path.join(stage, "index.js"), path.join(dist, "index.js"));
