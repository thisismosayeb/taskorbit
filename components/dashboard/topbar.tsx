"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, User as UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setActiveWorkspace, logOutAction } from "@/lib/actions/workspace";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import SearchDialog from "@/components/search/search-dialog";
import type { Workspace, WorkspaceRole, Notification } from "@/types";
import { t, useLocale} from "@/lib/i18n";

export function Topbar({
  workspace,
  memberships,
  role,
  userName,
  userEmail,
  userId,
  initialUnreadCount,
  initialNotifications,
}: {
  workspace: Workspace;
  memberships: { workspace: Workspace }[];
  role: WorkspaceRole;
  userName: string | null;
  userEmail: string | null;
  userId: string;
  initialUnreadCount: number;
  initialNotifications: Notification[];
}) {
  useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

  async function handleSwitch(workspaceId: string) {
    if (workspaceId === workspace.id) return;
    setSwitching(true);
    try {
      const result = await setActiveWorkspace(workspaceId);
      if (result?.error) {
        toast(result.error, "error");
        return;
      }
      router.refresh();
    } finally {
      // A rejecting switch must not leave the select disabled.
      setSwitching(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logOutAction();
    } finally {
      // logOutAction normally navigates away; if it throws, the button
      // must not stick on "Logging out…".
      setLoggingOut(false);
    }
  }

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-ink/10 bg-surface px-4 py-3 sm:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-heading text-base font-semibold text-ink sm:text-lg">{workspace.name}</h1>
        <p className="hidden text-xs text-muted sm:block">{workspace.timezone}</p>
      </div>

      {memberships.length > 1 ? (
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="hidden sm:inline">{t("topbar.workspaceLabel")}</span>
          <select
            aria-label={t("nav.switchWorkspace")}
            value={workspace.id}
            disabled={switching}
            onChange={(e) => void handleSwitch(e.target.value)}
            className="h-9 max-w-[180px] rounded-lg border border-ink/15 bg-surface px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {memberships.map((m) => (
              <option key={m.workspace.id} value={m.workspace.id}>
                {m.workspace.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <Badge variant={role === "manager" ? "primary" : "mint"} title={role === "manager" ? t("topbar.managerHint") : t("topbar.developerHint")}>
        {role === "manager" ? t("roles.manager") : t("roles.developer")}
      </Badge>

      <ThemeSwitcher compact />
      <LanguageSwitcher compact />

      <NotificationBell
        workspaceId={workspace.id}
        userId={userId}
        initialUnreadCount={initialUnreadCount}
        initialNotifications={initialNotifications}
      />

      <SearchDialog />

      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("topbar.userMenu")}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="gap-2"
        >
          <Avatar name={userName} email={userEmail} size="sm" />
          <span className="hidden max-w-[140px] truncate text-sm md:inline">{userName || userEmail || t("topbar.account")}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
        {menuOpen ? (
          <>
            <button aria-label={t("topbar.closeUserMenu")} className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-ink/10 bg-surface p-3 shadow-lg">
              <div className="flex items-center gap-3 border-b border-ink/10 pb-3">
                <Avatar name={userName} email={userEmail} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{userName || t("topbar.account")}</p>
                  <p className="truncate text-xs text-muted">{userEmail}</p>
                  <p className="mt-1 text-xs text-muted">
                    {t("topbar.roleLabel")} <span className="font-medium text-ink">{role === "manager" ? t("roles.manager") : t("roles.developer")}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink hover:bg-background disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                {loggingOut ? t("topbar.loggingOut") : t("nav.logout")}
              </button>
              <p className="mt-2 flex items-center gap-1.5 px-2 text-xs text-muted">
                <UserIcon className="h-3 w-3" /> {t("topbar.signedInAs", { email: userEmail })}
              </p>
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
