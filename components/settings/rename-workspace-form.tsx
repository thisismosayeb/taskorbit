"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renameWorkspace } from "@/lib/actions/workspace";
import { useToast } from "@/components/ui/toast";
import { t, useLocale} from "@/lib/i18n";

/** Manager-only workspace rename form. */
export function RenameWorkspaceForm({ workspaceId, currentName }: { workspaceId: string; currentName: string }) {
  useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = React.useState(currentName);
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() === currentName) return;
    setPending(true);
    try {
      const result = await renameWorkspace(workspaceId, name);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(t("settings.renamed"));
      router.refresh();
    } catch {
      // A rejected request must not leave the button stuck on "Saving…".
      toast(t("errors.generic"), "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1 space-y-1.5">
        <Label htmlFor="workspace-name">{t("workspace.name")}</Label>
        <Input id="workspace-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </div>
      <Button type="submit" disabled={pending || name.trim() === currentName}>
        {pending ? t("common.saving") : t("settings.renameWorkspace")}
      </Button>
    </form>
  );
}
