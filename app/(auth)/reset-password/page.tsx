'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { resetPasswordSchema, resetPasswordSchemaFor } from '@/lib/validators'
import { resetPassword } from '@/lib/auth/actions'
import { createClient } from '@/lib/supabase/client'
import { AuthCard, FieldError, SubmitButton, inputClassName } from '@/components/auth/auth-form'

type ResetValues = z.infer<typeof resetPasswordSchema>

type LinkState = 'checking' | 'ready' | 'error'

function ResetPasswordForm() {
  const locale = useLocale();
  const schema = useMemo(() => resetPasswordSchemaFor(locale), [locale]);
  const searchParams = useSearchParams()
  const [linkState, setLinkState] = useState<LinkState>('checking')
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    async function prepareSession() {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) {
        setLinkState('ready')
        return
      }

      // Direct reset link (bypassing /auth/callback): exchange the code, or
      // verify the recovery token hash, to establish a session first.
      const code = searchParams.get('code')
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else if (tokenHash && type === 'recovery') {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          })
          if (error) throw error
        } else {
          throw new Error('No reset code in link')
        }
        setLinkState('ready')
      } catch {
        setLinkState('error')
      }
    }
    prepareSession()
  }, [searchParams])

  async function onSubmit(values: ResetValues) {
    setFormError(null)
    const result = await resetPassword(values)
    if (result?.error) setFormError(result.error)
  }

  if (linkState === 'checking') {
    return (
      <AuthCard title={t('auth.resetPassword')} subtitle={t('auth.checkingLink')}>
        <p className="text-sm text-muted">{t('auth.pleaseWait')}</p>
      </AuthCard>
    )
  }

  if (linkState === 'error') {
    return (
      <AuthCard title={t('auth.linkExpiredTitle')} subtitle={t('auth.linkExpiredBody')}>
        <p className="text-sm leading-relaxed text-ink">
          {t('auth.linkExpiredHint')}
        </p>
        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            {t('auth.requestNewLink')}
          </Link>
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t('auth.resetPasswordTitle')} subtitle={t('auth.resetPasswordSubtitle')} error={formError}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink">
            {t('auth.newPassword')}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder={t('auth.passwordPlaceholder')}
            className={inputClassName}
            {...register('password')}
          />
          <FieldError message={errors.password?.message} />
        </div>
        <div>
          <label
            htmlFor="confirm_password"
            className="mb-1 block text-sm font-medium text-ink"
          >
            {t('auth.confirmNewPassword')}
          </label>
          <input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            placeholder={t('auth.repeatNewPassword')}
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
        <SubmitButton pending={isSubmitting}>{t('auth.updatePassword')}</SubmitButton>
      </form>
    </AuthCard>
  )
}

export default function ResetPasswordPage() {
  useLocale();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-muted">
          {t('common.loading')}
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}

import { t, useLocale} from '@/lib/i18n';