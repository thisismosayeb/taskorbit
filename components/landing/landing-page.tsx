"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight, BarChart3, Bell, CalendarDays, CheckCircle2,
  FolderKanban, History, LayoutDashboard, ListChecks, MessageSquare,
  Sparkles, Timer, Users, Workflow, Orbit,
} from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { PublicHeader } from "@/components/landing/public-header";
import { PublicFooter } from "@/components/landing/public-footer";
import { LiquidProgress } from "@/components/motion/liquid-progress";
import { Badge } from "@/components/ui/badge";
import { t, useLocale} from "@/lib/i18n";

gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  { icon: FolderKanban, titleKey: "landing.featurePlanning", bodyKey: "landing.featurePlanningBody" },
  { icon: Users, titleKey: "landing.featureAssignment", bodyKey: "landing.featureAssignmentBody" },
  { icon: ListChecks, titleKey: "landing.featureSubtasks", bodyKey: "landing.featureSubtasksBody" },
  { icon: Timer, titleKey: "landing.featureDeadlines", bodyKey: "landing.featureDeadlinesBody" },
  { icon: MessageSquare, titleKey: "landing.featureComments", bodyKey: "landing.featureCommentsBody" },
  { icon: Workflow, titleKey: "landing.featureWorkspaces", bodyKey: "landing.featureWorkspacesBody" },
  { icon: LayoutDashboard, titleKey: "landing.featureBoard", bodyKey: "landing.featureBoardBody" },
  { icon: CalendarDays, titleKey: "landing.featureCalendar", bodyKey: "landing.featureCalendarBody" },
  { icon: BarChart3, titleKey: "landing.featureAnalytics", bodyKey: "landing.featureAnalyticsBody" },
  { icon: Bell, titleKey: "landing.featureNotifications", bodyKey: "landing.featureNotificationsBody" },
  { icon: History, titleKey: "landing.featureActivity", bodyKey: "landing.featureActivityBody" },
  { icon: Sparkles, titleKey: "landing.featureAi", bodyKey: "landing.featureAiBody" },
] as const;

const STEPS = [
  { n: "1", titleKey: "landing.howStep1Title", bodyKey: "landing.howStep1Body" },
  { n: "2", titleKey: "landing.howStep2Title", bodyKey: "landing.howStep2Body" },
  { n: "3", titleKey: "landing.howStep3Title", bodyKey: "landing.howStep3Body" },
  { n: "4", titleKey: "landing.howStep4Title", bodyKey: "landing.howStep4Body" },
] as const;

const DEVELOPERS = [
  { initials: "MS", name: "Mosayeb Siam", color: "#6658F5" },
  { initials: "NZ", name: "Nabil Zaman", color: "#16C8E8" },
  { initials: "M", name: "Mamshad", color: "#2DD4BF" },
] as const;

const DEADLINE_DEMO = [
  { id: "onTime", variant: "green" as const, labelKey: "landing.deadlineDemoOnTime", bodyKey: "landing.deadlineDemoOnTimeBody" },
  { id: "overdue", variant: "red" as const, labelKey: "landing.deadlineDemoOverdue", bodyKey: "landing.deadlineDemoOverdueBody" },
  { id: "late", variant: "amber" as const, labelKey: "landing.deadlineDemoLate", bodyKey: "landing.deadlineDemoLateBody" },
  { id: "due", variant: "cyan" as const, labelKey: "landing.deadlineDemoDue", bodyKey: "landing.deadlineDemoDueBody" },
] as const;

