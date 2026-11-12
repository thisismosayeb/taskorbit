import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const next = url.searchParams.get('next')

  const loginWithError = (error: string) => {
    const redirectUrl = url.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.search = `?error=${encodeURIComponent(error)}`
    return NextResponse.redirect(redirectUrl)
  }

  // Recovery links sent with the token-hash flow go straight to the reset
  // page, which verifies the hash and establishes the session.
  if (tokenHash && type) {
    const redirectUrl = url.clone()
    redirectUrl.pathname = '/reset-password'
    redirectUrl.search = `?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`
    return NextResponse.redirect(redirectUrl)
  }

  if (!code) return loginWithError('invalid_link')

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return loginWithError('invalid_link')

  if (next && next.startsWith('/')) {
    const redirectUrl = url.clone()
    redirectUrl.pathname = next
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return loginWithError('invalid_link')

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  const redirectUrl = url.clone()
  redirectUrl.pathname =
    memberships && memberships.length > 0 ? '/dashboard' : '/onboarding'
  redirectUrl.search = ''
  return NextResponse.redirect(redirectUrl)
}
