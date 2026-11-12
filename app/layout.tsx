// Root layout (Part 3: ThemeProvider + LocaleProvider are mounted here,
// once, for the whole app — public pages, auth pages and dashboard alike).
//
// `suppressHydrationWarning` on <html> is required by next-themes: its
// inline script may add the `dark` class before React hydrates.
// `lang` comes from the server locale (cookie, else profile, else 'en').
// Metadata is translated for the request locale. Fonts include Hind
// Siliguri for Bangla (brand track); `html[lang="bn"]` in globals.css
// switches the body font to it.

import type { Metadata } from 'next'
import { Inter, Space_Grotesk, Hind_Siliguri } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { LocaleProvider } from '@/components/i18n/locale-provider'
import { getInitialPreferences, getServerLocale, createTranslator } from '@/lib/i18n/server'

const heading = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
})

const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const bangla = Hind_Siliguri({
  subsets: ['bengali', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-bangla',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getServerLocale())
  return {
    title: t('landing.metaTitle'),
    description: t('landing.metaDescription'),
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://taskorbit.app'),
    icons: {
      icon: [
        { url: '/favicon.ico', type: 'image/x-icon' },
        { url: '/brand/favicon.svg', type: 'image/svg+xml' },
      ],
      apple: [{ url: '/brand/taskorbit-icon-512.png', sizes: '512x512', type: 'image/png' }],
    },
    openGraph: {
      title: t('landing.metaTitle'),
      description: t('landing.metaDescription'),
      images: [{ url: '/brand/og-image.png', width: 1200, height: 630, alt: 'TaskOrbit — Plan. Assign. Track. Deliver.' }],
    },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { locale, theme } = await getInitialPreferences()
  return (
    <html lang={locale} suppressHydrationWarning className={`${heading.variable} ${body.variable} ${bangla.variable}`}>
      <body className="bg-background font-body text-ink antialiased">
        <ThemeProvider defaultTheme={theme}>
          <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
