import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Suspense } from 'react';
import { Shell } from '@/components/shell/Shell';
import { NotifyProvider } from '@/components/notify/NotifyProvider';
import { PREPAINT_SCRIPT } from '@/components/shell/prepaint';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Hitchcock Harness',
  description: 'One thread with Alma per film',
  // installable on the iPhone home screen (public/manifest.webmanifest, public/icons/, public/sw.js)
  manifest: '/manifest.webmanifest',
  applicationName: 'Hitchcock Harness',
  appleWebApp: { capable: true, title: 'Hitchcock', statusBarStyle: 'black' },
  icons: { icon: [{ url: '/icons/favicon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }] },
};

// maximumScale 1 stops iPhone Safari zooming into a text box on focus (its text is under 16 px); Safari still lets a
// person pinch to zoom, so nothing is lost for reading.
export const viewport: Viewport = { themeColor: '#09090B', width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // the pre-paint script sets the remembered column widths on <html> before React runs (shell/prepaint.ts)
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
      </head>
      <body className="bg-bg text-ink">
        <Suspense fallback={<div className="h-dvh bg-bg" />}>
          <NotifyProvider>
            <Shell>{children}</Shell>
          </NotifyProvider>
        </Suspense>
      </body>
    </html>
  );
}
