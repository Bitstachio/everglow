#!/usr/bin/env node

/**
 * Picks the iOS simulator the Mac smoke runs on, so the device does not drift
 * with the order `simctl list` happens to return.
 *
 * Usage: xcrun simctl list devices available -j | node scripts/pick-maestro-simulator.js
 *
 * Reads the pinned model and runtime from `SIM_DEVICE` (for example
 * `iPhone 17`) and `SIM_RUNTIME` (for example `iOS 26.5`). When the runner
 * image has the model but not the runtime, it falls back to the newest iOS
 * runtime that has the model and prints a GitHub `::warning::` so the drift is
 * visible on the run. When no runtime has the model, it exits 1 and lists every
 * available iPhone so the pin can be updated.
 *
 * On success it prints `udid=…`, `name=…` and `runtime=…` lines on stdout, in
 * the format `$GITHUB_OUTPUT` takes.
 */

const RUNTIME_KEY = /SimRuntime\.iOS-(\d+)-(\d+)(?:-(\d+))?$/;

/**
 * @param {string} key simctl runtime identifier, e.g. `com.apple.CoreSimulator.SimRuntime.iOS-26-5`
 * @returns {{ name: string, version: number[] } | null}
 */
const parseRuntime = (key) => {
  const match = RUNTIME_KEY.exec(key);
  if (!match) return null;
  const version = match.slice(1).map((part) => Number(part ?? 0));
  const shown = version[2] ? version.join(".") : version.slice(0, 2).join(".");
  return { name: `iOS ${shown}`, version };
};

const compareVersions = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

/**
 * Available iPhones grouped by iOS runtime, newest runtime first.
 * @param {{ devices?: Record<string, { name: string, udid: string, isAvailable?: boolean }[]> }} list
 */
const listIPhones = (list) =>
  Object.entries(list?.devices ?? {})
    .map(([key, devices]) => ({ runtime: parseRuntime(key), devices }))
    .filter((entry) => entry.runtime !== null)
    .map(({ runtime, devices }) => ({
      runtime,
      devices: devices.filter((device) => device.isAvailable !== false && device.name.startsWith("iPhone")),
    }))
    .filter((entry) => entry.devices.length > 0)
    .sort((a, b) => compareVersions(b.runtime.version, a.runtime.version));

/**
 * @param {Parameters<typeof listIPhones>[0]} list parsed `simctl list devices available -j`
 * @param {{ model: string, runtime: string }} pin
 * @returns {{ ok: true, udid: string, name: string, runtime: string, fallback: boolean } | { ok: false, available: string[] }}
 */
const pickSimulator = (list, pin) => {
  const runtimes = listIPhones(list);
  const withModel = runtimes
    .map((entry) => ({ runtime: entry.runtime, device: entry.devices.find((device) => device.name === pin.model) }))
    .filter((entry) => entry.device !== undefined);
  const pinned = withModel.find((entry) => entry.runtime.name === pin.runtime);
  const chosen = pinned ?? withModel[0];
  if (!chosen) {
    return {
      ok: false,
      available: runtimes.map((entry) => `${entry.runtime.name}: ${entry.devices.map((d) => d.name).join(", ")}`),
    };
  }
  return {
    ok: true,
    udid: chosen.device.udid,
    name: chosen.device.name,
    runtime: chosen.runtime.name,
    fallback: pinned === undefined,
  };
};

const main = () => {
  const model = process.env.SIM_DEVICE;
  const runtime = process.env.SIM_RUNTIME;
  if (!model || !runtime) {
    console.error("Set SIM_DEVICE (for example 'iPhone 17') and SIM_RUNTIME (for example 'iOS 26.5').");
    process.exitCode = 1;
    return;
  }
  const input = require("fs").readFileSync(0, "utf8");
  const result = pickSimulator(JSON.parse(input), { model, runtime });
  if (!result.ok) {
    console.error(`::error::No available '${model}' simulator on any iOS runtime. Update SIM_DEVICE in the workflow.`);
    console.error("Available iPhone simulators:");
    for (const line of result.available) console.error(`  ${line}`);
    if (result.available.length === 0) console.error("  (none)");
    process.exitCode = 1;
    return;
  }
  if (result.fallback) {
    console.error(
      `::warning::Pinned simulator '${model}' on '${runtime}' is not on this runner image. Using ${result.runtime} instead. Update SIM_RUNTIME in the workflow.`,
    );
  }
  console.log(`udid=${result.udid}`);
  console.log(`name=${result.name}`);
  console.log(`runtime=${result.runtime}`);
};

if (require.main === module) main();

module.exports = { parseRuntime, pickSimulator };
