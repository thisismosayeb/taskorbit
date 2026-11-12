'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { forgotPasswordSchema, forgotPasswordSchemaFor } from '@/lib/validators'
import { forgotPassword } from '@/lib/auth/actions'
import { AuthCard, FieldError, SubmitButton, inputClassName } from '@/components/auth/auth-form'

type ForgotValues = z.infer<typeof forgotPasswordSchema>

export default function ForgotPasswordPage() {
  const locale = useLocale();
  const schema = useMemo(() => forgotPasswordSchemaFor(locale), [locale]);
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: ForgotValues) {
    setFormError(null)
    const result = await forgotPassword(values)
    if (result?.error) {
      setFormError(result.error)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthCard title={t('auth.checkEmailTitle')} subtitle={t('auth.resetLinkSentTitle')} success>
        <p className="text-sm leading-relaxed text-ink">
          {t('auth.resetLinkSentBody')}
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
      title={t('auth.forgotPassword')}
      subtitle={t('auth.forgotSubtitle')}
      error={formError}
    >
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
        {formError ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        ) : null}
        <SubmitButton pending={isSubmitting}>{t('auth.sendResetLink')}</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {t('auth.rememberedIt')}{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t('auth.login')}
        </Link>
      </p>
    </AuthCard>
  )
}

import { t, useLocale} from '@/lib/i18n';