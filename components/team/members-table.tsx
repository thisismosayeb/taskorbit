"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { removeWorkspaceMember } from "@/lib/actions/team";
import { useToast } from "@/components/ui/toast";
import type { WorkspaceRole } from "@/types";
import { t, useLocale} from "@/lib/i18n";

/** One workspace member plus their task counts (computed on the server). */
export interface MemberRow {
  userId: string;
  name: string | null;
  role: WorkspaceRole;
  joinedAt: string;
  /** Assigned tasks with status != completed (top-level and subtasks). */
  openTasks: number;
  /** Assigned tasks with status = completed. */
  completedTasks: number;
  /** Assigned open tasks past their deadline (getDeadlineState = red). */
  overdueTasks: number;
  isSelf: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Members table. The manager can remove a developer (never themselves,
 * never the manager) after a confirmation dialog that states exactly how
 * many of their open tasks will become unassigned.
 */
export function MembersTable({
  members,
  workspaceId,
  isManager,
}: {
  members: MemberRow[];
  workspaceId: string;
  isManager: boolean;
}) {
  useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [removing, setRemoving] = React.useState<MemberRow | null>(null);

  if (members.length === 0) {
    return <p className="text-sm text-muted">{t("team.noMembers")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-xs font-medium text-muted">
            <th scope="col" className="pb-2 pr-3 font-medium">
              {t("team.memberCol")}
            </th>
            <th scope="col" className="pb-2 pr-3 font-medium">
              {t("team.roleCol")}
            </th>
            <th scope="col" className="pb-2 pr-3 font-medium">
              {t("team.joinedCol")}
            </th>
            <th scope="col" className="pb-2 pr-3 font-medium">
              {t("team.openCol")}
            </th>
            <th scope="col" className="pb-2 pr-3 font-medium">
              {t("team.completedCol")}
            </th>
            <th scope="col" className="pb-2 pr-3 font-medium">
              {t("team.overdueCol")}
            </th>
            <th scope="col" className="pb-2">
              <span className="sr-only">{t("team.actionsCol")}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {members.map((member) => {
            const canRemove = isManager && member.role !== "manager" && !member.isSelf;
            return (
              <tr key={member.userId}>
                <td className="py-3 pr-3">
                  <span className="flex items-center gap-3">
                    <Avatar name={member.name} />
                    <span className="font-medium text-ink">
                      {member.name || t("common.memberFallback")}
                      {member.isSelf ? t("team.youSuffix") : ""}
                    </span>
                  </span>
                </td>
                <td className="py-3 pr-3">
                  <Badge variant={member.role === "manager" ? "primary" : "mint"}>
                    {member.role === "manager" ? t("roles.manager") : t("roles.developer")}
                  </Badge>
                </td>
                <td className="py-3 pr-3 text-muted">{formatDate(member.joinedAt)}</td>
                <td className="py-3 pr-3 text-ink">{member.openTasks}</td>
                <td className="py-3 pr-3 text-ink">{member.completedTasks}</td>
                <td className={`py-3 pr-3 ${member.overdueTasks > 0 ? "font-medium text-red-600" : "text-ink"}`}>
                  {member.overdueTasks}
                </td>
                <td className="py-3 text-right">
                  {canRemove ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t("team.removeAria", { name: member.name ?? t("team.memberLower") })}
                      onClick={() => setRemoving(member)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" /> {t("team.removeButton")}
                    </Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? t("team.removeTitle", { name: removing.name ?? t("team.thisMember") }) : t("team.removeTitleFallback")}
        description={removing ? t("team.removeBody", { count: removing.openTasks }) : ""}
        confirmLabel={t("team.removeLabel")}
        onConfirm={async () => {
          if (!removing) return;
          const result = await removeWorkspaceMember(workspaceId, removing.userId);
          if (result.error) return result;
          const n = result.unassignedOpenTasks ?? 0;
          setRemoving(null);
          toast(t("team.memberRemoved", { count: n, countS: n === 1 ? "" : "s" }));
          router.refresh();
        }}
      />
    </div>
  );
}
