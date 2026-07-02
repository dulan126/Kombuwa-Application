import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Manrope, Space_Grotesk, Noto_Sans_Sinhala } from 'next/font/google';
import { AuthProvider } from '@/providers/AuthProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import './globals.css';

// ─── Fonts ───────────────────────────────────────────────────────────────────

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const notoSinhala = Noto_Sans_Sinhala({
  subsets: ['sinhala', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-noto-sinhala',
  display: 'swap',
});


// ─── Metadata ────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default: 'MIEDVANCE — ශ්‍රී ලංකාවේ ප්‍රමුඛ අ/පෙළ MCQ වේදිකාව',
    template: '%s | MIEDVANCE',
  },
  description:
    'ශ්‍රී ලංකාවේ ප්‍රමුඛ අ/පෙළ MCQ වේදිකාව. Daily MCQ, SRP Special Ranking Papers, Island-wide Rankings, Past Papers 2015-2024, Q&A Forum.',
  keywords: ['A/L', 'MCQ', 'Sri Lanka', 'අ/පෙළ', 'MIEDVANCE', 'Past Papers', 'Rankings'],
  authors: [{ name: 'MIEDVANCE' }],
  openGraph: {
    title: 'MIEDVANCE — ශ්‍රී ලංකාවේ ප්‍රමුඛ අ/පෙළ MCQ වේදිකාව',
    description: 'Daily MCQ · SRP · Rankings · Past Papers · Q&A Forum',
    type: 'website',
    locale: 'si_LK',
  },
};

// ─── Root Layout ─────────────────────────────────────────────────────────────
// No global Navbar here — each route group supplies its own chrome:
//   (app)/layout.tsx  → legacy top-navbar for /papers, /forum, etc.
//   subject/[id]/layout.tsx → sidebar for the subject app
//   The home page (/) includes its own HomeNavbar component directly.

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${manrope.variable} ${spaceGrotesk.variable} ${notoSinhala.variable}`}
    >
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
