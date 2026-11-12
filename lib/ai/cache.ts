// TaskOrbit AI — cache + usage ledger (Part 3, spec section 8).
//
// All reads/writes go through the ai_summaries / ai_usage tables added by
// migration 0007. Everything here is resilient: if the migration has not
// been applied yet the queries fail and the helpers return null/false
// instead of throwing, so the no-key AND the no-migration paths both
// degrade cleanly (uncached generation, in-memory limits).
//
// Writes go through the SECURITY DEFINER functions save_ai_summary /
// log_ai_usage — there are no direct INSERT policies on either table, so
// a forged client request can never write the cache or the ledger.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AiFeature } from "./features";

type Client = SupabaseClient<Database>;

export interface CachedSummary {
  content: unknown;
  inputDigest: string;
  generatedAt: string;
  model: string;
}

export interface SummaryScope {
  workspaceId: string;
  projectId: string | null;
  userId: string | null;
  feature: AiFeature;
  locale: string;
  summaryDate: string;
}

/** Read a cached summary for this exact scope + date. Null = no cache (or table missing). */
export async function readCachedSummary(
  supabase: Client,
  scope: SummaryScope,
): Promise<CachedSummary | null> {
  try {
    let query = supabase
      .from("ai_summaries")
      .select("content, input_digest, generated_at, model")
      .eq("workspace_id", scope.workspaceId)
      .eq("summary_type", scope.feature)
      .eq("locale", scope.locale)
      .eq("summary_date", scope.summaryDate);
    // `.is()` only accepts null/true/false; a real id needs `.eq()`.
    query =
      scope.projectId === null ? query.is("project_id", null) : query.eq("project_id", scope.projectId);
    query = scope.userId === null ? query.is("user_id", null) : query.eq("user_id", scope.userId);
    const { data, error } = await query
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      content: data.content,
      inputDigest: data.input_digest,
      generatedAt: data.generated_at,
      model: data.model,
    };
  } catch {
    return null;
  }
}

/**
 * Save (upsert) a summary via the SECURITY DEFINER function. The
 * function enforces membership (or the cron rule for unauthenticated
 * callers). False = save failed or migration not applied; the generated
 * result is still returned to the user, it just is not cached.
 */
export async function saveSummary(
  supabase: Client,
  scope: SummaryScope,
  content: unknown,
  model: string,
  inputDigest: string,
  generatedBy: string | null,
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("save_ai_summary", {
      p_workspace_id: scope.workspaceId,
      p_project_id: scope.projectId,
      p_user_id: scope.userId,
      p_summary_type: scope.feature,
      p_locale: scope.locale,
      p_summary_date: scope.summaryDate,
      p_content: content as never,
      p_model: model,
      p_input_digest: inputDigest,
      p_generated_by: generatedBy,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Count AI calls for a workspace on one local date. Null = unknown (table missing). */
export async function countWorkspaceUsageToday(
  supabase: Client,
  workspaceId: string,
  requestDate: string,
): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("request_date", requestDate);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

/** Count AI calls by one user in the last hour. Null = unknown (table missing). */
export async function countUserUsageLastHour(
  supabase: Client,
  workspaceId: string,
  actorId: string,
): Promise<number | null> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("actor_id", actorId)
      .gte("created_at", since);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

/** Log one AI call (ok / error / limit / cached) via the SECURITY DEFINER function. Best-effort. */
export async function logUsage(
  supabase: Client,
  workspaceId: string,
  actorId: string | null,
  feature: AiFeature,
  requestDate: string,
  status: "ok" | "error" | "limit" | "cached",
  estimatedTokens: number,
): Promise<void> {
  try {
    await supabase.rpc("log_ai_usage", {
      p_workspace_id: workspaceId,
      p_actor_id: actorId,
      p_feature: feature,
      p_request_date: requestDate,
      p_status: status,
      p_estimated_tokens: estimatedTokens,
    });
  } catch {
    // Usage logging must never fail a generation.
  }
}
