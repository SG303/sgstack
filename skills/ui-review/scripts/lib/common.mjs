// Shared helpers for the ui-review scripts: argument parsing, config loading, JSON IO.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Parses `--key value`, `--flag` and positional arguments.
export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

export function readJSON(file, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw new Error(`cannot read JSON ${file}: ${err.message}`);
  }
}

export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

export function deepMerge(base, override) {
  if (!isObject(base) || !isObject(override)) return override === undefined ? base : override;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) out[k] = deepMerge(base[k], v);
  return out;
}

// Defaults < project file (ui-review.config.json in cwd) < explicit --config file.
export function loadConfig(explicitPath) {
  let cfg = readJSON(path.join(SKILL_DIR, "config/defaults.json"));
  const projectFile = path.resolve("ui-review.config.json");
  if (fs.existsSync(projectFile)) cfg = deepMerge(cfg, readJSON(projectFile));
  if (explicitPath && fs.existsSync(explicitPath)) cfg = deepMerge(cfg, readJSON(explicitPath));
  return cfg;
}

export function die(msg, code = 1) {
  console.error(`error: ${msg}`);
  process.exit(code);
}

export function log(...parts) {
  console.error("[ui-review]", ...parts);
}

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function round(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

// Lists iteration directories (iter-0, iter-1, ...) of a run in numeric order.
export function listIterations(runDir) {
  if (!fs.existsSync(runDir)) return [];
  return fs
    .readdirSync(runDir)
    .filter((d) => /^iter-\d+$/.test(d))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
    .map((d) => path.join(runDir, d));
}
