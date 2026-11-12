// TaskOrbit AI — output schemas (Part 3, spec section 8).
//
// The model is asked for JSON and every reply is validated with Zod. On
// invalid output the caller shows a friendly error, never raw model text.
// Every task/project the AI mentions must exist in the input: after
// validation, filterReferences() drops references to ids that were not
// sent to the model (a model inventing a task id is a common failure).

import { z } from "zod";
import type { AiFeature } from "./features";

const taskRef = z.object({
  taskId: z.string(),
  title: z.string(),
  reason: z.string().optional(),
});

const projectRef = z.object({
  projectId: z.string(),
  name: z.string(),
});

export const dailyBriefSchema = z.object({
  headline: z.string().min(1).max(500),
  activeProjects: z
    .array(
      projectRef.extend({
        completionPercent: z.number().min(0).max(100),
        openTasks: z.number().int().min(0),
      }),
    )
    .max(20),
  recentlyCompleted: z.array(taskRef).max(20),
  upcoming: z.array(taskRef.extend({ dueDate: z.string().optional() })).max(20),
  overdue: z.array(taskRef.extend({ dueDate: z.string().optional() })).max(20),
  blockers: z.array(z.object({ taskId: z.string().optional(), text: z.string().min(1).max(500) })).max(10),
  nextActions: z
    .array(
      z.object({
        text: z.string().min(1).max(500),
        taskId: z.string().optional(),
        projectId: z.string().optional(),
      }),
    )
    .max(10),
});

export const projectSummarySchema = z.object({
  summary: z.string().min(1).max(2000),
  status: z.string().min(1).max(100),
  completionPercent: z.number().min(0).max(100),
  activeTasks: z.number().int().min(0),
  assignees: z
    .array(z.object({ name: z.string().min(1).max(100), openTasks: z.number().int().min(0) }))
    .max(20),
  risks: z
    .array(
      z.object({
        text: z.string().min(1).max(500),
        severity: z.enum(["low", "medium", "high"]),
      }),
    )
    .max(10),
  latestActivity: z.array(z.string().min(1).max(500)).max(10),
});

export const myFocusSchema = z.object({
  orderedTasks: z
    .array(
      z.object({
        taskId: z.string(),
        title: z.string(),
        reason: z.string().min(1).max(500),
      }),
    )
    .max(30),
});

export const deadlineRiskSchema = z.object({
  risks: z
    .array(
      z.object({
        taskId: z.string(),
        title: z.string(),
        dueDate: z.string().optional(),
        reason: z.string().min(1).max(500),
        likelihood: z.enum(["low", "medium", "high"]),
      }),
    )
    .max(30),
});

const standupListSchema = z
  .array(z.object({ taskId: z.string().optional(), text: z.string().min(1).max(500) }))
  .max(20);

export const standupSchema = z.object({
  done: standupListSchema,
  inProgress: standupListSchema,
  blocked: standupListSchema,
  next: standupListSchema,
});

export const nextActionsSchema = z.object({
  actions: z
    .array(
      z.object({
        text: z.string().min(1).max(500),
        taskId: z.string().optional(),
        projectId: z.string().optional(),
      }),
    )
    .max(10),
});

export const AI_SCHEMAS = {
  daily_brief: dailyBriefSchema,
  project_summary: projectSummarySchema,
  my_focus: myFocusSchema,
  deadline_risk: deadlineRiskSchema,
  standup: standupSchema,
  next_actions: nextActionsSchema,
} as const;

export type AiOutput = {
  daily_brief: z.infer<typeof dailyBriefSchema>;
  project_summary: z.infer<typeof projectSummarySchema>;
  my_focus: z.infer<typeof myFocusSchema>;
  deadline_risk: z.infer<typeof deadlineRiskSchema>;
  standup: z.infer<typeof standupSchema>;
  next_actions: z.infer<typeof nextActionsSchema>;
};

/** Validate one model reply for a feature. Returns the parsed value or null. */
export function validateAiOutput<F extends AiFeature>(
  feature: F,
  raw: unknown,
): AiOutput[F] | null {
  const parsed = AI_SCHEMAS[feature].safeParse(raw);
  return parsed.success ? (parsed.data as AiOutput[F]) : null;
}

/**
 * Drop references to tasks/projects that were not in the model input.
 * Walks the validated output; any object carrying a taskId/projectId
 * that is not in the known sets is removed from its parent array (and
 * the key is dropped when it is not in an array). Returns the cleaned
 * output plus how many references were dropped.
 */
export function filterReferences<F extends AiFeature>(
  feature: F,
  output: AiOutput[F],
  knownTaskIds: ReadonlySet<string>,
  knownProjectIds: ReadonlySet<string>,
): { output: AiOutput[F]; dropped: number } {
  let dropped = 0;

  function clean(value: unknown): unknown {
    if (Array.isArray(value)) {
      const kept: unknown[] = [];
      for (const item of value) {
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
          const obj = item as Record<string, unknown>;
          if (typeof obj.taskId === "string" && !knownTaskIds.has(obj.taskId)) {
            dropped += 1;
            continue;
          }
          if (typeof obj.projectId === "string" && !knownProjectIds.has(obj.projectId)) {
            dropped += 1;
            continue;
          }
        }
        kept.push(clean(item));
      }
      return kept;
    }
    if (value !== null && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        if (key === "taskId" && typeof v === "string" && !knownTaskIds.has(v)) {
          dropped += 1;
          continue;
        }
        if (key === "projectId" && typeof v === "string" && !knownProjectIds.has(v)) {
          dropped += 1;
          continue;
        }
        out[key] = clean(v);
      }
      return out;
    }
    return value;
  }

  return { output: clean(output) as AiOutput[F], dropped };
}

/** Pull task/project ids out of a validated output (for the reference check). */
export function collectReferencedIds(output: unknown): { taskIds: string[]; projectIds: string[] } {
  const taskIds = new Set<string>();
  const projectIds = new Set<string>();
  function walk(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value !== null && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (typeof obj.taskId === "string") taskIds.add(obj.taskId);
      if (typeof obj.projectId === "string") projectIds.add(obj.projectId);
      for (const v of Object.values(obj)) walk(v);
    }
  }
  walk(output);
  return { taskIds: [...taskIds], projectIds: [...projectIds] };
}
