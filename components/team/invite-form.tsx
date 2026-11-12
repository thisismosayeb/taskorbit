"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteDeveloper } from "@/lib/actions/team";
import { useToast } from "@/components/ui/toast";
import { t, useLocale} from "@/lib/i18n";

/** A just-created invite, handed to the pending list so it shows at once. */
export interface CreatedInvite {
  id: string;
  invited_email: string;
  created_at: string;
  expires_at: string;
  inviteLink: string;
}

/**
 * Manager-only invite form: creates an invite and shows a copyable link.
 *
 * Duplicate submits are prevented by DISABLING the submit button while the
 * server action is in flight (`disabled={pending}`) — a double-click on a
 * disabled button submits nothing, and the form's native submit is still
 * prevented by `e.preventDefault()` once hydrated.
 */
export function InviteForm({
  workspaceId,
  onInviteCreated,
}: {
  workspaceId: string;
  onInviteCreated?: (invite: CreatedInvite) => void;
}) {
  useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const result = await inviteDeveloper(workspaceId, email);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      setInviteLink(result.inviteLink ?? null);
      setEmail("");
      if (result.invitation && result.inviteLink) {
        onInviteCreated?.({ ...result.invitation, inviteLink: result.inviteLink });
      }
      toast(t("team.inviteCreated"));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleCopy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(t("team.copyFailed"), "error");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <Label htmlFor="invite-email">{t("team.developerEmail")}</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder={t("team.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? t("team.creating") : t("team.sendInvite")}
        </Button>
      </form>
      <p className="text-xs text-muted">
        {t("team.emailNotSentNote")}
      </p>
      {inviteLink ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-mint/40 bg-mint/10 p-3">
          <span className="min-w-0 flex-1 break-all text-sm text-ink">{inviteLink}</span>
          <Button size="sm" variant="outline" onClick={() => void handleCopy(inviteLink)}>
            {copied ? (
              <>
                <Check className="h-4 w-4" /> {t("common.copied")}
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> {t("team.copyInviteLink")}
              </>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
