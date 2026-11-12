import type { Metadata } from "next";
import { PublicHeader } from "@/components/landing/public-header";
import { PublicFooter } from "@/components/landing/public-footer";
import { createClient } from "@/lib/supabase/server";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Developers — TaskOrbit",
  description: "The three developers who built TaskOrbit as a university project.",
};

const DEVELOPERS = [
  { initials: "MS", name: "Mosayeb Siam", color: "#6658F5" },
  { initials: "NZ", name: "Nabil Zaman", color: "#16C8E8" },
  { initials: "M", name: "Mamshad", color: "#2DD4BF" },
] as const;

export default async function DevelopersPage() {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <div className="min-h-screen bg-background text-ink">
      <PublicHeader loggedIn={!!user} />
      <main id="main" className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">{t("publicPages.developersTitle")}</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">{t("publicPages.developersIntro")}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {DEVELOPERS.map((d) => (
            <article key={d.name} className="rounded-2xl bg-surface p-6 text-center ring-1 ring-ink/10">
              <span
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full font-heading text-xl font-bold text-white"
                style={{ backgroundColor: d.color }}
                aria-hidden="true"
              >
                {d.initials}
              </span>
              <h2 className="mt-4 font-heading text-base font-semibold">{d.name}</h2>
            </article>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted">{t("publicPages.developersNote")}</p>
      </main>
      <PublicFooter locale={locale} />
    </div>
  );
}
