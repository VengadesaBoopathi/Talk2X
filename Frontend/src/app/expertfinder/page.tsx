'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ExpertProfile {
  topics: string[]
  style: string
  top_subreddits: string[]
  knowledge_boundaries: string
}

interface Expert {
  username: string
  signal_a: number
  signal_b: number
  signal_c: number
  final_score: number
  preliminary_score: number
  profile: ExpertProfile
  posts: any[]
}

interface PipelineStep {
  id: string
  label: string
  detail: string
  status: 'waiting' | 'running' | 'done' | 'skipped'
  output?: string
}

const INITIAL_STEPS: PipelineStep[] = [
  { id: 'query', label: 'Query understanding', detail: 'Extracting topic, signals & target subreddits via LLM', status: 'waiting' },
  { id: 'validate', label: 'Subreddit validation', detail: 'Embedding & cosine similarity against query to filter noise', status: 'waiting' },
  { id: 'scrape', label: 'Post & comment retrieval', detail: 'Scraping top posts + comment threads from valid subreddits', status: 'waiting' },
  { id: 'filter', label: 'Semantic relevance filter', detail: 'Embedding all content against expertise signals, dropping off-topic', status: 'waiting' },
  { id: 'score', label: 'Three-signal scoring', detail: 'Signal A (depth) · Signal B (LLM quality) · Signal C (volume)', status: 'waiting' },
  { id: 'profile', label: 'Expert profile generation', detail: 'Gemini synthesizes communication style, boundaries & knowledge map', status: 'waiting' },
]

const STEP_TIMING = [1800, 3500, 7000, 9500, 13000, 17000]

type PageStatus = 'idle' | 'loading' | 'done' | 'error'

