// TaskOrbit AI — feature card (client component, Part 3, spec section 8).
//
// One card per AI feature: generate/refresh button, a loader while the
// model works, the validated result, a "Generated with AI" label, the
// generation time and the "AI can be wrong" note. Every task/project a
// result mentions links to the real task/project (references the model
// invented are already dropped server-side).
//
// NOTE: the spec's Wave Loader lives in components/motion/wave-loader.tsx,
// owned by another Part 3 track — it does not exist yet in this tree, so
// this card uses a simple local spinner for now. Swap the loader in when
// the motion track lands; nothing else in this file needs to change.

"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { generateAiFeature } from "@/lib/actions/ai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AiFeature } from "@/lib/ai/features";
import type { AiOutput } from "@/lib/ai/schemas";
import { t, useLocale} from "@/lib/i18n";

function TaskLink({ taskId, title }: { taskId: string; title: string }) {
  return (
    <Link href={`/dashboard/tasks/${taskId}`} className="font-medium hover:text-primary hover:underline">
      {title}
    </Link>
  );
}

function ProjectLink({ projectId, name }: { projectId: string; name: string }) {
  return (
    <Link href={`/dashboard/projects/${projectId}`} className="font-medium hover:text-primary hover:underline">
      {name}
    </Link>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0">{children}</h3>;
}

function ReasonLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

/** Structured rendering of one validated AI result. */
export function AiResultView({ feature, content }: { feature: AiFeature; content: AiOutput[AiFeature] }) {
  useLocale();
  switch (feature) {
    case "daily_brief": {
      const b = content as AiOutput["daily_brief"];
      return (
        <div className="space-y-2">
          <p className="font-medium">{b.headline}</p>
          <SectionTitle>{t("ai.activeProjects")}</SectionTitle>
          {b.activeProjects.length === 0 ? (
            <ReasonLine>{t("ai.noResult")}</ReasonLine>
          ) : (
            <ul className="space-y-1 text-sm">
              {b.activeProjects.map((p) => (
                <li key={p.projectId} className="flex flex-wrap items-center justify-between gap-2">
                  <ProjectLink projectId={p.projectId} name={p.name} />
                  <span className="text-xs text-muted">
                    {t("ai.completion", { percent: p.completionPercent })} · {t("ai.openTasks", { count: p.openTasks })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <SectionTitle>{t("ai.recentlyCompleted")}</SectionTitle>
          <ul className="space-y-1 text-sm">
            {b.recentlyCompleted.map((x) => (
              <li key={x.taskId}>
                <TaskLink taskId={x.taskId} title={x.title} />
              </li>
            ))}
          </ul>
          <SectionTitle>{t("ai.upcoming")}</SectionTitle>
          <ul className="space-y-1 text-sm">
            {b.upcoming.map((x) => (
              <li key={x.taskId}>
                <TaskLink taskId={x.taskId} title={x.title} />{" "}
                <span className="text-xs text-muted">
                  {x.dueDate ?? ""} {x.reason ? `— ${x.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <SectionTitle>{t("ai.overdue")}</SectionTitle>
          <ul className="space-y-1 text-sm">
            {b.overdue.map((x) => (
              <li key={x.taskId}>
                <TaskLink taskId={x.taskId} title={x.title} />{" "}
                <span className="text-xs text-muted">
                  {x.dueDate ?? ""} {x.reason ? `— ${x.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {b.blockers.length > 0 ? (
            <>
              <SectionTitle>{t("ai.blockers")}</SectionTitle>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {b.blockers.map((x, i) => (
                  <li key={i}>{x.text}</li>
                ))}
              </ul>
            </>
          ) : null}
          <SectionTitle>{t("ai.nextActions")}</SectionTitle>
          <ul className="space-y-1 text-sm">
            {b.nextActions.map((a, i) => (
              <li key={i}>
                {a.taskId ? (
                  <TaskLink taskId={a.taskId} title={a.text} />
                ) : a.projectId ? (
                  <ProjectLink projectId={a.projectId} name={a.text} />
                ) : (
                  a.text
                )}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "project_summary": {
      const s = content as AiOutput["project_summary"];
      return (
        <div className="space-y-2">
          <p className="text-sm">{s.summary}</p>
          <p className="text-sm text-muted">
            {s.status} · {t("ai.completion", { percent: s.completionPercent })} ·{" "}
            {t("ai.activeTasks", { count: s.activeTasks })}
          </p>
          <SectionTitle>{t("ai.assignees")}</SectionTitle>
          <ul className="space-y-1 text-sm">
            {s.assignees.map((a) => (
              <li key={a.name}>
                {a.name} — {t("ai.openTasks", { count: a.openTasks })}
              </li>
            ))}
          </ul>
          {s.risks.length > 0 ? (
            <>
              <SectionTitle>{t("ai.risks")}</SectionTitle>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {s.risks.map((r, i) => (
                  <li key={i}>
                    {r.text} <span className="text-xs text-muted">({r.severity})</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <SectionTitle>{t("ai.latestActivity")}</SectionTitle>
          <ul className="space-y-1 text-sm text-muted">
            {s.latestActivity.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      );
    }
    case "my_focus": {
      const f = content as AiOutput["my_focus"];
      return (
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {f.orderedTasks.map((x) => (
            <li key={x.taskId}>
              <TaskLink taskId={x.taskId} title={x.title} />
              <ReasonLine>{x.reason}</ReasonLine>
            </li>
          ))}
        </ol>
      );
    }
    case "deadline_risk": {
      const d = content as AiOutput["deadline_risk"];
      return (
        <ul className="space-y-2 text-sm">
          {d.risks.map((r) => (
            <li key={r.taskId}>
              <TaskLink taskId={r.taskId} title={r.title} />{" "}
              <span className="text-xs text-muted">
                {r.dueDate ?? ""} · {r.likelihood}
              </span>
              <ReasonLine>{r.reason}</ReasonLine>
            </li>
          ))}
        </ul>
      );
    }
    case "standup": {
      const s = content as AiOutput["standup"];
      const list = (items: { taskId?: string; text: string }[]) => (
        <ul className="space-y-1 text-sm">
          {items.map((x, i) => (
            <li key={i}>{x.taskId ? <TaskLink taskId={x.taskId} title={x.text} /> : x.text}</li>
          ))}
        </ul>
      );
      return (
        <div className="space-y-2">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("ai.standupDraftNote")}</p>
          <SectionTitle>{t("ai.done")}</SectionTitle>
          {list(s.done)}
          <SectionTitle>{t("ai.inProgress")}</SectionTitle>
          {list(s.inProgress)}
          <SectionTitle>{t("ai.blocked")}</SectionTitle>
          {list(s.blocked)}
          <SectionTitle>{t("ai.next")}</SectionTitle>
          {list(s.next)}
        </div>
      );
    }
    case "next_actions": {
      const n = content as AiOutput["next_actions"];
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {n.actions.map((a, i) => (
            <li key={i}>
              {a.taskId ? (
                <TaskLink taskId={a.taskId} title={a.text} />
              ) : a.projectId ? (
                <ProjectLink projectId={a.projectId} name={a.text} />
              ) : (
                a.text
              )}
            </li>
          ))}
        </ul>
      );
    }
  }
}

export interface AiFeatureCardProps {
  feature: AiFeature;
  title: string;
  body: string;
  projectOptions?: { id: string; name: string }[];
  initialContent?: AiOutput[AiFeature] | null;
  initialGeneratedAt?: string | null;
}

export function AiFeatureCard({
  feature,
  title,
  body,
  projectOptions,
  initialContent,
  initialGeneratedAt,
}: AiFeatureCardProps) {
  useLocale();
  const [content, setContent] = React.useState<AiOutput[AiFeature] | null>(initialContent ?? null);
  const [generatedAt, setGeneratedAt] = React.useState<string | null>(initialGeneratedAt ?? null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [projectId, setProjectId] = React.useState<string>(projectOptions?.[0]?.id ?? "");

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateAiFeature(feature, projectId ? { projectId } : {});
      if (result.ok) {
        setContent(result.content);
        setGeneratedAt(result.generatedAt);
      } else {
        setError(result.error);
      }
    } catch {
      setError(t("ai.errorTitle"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              {title}
            </CardTitle>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </div>
          <div className="flex items-center gap-2">
            {projectOptions && projectOptions.length > 0 ? (
              <label className="sr-only" htmlFor={`ai-project-${feature}`}>
                {t("ai.chooseProject")}
              </label>
            ) : null}
            {projectOptions && projectOptions.length > 0 ? (
              <select
                id={`ai-project-${feature}`}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={loading}
                className="h-10 rounded-lg border border-ink/15 bg-surface px-3 text-sm"
              >
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Button onClick={handleGenerate} disabled={loading} size="md">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : content ? (
                <RefreshCw className="h-4 w-4" aria-hidden />
              ) : (
                <Wand2 className="h-4 w-4" aria-hidden />
              )}
              {loading ? t("ai.generating") : content ? t("ai.refresh") : t("ai.generate")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t("ai.generating")}
          </p>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={handleGenerate}>
              {t("ai.tryAgain")}
            </Button>
          </div>
        ) : content ? (
          <>
            <AiResultView feature={feature} content={content} />
            <p className="mt-4 flex flex-wrap items-center gap-x-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" aria-hidden />
                {t("ai.generatedWithAi")}
              </span>
              {generatedAt ? <span>{t("ai.generatedAt", { date: new Date(generatedAt).toLocaleString() })}</span> : null}
              <span>{t("ai.aiCanBeWrong")}</span>
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">{t("ai.noResult")}</p>
        )}
      </CardContent>
    </Card>
  );
}
