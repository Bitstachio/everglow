#!/usr/bin/env node

/**
 * Picks the iOS simulator the Mac smoke runs on, so the device does not drift
 * with the order `simctl list` happens to return.
 *
 * Usage: xcrun simctl list devices available -j | node scripts/pick-maestro-simulator.ts
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
 *
 * The Mac smoke job runs this with `node` before `pnpm install`, so the
 * simulator can boot while dependencies install. It stays free of packages
 * for that reason.
 */

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const RUNTIME_KEY = /SimRuntime\.iOS-(\d+)-(\d+)(?:-(\d+))?$/;

export type SimulatorRuntime = { name: string; version: number[] };

type SimDevice = { name: string; udid: string; isAvailable?: boolean };

export type SimctlList = { devices?: Record<string, SimDevice[]> };

type RuntimeDevices = { runtime: SimulatorRuntime; devices: SimDevice[] };

export type SimulatorPin = { model: string; runtime: string };

export type PickSuccess = {
  ok: true;
  udid: string;
  name: string;
  runtime: string;
  fallback: boolean;
};

export type PickFailure = { ok: false; available: string[] };

/**
 * @param key simctl runtime identifier, e.g. `com.apple.CoreSimulator.SimRuntime.iOS-26-5`
 */
export const parseRuntime = (key: string): SimulatorRuntime | null => {
  const match = RUNTIME_KEY.exec(key);
  if (!match) return null;
  const version = match.slice(1).map((part) => Number(part ?? 0));
  const shown = version[2] ? version.join(".") : version.slice(0, 2).join(".");
  return { name: `iOS ${shown}`, version };
};

const compareVersions = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

/** Available iPhones grouped by iOS runtime, newest runtime first. */
const listIPhones = (list: SimctlList): RuntimeDevices[] =>
  Object.entries(list.devices ?? {})
    .flatMap(([key, devices]) => {
      const runtime = parseRuntime(key);
      if (!runtime) return [];
      const iphones = devices.filter((device) => device.isAvailable !== false && device.name.startsWith("iPhone"));
      return iphones.length > 0 ? [{ runtime, devices: iphones }] : [];
    })
    .sort((a, b) => compareVersions(b.runtime.version, a.runtime.version));

/**
 * @param list parsed `simctl list devices available -j`
 */
export const pickSimulator = (list: SimctlList, pin: SimulatorPin): PickSuccess | PickFailure => {
  const runtimes = listIPhones(list);
  const withModel = runtimes.flatMap((entry) => {
    const device = entry.devices.find((item) => item.name === pin.model);
    return device ? [{ runtime: entry.runtime, device }] : [];
  });
  const pinned = withModel.find((entry) => entry.runtime.name === pin.runtime);
  const chosen = pinned ?? withModel[0];
  if (!chosen) {
    return {
      ok: false,
      available: runtimes.map(
        (entry) => `${entry.runtime.name}: ${entry.devices.map((device) => device.name).join(", ")}`,
      ),
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

const main = (): void => {
  const model = process.env.SIM_DEVICE;
  const runtime = process.env.SIM_RUNTIME;
  if (!model || !runtime) {
    console.error("Set SIM_DEVICE (for example 'iPhone 17') and SIM_RUNTIME (for example 'iOS 26.5').");
    process.exitCode = 1;
    return;
  }
  const input = fs.readFileSync(0, "utf8");
  const result = pickSimulator(JSON.parse(input) as SimctlList, { model, runtime });
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

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) main();