export default function ExpertFinderPage() {
  const [query, setQuery] = useState('')
  const [pageStatus, setPageStatus] = useState<PageStatus>('idle')
  const [experts, setExperts] = useState<Expert[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS)
  const [thinkingOpen, setThinkingOpen] = useState(true)
  const [dark, setDark] = useState(false)
  const timersRef = useRef<NodeJS.Timeout[]>([])
  const router = useRouter()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  function clearTimers() {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  function startPipelineAnimation() {
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: 'waiting' })))
    setThinkingOpen(true)

    STEP_TIMING.forEach((delay, i) => {
      const t = setTimeout(() => {
        setSteps(prev => prev.map((s, idx) => {
          if (idx < i) return { ...s, status: 'done' }
          if (idx === i) return { ...s, status: 'running' }
          return s
        }))
      }, delay)
      timersRef.current.push(t)
    })
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return

    setPageStatus('loading')
    setErrorMsg('')
    setExperts([])
    clearTimers()
    startPipelineAnimation()

    try {
      const res = await fetch(`${API_URL}/api/v1/discover/experts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Discovery failed')
      }

      const data: Expert[] = await res.json()
      clearTimers()
      setSteps(prev => prev.map(s => ({ ...s, status: 'done' })))

      // Brief pause so user sees all steps done
      await new Promise(r => setTimeout(r, 600))
      setThinkingOpen(false)
      setExperts(data)
      setPageStatus('done')
    } catch (err: any) {
      clearTimers()
      setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'waiting' } : s))
      setPageStatus('error')
      setErrorMsg(err.message || 'Something went wrong')
    }
  }

  function handleSelectExpert(username: string) {
    router.push(`/chat/${username}`)
  }

  const score = (expert: Expert) => expert.final_score || expert.preliminary_score || 0

  const rankColors = ['#f59e0b', '#94a3b8', '#b45309']
  const rankLabels = ['1st', '2nd', '3rd']

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
          --success-bg: #0a1f14;
          --danger: #e55;
          --danger-bg: #2a1010;
          --warning: #f59e0b;
          --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
          --shadow-md: 0 4px 12px rgba(0,0,0,0.3);
          --shadow-lg: 0 10px 40px rgba(0,0,0,0.4);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: var(--bg); color: var(--text); font-family: var(--font-body); transition: background 0.3s, color 0.3s; }

        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 40%, transparent); }
          70% { box-shadow: 0 0 0 6px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
        @keyframes step-enter {
          from { opacity: 0; transform: translateX(-6px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes expert-enter {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .fade-up { animation: fadeUp 0.5s ease forwards; }

        .search-box:focus-within {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent) !important;
        }

        .btn-primary {
          background: var(--accent); color: white; border: none; cursor: pointer;
          transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
        }
        .btn-primary:hover:not(:disabled) {
          background: var(--accent-hover);
          box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 35%, transparent);
        }
        .btn-primary:active:not(:disabled) { transform: scale(0.98); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-ghost {
          background: transparent; border: 1px solid var(--border);
          color: var(--text-muted); cursor: pointer; transition: all 0.15s;
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

        .expert-card {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          cursor: pointer;
          box-shadow: var(--shadow-sm);
          transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
        }
        .expert-card:hover {
          border-color: var(--accent);
          box-shadow: var(--shadow-md), 0 0 0 1px color-mix(in srgb, var(--accent) 15%, transparent);
          transform: translateY(-2px);
        }

        .signal-bar-fill { transition: width 1s cubic-bezier(0.22, 1, 0.36, 1); }

        .thinking-panel {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: var(--shadow-md);
          margin-bottom: 1.5rem;
        }

        .thinking-toggle {
          width: 100%; display: flex; align-items: center;
          justify-content: space-between; padding: 14px 16px;
          background: transparent; border: none; cursor: pointer;
          text-align: left; transition: background 0.15s;
        }
        .thinking-toggle:hover { background: var(--surface2); }

        .step-row {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 10px 16px;
          animation: step-enter 0.3s ease forwards;
        }

        .chip {
          display: inline-flex; align-items: center;
          padding: 2px 10px; border-radius: 999px;
          font-size: 11px; font-family: var(--font-mono);
          font-weight: 500;
        }
      `}</style>

      {/* Theme Toggle */}
      <button onClick={() => setDark(d => !d)} className="btn-ghost" style={{
        position: 'fixed', top: '20px', right: '20px',
        padding: '8px 14px', borderRadius: '8px',
        fontSize: '13px', fontFamily: 'var(--font-mono)',
        display: 'flex', alignItems: 'center', gap: '6px', zIndex: 100,
      }}>
        <span>{dark ? '☀' : '◐'}</span>
        <span>{dark ? 'Light' : 'Dark'}</span>
      </button>

      <main style={{ minHeight: '100vh', padding: '2.5rem 1.5rem' }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>

          {/* Back */}
          <button onClick={() => router.push('/')} className="btn-ghost" style={{
            padding: '7px 14px', borderRadius: '8px',
            fontSize: '12px', fontFamily: 'var(--font-mono)', marginBottom: '2.5rem',
          }}>← TalkToX</button>

          {/* Header */}
          <div style={{ marginBottom: '2.5rem' }} className="fade-up">
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              background: 'var(--accent-light)',
              border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
              borderRadius: '999px', padding: '4px 14px',
              marginBottom: '1.25rem',
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }} />
              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', letterSpacing: '0.1em' }}>
                EXPERT DISCOVERY
              </span>
            </div>

            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 'clamp(1.9rem, 4vw, 3rem)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              marginBottom: '0.75rem',
            }}>
              Find real experts.<br />
              <em style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Chat with their knowledge.</em>
            </h1>

            <p style={{
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              lineHeight: 1.65,
            }}>
              We score Reddit users algorithmically — semantic depth, post quality via LLM, and consistency.
              <br />Pick an expert and drop straight into a RAG-powered chat with their posts.
            </p>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <div
                className="search-box"
                style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: 'var(--surface)',
                  border: '1.5px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '10px 14px',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                  <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Find experts in Kubernetes networking..."
                  disabled={pageStatus === 'loading'}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: 'var(--text)', fontFamily: 'var(--font-body)',
                    fontWeight: 400, fontSize: '0.95rem',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={pageStatus === 'loading' || !query.trim()}
                className="btn-primary"
                style={{
                  padding: '10px 22px', borderRadius: 'var(--radius)',
                  fontSize: '14px', fontFamily: 'var(--font-body)',
                  fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
                  whiteSpace: 'nowrap',
                }}
              >
                {pageStatus === 'loading' ? (
                  <><div className="spinner" />Discovering…</>
                ) : 'Find Experts →'}
              </button>
            </div>

            {/* Example chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {['Kubernetes networking', 'cardiac surgery', 'options trading', 'Rust async programming', 'ML infrastructure'].map(ex => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setQuery(ex)}
                  className="btn-ghost"
                  style={{
                    padding: '4px 12px', borderRadius: '999px',
                    fontSize: '11px', fontFamily: 'var(--font-mono)',
                  }}
                >{ex}</button>
              ))}
            </div>
          </form>

          {/* ─── THINKING PANEL (DeepSeek-style) ─── */}
          {(pageStatus === 'loading' || (pageStatus === 'done' && steps.some(s => s.status === 'done'))) && (
            <div className="thinking-panel">
              <button
                className="thinking-toggle"
                onClick={() => setThinkingOpen(o => !o)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {pageStatus === 'loading' && (
                    <div className="spinner" style={{ color: 'var(--accent)' }} />
                  )}
                  {pageStatus === 'done' && (
                    <div style={{
                      width: '14px', height: '14px', borderRadius: '50%',
                      background: 'var(--success)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '12px',
                    color: pageStatus === 'loading' ? 'var(--accent)' : 'var(--success)',
                    fontWeight: 500,
                  }}>
                    {pageStatus === 'loading' ? 'Pipeline running…' : 'Pipeline complete'}
                  </span>
                  <span style={{
                    fontSize: '11px', fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}>
                    {steps.filter(s => s.status === 'done').length}/{steps.length} steps
                  </span>
                </div>
                <svg
                  width="14" height="14" viewBox="0 0 14 14" fill="none"
                  style={{ transform: thinkingOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-muted)' }}
                >
                  <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {thinkingOpen && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '4px 0' }}>
                  {steps.map((step, i) => (
                    <div key={step.id} className="step-row" style={{
                      opacity: step.status === 'waiting' ? 0.35 : 1,
                      background: step.status === 'running' ? 'var(--accent-light)' : 'transparent',
                      transition: 'background 0.3s, opacity 0.3s',
                    }}>
                      {/* Status indicator */}
                      <div style={{ paddingTop: '2px', flexShrink: 0 }}>
                        {step.status === 'done' && (
                          <div style={{
                            width: '16px', height: '16px', borderRadius: '50%',
                            background: 'var(--success-bg)',
                            border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path d="M1.5 4L3.5 6L6.5 2" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                        {step.status === 'running' && (
                          <div className="spinner" style={{ color: 'var(--accent)', width: '16px', height: '16px' }} />
                        )}
                        {step.status === 'waiting' && (
                          <div style={{
                            width: '16px', height: '16px', borderRadius: '50%',
                            border: '1.5px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--border)' }} />
                          </div>
                        )}
                      </div>

                      {/* Step content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          marginBottom: '2px',
                        }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: '11px',
                            color: 'var(--text-muted)',
                            letterSpacing: '0.05em',
                          }}>0{i + 1}</span>
                          <span style={{
                            fontFamily: 'var(--font-body)', fontSize: '13px',
                            fontWeight: 600, color: 'var(--text)',
                          }}>{step.label}</span>
                          {step.status === 'running' && (
                            <span style={{
                              fontSize: '10px', fontFamily: 'var(--font-mono)',
                              color: 'var(--accent)', background: 'var(--accent-light)',
                              padding: '1px 7px', borderRadius: '999px',
                              border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                            }}>running</span>
                          )}
                        </div>
                        <p style={{
                          fontSize: '12px', fontFamily: 'var(--font-mono)',
                          color: 'var(--text-muted)', lineHeight: 1.5,
                        }}>{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {pageStatus === 'error' && (
            <div style={{
              padding: '12px 16px',
              background: 'var(--danger-bg)',
              border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
              borderRadius: 'var(--radius)',
              color: 'var(--danger)',
              fontFamily: 'var(--font-mono)', fontSize: '13px',
              lineHeight: 1.5, marginBottom: '1.5rem',
            }}>{errorMsg}</div>
          )}

          {/* No results */}
          {pageStatus === 'done' && experts.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '4rem 2rem',
              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '13px',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>∅</div>
              No experts found for this query. Try a more specific technical domain.
            </div>
          )}

          {/* ─── EXPERT RESULTS ─── */}
          {pageStatus === 'done' && experts.length > 0 && (
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '1.25rem',
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem' }}>
                  {experts.length} expert{experts.length !== 1 ? 's' : ''} found
                </div>
                <div style={{
                  fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
                }}>click any expert to chat</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {experts.map((expert, i) => (
                  <div
                    key={expert.username}
                    className="expert-card"
                    onClick={() => handleSelectExpert(expert.username)}
                    style={{ animationDelay: `${i * 0.08}s`, animation: 'expert-enter 0.4s ease forwards', opacity: 0 }}
                  >
                    {/* Top row */}
                    <div style={{
                      display: 'flex', alignItems: 'flex-start',
                      justifyContent: 'space-between', gap: '12px',
                      marginBottom: '1.25rem', flexWrap: 'wrap',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Avatar */}
                        <div style={{
                          width: '44px', height: '44px', borderRadius: '12px',
                          background: i < 3
                            ? `color-mix(in srgb, ${rankColors[i]} 15%, var(--surface2))`
                            : 'var(--surface2)',
                          border: `2px solid ${i < 3 ? rankColors[i] : 'var(--border)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <span style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '1.1rem',
                            color: i < 3 ? rankColors[i] : 'var(--text-muted)',
                          }}>
                            {expert.username[0].toUpperCase()}
                          </span>
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                            <span style={{
                              fontFamily: 'var(--font-body)', fontWeight: 600,
                              fontSize: '1rem', color: 'var(--text)',
                            }}>u/{expert.username}</span>
                            {i < 3 && (
                              <span style={{
                                fontSize: '10px', fontFamily: 'var(--font-mono)',
                                color: rankColors[i],
                                background: `color-mix(in srgb, ${rankColors[i]} 12%, transparent)`,
                                border: `1px solid color-mix(in srgb, ${rankColors[i]} 30%, transparent)`,
                                padding: '1px 8px', borderRadius: '999px', fontWeight: 600,
                              }}>{rankLabels[i]}</span>
                            )}
                          </div>
                          {expert.profile?.top_subreddits?.length > 0 && (
                            <div style={{
                              fontSize: '12px', fontFamily: 'var(--font-mono)',
                              color: 'var(--text-muted)',
                            }}>
                              {expert.profile.top_subreddits.slice(0, 3).map(s => `r/${s}`).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Score + CTA */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        <div style={{
                          textAlign: 'center',
                          background: 'var(--surface2)', border: '1px solid var(--border)',
                          borderRadius: '10px', padding: '8px 14px',
                        }}>
                          <div style={{
                            fontFamily: 'var(--font-mono)', fontWeight: 600,
                            fontSize: '1.15rem', color: 'var(--accent)', lineHeight: 1,
                          }}>{(score(expert) * 100).toFixed(0)}</div>
                          <div style={{
                            fontSize: '9px', fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)', marginTop: '2px', letterSpacing: '0.08em',
                          }}>SCORE</div>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); handleSelectExpert(expert.username) }}
                          className="btn-primary"
                          style={{
                            padding: '9px 18px', borderRadius: '10px',
                            fontSize: '13px', fontFamily: 'var(--font-body)', fontWeight: 600,
                          }}
                        >Chat →</button>
                      </div>
                    </div>

                    {/* Signal bars */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                      gap: '12px', marginBottom: '1rem',
                    }}>
                      {[
                        { label: 'Semantic Depth', value: expert.signal_a || 0, color: 'var(--accent)', desc: 'Avg cosine sim against expertise signals' },
                        { label: 'LLM Quality', value: (expert.signal_b || 0) / 10, color: '#8b5cf6', desc: 'Gemini-rated technical depth (1-10)' },
                        { label: 'Volume Score', value: Math.min((expert.signal_c || 0) / 10, 1), color: 'var(--success)', desc: 'Consistent high-quality posting' },
                      ].map(sig => (
                        <div key={sig.label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <span style={{
                              fontSize: '10px', fontFamily: 'var(--font-mono)',
                              color: 'var(--text-muted)',
                            }}>{sig.label}</span>
                            <span style={{
                              fontSize: '10px', fontFamily: 'var(--font-mono)',
                              color: sig.color, fontWeight: 600,
                            }}>{(sig.value * 100).toFixed(0)}%</span>
                          </div>
                          <div style={{
                            height: '4px', background: 'var(--border)',
                            borderRadius: '999px', overflow: 'hidden',
                          }}>
                            <div
                              className="signal-bar-fill"
                              style={{
                                height: '100%',
                                width: `${Math.min(sig.value * 100, 100)}%`,
                                background: sig.color,
                                borderRadius: '999px',
                              }}
                            />
                          </div>
                          <div style={{
                            fontSize: '10px', fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.4,
                            opacity: 0.7,
                          }}>{sig.desc}</div>
                        </div>
                      ))}
                    </div>

                    {/* Profile details */}
                    {expert.profile && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        {expert.profile.style && (
                          <p style={{
                            fontSize: '13px', fontFamily: 'var(--font-body)',
                            color: 'var(--text-muted)', lineHeight: 1.6,
                            marginBottom: expert.profile.topics?.length ? '12px' : '0',
                            fontStyle: 'italic',
                          }}>"{expert.profile.style}"</p>
                        )}

                        {expert.profile.topics?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: expert.profile.knowledge_boundaries ? '10px' : '0' }}>
                            {expert.profile.topics.slice(0, 5).map(topic => (
                              <span key={topic} className="chip" style={{
                                background: 'var(--accent-light)',
                                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                                color: 'var(--accent)',
                              }}>{topic}</span>
                            ))}
                          </div>
                        )}

                        {expert.profile.knowledge_boundaries && (
                          <div style={{
                            fontSize: '11px', fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)',
                            background: 'var(--surface2)', border: '1px solid var(--border)',
                            borderRadius: '8px', padding: '8px 12px',
                            lineHeight: 1.5,
                          }}>
                            <span style={{ color: 'var(--warning)', fontWeight: 600, marginRight: '6px' }}>⚠ Boundaries:</span>
                            {expert.profile.knowledge_boundaries}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
