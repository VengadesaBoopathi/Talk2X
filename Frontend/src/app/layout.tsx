import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TalkToX — Chat with any Reddit user',
  description: 'AI-powered conversations grounded in real Reddit post history',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="noise">{children}</body>
    </html>
  )
}
