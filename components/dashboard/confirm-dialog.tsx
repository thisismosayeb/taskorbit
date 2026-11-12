"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { t, useLocale} from "@/lib/i18n";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = t("common.delete"),
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<{ error?: string } | void>;
}) {
  useLocale();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      const result = await onConfirm();
      if (result && "error" in result && result.error) {
        toast(result.error, "error");
        return;
      }
      onOpenChange(false);
    } finally {
      // A rejecting onConfirm must not leave the button stuck on
      // "Deleting…" — reset the pending state even on failure.
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button variant="danger" disabled={pending} onClick={handleConfirm}>
          {pending ? t("common.deleting") : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
