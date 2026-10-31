// Builds dist/function.zip for the nodejs22.x arm64 Lambda.
//
// Reproducible: Sharp's Linux binaries come from pnpm-lock.yaml with
// --frozen-lockfile, and the zip has sorted entries, fixed timestamps and
// modes, and no extra fields. The same commit builds the same bytes, so
// Terraform's source_code_hash only changes when the code does.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const install = path.join(dist, "install");
const stage = path.join(dist, "lambda");
const zipPath = path.join(dist, "function.zip");

/** Every staged file gets this mtime: 1980-01-01, the earliest a zip can store. */
const FIXED_TIME = new Date("1980-01-01T00:00:00Z");

rmSync(dist, { recursive: true, force: true });
mkdirSync(install, { recursive: true });
mkdirSync(stage, { recursive: true });

// Sharp is the only runtime dependency left external; everything else is bundled.
execFileSync(
  path.join(root, "node_modules", ".bin", "esbuild"),
  [
    path.join("src", "index.ts"),
    "--bundle",
    "--platform=node",
    "--target=node22",
    "--format=cjs",
    "--external:sharp",
    `--outfile=${path.join(stage, "index.js")}`,
  ],
  { stdio: "inherit", cwd: root },
);

// Install production dependencies for Linux arm64 (glibc) from the lockfile.
// The hoisted linker gives a flat, symlink-free node_modules like npm's.
for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
  copyFileSync(path.join(root, file), path.join(install, file));
}
execFileSync(
  "pnpm",
  [
    "install",
    "--frozen-lockfile",
    "--prod",
    "--ignore-scripts",
    "--os=linux",
    "--cpu=arm64",
    "--libc=glibc",
    "--node-linker=hoisted",
  ],
  { stdio: "inherit", cwd: install },
);

// Copy only Sharp and what it requires at runtime on that platform. A package
// directory is copied whole, so a dependency nested under it comes along.
// pnpm also installs the musl variants; a package whose os/cpu/libc fields
// exclude the Lambda is left out.
const TARGET = { os: "linux", cpu: "arm64", libc: "glibc" };
const modules = path.join(install, "node_modules");
const runtimePackages = new Set();
const addWithDependencies = (name, optional, parent) => {
  if (runtimePackages.has(name)) return;
  if (!existsSync(path.join(modules, name, "package.json"))) {
    const nested = parent && existsSync(path.join(modules, parent, "node_modules", name, "package.json"));
    if (optional || nested) return; // another platform's package, or copied with its parent
    throw new Error(`${name} is required${parent ? ` by ${parent}` : ""} but was not installed`);
  }
  const manifest = JSON.parse(readFileSync(path.join(modules, name, "package.json"), "utf8"));
  if (!Object.entries(TARGET).every(([field, value]) => !manifest[field] || manifest[field].includes(value))) return;
  runtimePackages.add(name);
  for (const dependency of Object.keys(manifest.dependencies ?? {})) addWithDependencies(dependency, false, name);
  for (const dependency of Object.keys(manifest.optionalDependencies ?? {}))
    addWithDependencies(dependency, true, name);
};
addWithDependencies("sharp", false);
for (const required of ["@img/sharp-linux-arm64", "@img/sharp-libvips-linux-arm64"]) {
  if (!runtimePackages.has(required)) throw new Error(`${required} was not installed; check pnpm-lock.yaml`);
}
for (const name of runtimePackages) {
  cpSync(path.join(modules, name), path.join(stage, "node_modules", name), { recursive: true, dereference: true });
}

const sharpVersion = JSON.parse(readFileSync(path.join(modules, "sharp", "package.json"), "utf8")).version;
writeFileSync(
  path.join(stage, "package.json"),
  `${JSON.stringify({ name: "everglow-image-processor-lambda", private: true, dependencies: { sharp: sharpVersion } }, null, 2)}\n`,
);

// Normalise what zip records: entry order, mtimes and modes.
const files = [];
const walk = (relative) => {
  const absolute = path.join(stage, relative);
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      walk(child);
      chmodSync(path.join(stage, child), 0o755);
      utimesSync(path.join(stage, child), FIXED_TIME, FIXED_TIME);
    } else {
      files.push(child);
      chmodSync(path.join(stage, child), 0o644);
      utimesSync(path.join(stage, child), FIXED_TIME, FIXED_TIME);
    }
  }
};
walk("");
files.sort(); // code-unit order, independent of locale and filesystem

// -X drops uid/gid and extended timestamps, -D directory entries; TZ pins the
// DOS timestamps zip derives from local time; -@ keeps the sorted order.
execFileSync("zip", ["-X", "-D", "-q", "-9", zipPath, "-@"], {
  cwd: stage,
  input: `${files.join("\n")}\n`,
  stdio: ["pipe", "inherit", "inherit"],
  env: { ...process.env, TZ: "UTC" },
});

const zip = readFileSync(zipPath);
const sha256 = createHash("sha256").update(zip).digest("hex");
console.log(`wrote ${zipPath} (${zip.byteLength} bytes, ${files.length} files, sharp ${sharpVersion})`);
console.log(`sha256 ${sha256}`);

// Keep a copy of the bundle out of the way; the zip is what Terraform deploys.
copyFileSync(path.join(stage, "index.js"), path.join(dist, "index.js"));
