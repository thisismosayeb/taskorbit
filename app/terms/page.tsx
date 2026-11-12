import type { Metadata } from "next";
import { PublicHeader } from "@/components/landing/public-header";
import { PublicFooter } from "@/components/landing/public-footer";
import { createClient } from "@/lib/supabase/server";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Terms — TaskOrbit",
  description: "Short, plain terms for using TaskOrbit, a university project.",
};

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-8">
      <h2 className="font-heading text-xl font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{body}</p>
    </section>
  );
}

export default async function TermsPage() {
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
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">{t("publicPages.termsTitle")}</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">{t("publicPages.termsIntro")}</p>
        <Section title={t("publicPages.termsUseTitle")} body={t("publicPages.termsUseBody")} />
        <Section title={t("publicPages.termsAccountsTitle")} body={t("publicPages.termsAccountsBody")} />
        <Section title={t("publicPages.termsContentTitle")} body={t("publicPages.termsContentBody")} />
        <Section title={t("publicPages.termsAvailabilityTitle")} body={t("publicPages.termsAvailabilityBody")} />
        <Section title={t("publicPages.termsLiabilityTitle")} body={t("publicPages.termsLiabilityBody")} />
      </main>
      <PublicFooter locale={locale} />
    </div>
  );
}
