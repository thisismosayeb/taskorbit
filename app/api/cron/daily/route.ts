// Daily scheduler — Vercel Cron endpoint (Part 3, spec section 9).
//
// GET /api/cron/daily, once per day at 02:00 UTC (08:00 Dhaka) via
// vercel.json. Protected by CRON_SECRET: any caller without the exact
// `Authorization: Bearer <secret>` header gets 401. No secret is ever
// logged or returned.
//
// Jobs (each workspace, each failure isolated so one bad workspace never
// stops the others, and the app is unaffected):
//   1. Due-soon + overdue notifications — via the SECURITY DEFINER
//      run_daily_reminders_all() RPC (migration 0007). Idempotent per
//      workspace per local date (daily_job_runs); a second run the same
//      day does nothing extra. Notification generation stays in the
//      database, per DECISIONS.md — this route never inserts into
//      notifications itself, and no service-role key is used anywhere.
//   2. Daily Brief — for each workspace with recent activity, only if
//      AI is configured and within the workspace daily limit. The brief
//      input comes from the SECURITY DEFINER get_daily_brief_input() RPC
//      (minimal data only); the digest check reuses today's cached brief
//      when the input is unchanged. The "Generate today's brief" button
//      on /dashboard/ai is the manual fallback for this job.
//
// The route uses the publishable-key client with no session (the cron
// caller has none), so it only calls the SECURITY DEFINER RPCs — it
// cannot read or write workspace data directly under RLS. Counts only
// are logged.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AI_LIMITS, getGeminiModel, isAiConfigured } from "@/lib/ai/config";
import { isValidCronAuth } from "@/lib/ai/cron-auth";
import { generateFeature } from "@/lib/ai/generate";
import type { AiInputData } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReminderResult {
  workspace_id: string;
  local_date: string;
  already_run: boolean;
  due_soon: number;
  overdue: number;
}

interface BriefInput {
  workspace: { id: string; name: string; timezone: string };
  localDate: string;
  projects: { id: string; name: string; status: string }[];
  tasks: {
    id: string;
    projectId: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    completedAt: string | null;
    assigneeFirstName: string | null;
    isSubtask: boolean;
  }[];
  recentComments: {
    text: string;
    authorFirstName: string;
    taskTitle: string;
    createdAt: string;
  }[];
  recentActivityCount: number;
  cachedDigest: string | null;
  workspaceUsageToday: number;
}

function anonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

export async function GET(request: Request) {
  if (!isValidCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const summary = {
    reminders: { workspaces: 0, alreadyRun: 0, dueSoon: 0, overdue: 0, failed: 0 },
    briefs: { generated: 0, cached: 0, skipped: 0, failed: 0 },
  };

  const supabase = anonClient();

  // Job 1 — reminders for every workspace (idempotent in the database).
  let reminderRows: ReminderResult[] = [];
  try {
    const { data, error } = await supabase.rpc("run_daily_reminders_all");
    if (error) throw new Error(error.message);
    const parsed = (data ?? {}) as { workspaces?: ReminderResult[] };
    reminderRows = parsed.workspaces ?? [];
    for (const row of reminderRows) {
      summary.reminders.workspaces += 1;
      if (row.already_run) summary.reminders.alreadyRun += 1;
      summary.reminders.dueSoon += row.due_soon ?? 0;
      summary.reminders.overdue += row.overdue ?? 0;
    }
  } catch (err) {
    // Reminders failed as a whole: log counts only, keep going to briefs.
    summary.reminders.failed += 1;
    console.error("[cron/daily] reminders failed:", err instanceof Error ? err.message : "unknown error");
  }

  // Job 2 — daily brief per workspace (only with recent activity, only
  // if AI is configured and within the workspace daily limit).
  if (isAiConfigured()) {
    for (const row of reminderRows) {
      const workspaceId = row.workspace_id;
      try {
        const { data, error } = await supabase.rpc("get_daily_brief_input", { p_workspace_id: workspaceId });
        if (error) throw new Error(error.message);
        const input = data as unknown as BriefInput | null;
        if (!input) {
          summary.briefs.skipped += 1;
          continue;
        }
        if (input.recentActivityCount === 0) {
          summary.briefs.skipped += 1;
          continue;
        }
        if (input.workspaceUsageToday >= AI_LIMITS.workspacePerDay) {
          summary.briefs.skipped += 1;
          continue;
        }

        const aiInput: AiInputData = {
          workspaceName: input.workspace.name,
          timezone: input.workspace.timezone,
          localDate: input.localDate,
          locale: "en",
          projects: input.projects ?? [],
          tasks: input.tasks ?? [],
          comments: input.recentComments ?? [],
          recentActivity: [`${input.recentActivityCount} activity entries in the last 24 hours`],
        };

        const result = await generateFeature({
          supabase,
          feature: "daily_brief",
          workspaceId,
          userId: null,
          locale: "en",
          localDate: input.localDate,
          data: aiInput,
          knownCachedDigest: input.cachedDigest,
          knownWorkspaceUsageToday: input.workspaceUsageToday,
        });
        if (result.ok) {
          // generateFeature saves via save_ai_summary, which the cron
          // caller may use for a daily_brief because today's reminders
          // job has run (see 0007_ai.sql, cron_write_allowed).
          if (result.cached) summary.briefs.cached += 1;
          else summary.briefs.generated += 1;
        } else {
          summary.briefs.failed += 1;
          console.error(`[cron/daily] brief failed for workspace ${workspaceId}:`, result.error);
        }
      } catch (err) {
        summary.briefs.failed += 1;
        console.error(`[cron/daily] brief failed for workspace ${workspaceId}:`, err instanceof Error ? err.message : "unknown error");
      }
    }
  } else {
    summary.briefs.skipped += reminderRows.length;
  }

  // Log a summary (counts only — never data, never secrets).
  console.log("[cron/daily]", JSON.stringify({ ...summary, model: getGeminiModel() }));

  return NextResponse.json({ ok: true, ...summary });
}
