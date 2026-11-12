// Tiny client wrapper so the task detail page (a server component) gets
// live status / assignee updates: another user changing this task refreshes
// the page from the server (with the 30 s polling fallback when realtime
// cannot connect — see lib/realtime/hooks.ts).
//
// It renders one hidden span carrying the subscription mode (connecting |
// live | polling) so a browser test can read it without DevTools; there is
// no visible UI change.

"use client";

import { useRouter } from "next/navigation";
import { useTaskRealtime } from "@/lib/realtime/hooks";

export function TaskRealtime({ taskId }: { taskId: string }) {
  const router = useRouter();
  const mode = useTaskRealtime(taskId, () => router.refresh());
  return <span data-realtime-mode={mode} data-realtime-channel="task" className="hidden" aria-hidden="true" />;
}
