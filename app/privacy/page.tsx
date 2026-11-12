import type { Metadata } from "next";
import { PublicHeader } from "@/components/landing/public-header";
import { PublicFooter } from "@/components/landing/public-footer";
import { createClient } from "@/lib/supabase/server";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Privacy — TaskOrbit",
  description: "In plain words: what data TaskOrbit stores and what it does with it.",
};

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-8">
      <h2 className="font-heading text-xl font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{body}</p>
    </section>
  );
}

export default async function PrivacyPage() {
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
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">{t("publicPages.privacyTitle")}</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">{t("publicPages.privacyIntro")}</p>
        <Section title={t("publicPages.privacyDataTitle")} body={t("publicPages.privacyDataBody")} />
        <Section title={t("publicPages.privacyUseTitle")} body={t("publicPages.privacyUseBody")} />
        <Section title={t("publicPages.privacyAiTitle")} body={t("publicPages.privacyAiBody")} />
        <Section title={t("publicPages.privacyRightsTitle")} body={t("publicPages.privacyRightsBody")} />
        <Section title={t("publicPages.privacyNoCertTitle")} body={t("publicPages.privacyNoCertBody")} />
      </main>
      <PublicFooter locale={locale} />
    </div>
  );
}
