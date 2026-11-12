// Global search dialog (Part 2, §3).
//
// Self-contained: it renders its own trigger button and dialog, and
// registers its own Ctrl/Cmd+K listener. No required props — the dashboard
// shell mounts <SearchDialog /> wherever the trigger belongs.
//
// Searches the ACTIVE workspace only (projects by name, tasks/subtasks by
// title, members by name), debounced 300 ms, max 20 results grouped by
// type, keyboard navigable (↑/↓ + Enter). Each result links to the real
// page: a project, a task (or subtask) detail page, or the Team page for
// a member. The search runs through the server action
// lib/actions/search.ts, so RLS still applies.

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderKanban, ListChecks, Search, Users } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchWorkspace, type SearchResults } from "@/lib/actions/search";
import { t, useLocale} from "@/lib/i18n";

const EMPTY: SearchResults = { projects: [], tasks: [], members: [] };

interface FlatResult {
  key: string;
  label: string;
  hint: string;
  href: string;
  group: "projects" | "tasks" | "members";
}

export default function SearchDialog() {
  useLocale();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResults>(EMPTY);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+K toggles the dialog from anywhere in the dashboard.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Debounced 300 ms search; fewer than 2 characters searches nothing.
  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      void searchWorkspace(q).then((res) => {
        setResults(res.results ?? EMPTY);
        setLoading(false);
        setActive(0);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open ]);

  function close() {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
  }

  const flat: FlatResult[] = [
    ...results.projects.map((p) => ({
      key: `project-${p.id}`,
      label: p.name,
      hint: t("search.hintProject"),
      href: `/dashboard/projects/${p.id}`,
      group: "projects" as const,
    })),
    ...results.tasks.map((task) => ({
      key: `task-${task.id}`,
      label: task.title,
      hint: `${task.isSubtask ? t("search.hintSubtask") : t("search.hintTask")} · ${task.projectName}`,
      href: `/dashboard/tasks/${task.id}`,
      group: "tasks" as const,
    })),
    ...results.members.map((m) => ({
      key: `member-${m.id}`,
      label: m.name ?? t("common.memberFallback"),
      hint: t("search.hintMember"),
      href: "/dashboard/team",
      group: "members" as const,
    })),
  ];

  function goTo(index: number) {
    const item = flat[index];
    if (!item) return;
    close();
    router.push(item.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(0, flat.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      goTo(active);
    }
  }

  const total = flat.length;
  const searched = query.trim().length >= 2;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("search.openAria")}
        className="inline-flex items-center gap-2 rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-muted hover:text-ink"
      >
        <Search className="h-4 w-4" />
        <span>{t("search.trigger")}</span>
        <kbd className="rounded border border-ink/15 bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted">
          Ctrl K
        </kbd>
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => (v ? setOpen(true) : close())}
        title={t("search.title")}
        description={t("search.description")}
      >
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder={t("search.placeholder")}
          aria-label={t("search.inputAria")}
          role="combobox"
          aria-expanded={searched && total > 0}
          aria-controls="search-results"
          aria-activedescendant={flat[active] ? flat[active].key : undefined}
        />

        {loading ? (
          <p className="text-sm text-muted" role="status">
            {t("search.searching")}
          </p>
        ) : null}

        {!loading && searched && total === 0 ? (
          <p className="text-sm text-muted">{t("search.noMatches")}</p>
        ) : null}

        {total > 0 ? (
          <div id="search-results" role="listbox" aria-label={t("search.resultsAria")} className="space-y-4">
            {([
              ["projects", t("search.groupProjects"), FolderKanban],
              ["tasks", t("search.groupTasks"), ListChecks],
              ["members", t("search.groupPeople"), Users],
            ] as const).map(([group, label, Icon]) => {
              const items = flat.filter((f) => f.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </p>
                  <ul className="overflow-hidden rounded-lg border border-ink/10">
                    {items.map((item) => {
                      const index = flat.indexOf(item);
                      const isActive = index === active;
                      return (
                        <li key={item.key} role="option" id={item.key} aria-selected={isActive}>
                          <Link
                            href={item.href}
                            onClick={close}
                            onMouseEnter={() => setActive(index)}
                            className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                              isActive ? "bg-primary/10 text-primary" : "text-ink hover:bg-background"
                            }`}
                          >
                            <span className="min-w-0 truncate">{item.label}</span>
                            <span className="shrink-0 text-xs text-muted">{item.hint}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : null}

        <p className="text-xs text-muted">
          {total > 0 ? t("search.footerWithResults") : t("search.footerEmpty")} {t("search.footerToggle")}
        </p>
      </Dialog>
    </>
  );
}
