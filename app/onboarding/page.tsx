import { redirect } from 'next/navigation'
import { getCurrentUser, getUserWorkspaces } from '@/lib/actions/workspace'
import { CreateWorkspaceForm, InviteLinkForm } from '@/components/auth/auth-form'
import { OrbitMascot } from '@/components/auth/orbit-mascot'

export default async function OnboardingPage() {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const memberships = await getUserWorkspaces(user.id)
  if (memberships.length > 0) redirect('/dashboard')

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-slate-200 sm:grid sm:grid-cols-[1fr_1.15fr]">
        <div className="relative hidden flex-col items-center justify-center gap-4 overflow-hidden bg-gradient-to-br from-primary via-[#7A5CFF] to-cyanbrand p-8 text-white sm:flex">
          <OrbitMascot mood="idle" />
          <p className="relative text-center font-heading text-xl font-bold leading-snug">
            {t('mascot.welcomeBack')}
          </p>
          <p className="relative text-center text-sm text-white/85">{t('mascot.tasksMissed')}</p>
        </div>
        <div className="p-6 sm:p-8">
          <div className="mb-6 text-center sm:text-left">
          <span className="font-heading text-xl font-bold text-ink">{t('app.name')}</span>
          <h1 className="mt-2 font-heading text-2xl font-bold text-ink">
            {t('onboarding.welcomeName', { name: user.user_metadata?.full_name ?? user.email })}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t('onboarding.signedInAs', { email: user.email })}
          </p>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-heading text-lg font-semibold text-ink">
              {t('workspace.createTitle')}
            </h2>
            <p className="mb-4 mt-1 text-sm text-muted">
              {t('onboarding.createWorkspaceHint')}
            </p>
            <CreateWorkspaceForm />
          </section>

          <section className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-heading text-lg font-semibold text-ink">
              {t('onboarding.haveInvite')}
            </h2>
            <p className="mb-4 mt-1 text-sm text-muted">
              {t('onboarding.haveInviteHint')}
            </p>
            <InviteLinkForm />
          </section>
        </div>
        </div>
      </div>
    </main>
  )
}

import { createTranslator, getServerLocale } from "@/lib/i18n/server";