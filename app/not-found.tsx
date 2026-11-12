import Link from 'next/link'

export default async function NotFound() {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <h1 className="font-heading text-3xl font-bold text-ink">{t('errors.notFoundTitle')}</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        {t('errors.notFoundPageBody')}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/dashboard"
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          {t('common.goToDashboard')}
        </Link>
        <Link
          href="/"
          className="rounded-lg bg-surface px-5 py-2.5 text-sm font-semibold text-ink ring-1 ring-slate-300 hover:bg-slate-50"
        >
          {t('common.home')}
        </Link>
      </div>
    </main>
  )
}

import { createTranslator, getServerLocale } from "@/lib/i18n/server";