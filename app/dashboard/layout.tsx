import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { ToastProvider } from "@/components/ui/toast";
import { RealtimeProvider } from "@/components/realtime/realtime-provider";
import { getDashboardContext } from "@/lib/actions/workspace";
import { getUnreadCount, getLatestNotifications } from "@/lib/actions/notifications";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getDashboardContext();

  if (!ctx.user) redirect("/login");
  if (!ctx.workspace || ctx.memberships.length === 0 || !ctx.role) redirect("/onboarding");

  const [unreadCount, latestNotifications] = await Promise.all([
    getUnreadCount(ctx.workspace.id),
    getLatestNotifications(ctx.workspace.id, 10),
  ]);

  return (
    <ToastProvider>
      <RealtimeProvider workspaceId={ctx.workspace.id} userId={ctx.user.id}>
        <div data-role={ctx.role} className="flex min-h-screen flex-col bg-background font-body text-ink lg:flex-row">
          <Sidebar workspaceName={ctx.workspace.name} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              workspace={ctx.workspace}
              memberships={ctx.memberships}
              role={ctx.role}
              userName={ctx.profile?.full_name ?? null}
              userEmail={ctx.user.email}
              userId={ctx.user.id}
              initialUnreadCount={unreadCount}
              initialNotifications={latestNotifications}
            />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
          </div>
        </div>
      </RealtimeProvider>
    </ToastProvider>
  );
}
