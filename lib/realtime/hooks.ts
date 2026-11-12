// Realtime subscriptions (Supabase postgres_changes, RLS-respecting) with
// a polling fallback.
//
// Every hook below:
//  - subscribes to ONE table with a row filter scoped to data the user may
//    see (their own notifications, one task's comments, one project's
//    tasks). Never subscribe to another workspace's data — there is no
//    workspace-wide channel.
//  - falls back to polling (router.refresh() every 30 s + a refresh on
//    window focus) when the channel errors or does not reach SUBSCRIBED
//    within 10 s. The UI shows nothing alarming about the fallback; the
//    mode is only logged (console.info) for debugging.
//  - unsubscribes (removes the channel) on unmount, so a workspace switch
//    or navigation never leaks a subscription.
//
// The payload handlers receive the raw postgres_changes payload; callers
// decide what to do with it (usually router.refresh(), or a local state
// update for instant feedback).

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getRealtimeClient } from "@/lib/realtime/client";

export type RealtimeMode = "connecting" | "live" | "polling";

const CONNECT_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 30_000;

function logMode(channelName: string, mode: RealtimeMode) {
  // Debug only — the user never sees this.
  console.info(`[realtime] ${channelName}: ${mode}`);
}

interface SubscribeOptions<T extends Record<string, unknown>> {
  /** Unique channel name (include the scoped id, e.g. task id). */
  channelName: string;
  table: "tasks" | "comments" | "notifications";
  /** postgres_changes filter, e.g. `task_id=eq.<uuid>`. */
  filter: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  enabled?: boolean;
  onPayload: (payload: RealtimePostgresChangesPayload<T>) => void;
}

/**
 * Generic subscription with the polling fallback. Returns the current mode
 * so a component can (silently) know whether it is live.
 */
export function useRealtimeSubscription<T extends Record<string, unknown>>({
  channelName,
  table,
  filter,
  event = "*",
  enabled = true,
  onPayload,
}: SubscribeOptions<T>): RealtimeMode {
  const router = useRouter();
  const [mode, setMode] = React.useState<RealtimeMode>("connecting");
  const onPayloadRef = React.useRef(onPayload);
  onPayloadRef.current = onPayload;

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    // One stable listener so add/removeEventListener always match.
    const refresh = () => {
      if (!document.hidden) router.refresh();
    };

    const startPolling = () => {
      if (cancelled || pollTimer) return;
      setMode("polling");
      logMode(channelName, "polling");
      pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
      window.addEventListener("focus", refresh);
    };
    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      window.removeEventListener("focus", refresh);
    };

    const client = getRealtimeClient();
    const channel = client.channel(channelName);
    channel.on(
      "postgres_changes",
      { event, schema: "public", table, filter },
      (payload) => {
        onPayloadRef.current(payload as RealtimePostgresChangesPayload<T>);
      },
    );
    channel.subscribe((status, err) => {
      if (cancelled) return;
      if (status === "SUBSCRIBED") {
        if (connectTimer) clearTimeout(connectTimer);
        stopPolling();
        setMode("live");
        logMode(channelName, "live");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || err) {
        startPolling();
      }
    });
    // If the channel never connects, fall back to polling.
    connectTimer = setTimeout(() => {
      if (!cancelled) startPolling();
    }, CONNECT_TIMEOUT_MS);

    return () => {
      cancelled = true;
      if (connectTimer) clearTimeout(connectTimer);
      stopPolling();
      void client.removeChannel(channel);
    };
    // Re-subscribe only when the channel identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, table, filter, event, enabled]);

  return mode;
}

export interface CommentEvent {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  commentId: string | null;
}

/**
 * Live comments for the open task page. New / edited / deleted comments
 * arrive without a reload; the caller re-renders from the payload (a
 * router.refresh() is enough — the server re-reads the comments).
 * Mount in CommentThread or the task page (see PART2_NOTES for instructions).
 */
export function useTaskCommentsRealtime(
  taskId: string,
  onEvent: (event: CommentEvent) => void,
): RealtimeMode {
  return useRealtimeSubscription<{ id: string }>({
    channelName: `taskorbit-comments-${taskId}`,
    table: "comments",
    filter: `task_id=eq.${taskId}`,
    onPayload: (payload) => {
      const row = (payload.new ?? payload.old ?? {}) as { id?: string };
      onEvent({ eventType: payload.eventType, commentId: row.id ?? null });
    },
  });
}

export interface NotificationEvent {
  notification: {
    id: string;
    type: string;
    title: string;
    body: string;
    entity_type: string | null;
    entity_id: string | null;
    created_at: string;
    read_at: string | null;
  };
}

/**
 * Live notifications for the signed-in user. The filter is the recipient's
 * own id, and RLS (notifications_select_own) enforces the same bound
 * server-side, so no other member's notifications can arrive here.
 */
export function useNotificationsRealtime(
  userId: string,
  onNotification: (event: NotificationEvent) => void,
): RealtimeMode {
  return useRealtimeSubscription<{
    id: string;
    type: string;
    title: string;
    body: string;
    entity_type: string | null;
    entity_id: string | null;
    created_at: string;
    read_at: string | null;
  }>({
    channelName: `taskorbit-notifications-${userId}`,
    table: "notifications",
    filter: `recipient_id=eq.${userId}`,
    event: "INSERT",
    onPayload: (payload) => {
      const row = payload.new as NotificationEvent["notification"];
      if (row) onNotification({ notification: row });
    },
  });
}

export interface TaskEvent {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  taskId: string | null;
  projectId: string | null;
}

/**
 * Live task changes inside ONE project (board page). The filter is the
 * project id, so another workspace's tasks can never match this channel.
 */
export function useProjectTasksRealtime(
  projectId: string,
  onEvent: (event: TaskEvent) => void,
): RealtimeMode {
  return useRealtimeSubscription<{ id: string; project_id: string }>({
    channelName: `taskorbit-project-tasks-${projectId}`,
    table: "tasks",
    filter: `project_id=eq.${projectId}`,
    onPayload: (payload) => {
      const row = (payload.new ?? payload.old ?? {}) as { id?: string; project_id?: string };
      onEvent({ eventType: payload.eventType, taskId: row.id ?? null, projectId: row.project_id ?? null });
    },
  });
}

/**
 * Live changes to ONE task (task detail page): status / assignee changes by
 * another user appear without a reload.
 */
export function useTaskRealtime(
  taskId: string,
  onEvent: (event: TaskEvent) => void,
): RealtimeMode {
  return useRealtimeSubscription<{ id: string; project_id: string }>({
    channelName: `taskorbit-task-${taskId}`,
    table: "tasks",
    filter: `id=eq.${taskId}`,
    onPayload: (payload) => {
      const row = (payload.new ?? payload.old ?? {}) as { id?: string; project_id?: string };
      onEvent({ eventType: payload.eventType, taskId: row.id ?? null, projectId: row.project_id ?? null });
    },
  });
}
