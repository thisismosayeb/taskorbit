"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { InviteForm, type CreatedInvite } from "./invite-form";
import { recreateInvitation, revokeInvitation } from "@/lib/actions/team";
import { useToast } from "@/components/ui/toast";
import type { WorkspaceInvitation } from "@/types";
import { t, useLocale} from "@/lib/i18n";

/**
 * A pending invite as the list shows it. `token_hash` / `created_by` are
 * never needed client-side; `inviteLink` is only known while this browser
 * session created (or re-created) the invite — the raw token is never
 * stored, only its SHA-256 hash, so a pending invite loaded from the
 * server has no copyable link until it is re-created.
 */
export type PendingInviteItem = Omit<WorkspaceInvitation, "token_hash" | "created_by"> & {
  inviteLink?: string | null;
};

function toItem(inv: WorkspaceInvitation): PendingInviteItem {
  return {
    id: inv.id,
    workspace_id: inv.workspace_id,
    invited_email: inv.invited_email,
    intended_role: inv.intended_role,
    expires_at: inv.expires_at,
    accepted_at: inv.accepted_at,
    revoked_at: inv.revoked_at,
    created_at: inv.created_at,
    inviteLink: null,
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Manager-only invite section: the invite form plus the pending list.
 *
 * The list lives in client state, seeded from the server. A newly created
 * invite is appended immediately (with its copyable link), so the count
 * and the row are correct the moment the invite exists — the page no
 * longer depends on the post-create `router.refresh()` round-trip to
 * show it. `router.refresh()` still runs after every mutation so the
 * list reconciles with the server; the effect below merges server rows
 * back in while preserving copyable links the server cannot know.
 */
export function PendingInvitesSection({
  initialInvitations,
  workspaceId,
}: {
  initialInvitations: WorkspaceInvitation[];
  workspaceId: string;
}) {
  useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [invites, setInvites] = React.useState<PendingInviteItem[]>(() => initialInvitations.map(toItem));
  const [revoking, setRevoking] = React.useState<PendingInviteItem | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setInvites((prev) => {
      const prevById = new Map(prev.map((i) => [i.id, i]));
      const merged = initialInvitations.map((srv) => {
        const kept = prevById.get(srv.id);
        return kept ? { ...toItem(srv), inviteLink: kept.inviteLink ?? null } : toItem(srv);
      });
      for (const item of prev) {
        if (!merged.some((m) => m.id === item.id)) merged.unshift(item);
      }
      return merged;
    });
  }, [initialInvitations]);

  function handleCreated(created: CreatedInvite) {
    const item: PendingInviteItem = {
      id: created.id,
      workspace_id: workspaceId,
      invited_email: created.invited_email,
      intended_role: "developer",
      expires_at: created.expires_at,
      accepted_at: null,
      revoked_at: null,
      created_at: created.created_at,
      inviteLink: created.inviteLink,
    };
    setInvites((prev) => [item, ...prev.filter((i) => i.id !== item.id)]);
  }

  async function handleCopy(link: string, id: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast(t("team.copyFailed"), "error");
    }
  }

  async function handleRecreate(invite: PendingInviteItem) {
    setBusyId(invite.id);
    try {
      const result = await recreateInvitation(invite.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      if (result.invitation && result.inviteLink) {
        const fresh: PendingInviteItem = {
          id: result.invitation.id,
          workspace_id: workspaceId,
          invited_email: result.invitation.invited_email,
          intended_role: "developer",
          expires_at: result.invitation.expires_at,
          accepted_at: null,
          revoked_at: null,
          created_at: result.invitation.created_at,
          inviteLink: result.inviteLink,
        };
        setInvites((prev) => [fresh, ...prev.filter((i) => i.id !== invite.id)]);
      }
      toast(t("team.recreatedToast"));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("team.inviteTitle")}</CardTitle>
          <CardDescription>
            {t("team.inviteCardBody")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm workspaceId={workspaceId} onInviteCreated={handleCreated} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("team.pendingTitle", { count: invites.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <p className="text-sm text-muted">{t("team.noPending")}</p>
          ) : (
            <>
              <ul className="divide-y divide-ink/5">
                {invites.map((invite) => {
                  const busy = busyId === invite.id;
                  return (
                    <li key={invite.id} className="space-y-1.5 py-2.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 text-sm font-medium text-ink">{invite.invited_email}</span>
                        <span className="text-xs text-muted">{t("team.createdOn", { date: formatDate(invite.created_at) })}</span>
                        <span className="text-xs text-muted">{t("team.expiresOn", { date: formatDate(invite.expires_at) })}</span>
                        <span className="flex items-center gap-1">
                          {invite.inviteLink ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void handleCopy(invite.inviteLink as string, invite.id)}
                            >
                              {copiedId === invite.id ? (
                                <>
                                  <Check className="h-3.5 w-3.5" /> {t("common.copied")}
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" /> {t("team.copyLink")}
                                </>
                              )}
                            </Button>
                          ) : null}
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleRecreate(invite)}>
                            <RefreshCw className="h-3.5 w-3.5" /> {busy ? t("team.working") : t("team.recreate")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={t("team.revokeAria", { email: invite.invited_email })}
                            disabled={busy}
                            onClick={() => setRevoking(invite)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" /> {t("team.revoke")}
                          </Button>
                        </span>
                      </span>
                      {invite.inviteLink ? (
                        <span className="block min-w-0 break-all text-xs text-muted">{invite.inviteLink}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-muted">
                {t("team.noCopyNote")}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={t("team.revokeTitle")}
        description={
          revoking ? t("team.revokeBody", { email: revoking.invited_email }) : ""
        }
        confirmLabel={t("team.revokeLabel")}
        onConfirm={async () => {
          if (!revoking) return;
          const result = await revokeInvitation(revoking.id);
          if (result.error) return result;
          setInvites((prev) => prev.filter((i) => i.id !== revoking.id));
          setRevoking(null);
          toast(t("team.revoked"));
          router.refresh();
        }}
      />
    </>
  );
}
