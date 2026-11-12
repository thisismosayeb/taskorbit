'use client'

import { Suspense, useState, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { signupSchema, signupSchemaFor } from '@/lib/validators'
import { signUp } from '@/lib/auth/actions'
import { AuthCard, FieldError, SubmitButton, inputClassName } from '@/components/auth/auth-form'

type SignupValues = z.infer<typeof signupSchema>

function passwordStrength(password: string): { label: string; score: number } {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  const label =
    score <= 1 ? t('auth.strengthWeak') : score === 2 ? t('auth.strengthFair') : score === 3 ? t('auth.strengthGood') : t('auth.strengthStrong')
  return { label, score }
}

const strengthColor = ['bg-coral', 'bg-amber-500', 'bg-cyanbrand', 'bg-mint']

function SignupForm() {
  const locale = useLocale();
  const schema = useMemo(() => signupSchemaFor(locale), [locale]);
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? undefined
  const [formError, setFormError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({ resolver: zodResolver(schema) })

  const password = watch('password') ?? ''
  const strength = passwordStrength(password)

  async function onSubmit(values: SignupValues) {
    setFormError(null)
    let result: Awaited<ReturnType<typeof signUp>>
    try {
      result = await signUp(values, next)
    } catch {
      // A rejected server-action call (e.g. the request dropped) must not
      // leave the form hanging with no message.
      setFormError(t('errors.generic'))
      return
    }
    // Confirmation OFF: the account was created with a session, and the
    // server action returned where to go (see lib/auth/actions.ts).
    // Full document load (not router.push): same reason as the login
    // page — the root layout only re-renders with the freshly synced
    // theme/locale on a document load.
    if (result?.redirectTo) {
      window.location.assign(result.redirectTo)
      return
    }
    if (result?.needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }
    if (result?.error) setFormError(result.error)
  }

  if (needsConfirmation) {
    return (
      <AuthCard title={t('auth.checkEmailTitle')} subtitle={t('auth.almostIn')} success>
        <p className="text-sm leading-relaxed text-ink">
          {t('auth.confirmationSentBody')}
        </p>
        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t('auth.backToLogin')}
          </Link>
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={t('auth.signupTitle')}
      subtitle={t('auth.signupPageSubtitle')}
      error={formError}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="full_name" className="mb-1 block text-sm font-medium text-ink">
            {t('auth.fullName')}
          </label>
          <input
            id="full_name"
            type="text"
            autoComplete="name"
            placeholder={t('auth.fullNamePlaceholderLong')}
            className={inputClassName}
            {...register('full_name')}
          />
          <FieldError message={errors.full_name?.message} />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink">
            {t('auth.email')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t('auth.emailPlaceholder')}
            className={inputClassName}
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink">
            {t('auth.password')}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder={t('auth.passwordPlaceholder')}
            className={inputClassName}
            {...register('password')}
          />
          {password.length > 0 ? (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full ${strengthColor[Math.min(Math.max(strength.score - 1, 0), 3)]}`}
                  style={{ width: `${(strength.score / 5) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                {t('auth.passwordStrength')} <span className="font-medium text-ink">{strength.label}</span>{' '}
                — {t('auth.strengthHint')}
              </p>
            </div>
          ) : null}
          <FieldError message={errors.password?.message} />
        </div>
        <div>
          <label
            htmlFor="confirm_password"
            className="mb-1 block text-sm font-medium text-ink"
          >
            {t('auth.confirmPassword')}
          </label>
          <input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            placeholder={t('auth.repeatPassword')}
            className={inputClassName}
            {...register('confirm_password')}
          />
          <FieldError message={errors.confirm_password?.message} />
        </div>
        {formError ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        ) : null}
        <SubmitButton pending={isSubmitting}>{t('auth.createAccount')}</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {t('auth.haveAccount')}{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t('auth.login')}
        </Link>
      </p>
    </AuthCard>
  )
}

export default function SignupPage() {
  useLocale();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-muted">
          {t('common.loading')}
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  )
}

import { t, useLocale} from '@/lib/i18n';