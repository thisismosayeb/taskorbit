"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { addComment, deleteComment, editComment } from "@/lib/actions/comments";
import { useTaskCommentsRealtime } from "@/lib/realtime/hooks";
import { useToast } from "@/components/ui/toast";
import type { Comment, Profile, WorkspaceRole } from "@/types";
import { t, useLocale} from "@/lib/i18n";

const PAGE_SIZE = 20;

export interface CommentWithAuthor extends Comment {
  author: Profile | null;
}

export function CommentThread({
  taskId,
  comments,
  currentUserId,
  role,
  timezone,
}: {
  taskId: string;
  comments: CommentWithAuthor[];
  currentUserId: string;
  role: WorkspaceRole;
  timezone: string;
}) {
  useLocale();
  const router = useRouter();
  const { toast } = useToast();
  // Live comments: a comment posted/edited/deleted by anyone on this task
  // re-renders the thread from the server (with the 30 s polling fallback
  // when realtime cannot connect — see lib/realtime/hooks.ts).
  // The mode is exposed on the wrapper (connecting | live | polling) so a
  // browser test can read the subscription state without DevTools.
  const commentsRealtimeMode = useTaskCommentsRealtime(taskId, () => router.refresh());
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const [draft, setDraft] = React.useState("");
  const [posting, setPosting] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState("");
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [deleting, setDeleting] = React.useState<CommentWithAuthor | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  // Oldest first; newest at the bottom. New comments append at the bottom.
  const sorted = React.useMemo(
    () => [...comments].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [comments],
  );
  const visible = sorted.slice(Math.max(0, sorted.length - visibleCount));
  const hiddenCount = sorted.length - visible.length;

  function formatTime(iso: string): string {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (draft.trim().length === 0) {
      toast(t("comments.writeFirst"), "error");
      return;
    }
    setPosting(true);
    try {
      const result = await addComment(taskId, draft);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      setDraft("");
      router.refresh();
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
    } catch {
      // A rejected request must not leave the button stuck on "Posting…".
      toast(t("errors.generic"), "error");
    } finally {
      setPosting(false);
    }
  }

  async function handleSaveEdit(comment: CommentWithAuthor) {
    if (editDraft.trim().length === 0) {
      toast(t("comments.cannotBeEmpty"), "error");
      return;
    }
    setSavingEdit(true);
    try {
      const result = await editComment(comment.id, editDraft);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      setEditingId(null);
      toast(t("comments.updated"));
      router.refresh();
    } catch {
      toast(t("errors.generic"), "error");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="space-y-4" data-realtime-mode={commentsRealtimeMode} data-realtime-channel="comments">
      {comments.length === 0 ? (
        <p className="text-sm text-muted">{t("comments.noCommentsBody")}</p>
      ) : (
        <>
          {hiddenCount > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
              {t("comments.loadOlderCount", { count: hiddenCount })}
            </Button>
          ) : null}
          <ul className="space-y-4">
            {visible.map((comment) => {
              const isOwn = comment.author_id === currentUserId;
              const canDelete = role === "manager" || isOwn;
              const authorName = comment.author?.full_name || t("common.memberFallback");
              return (
                <li key={comment.id} className="flex gap-3">
                  <Avatar name={authorName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium text-ink">{authorName}</span>
                      <span className="text-xs text-muted" title={new Date(comment.created_at).toISOString()}>
                        {formatTime(comment.created_at)}
                        {comment.updated_at !== comment.created_at ? t("comments.editedSuffix") : ""}
                      </span>
                    </div>
                    {editingId === comment.id ? (
                      <div className="mt-1.5 space-y-2">
                        <Textarea
                          aria-label={t("comments.editAria")}
                          value={editDraft}
                          maxLength={2000}
                          onChange={(e) => setEditDraft(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={savingEdit} onClick={() => void handleSaveEdit(comment)}>
                            {savingEdit ? t("common.saving") : t("common.save")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{comment.content}</p>
                    )}
                    {editingId !== comment.id && (isOwn || canDelete) ? (
                      <div className="mt-1 flex gap-1">
                        {isOwn ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t("comments.editAria")}
                            onClick={() => {
                              setEditingId(comment.id);
                              setEditDraft(comment.content);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t("comments.deleteAria")}
                            onClick={() => setDeleting(comment)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <div ref={bottomRef} />
        </>
      )}

      <form onSubmit={handlePost} className="space-y-2 border-t border-ink/10 pt-4">
        <Textarea
          aria-label={t("comments.writeAria")}
          placeholder={t("comments.postPlaceholder")}
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">{draft.length}/2000</span>
          <Button type="submit" size="sm" disabled={posting || draft.trim().length === 0}>
            {posting ? t("comments.posting") : t("comments.postComment")}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("comments.deleteTitle")}
        description={t("comments.deleteBody")}
        confirmLabel={t("comments.deleteLabel")}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            const result = await deleteComment(deleting.id);
            if (result.error) return result;
          } catch {
            // Return an error object instead of throwing, so the dialog's
            // own pending state resets instead of sticking on "Deleting…".
            return { error: t("errors.generic") };
          }
          setDeleting(null);
          toast(t("comments.deleted"));
          router.refresh();
        }}
      />
    </div>
  );
}
