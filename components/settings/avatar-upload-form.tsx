// Profile picture upload on the Settings page (Part 4, Track B).
//
// Flow: pick a file → preview it locally → Upload sends the bytes to
// Supabase Storage (`avatars/<user-id>/avatar-<timestamp>.<ext>`,
// storage RLS allows only the caller's own folder) → the public URL
// is saved to profiles.avatar_url by the saveAvatarUrl server action
// (own row only, URL validated server-side). Replace uploads a new
// object and deletes the old one best-effort; Remove clears the URL
// (initials shown again) and deletes the stored object best-effort.
// Validation (PNG/JPG/WEBP/GIF, 2 MB) runs here before upload and
// again in the storage policy — the size/type check is never only
// client-side. Nothing is uploaded before the user presses Upload.

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { saveAvatarUrl } from "@/lib/actions/avatar";
import {
  AVATAR_BUCKET,
  buildAvatarPath,
  parseAvatarStoragePath,
  validateAvatarFile,
  type AvatarFileError,
} from "@/lib/avatar";
import { t } from "@/lib/i18n/dictionary";
import { useLocale } from "@/lib/i18n";

const ERROR_KEYS: Record<AvatarFileError, string> = {
  "invalid-type": "settings.avatarInvalidType",
  "too-large": "settings.avatarTooLarge",
};

export function AvatarUploadForm({
  userId,
  initialAvatarUrl,
  userName,
  userEmail,
}: {
  userId: string;
  initialAvatarUrl: string | null;
  userName: string | null;
  userEmail: string | null;
}) {
  useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [currentUrl, setCurrentUrl] = React.useState<string | null>(initialAvatarUrl);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Revoke the object URL when the preview is replaced or unmounted.
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onPickFile(file: File | null) {
    setStatus(null);
    if (!file) {
      setSelectedFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const error = validateAvatarFile(file);
    if (error) {
      setSelectedFile(null);
      setStatus({ kind: "error", text: t(ERROR_KEYS[error]) });
      return;
    }
    setSelectedFile(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function deleteStoredObject(url: string | null): Promise<void> {
    if (!url) return;
    const path = parseAvatarStoragePath(url, process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (!path) return; // Not one of our stored pictures (e.g. signup metadata) — leave it alone.
    try {
      const supabase = createClient();
      await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    } catch {
      // Best-effort cleanup: the old object may linger in storage, but
      // the profile already points at the new picture (or none).
    }
  }

  async function handleUpload() {
    if (!selectedFile || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const path = buildAvatarPath(userId, selectedFile.name, selectedFile.type);
      if (!path) {
        setStatus({ kind: "error", text: t("settings.avatarInvalidType") });
        return;
      }
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, selectedFile, { contentType: selectedFile.type, upsert: false });
      if (uploadError) {
        setStatus({ kind: "error", text: t("settings.avatarUploadFailed") });
        return;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const result = await saveAvatarUrl(publicUrl);
      if (!result.ok) {
        setStatus({ kind: "error", text: result.error ?? t("settings.avatarUploadFailed") });
        return;
      }
      const previousUrl = currentUrl;
      setCurrentUrl(publicUrl);
      setSelectedFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setStatus({ kind: "success", text: t("settings.avatarSaved") });
      toast(t("settings.avatarSaved"));
      await deleteStoredObject(previousUrl);
      router.refresh();
    } catch {
      setStatus({ kind: "error", text: t("settings.avatarUploadFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!currentUrl || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await saveAvatarUrl(null);
      if (!result.ok) {
        setStatus({ kind: "error", text: result.error ?? t("settings.avatarUploadFailed") });
        return;
      }
      const previousUrl = currentUrl;
      setCurrentUrl(null);
      setStatus({ kind: "success", text: t("settings.avatarRemoved") });
      toast(t("settings.avatarRemoved"));
      await deleteStoredObject(previousUrl);
      router.refresh();
    } catch {
      setStatus({ kind: "error", text: t("settings.avatarUploadFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.avatarTitle")}</CardTitle>
        <CardDescription>{t("settings.avatarDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar name={userName} email={userEmail} imageUrl={previewUrl ?? currentUrl} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("settings.avatarCurrent")}</p>
            <p className="text-xs text-muted">
              {previewUrl
                ? t("settings.avatarPreview")
                : currentUrl
                  ? userName || userEmail || ""
                  : t("settings.avatarNoPicture")}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="avatar-file">{t("settings.avatarChoose")}</Label>
          <Input
            id="avatar-file"
            data-testid="avatar-file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted">{t("settings.avatarNote")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!selectedFile || busy}
            onClick={() => void handleUpload()}
            data-testid="avatar-upload-button"
          >
            <Upload className="h-4 w-4" />
            {busy ? t("settings.avatarUploading") : t("settings.avatarUpload")}
          </Button>
          {currentUrl ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void handleRemove()}
              data-testid="avatar-remove-button"
            >
              <Trash2 className="h-4 w-4" />
              {busy ? t("settings.avatarRemoving") : t("settings.avatarRemove")}
            </Button>
          ) : null}
        </div>

        {status ? (
          <p
            role="status"
            data-testid="avatar-status"
            className={status.kind === "error" ? "text-sm text-red-600" : "text-sm text-emerald-700"}
          >
            {status.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
