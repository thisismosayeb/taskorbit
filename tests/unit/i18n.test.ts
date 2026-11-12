// i18n dictionary coverage: every t('...') key used in the UI source must
// exist in lib/i18n/en.ts, and every dictionary value must be a non-empty
// string. This is what makes a missing key fail loudly instead of rendering
// the raw key in the UI.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { en } from "@/lib/i18n/en";
import { bn } from "@/lib/i18n/bn";
import { createTranslator, t, translate } from "@/lib/i18n";

const ROOT = path.resolve(__dirname, "../..");

// Source scanned for t('...') usages: everything that renders UI text.
// (lib/i18n itself is excluded — its doc comments mention example keys.)
const SCAN_DIRS = [path.join(ROOT, "components"), path.join(ROOT, "app")];
const SCAN_FILES = [
  "lib/activity/format.ts",
  "lib/analytics.ts",
  "lib/board-permissions.ts",
  "lib/date/deadline.ts",
  "lib/date/relative.ts",
  "lib/progress.ts",
  "lib/validators.ts",
].map((f) => path.join(ROOT, f));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function usedKeys(): Map<string, string[]> {
  const files = [...SCAN_DIRS.flatMap(walk), ...SCAN_FILES];
  const found = new Map<string, string[]>();
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    for (const match of src.matchAll(/\bt\(\s*["']([^"']+)["']/g)) {
      const key = match[1];
      const list = found.get(key) ?? [];
      list.push(path.relative(ROOT, file));
      found.set(key, list);
    }
  }
  return found;
}

function lookup(dict: unknown, key: string): unknown {
  let current: unknown = dict;
  for (const part of key.split(".")) {
    if (current !== null && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function leaves(dict: unknown, prefix = ""): [string, unknown][] {
  if (dict !== null && typeof dict === "object" && !Array.isArray(dict)) {
    return Object.entries(dict as Record<string, unknown>).flatMap(([k, v]) =>
      leaves(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [[prefix, dict]];
}

describe("i18n dictionary", () => {
  it("every t('...') key used in the UI exists in the dictionary", () => {
    const keys = usedKeys();
    expect(keys.size).toBeGreaterThan(0);
    const missing = [...keys.entries()]
      .filter(([key]) => lookup(en, key) === undefined)
      .map(([key, files]) => `${key} (used in ${[...new Set(files)].join(", ")})`);
    expect(missing).toEqual([]);
  });

  it("every dictionary value is a non-empty string", () => {
    const bad = leaves(en).filter(
      ([, value]) => typeof value !== "string" || value.trim().length === 0,
    );
    expect(bad).toEqual([]);
  });

  it("interpolates {params} and leaves unknown placeholders visible", () => {
    expect(t("tasks.completeBlocked", { done: 2, total: 3 })).toBe(
      "Complete all subtasks first (2 of 3 done).",
    );
    expect(t("common.taskCount", { count: 1, countS: "" })).toBe("1 task");
    expect(t("common.taskCount", { count: 2, countS: "s" })).toBe("2 tasks");
    expect(t("tasks.statusTodo")).toBe("To do");
  });

  it("a missing key returns the key itself (never an empty string)", () => {
    expect(t("no.such.key")).toBe("no.such.key");
  });

  it("en and bn have exactly the same keys (a missing Bangla key fails the build)", () => {
    const enKeys = new Set(leaves(en).map(([key]) => key));
    const bnKeys = new Set(leaves(bn).map(([key]) => key));
    const missingInBn = [...enKeys].filter((k) => !bnKeys.has(k));
    const extraInBn = [...bnKeys].filter((k) => !enKeys.has(k));
    expect(missingInBn).toEqual([]);
    expect(extraInBn).toEqual([]);
    // The dictionaries are large; a silent shrink would hide missing keys.
    expect(enKeys.size).toBeGreaterThan(500);
  });

  it("every Bangla value is a non-empty string", () => {
    const bad = leaves(bn).filter(
      ([, value]) => typeof value !== "string" || value.trim().length === 0,
    );
    expect(bad).toEqual([]);
  });

  it("Bangla interpolation works and never leaks the English template", () => {
    expect(translate("tasks.completeBlocked", { done: 2, total: 3 }, "bn")).toBe(
      "আগে সব সাবটাস্ক শেষ করুন (3টির মধ্যে 2টি শেষ হয়েছে)।",
    );
    expect(createTranslator("bn")("deadline.overdue")).toBe("মেয়াদোত্তীর্ণ");
    expect(createTranslator("bn")("common.taskCount", { count: 1 })).toBe("1টি টাস্ক");
    // NOTE: t() substitutes params verbatim — it does not convert digits.
    // Dates and standalone numbers go through lib/i18n/format.ts, which
    // renders Bengali digits in Bangla; interpolated counts stay in the
    // digits the caller passed. Deliberate: converting digits inside a
    // substituted value would also rewrite digits inside user content
    // (task titles, emails) embedded in the same template.
    expect(createTranslator("en")("common.taskCount", { count: 1, countS: "" })).toBe("1 task");
    // The app name is identical in both locales (locale-invariant).
    expect(createTranslator("bn")("app.name")).toBe("TaskOrbit");
  });

  it("every client file that calls t() subscribes with useLocale()", () => {
    // t() reads the module-level client locale store; a client component
    // only re-renders on a language switch if it (or an ancestor) calls
    // useLocale(). Server files use createTranslator(locale) instead.
    const files = [...SCAN_DIRS.flatMap(walk)];
    const offenders: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      const head = src.slice(0, 3000);
      const i = head.indexOf("import ");
      const prelude = i >= 0 ? head.slice(0, i) : head;
      const isClient = /["']use client["']/.test(prelude);
      if (!isClient) continue;
      if (!/\bt\(\s*["']/.test(src)) continue;
      if (!/\buseLocale\b/.test(src)) offenders.push(path.relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });
});
