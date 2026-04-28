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

interface StepState {
  status: 'waiting' | 'running' | 'done'
  data: any
  open: boolean
}

const STEP_META: Record<string, { label: string; detail: string }> = {
  query:    { label: 'Query understanding',       detail: 'LLM extracts topic, signals & target subreddits' },
  validate: { label: 'Subreddit validation',      detail: 'Cosine similarity filter against your query' },
  scrape:   { label: 'Post & comment retrieval',  detail: 'Scraping top posts + threads from valid subreddits' },
  filter:   { label: 'Semantic relevance filter', detail: 'Embedding all content against expertise signals' },
  score:    { label: 'Three-signal scoring',      detail: 'Signal A (depth) · Signal B (LLM quality) · Signal C (volume)' },
  done:     { label: 'Expert profile generation', detail: 'Gemini synthesizes style, topics & knowledge map' },
}

type PageStatus = 'idle' | 'loading' | 'done' | 'error'

const SUGGESTED = [
  'Kubernetes networking', 'cardiac surgery', 'options trading',
  'Rust async programming', 'ML infrastructure', 'pharmaceutical chemistry',
]

const rankColors = ['#f59e0b', '#94a3b8', '#b45309']
const rankLabels = ['1st', '2nd', '3rd']

function makeInitialSteps(): Record<string, StepState> {
  return Object.fromEntries(
    Object.keys(STEP_META).map(k => [k, { status: 'waiting', data: null, open: false }])
  )
}

