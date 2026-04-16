'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type ScrapeStatus = 'idle' | 'loading' | 'scraping' | 'polling' | 'done' | 'error'

export default function Home() {
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState<ScrapeStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [statusText, setStatusText] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim()) return

    const clean = username.trim().toLowerCase()
    setStatus('loading')
    setErrorMsg('')

    try {
      // Check if already scraped
      const statusRes = await fetch(`${API_URL}/api/v1/status/${clean}`)

      if (statusRes.ok) {
        const data = await statusRes.json()
        if (data.scrape_status === 'idle') {
          // Already scraped — go straight to chat
          router.push(`/chat/${clean}`)
          return
        }
        if (data.scrape_status === 'in_progress') {
          setStatus('polling')
          setStatusText('Scrape already in progress...')
          await pollUntilDone(clean)
          return
        }
      }

      // Trigger scrape
      setStatus('scraping')
      setStatusText(`Scraping u/${clean}...`)

      const scrapeRes = await fetch(`${API_URL}/api/v1/scrape/${clean}`, {
        method: 'POST',
      })

      if (!scrapeRes.ok) {
        const err = await scrapeRes.json()
        throw new Error(err.detail || 'Scrape failed')
      }

      // Poll until done
      setStatus('polling')
      await pollUntilDone(clean)

    } catch (err: any) {
      setStatus('error')
      setErrorMsg(err.message || 'Something went wrong')
    }
  }

  async function pollUntilDone(clean: string) {
    const maxAttempts = 60
    let attempts = 0

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 3000))
      attempts++

      try {
        const res = await fetch(`${API_URL}/api/v1/status/${clean}`)
        if (!res.ok) continue

        const data = await res.json()
        setStatusText(`Scraping... ${data.total_posts || 0} posts, ${data.total_comments || 0} comments found`)

        if (data.scrape_status === 'idle') {
          setStatus('done')
          setTimeout(() => router.push(`/chat/${clean}`), 800)
          return
        }

        if (data.scrape_status === 'failed') {
          throw new Error('Scrape failed on server')
        }
      } catch (err: any) {
        setStatus('error')
        setErrorMsg(err.message || 'Failed to get status')
        return
      }
    }

    setStatus('error')
    setErrorMsg('Timed out waiting for scrape to complete')
  }

  const isLoading = ['loading', 'scraping', 'polling'].includes(status)

  return (
    <main style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '2rem',
      position: 'relative',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'fixed',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '600px',
        height: '400px',
        background: 'radial-gradient(ellipse, rgba(124,106,255,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '560px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '1.5rem',
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}>💬</div>
            <span style={{
              fontFamily: 'Syne, sans-serif',
              fontWeight: 800,
              fontSize: '1.4rem',
              letterSpacing: '-0.02em',
              color: 'var(--text)',
            }}>TalkToX</span>
          </div>
          
          <h1 style={{
            fontFamily: 'Syne, sans-serif',
            fontWeight: 800,
            fontSize: 'clamp(2rem, 5vw, 3rem)',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            marginBottom: '1rem',
          }}>
            Talk to any<br />
            <span style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>Reddit user</span>
          </h1>
          
          <p style={{
            color: 'var(--text-muted)',
            fontSize: '1rem',
            lineHeight: 1.6,
            fontFamily: 'DM Mono, monospace',
            fontWeight: 300,
          }}>
            Enter a username. We scrape their posts.<br />You chat with an AI that only knows what they wrote.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '1.5rem',
            marginBottom: '1rem',
          }}>
            <label style={{
              display: 'block',
              fontSize: '11px',
              fontFamily: 'DM Mono, monospace',
              color: 'var(--text-muted)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '0.75rem',
            }}>Reddit Username</label>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{
                color: 'var(--text-muted)',
                fontFamily: 'DM Mono, monospace',
                fontSize: '1.1rem',
                flexShrink: 0,
              }}>u/</span>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="spez"
                disabled={isLoading}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  fontFamily: 'Syne, sans-serif',
                  fontWeight: 600,
                  fontSize: '1.2rem',
                  letterSpacing: '-0.01em',
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !username.trim()}
            style={{
              width: '100%',
              padding: '1rem',
              background: isLoading 
                ? 'var(--surface2)' 
                : 'linear-gradient(135deg, var(--accent), #5b4fd4)',
              border: '1px solid',
              borderColor: isLoading ? 'var(--border)' : 'transparent',
              borderRadius: '12px',
              color: isLoading ? 'var(--text-muted)' : 'white',
              fontFamily: 'Syne, sans-serif',
              fontWeight: 700,
              fontSize: '1rem',
              letterSpacing: '-0.01em',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
            }}
          >
            {isLoading ? (
              <>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  borderRadius: '50%',
                  animation: 'spin-slow 0.8s linear infinite',
                }} />
                {statusText || 'Working...'}
              </>
            ) : (
              status === 'done' ? '✓ Redirecting...' : 'Start chatting →'
            )}
          </button>
        </form>

        {/* Error */}
        {status === 'error' && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            background: 'rgba(255, 106, 138, 0.08)',
            border: '1px solid rgba(255, 106, 138, 0.3)',
            borderRadius: '10px',
            color: 'var(--accent2)',
            fontSize: '0.875rem',
            fontFamily: 'DM Mono, monospace',
          }}>
            {errorMsg}
          </div>
        )}

        {/* Footer note */}
        <p style={{
          textAlign: 'center',
          marginTop: '2rem',
          fontSize: '12px',
          color: 'var(--text-muted)',
          fontFamily: 'DM Mono, monospace',
        }}>
          Only uses public Reddit data · Answers cite exact source posts
        </p>
      </div>
    </main>
  )
}
