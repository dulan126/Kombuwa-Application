import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { DM_Sans, Noto_Sans_Sinhala } from 'next/font/google';
import { AuthProvider } from '@/providers/AuthProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { Navbar } from '@/components/layout/Navbar';
import './globals.css';

// ─── Fonts ───────────────────────────────────────────────────────────────────

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const notoClass = Noto_Sans_Sinhala({
  subsets: ['sinhala', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-noto-sans-sinhala',
  display: 'swap',
});


// ─── Metadata ────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default: 'Kombuwaedu — ශ්‍රී ලංකාවේ ප්‍රමුඛ අ/පෙළ MCQ වේදිකාව',
    template: '%s | Kombuwaedu',
  },
  description:
    'ශ්‍රී ලංකාවේ ප්‍රමුඛ අ/පෙළ MCQ වේදිකාව. Daily MCQ, SRP Special Ranking Papers, Island-wide Rankings, Past Papers 2015-2024, Q&A Forum.',
  keywords: ['A/L', 'MCQ', 'Sri Lanka', 'අ/පෙළ', 'Kombuwaedu', 'Past Papers', 'Rankings'],
  authors: [{ name: 'Kombuwaedu' }],
  openGraph: {
    title: 'Kombuwaedu — ශ්‍රී ලංකාවේ ප්‍රමුඛ අ/පෙළ MCQ වේදිකාව',
    description: 'Daily MCQ · SRP · Rankings · Past Papers · Q&A Forum',
    type: 'website',
    locale: 'si_LK',
  },
};

// ─── Root Layout ─────────────────────────────────────────────────────────────

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${dmSans.variable} ${notoClass.variable}`}>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <ToastProvider>
              <Navbar />
              <main className="pt-[58px] min-h-screen">{children}</main>
            </ToastProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
