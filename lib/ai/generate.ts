// TaskOrbit AI — generation orchestration (Part 3, spec section 8).
//
// One path for the server action and the daily cron: build the minimised
// input, reuse the cache when the input digest is unchanged, enforce the
// limits, call Gemini, validate the JSON with Zod, drop references to
// tasks/projects that were not in the input, then cache + log usage.
//
// AI only reads and suggests — this module never writes tasks, statuses
// or assignments. Errors are friendly messages, never raw model text.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AI_LIMITS, getGeminiModel, isAiConfigured } from "./config";
import type { AiFeature } from "./features";
import { filterReferences, validateAiOutput, type AiOutput } from "./schemas";
import { buildPrompt, truncateInput, type AiInputData } from "./prompts";
import {
  checkMemoryHourlyLimit,
  computeDigest,
  userHourlyAllowed,
  workspaceDailyAllowed,
} from "./limits";
import { generateText, parseModelJson } from "./gemini";
import {
  countUserUsageLastHour,
  countWorkspaceUsageToday,
  logUsage,
  readCachedSummary,
  saveSummary,
  type SummaryScope,
} from "./cache";

type Client = SupabaseClient<Database>;

export type GenerateResult<F extends AiFeature = AiFeature> =
  | { ok: true; content: AiOutput[F]; cached: boolean; generatedAt: string; model: string; droppedRefs: number }
  | { ok: false; error: string; limitReached?: boolean; notConfigured?: boolean };

export interface GenerateOptions<F extends AiFeature = AiFeature> {
  supabase: Client;
  feature: F;
  workspaceId: string;
  projectId?: string | null;
  /** Null for the cron route (system-generated). */
  userId: string | null;
  locale: "en" | "bn";
  localDate: string;
  data: AiInputData;
  /** Cron path: digest of today's cached brief, from get_daily_brief_input. */
  knownCachedDigest?: string | null;
  /** Cron path: today's workspace usage count, from get_daily_brief_input. */
  knownWorkspaceUsageToday?: number | null;
}

const FRIENDLY_ERROR = "TaskOrbit AI could not generate this right now. Please try again.";

export async function generateFeature<F extends AiFeature>(opts: GenerateOptions<F>): Promise<GenerateResult<F>> {
  const { supabase, feature, workspaceId, userId, locale, localDate } = opts;
  const projectId = opts.projectId ?? null;
  const scopeUserId = feature === "my_focus" || feature === "standup" ? userId : null;
  const scope: SummaryScope = {
    workspaceId,
    projectId: feature === "project_summary" ? projectId : null,
    userId: scopeUserId,
    feature,
    locale,
    summaryDate: localDate,
  };

  if (!isAiConfigured()) {
    return { ok: false, error: "TaskOrbit AI is not configured yet.", notConfigured: true };
  }

  const trimmed = truncateInput(opts.data, AI_LIMITS.maxInputChars);
  const digest = computeDigest({ feature, data: trimmed });

  // Cache: reuse when the input digest is unchanged.
  const cached = await readCachedSummary(supabase, scope);
  if (cached && cached.inputDigest === digest) {
    const content = validateAiOutput(feature, cached.content);
    if (content) {
      await logUsage(supabase, workspaceId, userId, feature, localDate, "cached", 0);
      return { ok: true, content: content as AiOutput[F], cached: true, generatedAt: cached.generatedAt, model: cached.model, droppedRefs: 0 };
    }
    // Cached row is corrupt: fall through and regenerate.
  }
  // Cron path: the RPC already told us the cached digest — same shortcut
  // without a table read (the cron client cannot read ai_summaries).
  if (opts.knownCachedDigest && opts.knownCachedDigest === digest) {
    return {
      ok: true,
      content: null as unknown as AiOutput[F],
      cached: true,
      generatedAt: "",
      model: getGeminiModel(),
      droppedRefs: 0,
    };
  }

  // Limits: workspace per day, then user per hour (DB ledger first,
  // in-memory fallback when the migration is not applied yet).
  const workspaceUsage = opts.knownWorkspaceUsageToday ?? (await countWorkspaceUsageToday(supabase, workspaceId, localDate));
  if (workspaceUsage !== null && !workspaceDailyAllowed(workspaceUsage, AI_LIMITS.workspacePerDay)) {
    await logUsage(supabase, workspaceId, userId, feature, localDate, "limit", 0);
    return { ok: false, error: "The AI usage limit for this workspace has been reached for today. Please try again tomorrow.", limitReached: true };
  }
  if (userId) {
    const userUsage = await countUserUsageLastHour(supabase, workspaceId, userId);
    const allowed =
      userUsage !== null
        ? userHourlyAllowed(userUsage, AI_LIMITS.userPerHour)
        : checkMemoryHourlyLimit(userId, Date.now(), AI_LIMITS.userPerHour);
    if (!allowed) {
      await logUsage(supabase, workspaceId, userId, feature, localDate, "limit", 0);
      return { ok: false, error: "You have reached the AI usage limit for this hour. Please try again later.", limitReached: true };
    }
  }

  // Generate + validate.
  let parsed: AiOutput[F] | null = null;
  let estimatedTokens = 0;
  try {
    const { text, estimatedTokens: tokens } = await generateText(buildPrompt(feature, trimmed));
    estimatedTokens = tokens;
    const cleaned = validateAiOutput(feature, parseModelJson(text));
    if (!cleaned) throw new Error("Invalid AI output");
    parsed = cleaned;
  } catch {
    await logUsage(supabase, workspaceId, userId, feature, localDate, "error", estimatedTokens);
    return { ok: false, error: FRIENDLY_ERROR };
  }

  // Drop references to tasks/projects that were not in the input.
  const knownTaskIds = new Set(trimmed.tasks.map((t) => t.id));
  const knownProjectIds = new Set(trimmed.projects.map((p) => p.id));
  const { output, dropped } = filterReferences(feature, parsed, knownTaskIds, knownProjectIds);

  await saveSummary(supabase, scope, output, getGeminiModel(), digest, userId);
  await logUsage(supabase, workspaceId, userId, feature, localDate, "ok", estimatedTokens);

  return {
    ok: true,
    content: output as AiOutput[F],
    cached: false,
    generatedAt: new Date().toISOString(),
    model: getGeminiModel(),
    droppedRefs: dropped,
  };
}
