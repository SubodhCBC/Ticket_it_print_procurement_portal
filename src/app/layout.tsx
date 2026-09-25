import type { Metadata, Viewport } from 'next'
import { StoreProvider } from '@/store/StoreProvider'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { QueryProvider } from '@/lib/query/QueryProvider'
import './globals.css'

export const metadata: Metadata = {
  title:
    'Print Procurement Portal | Marketing Collateral & Digital Asset Ordering Platform',
  description:
    'Self-service digital asset library and collateral ordering portal with consolidated monthly multi-site billing and DAM integration.',
  keywords: [
    'Print Procurement Portal',
    'marketing collateral',
    'digital asset management',
    'DAM',
    'point of sale',
    'consolidated billing',
    'multi-site ordering',
  ],
  authors: [{ name: 'Print Procurement Portal' }],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#f73582',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* Figtree loads for everyone. Acumin, which the tokens asked for first,
            only ever rendered on machines that happened to have it installed. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <StoreProvider>
          <QueryProvider>
            <AuthProvider>
              <div
                style={{
                  minHeight: '100vh',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <main
                  style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                >
                  {children}
                </main>
              </div>
            </AuthProvider>
          </QueryProvider>
        </StoreProvider>
      </body>
    </html>
  )
}
