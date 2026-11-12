'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from '@/lib/validators'

type ActionResult = {
  error?: string
  /** Where the browser should go next — returned, not thrown (see signUp). */
  redirectTo?: string
}
type SignupResult = ActionResult & {
  needsConfirmation?: boolean
  /** Where the browser should go next — returned, not thrown (see signUp). */
  redirectTo?: string
}

// Only an in-app path is ever a valid redirect target. Reject
// protocol-relative URLs (//evil.com) so a crafted ?next= cannot send the
// user off-site.
function safeNextPath(next?: string): string {
  return next && next.startsWith('/') && !next.startsWith('//')
    ? next
    : '/onboarding'
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

// Best-effort in-memory guard against credential-stuffing bursts. This is
// NOT a substitute for Supabase's own rate limits; it only smooths obvious
// abuse from a single IP on a single long-lived server instance.
const attempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string, max = 5, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= max) return false
  entry.count += 1
  return true
}

async function clientIp(): Promise<string> {
  const headerList = await headers()
  return (
    headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headerList.get('x-real-ip') ??
    'unknown'
  )
}

function friendlyAuthError(message: string): string {
  if (/user already registered/i.test(message)) {
    return 'An account with this email already exists. Try logging in instead.'
  }
  if (/invalid login credentials/i.test(message)) {
    return 'Incorrect email or password. Please try again.'
  }
  if (/email.*not confirmed/i.test(message)) {
    return 'Please confirm your email first — check your inbox for the confirmation link.'
  }
  if (/expired/i.test(message)) {
    return 'This link has expired. Please request a new one.'
  }
  return message
}

