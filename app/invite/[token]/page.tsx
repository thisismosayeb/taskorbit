import Link from 'next/link'
import { getCurrentUser } from '@/lib/actions/workspace'
import { AuthCard, InviteAcceptForm } from '@/components/auth/auth-form'

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const { token } = await params
  const user = await getCurrentUser()

  if (!user) {
    return (
      <AuthCard
        title={t("invite.invitedTitle")}
        subtitle={t("invite.invitedSubtitle")}
      >
        <div className="space-y-3">
          <Link
            href={`/login?next=/invite/${encodeURIComponent(token)}`}
            className="block rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
          >
            {t("invite.loginToAccept")}
          </Link>
          <Link
            href={`/signup?next=/invite/${encodeURIComponent(token)}`}
            className="block rounded-lg bg-surface px-4 py-2.5 text-center text-sm font-semibold text-ink ring-1 ring-slate-300 hover:bg-slate-50"
          >
            {t("invite.createAccount")}
          </Link>
        </div>
        <p className="mt-4 text-center text-sm text-muted">
          {t("invite.returnNote")}
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={t("onboarding.joinWorkspace")}
      subtitle={t("invite.signedInAs", { email: user.email })}
    >
      <InviteAcceptForm token={token} />
      <p className="mt-4 text-sm leading-relaxed text-muted">
        {t("invite.noDetailsNote")}
      </p>
    </AuthCard>
  )
}

import { createTranslator, getServerLocale } from "@/lib/i18n/server";