/** Mini dashboard preview, built in HTML/SVG — an illustration, not live data. */
function DashboardPreview() {
  useLocale();
  return (
    <div className="relative mx-auto mt-12 max-w-4xl text-left" aria-label={t("landing.previewCaption")}>
      {/* orbit ring behind the preview */}
      <div className="animate-orbit-spin pointer-events-none absolute -top-10 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full border border-dashed border-primary/30" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-2xl bg-surface shadow-xl ring-1 ring-ink/10">
        <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-coral" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-mint" />
          <span className="ml-2 text-xs font-medium text-muted">TaskOrbit — Website Redesign</span>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_220px] sm:p-5">
          <div className="space-y-3">
            {[
              { title: "Design homepage", chip: "In progress", chipClass: "bg-cyanbrand/15 text-cyan-700", initials: "MS", color: "#6658F5" },
              { title: "Build login page", chip: "Completed on time", chipClass: "bg-green-100 text-green-800", initials: "NZ", color: "#16C8E8" },
              { title: "Fix footer links", chip: "Overdue", chipClass: "bg-red-100 text-red-700", initials: "M", color: "#FF7D70" },
            ].map((task, i) => (
              <div
                key={task.title}
                className="animate-float-soft flex items-center gap-3 rounded-xl border border-ink/10 bg-background p-3"
                style={{ animationDelay: `${i * 0.7}s` }}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: task.color }}
                >
                  {task.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{task.title}</span>
                  <span className="block text-xs text-muted">Website Redesign · due 20 Nov</span>
                </span>
                <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-block ${task.chipClass}`}>
                  {task.chip}
                </span>
              </div>
            ))}
            {/* mini timeline */}
            <div className="rounded-xl border border-ink/10 bg-background p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">This week</p>
              <div className="mt-2 flex items-center gap-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => (
                  <div key={d} className="flex-1 text-center">
                    <div
                      className="mx-auto h-8 rounded-md"
                      style={{ backgroundColor: i < 3 ? "#6658F5" : i === 3 ? "#16C8E8" : "#E4E9F5", opacity: i < 3 ? 0.9 : 1 }}
                    />
                    <span className="mt-1 block text-[10px] text-muted">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-ink/10 bg-background p-4">
            <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="67% complete">
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--surface-2)" strokeWidth="12" />
              <circle
                cx="60" cy="60" r="50" fill="none" stroke="#6658F5" strokeWidth="12" strokeLinecap="round"
                strokeDasharray="314" strokeDashoffset={314 * 0.33} transform="rotate(-90 60 60)"
              />
              <text x="60" y="66" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--ink)">67%</text>
            </svg>
            <p className="text-center text-xs text-muted">2 of 3 tasks done</p>
            <div className="flex -space-x-2">
              {DEVELOPERS.map((d) => (
                <span
                  key={d.initials}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-surface"
                  style={{ backgroundColor: d.color }}
                >
                  {d.initials}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* floating status chips */}
      <span className="animate-float absolute -right-2 -top-4 hidden rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-800 shadow-md sm:inline-block">
        ✓ Completed on time
      </span>
      <span
        className="animate-float absolute -left-3 bottom-16 hidden rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-md sm:inline-block"
        style={{ animationDelay: "1.2s" }}
      >
        ● Overdue by 2 days
      </span>
      <p className="mt-4 text-center text-xs text-muted">{t("landing.previewCaption")}</p>
    </div>
  );
}

export function LandingPage({ loggedIn }: { loggedIn: boolean }) {
  useLocale();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [showcase, setShowcase] = React.useState<"manager" | "developer">("manager");
  const [demo, setDemo] = React.useState<(typeof DEADLINE_DEMO)[number]["id"]>("onTime");

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-hero]",
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.7, stagger: 0.12, ease: "power2.out", clearProps: "transform" },
      );
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 28 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            ease: "power2.out",
            clearProps: "transform,opacity",
            scrollTrigger: { trigger: el, start: "top 88%" },
          },
        );
      });
    }, root);
    return () => ctx.revert();
  }, []);

  React.useEffect(() => {
    // Showcase switch: short fade/slide, transform + opacity only.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(
      "[data-showcase-panel]",
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", clearProps: "all" },
    );
  }, [showcase]);

  const activeDemo = DEADLINE_DEMO.find((d) => d.id === demo)!;

  return (
    <div ref={rootRef} className="min-h-screen bg-background text-ink">
      <PublicHeader loggedIn={loggedIn} />
      <main id="main">
        {/* HERO */}
        <section className="relative overflow-hidden px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl text-center">
            <p data-hero className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary">
              <Orbit className="h-3.5 w-3.5" /> {t("app.tagline")}
            </p>
            <h1 data-hero className="mx-auto mt-5 max-w-3xl font-heading text-4xl font-bold leading-[1.1] sm:text-5xl lg:text-6xl">
              Turn Big Ideas Into <span className="gradient-text">Brilliantly Managed</span> Projects.
            </h1>
            <p data-hero className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              {t("landing.heroSub")}
            </p>
            <div data-hero className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:opacity-90"
              >
                {t("landing.getStartedFree")} <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="rounded-xl bg-surface px-6 py-3.5 text-sm font-semibold text-ink ring-1 ring-ink/15 transition hover:-translate-y-0.5 hover:bg-background"
              >
                {t("landing.exploreFeatures")}
              </a>
            </div>
            <DashboardPreview />
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" aria-labelledby="features-title" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
          <div data-reveal className="text-center">
            <h2 id="features-title" className="font-heading text-3xl font-bold sm:text-4xl">{t("landing.featuresTitle")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted">{t("landing.featuresSubtitle")}</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.titleKey} data-reveal className="hover-lift rounded-2xl bg-surface p-5 ring-1 ring-ink/10">
                <f.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-heading text-base font-semibold">{t(f.titleKey)}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{t(f.bodyKey)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" aria-labelledby="how-title" className="bg-surface/60 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div data-reveal className="text-center">
              <h2 id="how-title" className="font-heading text-3xl font-bold sm:text-4xl">{t("landing.howTitle")}</h2>
              <p className="mx-auto mt-3 max-w-xl text-muted">{t("landing.howSubtitle")}</p>
            </div>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.n} data-reveal className="relative rounded-2xl bg-surface p-5 ring-1 ring-ink/10">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-heading text-lg font-bold text-white">
                    {s.n}
                  </span>
                  <h3 className="mt-4 font-heading text-base font-semibold">{t(s.titleKey)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{t(s.bodyKey)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* SHOWCASE */}
        <section id="showcase" aria-labelledby="showcase-title" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
          <div data-reveal className="text-center">
            <h2 id="showcase-title" className="font-heading text-3xl font-bold sm:text-4xl">{t("landing.showcaseTitle")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted">{t("landing.showcaseSubtitle")}</p>
          </div>
          <div data-reveal className="mt-8 flex justify-center gap-2" role="tablist" aria-label={t("landing.showcaseTitle")}>
            {(["manager", "developer"] as const).map((role) => (
              <button
                key={role}
                type="button"
                role="tab"
                aria-selected={showcase === role}
                onClick={() => setShowcase(role)}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                  showcase === role ? "bg-primary text-white shadow-md" : "bg-surface text-ink ring-1 ring-ink/15 hover:bg-background"
                }`}
              >
                {role === "manager" ? t("landing.showcaseManager") : t("landing.showcaseDeveloper")}
              </button>
            ))}
          </div>
          <div data-showcase-panel data-reveal className="mx-auto mt-6 max-w-3xl rounded-2xl bg-surface p-6 ring-1 ring-ink/10 sm:p-8" role="tabpanel">
            <h3 className="font-heading text-xl font-bold">
              {showcase === "manager" ? t("landing.showcaseManager") : t("landing.showcaseDeveloper")}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {showcase === "manager" ? t("landing.showcaseManagerBody") : t("landing.showcaseDeveloperBody")}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {showcase === "manager" ? (
                <>
                  <div className="rounded-xl bg-background p-4"><p className="text-xs text-muted">Projects</p><p className="mt-1 font-heading text-2xl font-bold">12</p></div>
                  <div className="rounded-xl bg-background p-4"><p className="text-xs text-muted">Overdue</p><p className="mt-1 font-heading text-2xl font-bold text-red-600">3</p></div>
                  <div className="rounded-xl bg-background p-4"><p className="text-xs text-muted">Completed</p><p className="mt-1 font-heading text-2xl font-bold text-green-600">48</p></div>
                </>
              ) : (
                <>
                  <div className="rounded-xl bg-background p-4"><p className="text-xs text-muted">My tasks</p><p className="mt-1 font-heading text-2xl font-bold">5</p></div>
                  <div className="rounded-xl bg-background p-4"><p className="text-xs text-muted">Due today</p><p className="mt-1 font-heading text-2xl font-bold text-amber-600">2</p></div>
                  <div className="rounded-xl bg-background p-4"><p className="text-xs text-muted">Done</p><p className="mt-1 font-heading text-2xl font-bold text-green-600">9</p></div>
                </>
              )}
            </div>
            <p className="mt-4 text-xs text-muted">{t("landing.previewCaption")}</p>
          </div>
        </section>

        {/* DEADLINE COLORS DEMO */}
        <section aria-labelledby="deadline-title" className="bg-surface/60 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div data-reveal className="text-center">
              <h2 id="deadline-title" className="font-heading text-3xl font-bold sm:text-4xl">{t("landing.deadlineDemoTitle")}</h2>
              <p className="mx-auto mt-3 max-w-xl text-muted">{t("landing.deadlineDemoBody")}</p>
            </div>
            <div data-reveal className="mt-8 flex flex-wrap justify-center gap-3">
              {DEADLINE_DEMO.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={demo === d.id}
                  onClick={() => setDemo(d.id)}
                  className={`rounded-full px-4 py-2 ring-2 transition ${demo === d.id ? "ring-primary" : "ring-transparent"}`}
                >
                  <Badge variant={d.variant}>{t(d.labelKey)}</Badge>
                </button>
              ))}
            </div>
            <p data-reveal className="mx-auto mt-5 max-w-xl text-center text-sm leading-relaxed text-muted">
              <Badge variant={activeDemo.variant}>{t(activeDemo.labelKey)}</Badge>
              <span className="ml-2">{t(activeDemo.bodyKey)}</span>
            </p>
          </div>
        </section>

        {/* UI DETAILS */}
        <section aria-labelledby="ui-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div data-reveal className="text-center">
            <h2 id="ui-title" className="font-heading text-3xl font-bold sm:text-4xl">{t("landing.uiTitle")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted">{t("landing.uiSubtitle")}</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article data-reveal className="rounded-2xl bg-surface p-5 ring-1 ring-ink/10">
              <h3 className="font-heading text-base font-semibold">{t("landing.uiBoard")}</h3>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                {["To do", "In progress", "Done"].map((col, i) => (
                  <div key={col} className="rounded-lg bg-background p-2">
                    <p className="font-semibold text-muted">{col}</p>
                    <div className="mt-2 space-y-1.5">
                      {Array.from({ length: i === 1 ? 2 : 1 }).map((_, j) => (
                        <div key={j} className="rounded-md bg-surface p-2 ring-1 ring-ink/10">Task {i + 1}.{j + 1}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <article data-reveal className="rounded-2xl bg-surface p-5 ring-1 ring-ink/10">
              <h3 className="font-heading text-base font-semibold">{t("landing.uiCalendar")}</h3>
              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px]">
                {Array.from({ length: 14 }).map((_, i) => (
                  <div
                    key={i}
                    className={`rounded-md py-2 ${i === 4 ? "bg-primary font-bold text-white" : i === 9 ? "bg-red-100 font-bold text-red-700" : "bg-background text-muted"}`}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </article>
            <article data-reveal className="rounded-2xl bg-surface p-5 ring-1 ring-ink/10">
              <h3 className="font-heading text-base font-semibold">{t("landing.uiComments")}</h3>
              <div className="mt-3 space-y-2 text-xs">
                <div className="rounded-lg bg-background p-2.5"><span className="font-semibold">MS</span> <span className="text-muted">Homepage design is ready for review.</span></div>
                <div className="rounded-lg bg-background p-2.5"><span className="font-semibold">NZ</span> <span className="text-muted">Looks good — moving it to review.</span></div>
              </div>
            </article>
            <article data-reveal className="rounded-2xl bg-surface p-5 ring-1 ring-ink/10">
              <h3 className="font-heading text-base font-semibold">{t("landing.uiProgress")}</h3>
              <div className="mt-4"><LiquidProgress percent={67} variant="bar" accent="manager" label={t("progress.aria", { percent: "67%" })} /></div>
              <p className="mt-2 text-xs text-muted">2 of 3 tasks done — 67%</p>
            </article>
            <article data-reveal className="rounded-2xl bg-surface p-5 ring-1 ring-ink/10">
              <h3 className="font-heading text-base font-semibold">{t("landing.uiAnalytics")}</h3>
              <div className="mt-3 flex items-end gap-2" aria-hidden="true">
                {[40, 65, 30, 80, 55].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-md bg-primary/80" style={{ height: `${h}px`, opacity: 0.5 + i * 0.12 }} />
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Completed tasks per week</p>
            </article>
            <article data-reveal className="rounded-2xl bg-gradient-to-br from-primary to-cyanbrand p-5 text-white">
              <h3 className="font-heading text-base font-semibold">{t("landing.featureAi")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/90">{t("landing.aiPoint1")}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/90">{t("landing.aiPoint2")}</p>
            </article>
          </div>
        </section>

        {/* AI */}
        <section aria-labelledby="ai-title" className="bg-surface/60 py-16">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <Sparkles data-reveal className="mx-auto h-8 w-8 text-primary" />
            <h2 data-reveal id="ai-title" className="mt-4 font-heading text-3xl font-bold sm:text-4xl">{t("landing.aiTitle")}</h2>
            <p data-reveal className="mt-4 text-sm leading-relaxed text-muted sm:text-base">{t("landing.aiBody")}</p>
            <ul data-reveal className="mx-auto mt-6 max-w-xl space-y-2 text-left text-sm text-muted">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint" />{t("landing.aiPoint1")}</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint" />{t("landing.aiPoint2")}</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint" />{t("landing.aiPoint3")}</li>
            </ul>
          </div>
        </section>

        {/* DEVELOPERS */}
        <section id="developers" aria-labelledby="developers-title" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
          <div data-reveal className="text-center">
            <h2 id="developers-title" className="font-heading text-3xl font-bold sm:text-4xl">{t("landing.developersTitle")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted">{t("landing.developersSubtitle")}</p>
          </div>
          <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
            {DEVELOPERS.map((d) => (
              <article key={d.name} data-reveal className="hover-lift rounded-2xl bg-surface p-6 text-center ring-1 ring-ink/10">
                <span
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-full font-heading text-xl font-bold text-white"
                  style={{ backgroundColor: d.color }}
                  aria-hidden="true"
                >
                  {d.initials}
                </span>
                <h3 className="mt-4 font-heading text-base font-semibold">{d.name}</h3>
              </article>
            ))}
          </div>
        </section>

        {/* FINAL CTA */}
        <section aria-labelledby="cta-title" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div data-reveal className="rounded-3xl bg-gradient-to-br from-primary via-[#7A5CFF] to-cyanbrand px-6 py-14 text-center text-white sm:px-12">
            <h2 id="cta-title" className="font-heading text-3xl font-bold sm:text-4xl">{t("landing.finalCtaTitle")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/85">{t("landing.finalCtaBody")}</p>
            <Link
              href="/signup"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-primary transition hover:-translate-y-0.5"
            >
              {t("landing.finalCtaButton")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
