import { createClient } from "@/lib/supabase/server";
import { getDashboardContext } from "@/lib/actions/workspace";
import { isManager } from "@/lib/permissions";
import { getDeadlineState } from "@/lib/date/deadline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MembersTable, type MemberRow } from "@/components/team/members-table";
import { PendingInvitesSection } from "@/components/team/pending-invites";
import type { Profile, Task, Project, WorkspaceInvitation, WorkspaceMember } from "@/types";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export default async function TeamPage() {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) return null;
  const manager = isManager(ctx.role);

  const supabase = await createClient();
  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
    .order("joined_at", { ascending: true });
  const members = (memberRows ?? []) as WorkspaceMember[];

  const memberIds = members.map((m) => m.user_id);
  const { data: profileRows } =
    memberIds.length > 0 ? await supabase.from("profiles").select("*").in("id", memberIds) : { data: [] as Profile[] };
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p]));

  // Task counts per member. "Open" is every assigned task whose status is
  // not completed (top-level tasks and subtasks); "overdue" reuses
  // getDeadlineState() — the single deadline source of truth — so the
  // counts agree with the chips on the task pages.
  const { data: projectRows } = await supabase.from("projects").select("id").eq("workspace_id", ctx.workspace.id);
  const projectIds = ((projectRows ?? []) as Pick<Project, "id">[]).map((p) => p.id);
  const { data: taskRows } =
    projectIds.length > 0
      ? await supabase
          .from("tasks")
          .select("assigned_to, status, due_date, completed_at")
          .in("project_id", projectIds)
      : { data: [] as Pick<Task, "assigned_to" | "status" | "due_date" | "completed_at">[] };
  const timezone = ctx.workspace.timezone;
  const counts = new Map<string, { open: number; completed: number; overdue: number }>();
  for (const t of (taskRows ?? []) as Pick<Task, "assigned_to" | "status" | "due_date" | "completed_at">[]) {
    if (!t.assigned_to) continue;
    const c = counts.get(t.assigned_to) ?? { open: 0, completed: 0, overdue: 0 };
    if (t.status === "completed") {
      c.completed += 1;
    } else {
      c.open += 1;
      if (getDeadlineState(t, timezone, undefined, locale).state === "red") c.overdue += 1;
    }
    counts.set(t.assigned_to, c);
  }

  const memberTableRows: MemberRow[] = members.map((member) => {
    const c = counts.get(member.user_id) ?? { open: 0, completed: 0, overdue: 0 };
    return {
      userId: member.user_id,
      name: profiles.get(member.user_id)?.full_name ?? null,
      role: member.role,
      joinedAt: member.joined_at,
      openTasks: c.open,
      completedTasks: c.completed,
      overdueTasks: c.overdue,
      isSelf: member.user_id === ctx.user!.id,
    };
  });

  const { data: inviteRows } = manager
    ? await supabase
        .from("workspace_invitations")
        .select("*")
        .eq("workspace_id", ctx.workspace.id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
    : { data: [] as WorkspaceInvitation[] };
  const pendingInvites = ((inviteRows ?? []) as WorkspaceInvitation[]).filter(
    (i) => new Date(i.expires_at).getTime() > Date.now(),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("team.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("team.subtitle", { workspace: ctx.workspace.name })}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("team.membersTitle", { count: members.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          <MembersTable members={memberTableRows} workspaceId={ctx.workspace.id} isManager={manager} />
        </CardContent>
      </Card>

      {manager ? (
        <PendingInvitesSection initialInvitations={pendingInvites} workspaceId={ctx.workspace.id} />
      ) : (
        <p className="text-sm text-muted">{t("team.onlyManagerInvite")}</p>
      )}
    </div>
  );
}
