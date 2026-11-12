import type { Metadata } from "next";
import { PublicHeader } from "@/components/landing/public-header";
import { PublicFooter } from "@/components/landing/public-footer";
import { createClient } from "@/lib/supabase/server";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "About — TaskOrbit",
  description:
    "What TaskOrbit does, how it is built, and the university project behind it.",
};

async function isLoggedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-8">
      <h2 className="font-heading text-xl font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{body}</p>
    </section>
  );
}

export default async function AboutPage() {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const loggedIn = await isLoggedIn();
  return (
    <div className="min-h-screen bg-background text-ink">
      <PublicHeader loggedIn={loggedIn} />
      <main id="main" className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">{t("publicPages.aboutTitle")}</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">{t("publicPages.aboutIntro")}</p>
        <Section title={t("publicPages.aboutWhatTitle")} body={t("publicPages.aboutWhatBody")} />
        <Section title={t("publicPages.aboutTechTitle")} body={t("publicPages.aboutTechBody")} />
        <Section title={t("publicPages.aboutProjectTitle")} body={t("publicPages.aboutProjectBody")} />
        <section className="mt-8">
          <h2 className="font-heading text-xl font-bold">{t("publicPages.developersTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">
            Mosayeb Siam · Nabil Zaman · Mamshad
          </p>
        </section>
      </main>
      <PublicFooter locale={locale} />
    </div>
  );
}
