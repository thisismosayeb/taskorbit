// Async server wrapper for the notification bell (Part 4 Track A —
// dashboard slowness). The bell's unread count + latest notifications
// used to be awaited in the dashboard layout, blocking every navigation
// on two sequential round trips. Loading them here inside <Suspense>
// lets the layout stream while the bell resolves in parallel; the bell
// itself is unchanged and receives the same props the layout used to
// pass through the Topbar.
import { Suspense } from "react";
import { Bell } from "lucide-react";
import { getLatestNotifications, getUnreadCount } from "@/lib/actions/notifications";
import { NotificationBell } from "@/components/notifications/notification-bell";

async function BellLoader({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const [initialUnreadCount, initialNotifications] = await Promise.all([
    getUnreadCount(workspaceId),
    getLatestNotifications(workspaceId, 10),
  ]);
  return (
    <NotificationBell
      workspaceId={workspaceId}
      userId={userId}
      initialUnreadCount={initialUnreadCount}
      initialNotifications={initialNotifications}
    />
  );
}

// Same footprint as the bell's ghost sm button, so the topbar does not
// shift when the real bell streams in.
function BellSkeleton() {
  return (
    <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg text-muted">
      <Bell className="h-5 w-5 animate-pulse" />
    </span>
  );
}

export function NotificationBellAsync({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  return (
    <Suspense fallback={<BellSkeleton />}>
      <BellLoader workspaceId={workspaceId} userId={userId} />
    </Suspense>
  );
}