async function setActiveWorkspaceCookieValue(workspaceId: string) {
  const store = await cookies()
  store.set('taskorbit-workspace-id', workspaceId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
}

function workspaceIdFromRpc(data: unknown): string | null {
  if (typeof data === 'string' && data.length > 0) return data
  if (data && typeof data === 'object' && 'id' in data) {
    const id = (data as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }
  return null
}

// Part 3 (§6–§7): after a successful login, mirror the user's stored
// theme / language preferences into the cookies the server reads on the
// next render, so the dashboard opens in their theme and language even
// on a fresh device. Best-effort: a failure here never blocks login
// (the root layout falls back to the profile directly).
//
// An EXPLICIT pre-login choice wins: if the switchers already wrote a
// `taskorbit-locale` / `taskorbit-theme` cookie before login (logged-out
// user picking Bangla / Dark on the landing or login page), that cookie
// is kept — not overwritten from the profile — and adopted into the
// profile so it survives reloads. Only when no cookie exists does the
// profile value apply (fresh device). Overwriting unconditionally used
// to discard the pre-login Bangla choice at login (Part 3 bug).
async function syncPreferenceCookies(userId: string) {
  try {
    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('preferred_locale, theme_preference')
      .eq('id', userId)
      .maybeSingle()
    if (!profile) return
    const store = await cookies()
    const cookieLocale = store.get('taskorbit-locale')?.value
    const cookieTheme = store.get('taskorbit-theme')?.value
    const locale =
      cookieLocale === 'bn' || cookieLocale === 'en'
        ? cookieLocale
        : profile.preferred_locale === 'bn'
          ? 'bn'
          : 'en'
    const theme =
      cookieTheme === 'light' || cookieTheme === 'dark' || cookieTheme === 'system'
        ? cookieTheme
        : profile.theme_preference === 'light' || profile.theme_preference === 'dark'
          ? profile.theme_preference
          : 'system'
    store.set('taskorbit-locale', locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
    store.set('taskorbit-theme', theme, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
    if (locale !== profile.preferred_locale || theme !== profile.theme_preference) {
      await supabase
        .from('profiles')
        .update({ preferred_locale: locale, theme_preference: theme })
        .eq('id', userId)
    }
  } catch {
    // Ignore — login proceeds; the layout's profile fallback applies.
  }
}

export async function signUp(
  values: z.infer<typeof signupSchema>,
  next?: string
): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(values)
  if (!parsed.success) {
    return { error: 'Please check the form and try again.' }
  }
  if (!checkRateLimit(`signup:${await clientIp()}`)) {
    return {
      error: 'Too many signup attempts. Please wait a few minutes and try again.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      // Carry the invite (or other in-app destination) through the
      // confirmation email, so the callback can send the user back there.
      emailRedirectTo: `${appUrl()}/auth/callback${next && next.startsWith('/') && !next.startsWith('//') ? `?next=${encodeURIComponent(next)}` : ''}`,
    },
  })
  if (error) return { error: friendlyAuthError(error.message) }

  // Email confirmation enabled: no session is returned until the user
  // confirms via the emailed link.
  if (!data.session) return { needsConfirmation: true }

  // Confirmation is OFF: a session was created, so the user is signed in
  // already. The redirect target is RETURNED for the client to navigate to
  // (router.push) instead of throwing redirect(): a thrown redirect only
  // navigates if the action response carrying it reaches the browser
  // intact, and in the Part 1 E2E run (flaky tunnel) the signup form sat
  // there with no error and no visible session (friction (a)). Returning
  // the target keeps the navigation on the client, after the session
  // cookies are already set. (redirect() itself works fine at the
  // transport level in Next 15.5.29 — verified live for logIn: 303 with
  // x-action-redirect — so this is robustness, not a Next defect.)
  return { redirectTo: safeNextPath(next) }
}

export async function logIn(
  values: z.infer<typeof loginSchema>,
  next?: string
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(values)
  if (!parsed.success) {
    return { error: 'Please check the form and try again.' }
  }
  if (!checkRateLimit(`login:${await clientIp()}`)) {
    return {
      error: 'Too many login attempts. Please wait a few minutes and try again.',
    }
  }

  const supabase = await createClient()
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) return { error: friendlyAuthError(error.message) }

  if (signInData.user) await syncPreferenceCookies(signInData.user.id)

  // The redirect target is RETURNED for the client to navigate to with a
  // full document load (window.location.assign), not thrown as redirect()
  // and not router.push(): the root layout (ThemeProvider defaultTheme,
  // LocaleProvider initialLocale) only re-renders on a document load, so
  // an RSC navigation after login would leave the dashboard in the
  // logged-out theme/locale until a manual reload (Part 3 bug: theme and
  // Bangla choice did not survive a real form login). See signUp's
  // comment for the same pattern. NOTE: the default here is /dashboard,
  // NOT safeNextPath's /onboarding — logging in (unlike signing up) must
  // not send a user who already has a workspace through onboarding.
  return { redirectTo: next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard' }
}

export async function forgotPassword(
  values: z.infer<typeof forgotPasswordSchema>
): Promise<ActionResult & { sent?: boolean }> {
  const parsed = forgotPasswordSchema.safeParse(values)
  if (!parsed.success) {
    return { error: 'Please enter a valid email address.' }
  }
  if (!checkRateLimit(`forgot:${await clientIp()}`)) {
    return {
      error: 'Too many requests. Please wait a few minutes and try again.',
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl()}/auth/callback?next=/reset-password`,
  })
  if (error) return { error: friendlyAuthError(error.message) }

  // Deliberately the same success response whether or not the email exists.
  return { sent: true }
}

export async function resetPassword(
  values: z.infer<typeof resetPasswordSchema>
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(values)
  if (!parsed.success) {
    return { error: 'Please check the form and try again.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Your reset link has expired. Please request a new one.' }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })
  if (error) return { error: friendlyAuthError(error.message) }

  redirect('/login?reset=success')
}

export async function createWorkspaceAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Workspace name is required.' }
  if (name.length > 80) {
    return { error: 'Workspace name must be 80 characters or fewer.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RPC argument names must match the migration exactly:
  // create_workspace(p_name text) — see supabase/migrations/0002_rpc.sql.
  const { data, error } = await supabase.rpc('create_workspace', {
    p_name: name,
  })
  if (error) return { error: error.message }

  const workspaceId = workspaceIdFromRpc(data)
  if (workspaceId) await setActiveWorkspaceCookieValue(workspaceId)

  redirect('/dashboard')
}

export async function acceptInviteAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const token = String(formData.get('token') ?? '').trim()
  if (!token) return { error: 'This invite link is invalid.' }
  if (!checkRateLimit(`invite:${await clientIp()}`, 10)) {
    return {
      error: 'Too many attempts. Please wait a few minutes and try again.',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RPC argument names must match the migration exactly:
  // accept_invitation(p_token text) — see supabase/migrations/0002_rpc.sql.
  const { data, error } = await supabase.rpc('accept_invitation', {
    p_token: token,
  })
  if (error) return { error: error.message }

  const workspaceId = workspaceIdFromRpc(data)
  if (workspaceId) await setActiveWorkspaceCookieValue(workspaceId)

  redirect('/dashboard')
}
