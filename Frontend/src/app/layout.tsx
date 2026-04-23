import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TalkToX — Chat with any Reddit user',
  description: 'Enter a Reddit username. We index their posts. You chat with an AI grounded in exactly what they wrote.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}
