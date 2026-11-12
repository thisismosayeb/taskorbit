'use client'

import { Suspense, useState, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { loginSchema, loginSchemaFor } from '@/lib/validators'
import { logIn } from '@/lib/auth/actions'
import { AuthCard, FieldError, SubmitButton, inputClassName } from '@/components/auth/auth-form'

type LoginValues = z.infer<typeof loginSchema>

function LoginForm() {
  const locale = useLocale();
  const schema = useMemo(() => loginSchemaFor(locale), [locale]);
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? undefined
  const justReset = searchParams.get('reset') === 'success'
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: LoginValues) {
    setFormError(null)
    const result = await logIn(values, next)
    if (result?.error) setFormError(result.error)
    // Full document load (not router.push): the root layout only
    // re-renders with the freshly synced theme/locale on a document
    // load — an RSC navigation would leave the dashboard in the
    // logged-out theme/locale until a manual reload (Part 3 bug).
    else if (result?.redirectTo) window.location.assign(result.redirectTo)
  }

  return (
    <AuthCard title={t('auth.loginTitle')} subtitle={t('auth.loginPageSubtitle')} error={formError}>
      {justReset ? (
        <p className="mb-4 rounded-lg bg-mint/15 px-3 py-2 text-sm text-teal-800">
          {t('auth.passwordUpdated')}
        </p>
      ) : null}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
            autoComplete="current-password"
            placeholder={t('auth.passwordLoginPlaceholder')}
            className={inputClassName}
            {...register('password')}
          />
          <FieldError message={errors.password?.message} />
        </div>
        {formError ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        ) : null}
        <SubmitButton pending={isSubmitting}>{t('auth.login')}</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          {t('auth.forgotPassword')}
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-muted">
        {t('auth.noAccount')}{' '}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          {t('auth.signup')}
        </Link>
      </p>
    </AuthCard>
  )
}

export default function LoginPage() {
  useLocale();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-muted">
          {t('common.loading')}
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}

import { t, useLocale} from '@/lib/i18n';