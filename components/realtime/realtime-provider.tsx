// Realtime context for the dashboard. Mounted once in
// app/dashboard/layout.tsx so every dashboard page can read the active
// workspace / user ids and use the realtime hooks in lib/realtime/hooks.ts.
// The provider itself opens no channels — each hook subscribes only to the
// rows it needs (one task's comments, one project's tasks, the user's own
// notifications) and unsubscribes on unmount.
"use client";

import * as React from "react";

export interface RealtimeContextValue {
  workspaceId: string;
  userId: string;
}

const RealtimeContext = React.createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({
  workspaceId,
  userId,
  children,
}: {
  workspaceId: string;
  userId: string;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ workspaceId, userId }), [workspaceId, userId]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeContext(): RealtimeContextValue {
  const ctx = React.useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtimeContext must be used inside <RealtimeProvider>.");
  return ctx;
}
