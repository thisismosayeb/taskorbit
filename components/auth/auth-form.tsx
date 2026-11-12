'use client'

import { useActionState, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { acceptInviteAction, createWorkspaceAction } from '@/lib/auth/actions'
import { OrbitMascot, type MascotMood } from '@/components/auth/orbit-mascot'
import { ThemeSwitcher } from '@/components/theme/theme-switcher'
import { LanguageSwitcher } from '@/components/i18n/language-switcher'

export const inputClassName =
  'w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'

/**
 * Auth shell — desktop split screen (Orbit mascot illustration left, form
 * right), mobile single column with the form first. The mascot watches the
 * form: email focused/typed → looks at the form, password focused → covers
 * its eyes, error → surprised shake, success → happy bounce. Decorative
 * only; labels and errors stay accessible.
 *
 * Theme / language switchers live in the form header (wired by the
 * theme/i18n track): ThemeSwitcher + LanguageSwitcher below.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  error,
  success,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  error?: string | null
  success?: boolean
}) {
  useLocale();
  const [focusMood, setFocusMood] = useState<MascotMood>('idle')

  function moodFromFocus(target: EventTarget | null): MascotMood {
    if (!(target instanceof HTMLInputElement)) return 'idle'
    if (target.type === 'password') return 'shy'
    if (target.type === 'email' || target.type === 'text') return 'look'
    return 'idle'
  }

  const mood: MascotMood = success ? 'success' : error ? 'error' : focusMood

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-4xl">
        <div className="overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-slate-200 sm:grid sm:grid-cols-[1fr_1.15fr]">
          {/* Illustration panel — hidden on small screens; form comes first. */}
          <div className="relative hidden flex-col items-center justify-center gap-4 overflow-hidden bg-gradient-to-br from-primary via-[#7A5CFF] to-cyanbrand p-8 text-white sm:flex">
            <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white/10" aria-hidden="true" />
            <div className="absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-white/10" aria-hidden="true" />
            <OrbitMascot mood={mood} />
            <p className="relative text-center font-heading text-xl font-bold leading-snug">
              {t('mascot.welcomeBack')}
            </p>
            <p className="relative text-center text-sm text-white/85">{t('mascot.tasksMissed')}</p>
            <p className="relative mt-2 text-center text-xs font-medium uppercase tracking-widest text-white/70">
              {t('mascot.panelTitle')}
            </p>
          </div>

          {/* Form panel */}
          <div className="p-6 sm:p-8" onFocus={(e) => setFocusMood(moodFromFocus(e.target))} onBlur={() => setFocusMood('idle')}>
            <div className="mb-6 flex items-center justify-between gap-2">
              <Link href="/" className="flex items-center gap-2">
                <Image src="/brand/taskorbit-icon.svg" alt="" width={36} height={36} className="h-9 w-9 rounded-xl" />
                <span className="font-heading text-xl font-bold text-ink">{t('app.name')}</span>
              </Link>
              <div className="flex items-center gap-1">
                <ThemeSwitcher compact />
                <LanguageSwitcher compact />
              </div>
            </div>
            <h1 className="font-heading text-2xl font-bold text-ink">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </main>
  )
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1 text-sm text-red-600">
      {message}
    </p>
  )
}

export function SubmitButton({
  pending,
  children,
}: {
  pending?: boolean
  children: ReactNode
}) {
  useLocale();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? t('auth.pleaseWaitEllipsis') : children}
    </button>
  )
}

export function CreateWorkspaceForm() {
  useLocale();
  const [state, formAction, pending] = useActionState(createWorkspaceAction, null)

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="workspace-name" className="mb-1 block text-sm font-medium text-ink">
          {t('workspace.name')}
        </label>
        <input
          id="workspace-name"
          name="name"
          type="text"
          required
          maxLength={80}
          autoComplete="organization"
          placeholder={t('auth.workspacePlaceholder')}
          className={inputClassName}
        />
      </div>
      {state?.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pending={pending}>{t('workspace.create')}</SubmitButton>
    </form>
  )
}

export function InviteLinkForm() {
  useLocale();
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = String(new FormData(event.currentTarget).get('inviteLink') ?? '').trim()
    const fromUrl = value.match(/\/invite\/([A-Za-z0-9_-]+)/)?.[1]
    const bareToken = /^[A-Za-z0-9_-]+$/.test(value) ? value : null
    const token = fromUrl ?? bareToken
    if (!token) {
      setError(t('auth.inviteInvalid'))
      return
    }
    router.push(`/invite/${token}`)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="invite-link" className="mb-1 block text-sm font-medium text-ink">
          {t('onboarding.inviteLink')}
        </label>
        <input
          id="invite-link"
          name="inviteLink"
          type="text"
          required
          autoComplete="off"
          placeholder={t('auth.invitePlaceholder')}
          className={inputClassName}
        />
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <SubmitButton>{t('onboarding.joinWorkspace')}</SubmitButton>
    </form>
  )
}

export function InviteAcceptForm({ token }: { token: string }) {
  useLocale();
  const [state, formAction, pending] = useActionState(acceptInviteAction, null)

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state?.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pending={pending}>{t('invite.accept')}</SubmitButton>
      <p className="text-center text-sm text-muted">
        <Link href="/dashboard" className="font-medium text-primary hover:underline">
          {t('auth.notNow')}
        </Link>
      </p>
    </form>
  )
}

import { t, useLocale} from '@/lib/i18n';