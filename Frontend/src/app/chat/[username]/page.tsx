'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  citations?: string[]
}

interface ScrapeStep {
  label: string
  status: 'waiting' | 'running' | 'done'
}

const SCRAPE_STEPS: ScrapeStep[] = [
  { label: 'Fetching Reddit profile', status: 'waiting' },
  { label: 'Paginating post history', status: 'waiting' },
  { label: 'Paginating comment history', status: 'waiting' },
  { label: 'Chunking content', status: 'waiting' },
  { label: 'Generating embeddings', status: 'waiting' },
  { label: 'Writing to vector store', status: 'waiting' },
]

const SCRAPE_TIMING = [800, 2500, 5000, 8000, 11000, 14000]

type AppStatus = 'checking' | 'scraping' | 'polling' | 'ready' | 'error'

const SUGGESTED = [
  'What topics do they post about most?',
  "What's their general opinion on AI?",
  'Which subreddits are they most active in?',
  'What are their most upvoted posts about?',
]

export default function ChatPage() {
  const params = useParams()
  const router = useRouter()
  const username = params.username as string

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [userInfo, setUserInfo] = useState<any>(null)
  const [appStatus, setAppStatus] = useState<AppStatus>('checking')
  const [statusText, setStatusText] = useState('Checking user…')
  const [scrapeSteps, setScrapeSteps] = useState<ScrapeStep[]>(SCRAPE_STEPS)
  const [stepsOpen, setStepsOpen] = useState(true)
  const [dark, setDark] = useState(false)
  const [inputRows, setInputRows] = useState(1)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrapeTimersRef = useRef<NodeJS.Timeout[]>([])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => { initUser() }, [username])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function clearScrapeTimers() {
    scrapeTimersRef.current.forEach(clearTimeout)
    scrapeTimersRef.current = []
  }

  function startScrapeAnimation() {
    setScrapeSteps(SCRAPE_STEPS.map(s => ({ ...s, status: 'waiting' })))
    setStepsOpen(true)

    SCRAPE_TIMING.forEach((delay, i) => {
      const t = setTimeout(() => {
        setScrapeSteps(prev => prev.map((s, idx) => {
          if (idx < i) return { ...s, status: 'done' }
          if (idx === i) return { ...s, status: 'running' }
          return s
        }))
      }, delay)
      scrapeTimersRef.current.push(t)
    })
  }

  async function initUser() {
    try {
      const res = await fetch(`${API_URL}/api/v1/status/${username}`)

      if (res.ok) {
        const data = await res.json()
        setUserInfo(data)

        if (data.scrape_status === 'idle' && data.total_posts > 0) {
          setScrapeSteps(SCRAPE_STEPS.map(s => ({ ...s, status: 'done' })))
          setStepsOpen(false)
          setAppStatus('ready')
          return
        }

        if (data.scrape_status === 'in_progress') {
          setAppStatus('polling')
          setStatusText('Scrape already in progress…')
          startScrapeAnimation()
          await pollUntilDone()
          return
        }

        if (data.scrape_status === 'idle' && data.total_posts === 0) {
          await triggerScrape()
          return
        }
      } else if (res.status === 404) {
        await triggerScrape()
      } else {
        setAppStatus('error')
        setStatusText('Failed to check user status')
      }
    } catch {
      setAppStatus('error')
      setStatusText('Could not connect to server')
    }
  }

  async function triggerScrape() {
    setAppStatus('scraping')
    setStatusText(`Scraping u/${username}'s Reddit history…`)
    startScrapeAnimation()

    try {
      const scrapeRes = await fetch(`${API_URL}/api/v1/scrape/${username}`, { method: 'POST' })
      if (!scrapeRes.ok) {
        const err = await scrapeRes.json()
        throw new Error(err.detail || 'Scrape failed')
      }
      setAppStatus('polling')
      await pollUntilDone()
    } catch (err: any) {
      clearScrapeTimers()
      setAppStatus('error')
      setStatusText(err.message || 'Scrape failed')
    }
  }

  async function pollUntilDone() {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000))
      try {
        const res = await fetch(`${API_URL}/api/v1/status/${username}`)
        if (!res.ok) continue
        const data = await res.json()
        setUserInfo(data)
        setStatusText(`${data.total_posts || 0} posts · ${data.total_comments || 0} comments indexed`)

        if (data.scrape_status === 'idle' && data.total_posts > 0) {
          clearScrapeTimers()
          setScrapeSteps(prev => prev.map(s => ({ ...s, status: 'done' })))
          await new Promise(r => setTimeout(r, 600))
          setStepsOpen(false)
          setAppStatus('ready')
          return
        }

        if (data.scrape_status === 'failed') throw new Error('Scrape failed on server')
      } catch (err: any) {
        clearScrapeTimers()
        setAppStatus('error')
        setStatusText(err.message || 'Failed to get status')
        return
      }
    }
    clearScrapeTimers()
    setAppStatus('error')
    setStatusText('Timed out waiting for scrape')
  }

  function extractCitations(content: string): string[] {
    const urlRegex = /https?:\/\/reddit\.com[^\s\)"']+/g
    return [...new Set(content.match(urlRegex) || [])]
  }

  async function sendMessage() {
    if (!input.trim() || isStreaming || appStatus !== 'ready') return

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    const historyForApi = messages.map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setInputRows(1)
    setIsStreaming(true)

    const assistantPlaceholder: Message = {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, assistantPlaceholder])

    try {
      const res = await fetch(`${API_URL}/api/v1/chat/${username}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage.content, chat_history: historyForApi }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Chat failed')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: accumulated,
            citations: extractCitations(accumulated),
          }
          return updated
        })
      }
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `Error: ${err.message}`,
        }
        return updated
      })
    } finally {
      setIsStreaming(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const lines = e.target.value.split('\n').length
    setInputRows(Math.min(lines, 4))
  }

  function formatTime(date: Date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  
  function renderContent(content: string) {
    const withoutSources = content.replace(/\n*Sources:\n[\s\S]*/gi, '').trim()
    const withoutUrls = withoutSources.replace(/https?:\/\/reddit\.com[^\s\)"']+/g, '').trim()
    const withoutEmptyParens = withoutUrls.replace(/\(\s*\)/g, '').trim()
    return withoutEmptyParens
  }

  const doneScraping = scrapeSteps.every(s => s.status === 'done')

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
          --success-bg: #f0fdf4;
          --danger: #c0392b;
          --danger-bg: #fef2f2;
          --warning: #b45309;
          --shadow-sm: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
          --shadow-md: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
          --font-display: 'Instrument Serif', Georgia, serif;
          --font-body: 'DM Sans', system-ui, sans-serif;
          --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
          --radius: 12px;
          --radius-lg: 20px;
          --msg-user-bg: var(--accent);
          --msg-user-color: white;
          --msg-ai-bg: var(--surface);
          --msg-ai-border: var(--border);
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
          --success-bg: #0a1f14;
          --danger: #e55;
          --danger-bg: #2a1010;
          --warning: #f59e0b;
          --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
          --shadow-md: 0 4px 12px rgba(0,0,0,0.3);
          --msg-user-bg: var(--accent);
          --msg-user-color: white;
          --msg-ai-bg: var(--surface);
          --msg-ai-border: var(--border);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: var(--bg); color: var(--text); font-family: var(--font-body); height: 100%; }
        #__next, body, html { height: 100%; }

        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes msg-in-user {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes msg-in-ai {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .msg-user { animation: msg-in-user 0.25s ease forwards; }
        .msg-ai { animation: msg-in-ai 0.25s ease forwards; }

        .btn-ghost {
          background: transparent; border: 1px solid var(--border);
          color: var(--text-muted); cursor: pointer; transition: all 0.15s;
          display: flex; align-items: center; gap: 6px;
        }
        .btn-ghost:hover { border-color: var(--text-muted); color: var(--text); }

        .spinner {
          width: 14px; height: 14px;
          border: 1.5px solid color-mix(in srgb, currentColor 25%, transparent);
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }

        .input-area {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius-lg);
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input-area:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
        }

        .send-btn {
          width: 36px; height: 36px; border-radius: 10px; border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s; flex-shrink: 0;
          font-size: 15px;
        }
        .send-btn:enabled { background: var(--accent); color: white; }
        .send-btn:enabled:hover { background: var(--accent-hover); }
        .send-btn:disabled { background: var(--border); color: var(--text-muted); cursor: not-allowed; }

        .citation-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 999px;
          font-size: 11px; font-family: var(--font-mono);
          background: var(--accent-light);
          border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
          color: var(--accent);
          text-decoration: none;
          transition: background 0.15s;
        }
        .citation-chip:hover { background: color-mix(in srgb, var(--accent) 15%, transparent); }

        .suggested-chip {
          background: var(--surface); border: 1px solid var(--border);
          color: var(--text-muted); padding: 7px 14px; border-radius: 999px;
          font-size: 12px; font-family: var(--font-body);
          cursor: pointer; transition: all 0.15s; text-align: left;
          line-height: 1.4;
        }
        .suggested-chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }

        .thinking-panel {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: var(--shadow-md);
        }
        .thinking-toggle {
          width: 100%; display: flex; align-items: center;
          justify-content: space-between; padding: 13px 16px;
          background: transparent; border: none; cursor: pointer;
          text-align: left; transition: background 0.15s;
        }
        .thinking-toggle:hover { background: var(--surface2); }

        .step-row {
          display: flex; align-items: center; gap: 12px;
          padding: 9px 16px;
          transition: background 0.3s, opacity 0.3s;
        }
      `}</style>

      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

        {/* Header */}
        <header style={{
          padding: '0.875rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex', alignItems: 'center', gap: '12px',
          flexShrink: 0, boxShadow: 'var(--shadow-sm)',
        }}>
          <button onClick={() => router.back()} className="btn-ghost" style={{
            padding: '6px 12px', borderRadius: '8px',
            fontSize: '12px', fontFamily: 'var(--font-mono)',
          }}>← back</button>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: appStatus === 'ready' ? 'var(--success)' : appStatus === 'error' ? 'var(--danger)' : 'var(--warning)',
                boxShadow: `0 0 6px ${appStatus === 'ready' ? 'var(--success)' : 'var(--danger)'}`,
              }} />
              <span style={{ fontWeight: 600, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
                u/{username}
              </span>
            </div>
            <div style={{
              fontSize: '11px', color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)', marginTop: '1px',
            }}>
              {appStatus === 'ready' && userInfo
                ? `${userInfo.total_posts} posts · ${userInfo.total_comments} comments indexed`
                : statusText}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              padding: '4px 10px', borderRadius: '999px',
            }}>RAG · Gemini</div>
            <button onClick={() => setDark(d => !d)} className="btn-ghost" style={{
              padding: '6px 10px', borderRadius: '8px',
              fontSize: '13px', fontFamily: 'var(--font-mono)',
            }}>{dark ? '☀' : '◐'}</button>
          </div>
        </header>

        {/* ─── LOADING / SCRAPING ─── */}
        {(appStatus === 'checking' || appStatus === 'scraping' || appStatus === 'polling') && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '2rem', gap: '1.5rem',
          }}>
            <div style={{ width: '100%', maxWidth: '440px' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.4rem', marginBottom: '6px',
                }}>
                  {appStatus === 'scraping' ? `Indexing u/${username}` : 'Building knowledge base…'}
                </div>
                <div style={{
                  fontSize: '12px', fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}>{statusText}</div>
              </div>

              {/* Scrape steps thinking panel */}
              <div className="thinking-panel">
                <button
                  className="thinking-toggle"
                  onClick={() => setStepsOpen(o => !o)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="spinner" style={{ color: 'var(--accent)' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent)', fontWeight: 500 }}>
                      Scraping pipeline
                    </span>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {scrapeSteps.filter(s => s.status === 'done').length}/{scrapeSteps.length}
                    </span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                    style={{ transform: stepsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-muted)' }}>
                    <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {stepsOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '4px 0' }}>
                    {scrapeSteps.map((step, i) => (
                      <div key={i} className="step-row" style={{
                        opacity: step.status === 'waiting' ? 0.3 : 1,
                        background: step.status === 'running' ? 'var(--accent-light)' : 'transparent',
                      }}>
                        {step.status === 'done' ? (
                          <div style={{
                            width: '16px', height: '16px', borderRadius: '50%',
                            background: 'var(--success-bg)',
                            border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path d="M1.5 4L3.5 6L6.5 2" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        ) : step.status === 'running' ? (
                          <div className="spinner" style={{ color: 'var(--accent)', width: '16px', height: '16px' }} />
                        ) : (
                          <div style={{
                            width: '16px', height: '16px', borderRadius: '50%',
                            border: '1.5px solid var(--border)', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--border)' }} />
                          </div>
                        )}
                        <span style={{
                          fontSize: '13px', fontFamily: 'var(--font-body)',
                          fontWeight: step.status === 'running' ? 600 : 400,
                          color: step.status === 'running' ? 'var(--accent)' : 'var(--text)',
                        }}>{step.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p style={{
                textAlign: 'center', marginTop: '1rem',
                fontSize: '11px', fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
              }}>First time — takes 1–3 minutes. Incremental on repeat visits.</p>
            </div>
          </div>
        )}

        {/* ─── ERROR ─── */}
        {appStatus === 'error' && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '1rem', padding: '2rem',
          }}>
            <div style={{ fontSize: '2rem' }}>⚠</div>
            <div style={{
              color: 'var(--danger)', fontFamily: 'var(--font-mono)',
              fontSize: '13px', textAlign: 'center', lineHeight: 1.6,
              maxWidth: '360px',
            }}>{statusText}</div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
              <button onClick={initUser} style={{
                padding: '9px 20px', background: 'var(--accent)', color: 'white',
                border: 'none', borderRadius: '10px', fontFamily: 'var(--font-body)',
                fontWeight: 600, fontSize: '13px', cursor: 'pointer',
              }}>Try again</button>
              <button onClick={() => router.back()} className="btn-ghost" style={{
                padding: '9px 20px', borderRadius: '10px',
                fontFamily: 'var(--font-body)', fontSize: '13px',
              }}>← Go back</button>
            </div>
          </div>
        )}

        {/* ─── CHAT ─── */}
        {appStatus === 'ready' && (
          <>
            <div style={{
              flex: 1, overflowY: 'auto',
              padding: '1.5rem',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center',
            }}>
              <div style={{ width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {messages.length === 0 && (
                  <div style={{
                    paddingTop: '3rem',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: '1rem', animation: 'fadeUp 0.4s ease forwards',
                  }}>
                    <div style={{
                      width: '52px', height: '52px', borderRadius: '14px',
                      background: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '22px', marginBottom: '0.25rem',
                    }}>💬</div>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.3rem', textAlign: 'center',
                    }}>
                      Ask anything about <em style={{ fontStyle: 'italic' }}>u/{username}</em>
                    </div>
                    <p style={{
                      fontSize: '13px', fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6,
                    }}>
                      Every answer is grounded in their actual posts.<br />
                      Sources are cited inline.
                    </p>

                    <div style={{
                      display: 'flex', flexWrap: 'wrap', gap: '8px',
                      justifyContent: 'center', marginTop: '0.5rem', maxWidth: '520px',
                    }}>
                      {SUGGESTED.map(q => (
                        <button
                          key={q}
                          onClick={() => { setInput(q); inputRef.current?.focus() }}
                          className="suggested-chip"
                        >{q}</button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => {
                  const displayContent = isStreaming && i === messages.length - 1
                    ? msg.content  // show raw during streaming
                      .replace(/https?:\/\/reddit\.com[^\s\)"']+/g, '')
                      .replace(/\(\s*\)/g, '')
                    : renderContent(msg.content)  // clean fully when done

                  return (
                    <div
                      key={i}
                      className={msg.role === 'user' ? 'msg-user' : 'msg-ai'}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        gap: '6px',
                      }}
                    >
                      <div style={{
                        fontSize: '11px', fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)', paddingInline: '4px',
                      }}>
                        {msg.role === 'user' ? 'you' : `u/${username} via AI`} · {formatTime(msg.timestamp)}
                      </div>

                      <div style={{
                        maxWidth: '85%',
                        padding: '0.875rem 1.1rem',
                        borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        fontSize: '14.5px', lineHeight: 1.7,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)',
                        color: msg.role === 'user' ? 'white' : 'var(--text)',
                        border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                        boxShadow: 'var(--shadow-sm)',
                        fontFamily: 'var(--font-body)',
                        fontWeight: 400,
                      }}>
                        {displayContent || (isStreaming && i === messages.length - 1 && msg.role === 'assistant' ? '' : '—')}
                        {isStreaming && i === messages.length - 1 && msg.role === 'assistant' && (
                          <span style={{
                            display: 'inline-block', width: '2px', height: '15px',
                            background: 'var(--accent)', marginLeft: '2px', verticalAlign: 'middle',
                            animation: 'cursor-blink 0.8s step-end infinite',
                          }} />
                        )}
                      </div>

                      {/* Citation chips */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingInline: '4px' }}>
                          {msg.citations.map((url, j) => (
                            <a
                              key={j}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="citation-chip"
                            >
                              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                                <path d="M2 7L7 2M7 2H3.5M7 2V5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              source {j + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
            </div>

            {/* Input bar */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface)',
              flexShrink: 0,
            }}>
              <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                <div className="input-area" style={{
                  display: 'flex', alignItems: 'flex-end', gap: '10px',
                  padding: '10px 10px 10px 16px',
                }}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={`Ask about u/${username}…`}
                    disabled={isStreaming}
                    rows={inputRows}
                    style={{
                      flex: 1, background: 'transparent', border: 'none', outline: 'none',
                      color: 'var(--text)', fontFamily: 'var(--font-body)',
                      fontSize: '14.5px', lineHeight: 1.6, resize: 'none',
                      maxHeight: '120px', overflowY: 'auto',
                      fontWeight: 400,
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || isStreaming}
                    className="send-btn"
                  >
                    {isStreaming ? '⏸' : '↑'}
                  </button>
                </div>
                <p style={{
                  textAlign: 'center', marginTop: '6px',
                  fontSize: '11px', color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  Enter to send · Shift+Enter for newline
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
