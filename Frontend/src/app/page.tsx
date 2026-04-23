'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type ScrapeStatus = 'idle' | 'loading' | 'scraping' | 'polling' | 'done' | 'error'

export default function Home() {
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState<ScrapeStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [statusText, setStatusText] = useState('')
  const [dark, setDark] = useState(false)
  const router = useRouter()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim()) return
    const clean = username.trim().toLowerCase()
    setStatus('loading')
    setErrorMsg('')
    try {
      const statusRes = await fetch(`${API_URL}/api/v1/status/${clean}`)
      if (statusRes.ok) {
        const data = await statusRes.json()
        if (data.scrape_status === 'idle' && data.total_posts > 0) {
          router.push(`/chat/${clean}`)
          return
        }
        if (data.scrape_status === 'in_progress') {
          setStatus('polling')
          setStatusText('Scrape already running — checking progress...')
          await pollUntilDone(clean)
          return
        }
      }
      setStatus('scraping')
      setStatusText(`Scraping u/${clean}...`)
      const scrapeRes = await fetch(`${API_URL}/api/v1/scrape/${clean}`, { method: 'POST' })
      if (!scrapeRes.ok) {
        const err = await scrapeRes.json()
        throw new Error(err.detail || 'Scrape failed')
      }
      setStatus('polling')
      await pollUntilDone(clean)
    } catch (err: any) {
      setStatus('error')
      setErrorMsg(err.message || 'Something went wrong')
    }
  }

  async function pollUntilDone(clean: string) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000))
      try {
        const res = await fetch(`${API_URL}/api/v1/status/${clean}`)
        if (!res.ok) continue
        const data = await res.json()
        setStatusText(`${data.total_posts || 0} posts · ${data.total_comments || 0} comments indexed`)
        if (data.scrape_status === 'idle' && data.total_posts > 0) {
          setStatus('done')
          setTimeout(() => router.push(`/chat/${clean}`), 600)
          return
        }
        if (data.scrape_status === 'failed') throw new Error('Scrape failed on server')
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
    <>
      <style>{`
        :root {
          --bg: #faf8f5;
          --surface: #ffffff;
          --surface2: #f3f1ee;
          --border: #e8e4de;
          --text: #1a1714;
          --text-muted: #8a847c;
          --accent: #1a56db;
          --accent-light: #eff6ff;
          --accent-hover: #1447b3;
          --success: #0d7a4e;
          --danger: #c0392b;
          --danger-bg: #fef2f2;
          --shadow-sm: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
          --shadow-md: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
          --shadow-lg: 0 10px 40px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.04);
          --font-display: 'Instrument Serif', Georgia, serif;
          --font-body: 'DM Sans', system-ui, sans-serif;
          --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
          --radius: 12px;
          --radius-lg: 20px;
        }
        [data-theme="dark"] {
          --bg: #0f0e0c;
          --surface: #1a1916;
          --surface2: #242220;
          --border: #2e2c29;
          --text: #f0ece6;
          --text-muted: #6b6660;
          --accent: #4a87f5;
          --accent-light: #1a2340;
          --accent-hover: #6b9cf7;
          --success: #2ecc8a;
          --danger: #e55;
          --danger-bg: #2a1010;
          --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
          --shadow-md: 0 4px 12px rgba(0,0,0,0.3);
          --shadow-lg: 0 10px 40px rgba(0,0,0,0.4);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: var(--bg); color: var(--text); font-family: var(--font-body); transition: background 0.3s, color 0.3s; }

        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }

        .fade-up { animation: fadeUp 0.5s ease forwards; }

        .input-focus:focus-within {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent) !important;
        }

        .btn-primary {
          background: var(--accent);
          color: white;
          border: none;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
        }
        .btn-primary:hover:not(:disabled) {
          background: var(--accent-hover);
          box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 35%, transparent);
        }
        .btn-primary:active:not(:disabled) { transform: scale(0.98); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-ghost {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-ghost:hover { border-color: var(--text-muted); color: var(--text); }

        .expert-cta:hover {
          border-color: var(--accent) !important;
          background: var(--accent-light) !important;
        }

        .spinner {
          width: 16px; height: 16px;
          border: 2px solid color-mix(in srgb, currentColor 25%, transparent);
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }
      `}</style>

      {/* Theme Toggle */}
      <button
        onClick={() => setDark(d => !d)}
        className="btn-ghost"
        style={{
          position: 'fixed', top: '20px', right: '20px',
          padding: '8px 14px', borderRadius: '8px',
          fontSize: '13px', fontFamily: 'var(--font-mono)',
          display: 'flex', alignItems: 'center', gap: '6px',
          zIndex: 100,
        }}
      >
        <span>{dark ? '☀' : '◐'}</span>
        <span>{dark ? 'Light' : 'Dark'}</span>
      </button>

      <main style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}>
        <div style={{ width: '100%', maxWidth: '480px' }} className="fade-up">

          {/* Wordmark */}
          <div style={{ marginBottom: '3.5rem', textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '1.75rem',
            }}>
              <div style={{
                width: '32px', height: '32px',
                background: 'var(--accent)',
                borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4.5C2 3.12 3.12 2 4.5 2h7C12.88 2 14 3.12 14 4.5v4C14 9.88 12.88 11 11.5 11H9l-3 3v-3H4.5C3.12 11 2 9.88 2 8.5v-4z" fill="white"/>
                </svg>
              </div>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: '1.5rem',
                letterSpacing: '-0.01em',
                color: 'var(--text)',
              }}>TalkToX</span>
            </div>

            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 'clamp(2.2rem, 5vw, 3.2rem)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              marginBottom: '1rem',
              color: 'var(--text)',
            }}>
              Converse with<br />
              <em style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>any Reddit user</em>
            </h1>

            <p style={{
              color: 'var(--text-muted)',
              fontSize: '0.95rem',
              lineHeight: 1.65,
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
            }}>
              We index their posts and comments into a knowledge base.
              <br />You chat with an AI grounded in exactly what they wrote.
            </p>
          </div>

          {/* Search card */}
          <form onSubmit={handleSubmit} style={{ marginBottom: '1rem' }}>
            <div
              className="input-focus"
              style={{
                background: 'var(--surface)',
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem 1.25rem 1rem',
                marginBottom: '10px',
                boxShadow: 'var(--shadow-md)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            >
              <label style={{
                display: 'block',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: '10px',
                fontWeight: 500,
              }}>Reddit Username</label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.1rem',
                  userSelect: 'none',
                }}>u/</span>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="spez"
                  disabled={isLoading}
                  autoFocus
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text)',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    fontSize: '1.25rem',
                    letterSpacing: '-0.01em',
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !username.trim()}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 'var(--radius)',
                fontSize: '15px',
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                letterSpacing: '-0.01em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {isLoading ? (
                <>
                  <div className="spinner" />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                    {statusText || 'Working…'}
                  </span>
                </>
              ) : status === 'done' ? (
                <>
                  <span style={{ color: 'var(--success)', filter: 'brightness(2)' }}>✓</span>
                  Redirecting…
                </>
              ) : (
                <>Start chatting <span style={{ opacity: 0.7 }}>→</span></>
              )}
            </button>
          </form>

          {status === 'error' && (
            <div style={{
              marginTop: '12px',
              padding: '12px 16px',
              background: 'var(--danger-bg)',
              border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
              borderRadius: 'var(--radius)',
              color: 'var(--danger)',
              fontSize: '13px',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.5,
            }}>
              {errorMsg}
            </div>
          )}

          {/* Divider */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            margin: '1.5rem 0',
          }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          {/* ExpertFinder CTA */}
          <button
            onClick={() => router.push('/expertfinder')}
            className="expert-cta"
            style={{
              width: '100%',
              padding: '1.1rem 1.25rem',
              background: 'var(--surface)',
              border: '1.5px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all 0.2s',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: '0.95rem',
                color: 'var(--text)',
                marginBottom: '3px',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="4.5" stroke="var(--accent)" strokeWidth="1.5"/>
                  <path d="M10.5 10.5L14 14" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Don't know who to talk to?
              </div>
              <div style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}>Find real topic experts algorithmically — ExpertFinder</div>
            </div>
            <span style={{ color: 'var(--accent)', fontSize: '18px', flexShrink: 0 }}>→</span>
          </button>

          <p style={{
            textAlign: 'center',
            marginTop: '2rem',
            fontSize: '12px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            Only public Reddit data · Every answer cites the source post
          </p>
        </div>
      </main>
    </>
  )
}
