/**
 * TaskOrbit Part 3 — AI + daily scheduler security tests.
 *
 * Runs against the live Supabase TEST project (taskorbit-test) ONLY, and
 * against a production build output for the client-bundle check. Never
 * run against production.
 *
 * What this file covers:
 *   (a) Gemini key not present in any client bundle — scans the built
 *       .next/static output for the literal "GEMINI" and, when a key is
 *       configured in the test env, for the key value itself. SKIPPED
 *       when no build output exists; run `npm run build` first, or set
 *       TASKORBIT_BUILD_DIR to a build output directory.
 *   (b) Developer cannot generate a manager-only AI feature via a direct
 *       request — SKIPPED in the runner (needs a live dev server + real
 *       logins, like the analytics case in api-attack.test.ts). The pure
 *       role gate is covered by tests/unit/ai-limits.test.ts; the live
 *       steps are in the skipped test's comments. NOT TESTED here.
 *   (c) User from workspace B cannot read workspace A's ai_summaries —
 *       SKIPPED: migration 0007 has NOT been applied to the test project
 *       yet, so the tables do not exist and this case cannot run. It must
 *       be run after 0007 is applied. NOT TESTED here — never claimed
 *       as passed.
 *
 * The suite must never fail just because the build output or the
 * migration is missing: those cases skip with a plain-language note.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function report(caseId: string, detail: string): void {
  // eslint-disable-next-line no-console
  console.log(`[CASE ${caseId}] ${detail}`);
}

function walkJs(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(full, out);
    else if (/\.js$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("AI client-bundle secrecy", () => {
  const buildDir = process.env.TASKORBIT_BUILD_DIR ?? path.resolve(process.cwd(), ".next");
  const staticDir = path.join(buildDir, "static");
  const hasBuild = existsSync(staticDir);

  it.skipIf(!hasBuild)(
    "no GEMINI string (and no configured key value) in any client bundle",
    () => {
      const files = walkJs(staticDir);
      expect(files.length).toBeGreaterThan(0);
      const key = process.env.GEMINI_API_KEY?.trim() || "";
      const hits: string[] = [];
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        if (src.includes("GEMINI")) hits.push(`${path.relative(buildDir, file)}: "GEMINI"`);
        if (key && src.includes(key)) hits.push(`${path.relative(buildDir, file)}: key value`);
        if (src.includes("NEXT_PUBLIC_GEMINI")) hits.push(`${path.relative(buildDir, file)}: "NEXT_PUBLIC_GEMINI"`);
      }
      report(
        "ai-bundle",
        hasBuild
          ? `${files.length} client JS files scanned in ${buildDir}; GEMINI/key hits: ${hits.length === 0 ? "none" : hits.join("; ")}`
          : "no build output",
      );
      expect(hits).toEqual([]);
    },
  );

  it("reports plainly when no build output exists (run npm run build first)", () => {
    if (!hasBuild) {
      report(
        "ai-bundle",
        `NOT TESTED — no build output at ${staticDir}. Run \`npm run build\`, or set TASKORBIT_BUILD_DIR to a build output directory, then re-run.`,
      );
    }
    expect(true).toBe(true);
  });
});

describe("AI role enforcement (live)", () => {
  it.skip("NOT TESTED in the runner: developer cannot generate a manager-only AI feature via direct request", () => {
    // VERIFIED LIVE 2026-11-12 (Track D) against the production copy on
    // :3100 (isolated build; the dev server's action ids differ, so the
    // dev :3000 POST 404s — use the build copy's manifest id).
    // Developer direct Next-Action POST of generateAiFeature("daily_brief")
    // -> HTTP 200 with exactly:
    //   {"ok":false,"error":"Only the workspace manager can use this AI feature."}
    // and NO brief content, project names or task titles.
    // Manager control POST of the same call -> HTTP 200 with:
    //   {"ok":false,"error":"TaskOrbit AI is not configured yet.","notConfigured":true}
    // which proves the call path works and the developer denial comes from
    // the role gate (lib/actions/ai.ts checks canGenerateFeature before
    // the configured check and before loading any data). The role gate is
    // NOT blocked by migration 0007 being unapplied.
    // Reproduce: mint the @supabase/ssr session cookie ("base64-" +
    // base64url(session JSON)) + taskorbit-workspace-id for "Test
    // Workspace"; build the body with the client-side encodeReply from
    // react-server-dom-webpack (encodeReply(["daily_brief", {}])) — a
    // hand-built FormData with fields "0"/"1" 500s (flight encoding);
    // POST to /dashboard/ai with header
    // Next-Action: 60f1445153307439f19a8ed53dfed3dde89ea729da
    // (generateAiFeature, from .next/server/server-reference-manifest.json
    // of the build copy). The pure role gate (canGenerateFeature) is also
    // covered by tests/unit/ai-limits.test.ts and runs in `npm test`.
    report("ai-role", "VERIFIED LIVE 2026-11-12 (see comments) — still skipped in the runner (needs a live server).");
  });
});

describe("AI RLS (live, needs migration 0007)", () => {
  it.skip("NOT TESTED: user from workspace B cannot read workspace A's ai_summaries", () => {
    // Migration 0007 (ai_summaries / ai_usage / daily_job_runs) has NOT
    // been applied to the test project, so the tables do not exist and
    // this case cannot run. Do NOT mark it passed.
    // After applying 0007 (see the migration header for how), run:
    //   1. As the manager of workspace A, generate a daily brief (or
    //      insert a row via save_ai_summary) so one ai_summaries row
    //      exists in A.
    //   2. As a member of workspace B only, select from ai_summaries
    //      with the publishable key: expect 0 rows.
    //   3. As the same user, select ai_summaries with workspace_id = A:
    //      expect 0 rows (RLS, not a filter).
    //   4. As a developer in A, select their own my_focus row: 1 row;
    //      another developer's my_focus row: 0 rows.
    report("ai-rls", "NOT TESTED — migration 0007 not applied to the test project; see the test comments.");
  });
});
