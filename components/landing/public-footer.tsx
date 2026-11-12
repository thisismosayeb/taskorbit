import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { createTranslator, t, type SupportedLocale } from "@/lib/i18n/dictionary";

/** Public footer: product links, About, Developers, Privacy, Terms, auth, credits. */
export function PublicFooter({ locale }: { locale?: SupportedLocale }) {
  // Server pages pass the request locale (the footer is rendered by
  // server pages and by the client landing page); client callers omit
  // it and the client i18n store applies.
  const tr = locale ? createTranslator(locale) : t;
  return (
    <footer className="border-t border-ink/10 bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-muted">{tr("app.tagline")}</p>
          <p className="mt-3 text-xs leading-relaxed text-muted">{tr("landing.footer")}</p>
        </div>
        <nav aria-label="Product">
          <h2 className="font-heading text-sm font-semibold text-ink">TaskOrbit</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/#features" className="hover:text-primary">{tr("landing.navFeatures")}</Link></li>
            <li><Link href="/#how" className="hover:text-primary">{tr("landing.navHow")}</Link></li>
            <li><Link href="/#showcase" className="hover:text-primary">{tr("landing.navShowcase")}</Link></li>
            <li><Link href="/#developers" className="hover:text-primary">{tr("landing.navDevelopers")}</Link></li>
          </ul>
        </nav>
        <nav aria-label="About">
          <h2 className="font-heading text-sm font-semibold text-ink">{tr("landing.navAbout")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/about" className="hover:text-primary">{tr("landing.navAbout")}</Link></li>
            <li><Link href="/developers" className="hover:text-primary">{tr("landing.navDevelopers")}</Link></li>
            <li><Link href="/privacy" className="hover:text-primary">{tr("publicPages.privacyTitle")}</Link></li>
            <li><Link href="/terms" className="hover:text-primary">{tr("publicPages.termsTitle")}</Link></li>
          </ul>
        </nav>
        <nav aria-label="Account">
          <h2 className="font-heading text-sm font-semibold text-ink">{tr("topbar.account")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/login" className="hover:text-primary">{tr("auth.login")}</Link></li>
            <li><Link href="/signup" className="hover:text-primary">{tr("auth.createAccount")}</Link></li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Mosayeb Siam · Nabil Zaman · Mamshad
          </p>
        </nav>
      </div>
      <div className="border-t border-ink/10 py-5 text-center text-xs text-muted">
        {tr("footer.rights", { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}