export default function ExpertFinderPage() {
  const [query, setQuery] = useState('')
  const [pageStatus, setPageStatus] = useState<PageStatus>('idle')
  const [experts, setExperts] = useState<Expert[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [dark, setDark] = useState(false)
  const [steps, setSteps] = useState<Record<string, StepState>>(makeInitialSteps)
  const router = useRouter()
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    const cached = sessionStorage.getItem('ef_results')
    const cachedQuery = sessionStorage.getItem('ef_query')
    if (cached && cachedQuery) {
      setExperts(JSON.parse(cached))
      setQuery(cachedQuery)
      setPageStatus('done')
    }
  }, [])

  function setStepRunning(key: string) {
    setSteps(prev => ({ ...prev, [key]: { ...prev[key], status: 'running', open: true } }))
  }

  function setStepDone(key: string, data: any) {
    setSteps(prev => ({ ...prev, [key]: { status: 'done', data, open: true } }))
  }

  function toggleStep(key: string) {
    setSteps(prev => ({ ...prev, [key]: { ...prev[key], open: !prev[key].open } }))
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setPageStatus('loading')
    setErrorMsg('')
    setExperts([])
    setSteps(makeInitialSteps())
    setStepRunning('query')

    try {
      const res = await fetch(`${API_URL}/api/v1/discover/experts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Discovery failed')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const raw of parts) {
          if (!raw.trim()) continue
          let eventType = '', eventData = ''
          for (const line of raw.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim()
            if (line.startsWith('data: ')) eventData = line.slice(6).trim()
          }
          if (!eventType || !eventData) continue
          try { handleSSEEvent(eventType, JSON.parse(eventData)) }
          catch { console.error('SSE parse error', eventData) }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setPageStatus('error')
      setErrorMsg(err.message || 'Something went wrong')
    }
  }

  function handleSSEEvent(type: string, data: any) {
    if (type === 'step_query')    { setStepDone('query', data);    setStepRunning('validate') }
    if (type === 'step_validate') { setStepDone('validate', data); setStepRunning('scrape') }
    if (type === 'step_scrape')   { setStepDone('scrape', data);   setStepRunning('filter') }
    if (type === 'step_filter')   { setStepDone('filter', data);   setStepRunning('score') }
    if (type === 'step_score')    { setStepDone('score', data);    setStepRunning('done') }
    if (type === 'done' || type === 'cached') {
      setStepDone('done', { count: data.experts?.length || 0 })
      const list = data.experts || []
      setExperts(list)
      sessionStorage.setItem('ef_results', JSON.stringify(list))
      sessionStorage.setItem('ef_query', query.trim())
      setPageStatus('done')
    }
    if (type === 'error') { setPageStatus('error'); setErrorMsg(data.message || 'Pipeline failed') }
  }

  const anyActive = Object.values(steps).some(s => s.status !== 'waiting')

  return (
    <>
      <style>{`
        :root {
          --bg:#faf8f5; --surface:#fff; --surface2:#f3f1ee; --border:#e8e4de;
          --text:#1a1714; --text-muted:#8a847c; --accent:#1a56db;
          --accent-light:#eff6ff; --accent-hover:#1447b3;
          --success:#0d7a4e; --success-bg:#f0fdf4;
          --danger:#c0392b; --danger-bg:#fef2f2; --warning:#b45309;
          --shadow-sm:0 1px 3px rgba(0,0,0,.08); --shadow-md:0 4px 12px rgba(0,0,0,.08);
          --font-d:'Instrument Serif',Georgia,serif; --font-b:'DM Sans',system-ui,sans-serif; --font-m:'JetBrains Mono',monospace;
          --r:12px; --rl:20px;
        }
        [data-theme="dark"] {
          --bg:#0f0e0c; --surface:#1a1916; --surface2:#242220; --border:#2e2c29;
          --text:#f0ece6; --text-muted:#6b6660; --accent:#4a87f5;
          --accent-light:#1a2340; --accent-hover:#6b9cf7;
          --success:#2ecc8a; --success-bg:#0a1f14; --danger:#e55; --danger-bg:#2a1010;
          --shadow-sm:0 1px 3px rgba(0,0,0,.3); --shadow-md:0 4px 12px rgba(0,0,0,.3);
        }
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:var(--bg);color:var(--text);font-family:var(--font-b);transition:background .3s,color .3s}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes xin{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .fade-up{animation:fadeUp .4s ease forwards}
        .spinner{width:14px;height:14px;border:1.5px solid color-mix(in srgb,currentColor 25%,transparent);border-top-color:currentColor;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
        .btn-g{background:transparent;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:6px}
        .btn-g:hover{border-color:var(--text-muted);color:var(--text)}
        .btn-p{background:var(--accent);color:white;border:none;cursor:pointer;transition:background .15s,transform .1s}
        .btn-p:hover:not(:disabled){background:var(--accent-hover)}
        .btn-p:active:not(:disabled){transform:scale(.98)}
        .btn-p:disabled{opacity:.5;cursor:not-allowed}
        .swrap:focus-within{border-color:var(--accent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)!important}
        .sp{background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r);overflow:hidden}
        .sh{width:100%;display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:transparent;border:none;cursor:pointer;transition:background .15s;text-align:left}
        .sh:hover{background:var(--surface2)}
        .sb{border-top:1px solid var(--border);padding:12px 14px}
        .tag{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:11px;font-family:var(--font-m)}
        .tb{background:var(--accent-light);border:1px solid color-mix(in srgb,var(--accent) 25%,transparent);color:var(--accent)}
        .tg{background:var(--success-bg);border:1px solid color-mix(in srgb,var(--success) 30%,transparent);color:var(--success)}
        .tw{background:color-mix(in srgb,var(--warning) 10%,transparent);border:1px solid color-mix(in srgb,var(--warning) 30%,transparent);color:var(--warning)}
        .xc{background:var(--surface);border:1.5px solid var(--border);border-radius:var(--rl);padding:1.4rem;cursor:pointer;box-shadow:var(--shadow-sm);transition:border-color .2s,box-shadow .2s,transform .15s}
        .xc:hover{border-color:var(--accent);box-shadow:var(--shadow-md);transform:translateY(-2px)}
        .bt{height:4px;background:var(--border);border-radius:999px;overflow:hidden}
        .bf{height:100%;border-radius:999px;transition:width 1s cubic-bezier(.22,1,.36,1)}
        .rb{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:12px;font-family:var(--font-m);background:color-mix(in srgb,#ff4500 12%,transparent);border:1px solid color-mix(in srgb,#ff4500 30%,transparent);color:#ff4500;text-decoration:none;transition:background .15s}
        .rb:hover{background:color-mix(in srgb,#ff4500 20%,transparent)}
      `}</style>

      <button onClick={() => setDark(d => !d)} className="btn-g" style={{ position:'fixed', top:20, right:20, padding:'8px 14px', borderRadius:'8px', fontSize:'13px', fontFamily:'var(--font-m)', zIndex:100 }}>
        {dark ? '☀' : '◐'} {dark ? 'Light' : 'Dark'}
      </button>

      <main style={{ minHeight:'100vh', padding:'2.5rem 1.5rem' }}>
        <div style={{ maxWidth:'800px', margin:'0 auto' }}>

          <button onClick={() => router.push('/')} className="btn-g" style={{ padding:'7px 14px', borderRadius:'8px', fontSize:'12px', fontFamily:'var(--font-m)', marginBottom:'2.5rem' }}>← TalkToX</button>

          <div style={{ marginBottom:'2rem' }} className="fade-up">
            <div style={{ display:'inline-flex', alignItems:'center', gap:'7px', background:'var(--accent-light)', border:'1px solid color-mix(in srgb,var(--accent) 25%,transparent)', borderRadius:'999px', padding:'4px 14px', marginBottom:'1rem' }}>
              <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--accent)' }} />
              <span style={{ fontSize:'11px', fontFamily:'var(--font-m)', color:'var(--accent)', letterSpacing:'.1em' }}>EXPERT DISCOVERY</span>
            </div>
            <h1 style={{ fontFamily:'var(--font-d)', fontWeight:400, fontSize:'clamp(1.9rem,4vw,3rem)', lineHeight:1.05, letterSpacing:'-.02em', marginBottom:'.75rem' }}>
              Find real experts.<br /><em style={{ color:'var(--text-muted)' }}>Chat with their knowledge.</em>
            </h1>
            <p style={{ color:'var(--text-muted)', fontSize:'.9rem', fontWeight:300, lineHeight:1.65 }}>
              Every expert is scored algorithmically — semantic depth, LLM quality rating, and posting volume.<br />
              Pick one and drop into a RAG-powered chat grounded in their actual posts.
            </p>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} style={{ marginBottom:'2rem' }}>
            <div style={{ display:'flex', gap:'10px', marginBottom:'10px' }}>
              <div className="swrap" style={{ flex:1, display:'flex', alignItems:'center', gap:'10px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:'var(--r)', padding:'10px 14px', boxShadow:'var(--shadow-sm)', transition:'border-color .15s,box-shadow .15s' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink:0, color:'var(--text-muted)' }}>
                  <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Find experts in Kubernetes networking..."
                  disabled={pageStatus === 'loading'}
                  style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'var(--text)', fontFamily:'var(--font-b)', fontSize:'.95rem' }} />
              </div>
              <button type="submit" disabled={pageStatus === 'loading' || !query.trim()} className="btn-p"
                style={{ padding:'10px 22px', borderRadius:'var(--r)', fontSize:'14px', fontFamily:'var(--font-b)', fontWeight:600, display:'flex', alignItems:'center', gap:'8px', whiteSpace:'nowrap' }}>
                {pageStatus === 'loading' ? <><div className="spinner" />Discovering…</> : 'Find Experts →'}
              </button>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
              {SUGGESTED.map(ex => (
                <button key={ex} type="button" onClick={() => setQuery(ex)} className="btn-g"
                  style={{ padding:'4px 12px', borderRadius:'999px', fontSize:'11px', fontFamily:'var(--font-m)' }}>{ex}</button>
              ))}
            </div>
          </form>

          {/* Pipeline steps */}
          {anyActive && (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'2rem' }}>
              {Object.entries(STEP_META).map(([key, meta]) => {
                const step = steps[key]
                if (step.status === 'waiting') return null
                return (
                  <div key={key} className="sp">
                    <button className="sh" onClick={() => toggleStep(key)}>
                      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        {step.status === 'running' && <div className="spinner" style={{ color:'var(--accent)' }} />}
                        {step.status === 'done' && (
                          <div style={{ width:'16px', height:'16px', borderRadius:'50%', background:'var(--success-bg)', border:'1px solid color-mix(in srgb,var(--success) 30%,transparent)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.5 6L6.5 2" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                        )}
                        <div>
                          <div style={{ fontFamily:'var(--font-b)', fontSize:'13px', fontWeight:600, color:'var(--text)' }}>{meta.label}</div>
                          <div style={{ fontFamily:'var(--font-m)', fontSize:'11px', color:'var(--text-muted)' }}>{meta.detail}</div>
                        </div>
                        {step.status === 'running' && (
                          <span style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:'var(--accent)', background:'var(--accent-light)', padding:'1px 7px', borderRadius:'999px', border:'1px solid color-mix(in srgb,var(--accent) 25%,transparent)' }}>running</span>
                        )}
                      </div>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                        style={{ transform:step.open ? 'rotate(180deg)' : 'none', transition:'transform .2s', color:'var(--text-muted)', flexShrink:0 }}>
                        <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    {step.open && step.data && (
                      <div className="sb">
                        {/* Query */}
                        {key === 'query' && (
                          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                            <div>
                              <div style={{ fontSize:'11px', fontFamily:'var(--font-m)', color:'var(--text-muted)', marginBottom:'6px' }}>CORE TOPIC</div>
                              <span className="tag tb">{step.data.core_topic}</span>
                            </div>
                            <div>
                              <div style={{ fontSize:'11px', fontFamily:'var(--font-m)', color:'var(--text-muted)', marginBottom:'6px' }}>TARGET SUBREDDITS</div>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
                                {step.data.relevant_subreddits?.map((s: string) => <span key={s} className="tag tb">r/{s}</span>)}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize:'11px', fontFamily:'var(--font-m)', color:'var(--text-muted)', marginBottom:'6px' }}>EXPERTISE SIGNALS ({step.data.expertise_signals?.length})</div>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
                                {step.data.expertise_signals?.slice(0,8).map((s: string) => <span key={s} className="tag tw">{s}</span>)}
                              </div>
                            </div>
                          </div>
                        )}
                        {/* Validate */}
                        {key === 'validate' && (
                          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                            <div style={{ fontSize:'12px', fontFamily:'var(--font-m)', color:'var(--text-muted)' }}>
                              {step.data.total_valid} of {step.data.total_checked} subreddits passed
                            </div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
                              {step.data.valid_subreddits?.map((s: string) => <span key={s} className="tag tg">r/{s} ✓</span>)}
                            </div>
                          </div>
                        )}
                        {/* Scrape */}
                        {key === 'scrape' && (
                          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                            <div style={{ display:'flex', gap:'16px' }}>
                              {[['posts', step.data.total_posts], ['comments', step.data.total_comments], ['total', step.data.total_content]].map(([l, v]) => (
                                <div key={l as string} style={{ fontFamily:'var(--font-m)', fontSize:'12px' }}>
                                  <span style={{ color:'var(--accent)', fontWeight:600 }}>{v}</span>
                                  <span style={{ color:'var(--text-muted)' }}> {l}</span>
                                </div>
                              ))}
                            </div>
                            {step.data.per_subreddit && (
                              <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
                                {Object.entries(step.data.per_subreddit).map(([sub, count]) => (
                                  <span key={sub} className="tag tb">r/{sub}: {count as number}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Filter */}
                        {key === 'filter' && (
                          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                            <div style={{ fontSize:'12px', fontFamily:'var(--font-m)', color:'var(--text-muted)' }}>
                              {step.data.authors_found} authors passed relevance filter
                            </div>
                            {step.data.authors?.slice(0,10).map((a: any) => (
                              <div key={a.username} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                                <span style={{ fontFamily:'var(--font-m)', fontSize:'12px', color:'var(--text)', minWidth:'150px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>u/{a.username}</span>
                                <div className="bt" style={{ flex:1 }}><div className="bf" style={{ width:`${a.avg_similarity*100}%`, background:'var(--accent)' }} /></div>
                                <span style={{ fontFamily:'var(--font-m)', fontSize:'11px', color:'var(--accent)', minWidth:'36px', textAlign:'right' }}>{(a.avg_similarity*100).toFixed(0)}%</span>
                                <span style={{ fontFamily:'var(--font-m)', fontSize:'11px', color:'var(--text-muted)' }}>{a.post_count}p</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Score */}
                        {key === 'score' && (
                          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                            {step.data.top_users?.map((u: any) => (
                              <div key={u.username} style={{ padding:'10px 12px', background:'var(--surface2)', borderRadius:'8px', border:'1px solid var(--border)' }}>
                                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}>
                                  <span style={{ fontFamily:'var(--font-b)', fontWeight:600, fontSize:'13px' }}>u/{u.username}</span>
                                  <span style={{ fontFamily:'var(--font-m)', fontSize:'12px', color:'var(--accent)', fontWeight:600 }}>{(u.final_score*100).toFixed(0)} pts</span>
                                </div>
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
                                  {[['Signal A', u.signal_a, 'var(--accent)'], ['Signal B', u.signal_b, '#8b5cf6'], ['Signal C', u.signal_c, 'var(--success)']].map(([l, v, c]) => (
                                    <div key={l as string}>
                                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
                                        <span style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:'var(--text-muted)' }}>{l}</span>
                                        <span style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:c as string, fontWeight:600 }}>{((v as number)*100).toFixed(0)}%</span>
                                      </div>
                                      <div className="bt"><div className="bf" style={{ width:`${Math.min((v as number)*100,100)}%`, background:c as string }} /></div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Done */}
                        {key === 'done' && (
                          <div style={{ fontSize:'12px', fontFamily:'var(--font-m)', color:'var(--success)' }}>
                            {step.data.count} expert profile{step.data.count !== 1 ? 's' : ''} generated successfully
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Error */}
          {pageStatus === 'error' && (
            <div style={{ padding:'12px 16px', background:'var(--danger-bg)', border:'1px solid color-mix(in srgb,var(--danger) 30%,transparent)', borderRadius:'var(--r)', color:'var(--danger)', fontFamily:'var(--font-m)', fontSize:'13px', marginBottom:'1.5rem' }}>
              {errorMsg}
            </div>
          )}

          {/* No results */}
          {pageStatus === 'done' && experts.length === 0 && (
            <div style={{ textAlign:'center', padding:'4rem 2rem', color:'var(--text-muted)', fontFamily:'var(--font-m)', fontSize:'13px' }}>
              <div style={{ fontSize:'2rem', marginBottom:'1rem' }}>∅</div>
              No experts found. Try a more specific technical domain.
            </div>
          )}

          {/* Expert cards */}
          {pageStatus === 'done' && experts.length > 0 && (
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
                <div style={{ fontFamily:'var(--font-d)', fontSize:'1.3rem' }}>{experts.length} expert{experts.length !== 1 ? 's' : ''} found</div>
                <div style={{ fontSize:'11px', fontFamily:'var(--font-m)', color:'var(--text-muted)' }}>click card to chat · Reddit icon to visit profile</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                {experts.map((expert, i) => (
                  <div key={expert.username} className="xc"
                    onClick={() => router.push(`/chat/${expert.username}`)}
                    style={{ animation:'xin .4s ease forwards', animationDelay:`${i*.08}s`, opacity:0 }}>

                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px', marginBottom:'1.25rem', flexWrap:'wrap' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                        <div style={{ width:'44px', height:'44px', borderRadius:'12px', background:i<3?`color-mix(in srgb,${rankColors[i]} 15%,var(--surface2))`:'var(--surface2)', border:`2px solid ${i<3?rankColors[i]:'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <span style={{ fontFamily:'var(--font-d)', fontSize:'1.1rem', color:i<3?rankColors[i]:'var(--text-muted)' }}>{expert.username[0].toUpperCase()}</span>
                        </div>
                        <div>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px', flexWrap:'wrap' }}>
                            <span style={{ fontFamily:'var(--font-b)', fontWeight:600, fontSize:'1rem' }}>u/{expert.username}</span>
                            {i < 3 && <span style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:rankColors[i], background:`color-mix(in srgb,${rankColors[i]} 12%,transparent)`, border:`1px solid color-mix(in srgb,${rankColors[i]} 30%,transparent)`, padding:'1px 8px', borderRadius:'999px', fontWeight:600 }}>{rankLabels[i]}</span>}
                          </div>
                          {expert.profile?.top_subreddits?.length > 0 && (
                            <div style={{ fontSize:'12px', fontFamily:'var(--font-m)', color:'var(--text-muted)' }}>
                              {expert.profile.top_subreddits.slice(0,3).map((s:string) => `r/${s}`).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
                        {/* Reddit profile button */}
                        <a href={`https://reddit.com/u/${expert.username}`} target="_blank" rel="noopener noreferrer"
                          className="rb" onClick={e => e.stopPropagation()}>
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                            <circle cx="10" cy="10" r="10" fill="#ff4500"/>
                            <path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.26.26 0 00-.31.2l-.73 3.44a7.14 7.14 0 00-3.84 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.55-1.59zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.56 3.56 0 01-2.85.57 3.56 3.56 0 01-2.85-.57.26.26 0 01.37-.37 3.27 3.27 0 002.48.43 3.27 3.27 0 002.48-.43.26.26 0 01.37.37zm-.15-1.65a1 1 0 111-1 1 1 0 01-1 1z" fill="white"/>
                          </svg>
                          Reddit
                        </a>
                        <div style={{ textAlign:'center', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'8px 12px' }}>
                          <div style={{ fontFamily:'var(--font-m)', fontWeight:600, fontSize:'1.1rem', color:'var(--accent)', lineHeight:1 }}>{((expert.final_score||expert.preliminary_score||0)*100).toFixed(0)}</div>
                          <div style={{ fontSize:'9px', fontFamily:'var(--font-m)', color:'var(--text-muted)', marginTop:'2px', letterSpacing:'.08em' }}>SCORE</div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); router.push(`/chat/${expert.username}`) }} className="btn-p"
                          style={{ padding:'9px 18px', borderRadius:'10px', fontSize:'13px', fontFamily:'var(--font-b)', fontWeight:600 }}>Chat →</button>
                      </div>
                    </div>

                    {/* Signal bars */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'1rem' }}>
                      {[
                        { label:'Semantic Depth', value:expert.signal_a||0, color:'var(--accent)', desc:'Avg cosine sim vs expertise signals' },
                        { label:'LLM Quality', value:expert.signal_b||0, color:'#8b5cf6', desc:'Gemini-rated technical depth' },
                        { label:'Volume Score', value:Math.min(expert.signal_c||0,1), color:'var(--success)', desc:'Consistent high-quality posting' },
                      ].map(sig => (
                        <div key={sig.label}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'5px' }}>
                            <span style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:'var(--text-muted)' }}>{sig.label}</span>
                            <span style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:sig.color, fontWeight:600 }}>{(Math.min(sig.value,1)*100).toFixed(0)}%</span>
                          </div>
                          <div className="bt"><div className="bf" style={{ width:`${Math.min(sig.value*100,100)}%`, background:sig.color }} /></div>
                          <div style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:'var(--text-muted)', marginTop:'3px', opacity:.7 }}>{sig.desc}</div>
                        </div>
                      ))}
                    </div>

                    {/* Profile */}
                    {expert.profile && (
                      <div style={{ borderTop:'1px solid var(--border)', paddingTop:'1rem' }}>
                        {expert.profile.style && (
                          <p style={{ fontSize:'13px', color:'var(--text-muted)', lineHeight:1.6, marginBottom:expert.profile.topics?.length?'12px':'0', fontStyle:'italic' }}>
                            "{expert.profile.style}"
                          </p>
                        )}
                        {expert.profile.topics?.length > 0 && (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:expert.profile.knowledge_boundaries?'10px':'0' }}>
                            {expert.profile.topics.slice(0,6).map((t:string) => <span key={t} className="tag tb">{t}</span>)}
                          </div>
                        )}
                        {expert.profile.knowledge_boundaries && (
                          <div style={{ fontSize:'11px', fontFamily:'var(--font-m)', color:'var(--text-muted)', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'8px', padding:'8px 12px', lineHeight:1.5 }}>
                            <span style={{ color:'var(--warning)', fontWeight:600, marginRight:'6px' }}>⚠ Boundaries:</span>
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
