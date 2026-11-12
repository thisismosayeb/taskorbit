// Live board updates: one realtime channel per project on the board, so a
// task status / assignee change by anyone refreshes the board from the
// server (with the 30 s polling fallback when realtime cannot connect —
// see lib/realtime/hooks.ts).
//
// Each project gets its own child component because hooks cannot be called
// in a loop; the board remounts (via its `key`) whenever the filters change,
// so the project list is stable for the lifetime of this component.

"use client";

import { useRouter } from "next/navigation";
import { useProjectTasksRealtime } from "@/lib/realtime/hooks";

function ProjectTasksRealtime({ projectId }: { projectId: string }) {
  const router = useRouter();
  useProjectTasksRealtime(projectId, () => router.refresh());
  return null;
}

export function BoardRealtime({ projectIds }: { projectIds: string[] }) {
  return (
    <>
      {projectIds.map((projectId) => (
        <ProjectTasksRealtime key={projectId} projectId={projectId} />
      ))}
    </>
  );
}
