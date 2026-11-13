// Shared env-file handling for the demo scripts (seed + reset).
//
// Credentials come ONLY from a local, git-ignored env file (default
// `.env.demo.local` in the repo root) or from variables already exported in
// the process environment. There are NO fallback defaults — a missing
// variable is a hard failure with the exact names listed.
//
// The file is never committed: `.env*` is in `.gitignore`. The service-role
// key in it must never leave the owner's local machine.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEMO_ENV_FILE_DEFAULT = ".env.demo.local";

/** Repo root (the scripts live in `<root>/scripts/`). */
export function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

/** Parse a `KEY=VALUE` env file. Comments (#) and blank lines are ignored. */
export function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip one layer of matching quotes (single or double).
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load credentials. `filePath` is the `--env` value (or null for the
 * default). A missing explicitly-passed file is fatal; a missing default
 * file just means "rely on exported process env vars".
 * Returns a lookup that prefers the process environment over the file.
 */
export function loadDemoEnv(filePath: string | null): Record<string, string> {
  const path = filePath ?? join(repoRoot(), DEMO_ENV_FILE_DEFAULT);
  let fromFile: Record<string, string> = {};
  if (existsSync(path)) {
    fromFile = parseEnvFile(path);
    console.log(`[demo] env file: ${path}`);
  } else if (filePath) {
    throw new Error(
      `Env file not found: ${path}\n` +
        `Create it from the template in docs/DEMO_DATA.md (placeholder values only).`,
    );
  } else {
    console.log(
      `[demo] no ${DEMO_ENV_FILE_DEFAULT} found — using exported environment variables.`,
    );
  }
  // Exported variables win over the file; the file fills in the rest.
  return { ...fromFile, ...pickDefined(process.env) };
}

function pickDefined(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

/**
 * Require the given variables. Throws a single clear error listing every
 * missing name (and where to put them). Never falls back to defaults.
 */
export function requireEnv(
  env: Record<string, string>,
  names: string[],
  fileHint: string,
): Record<string, string> {
  const missing = names.filter((n) => !env[n] || env[n].trim() === "");
  if (missing.length > 0) {
    throw new Error(
      `Missing required demo credential(s): ${missing.join(", ")}\n` +
        `Set them in ${fileHint} (see docs/DEMO_DATA.md for the exact template) ` +
        `or export them in your shell. No defaults are used.`,
    );
  }
  const out: Record<string, string> = {};
  for (const n of names) out[n] = env[n].trim();
  return out;
}

/** Parse `--env <path>` / `--force` style flags. Unknown flags are fatal. */
export function parseArgs(
  argv: string[],
  allowed: string[],
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const name = arg.slice(2);
    if (!allowed.includes(name)) {
      throw new Error(
        `Unknown flag: ${arg} (allowed: ${allowed.map((a) => `--${a}`).join(", ")})`,
      );
    }
    if (name === "env") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--env needs a file path, e.g. --env .env.demo.local");
      }
      out.env = value;
      i++;
    } else {
      out[name] = true;
    }
  }
  return out;
}

export function fail(message: string): never {
  console.error(`\n[demo] ERROR: ${message}\n`);
  process.exit(1);
}
