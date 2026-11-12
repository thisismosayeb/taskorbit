// TaskOrbit AI — feature catalogue (Part 3, spec section 8).
//
// Pure role rules, so they are unit-testable without a session.
// Manager-only: daily_brief, project_summary. Everyone else may use the
// remaining features, scoped to data they are allowed to see.

import type { WorkspaceRole } from "@/types";

export type AiFeature =
  | "daily_brief"
  | "project_summary"
  | "my_focus"
  | "deadline_risk"
  | "standup"
  | "next_actions";

export const AI_FEATURES: readonly AiFeature[] = [
  "daily_brief",
  "project_summary",
  "my_focus",
  "deadline_risk",
  "standup",
  "next_actions",
] as const;

export const MANAGER_ONLY_FEATURES: ReadonlySet<AiFeature> = new Set(["daily_brief", "project_summary"]);

/** Server-side role gate. A developer asking for a manager-only feature gets an error, never data. */
export function canGenerateFeature(role: WorkspaceRole | null | undefined, feature: AiFeature): boolean {
  if (!role) return false;
  if (MANAGER_ONLY_FEATURES.has(feature)) return role === "manager";
  return role === "manager" || role === "developer";
}

/** Which features a role may see on the AI page. */
export function featuresForRole(role: WorkspaceRole | null | undefined): AiFeature[] {
  return AI_FEATURES.filter((f) => canGenerateFeature(role, f));
}
