"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderKanban, SquareKanban, ListChecks, Calendar, Activity, BarChart3, Bell, Users, Settings, Menu, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoIcon } from "@/components/brand/logo";
import { t, useLocale} from "@/lib/i18n";

const links = [
  { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
  { href: "/dashboard/projects", label: t("nav.projects"), icon: FolderKanban },
  { href: "/dashboard/board", label: t("nav.board"), icon: SquareKanban },
  { href: "/dashboard/my-tasks", label: t("nav.myTasks"), icon: ListChecks },
  { href: "/dashboard/tasks", label: t("nav.allTasks"), icon: ListChecks },
  { href: "/dashboard/calendar", label: t("nav.calendar"), icon: Calendar },
  { href: "/dashboard/activity", label: t("nav.activity"), icon: Activity },
  { href: "/dashboard/analytics", label: t("nav.analytics"), icon: BarChart3 },
  { href: "/dashboard/ai", label: t("nav.ai"), icon: Sparkles },
  { href: "/dashboard/notifications", label: t("nav.notifications"), icon: Bell },
  { href: "/dashboard/team", label: t("nav.team"), icon: Users },
  { href: "/dashboard/settings", label: t("nav.settings"), icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  useLocale();
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label={t("sidebar.dashboardAria")}>
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-roleaccent/10 text-roleaccent" : "text-ink/80 hover:bg-background hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ workspaceName }: { workspaceName: string }) {
  useLocale();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {/* Mobile top strip with menu button */}
      <div className="flex items-center justify-between border-b border-ink/10 bg-surface px-4 py-3 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-heading text-lg font-bold text-ink">
          <LogoIcon size={32} />
          {t("app.name")}
        </Link>
        <button
          type="button"
          aria-label={open ? t("sidebar.closeMenu") : t("sidebar.openMenu")}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 text-ink hover:bg-background"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t("sidebar.navMenu")}>
          <button aria-label={t("sidebar.closeMenu")} className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
              <span className="font-heading text-lg font-bold text-ink">{t("app.name")}</span>
              <button type="button" aria-label={t("sidebar.closeMenu")} onClick={() => setOpen(false)} className="rounded-md p-2 hover:bg-background">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="truncate px-4 pt-3 text-xs font-medium uppercase tracking-wide text-muted">{workspaceName}</p>
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink/10 bg-surface lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2 border-b border-ink/10 px-5 py-4 font-heading text-xl font-bold text-ink">
          <LogoIcon size={32} />
          {t("app.name")}
        </Link>
        <p className="truncate px-5 pt-4 text-xs font-medium uppercase tracking-wide text-muted">{workspaceName}</p>
        <NavLinks />
      </aside>
    </>
  );
}
