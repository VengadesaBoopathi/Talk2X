'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ExpertProfile { topics: string[]; style: string; top_subreddits: string[]; knowledge_boundaries: string }
interface Expert { username: string; signal_a: number; signal_b: number; signal_c: number; final_score: number; preliminary_score: number; profile: ExpertProfile; posts: any[] }
interface StepState { status: 'waiting' | 'running' | 'done'; data: any; open: boolean }

const STEP_META: Record<string, { label: string; detail: string }> = {
  query:    { label: 'Query understanding',       detail: 'LLM extracts topic, signals & target subreddits' },
  validate: { label: 'Subreddit validation',      detail: 'Cosine similarity filter against your query' },
  scrape:   { label: 'Post & comment retrieval',  detail: 'Scraping top posts + threads from valid subreddits' },
  filter:   { label: 'Semantic relevance filter', detail: 'Embedding all content against expertise signals' },
  score:    { label: 'Three-signal scoring',      detail: 'Signal A (depth) · Signal B (LLM quality) · Signal C (volume)' },
  done:     { label: 'Expert profile generation', detail: 'Gemini synthesizes style, topics & knowledge map' },
}

type PageStatus = 'idle' | 'loading' | 'done' | 'error'
const SUGGESTED = ['Kubernetes networking','cardiac surgery','options trading','Rust async programming','ML infrastructure','pharmaceutical chemistry']
const rankColors = ['#b45309','#6b7280','#92400e']
const rankLabels = ['1st','2nd','3rd']

function makeInitialSteps(): Record<string, StepState> {
  return Object.fromEntries(Object.keys(STEP_META).map(k => [k, { status: 'waiting', data: null, open: false }]))
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@400;500&display=swap');
:root{
  --bg:#f8f4ff;--surface:#ffffff;--surface2:#f0e8ff;--border:#ddd0f5;
  --text:#0a0010;--text-muted:#6b4f8a;
  --accent:#5b21b6;--accent-light:#ede9fe;--accent-hover:#4c1d95;
  --pink:#be185d;--pink-light:#fce7f3;
  --green:#047857;--green-bg:#ecfdf5;--green-light:#d1fae5;
  --success:#047857;--success-bg:#ecfdf5;
  --warning:#b45309;--warning-bg:#fffbeb;
  --danger:#dc2626;--danger-bg:#fef2f2;
  --shadow-sm:0 1px 3px rgba(91,33,182,0.08);
  --shadow-md:0 4px 20px rgba(91,33,182,0.10);
  --font-d:'Instrument Serif',Georgia,serif;--font-b:'DM Sans',system-ui,sans-serif;--font-m:'JetBrains Mono',monospace;
  --r:12px;--rl:20px;
}
[data-theme="dark"]{
  --bg:#080010;--surface:#110022;--surface2:#1c0038;--border:#3a1a60;
  --text:#ffffff;--text-muted:#b89fd4;
  --accent:#9333ea;--accent-light:#2e1065;--accent-hover:#a855f7;
  --pink:#ec4899;--pink-light:#500724;
  --green:#10b981;--green-bg:#022c22;--green-light:#064e3b;
  --success:#10b981;--success-bg:#022c22;
  --warning:#f59e0b;--warning-bg:#1c1408;
  --danger:#f87171;--danger-bg:#2a0a0a;
  --shadow-sm:0 1px 3px rgba(0,0,0,0.5);
  --shadow-md:0 4px 20px rgba(0,0,0,0.5);
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--text);font-family:var(--font-b);transition:background .3s,color .3s}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
.fu{animation:fadeUp .4s ease forwards}
.sp{width:14px;height:14px;border:1.5px solid color-mix(in srgb,currentColor 25%,transparent);border-top-color:currentColor;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
.btn-g{background:transparent;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:6px}
.btn-g:hover{border-color:var(--accent);color:var(--accent)}
.btn-p{background:var(--accent);color:#fff;border:none;cursor:pointer;transition:background .15s,transform .1s,box-shadow .15s}
.btn-p:hover:not(:disabled){background:var(--accent-hover);box-shadow:0 4px 14px rgba(91,33,182,0.35)}
.btn-p:active:not(:disabled){transform:scale(.98)}
.btn-p:disabled{opacity:.45;cursor:not-allowed}
.sw:focus-within{border-color:var(--accent)!important;box-shadow:0 0 0 3px rgba(91,33,182,0.12)!important}
.panel{background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r);overflow:hidden}
.ph{width:100%;display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:transparent;border:none;cursor:pointer;transition:background .15s;text-align:left}
.ph:hover{background:var(--surface2)}
.pb{border-top:1px solid var(--border);padding:12px 14px}
.tag{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:11px;font-family:var(--font-m)}
.ta{background:var(--accent-light);border:1px solid rgba(91,33,182,.25);color:var(--accent)}
.tp{background:var(--pink-light);border:1px solid rgba(190,24,93,.25);color:var(--pink)}
.tg{background:var(--green-bg);border:1px solid rgba(4,120,87,.25);color:var(--green)}
.tw{background:var(--warning-bg);border:1px solid rgba(180,83,9,.25);color:var(--warning)}
.card{background:var(--surface);border:1.5px solid var(--border);border-radius:var(--rl);padding:1.4rem;cursor:pointer;box-shadow:var(--shadow-sm);transition:border-color .2s,box-shadow .2s,transform .15s}
.card:hover{border-color:var(--accent);box-shadow:var(--shadow-md);transform:translateY(-2px)}
.bar{height:4px;background:var(--border);border-radius:999px;overflow:hidden}
.barf{height:100%;border-radius:999px;transition:width 1s cubic-bezier(.22,1,.36,1)}
.rb{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;font-size:12px;font-family:var(--font-m);background:rgba(255,69,0,0.08);border:1px solid rgba(255,69,0,0.2);color:#ff4500;text-decoration:none;transition:background .15s}
.rb:hover{background:rgba(255,69,0,0.15)}
.chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-size:10px;font-family:var(--font-m);letter-spacing:.08em}
`

export default function ExpertFinderPage() {
  const [query, setQuery] = useState('')
  const [pageStatus, setPageStatus] = useState<PageStatus>('idle')
  const [experts, setExperts] = useState<Expert[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [dark, setDark] = useState(false)
  const [steps, setSteps] = useState<Record<string, StepState>>(makeInitialSteps)
  const router = useRouter()
  const abortRef = useRef<AbortController | null>(null)
  const queryRef = useRef('')

  useEffect(() => { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light') }, [dark])

  useEffect(() => {
    const cached = sessionStorage.getItem('ef_results')
    const cachedQuery = sessionStorage.getItem('ef_query')
    if (cached && cachedQuery) { setExperts(JSON.parse(cached)); setQuery(cachedQuery); setPageStatus('done') }
  }, [])

  const setStepRunning = (key: string) => setSteps(p => ({ ...p, [key]: { ...p[key], status: 'running', open: true } }))
  const setStepDone = (key: string, data: any) => setSteps(p => ({ ...p, [key]: { status: 'done', data, open: true } }))
  const toggleStep = (key: string) => setSteps(p => ({ ...p, [key]: { ...p[key], open: !p[key].open } }))

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    queryRef.current = query.trim()
    setPageStatus('loading'); setErrorMsg(''); setExperts([]); setSteps(makeInitialSteps()); setStepRunning('query')
    try {
      const res = await fetch(`${API_URL}/api/v1/discover/experts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }), signal: abortRef.current.signal,
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Discovery failed') }
      const reader = res.body!.getReader(); const decoder = new TextDecoder(); let buffer = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n'); buffer = parts.pop() || ''
        for (const raw of parts) {
          if (!raw.trim()) continue
          let eventType = '', eventData = ''
          for (const line of raw.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim()
            if (line.startsWith('data: ')) eventData = line.slice(6).trim()
          }
          if (!eventType || !eventData) continue
          try { handleSSEEvent(eventType, JSON.parse(eventData)) } catch { console.error('SSE parse error', eventData) }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setPageStatus('error'); setErrorMsg(err.message || 'Something went wrong')
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
      const list = data.experts || []; setExperts(list)
      sessionStorage.setItem('ef_results', JSON.stringify(list)); sessionStorage.setItem('ef_query', queryRef.current)
      setPageStatus('done')
    }
    if (type === 'error') { setPageStatus('error'); setErrorMsg(data.message || 'Pipeline failed') }
  }

  const anyActive = Object.values(steps).some(s => s.status !== 'waiting')

  return (
    <>
      <style>{CSS}</style>

      <button onClick={() => setDark(d => !d)} className="btn-g" style={{ position:'fixed', top:20, right:20, padding:'8px 14px', borderRadius:'8px', fontSize:'13px', fontFamily:'var(--font-m)', zIndex:100 }}>
        {dark ? '☀' : '◐'} {dark ? 'Light' : 'Dark'}
      </button>

      <main style={{ minHeight:'100vh', padding:'2.5rem 1.5rem' }}>
        <div style={{ maxWidth:'820px', margin:'0 auto' }}>

          <button onClick={() => router.push('/')} className="btn-g" style={{ padding:'7px 14px', borderRadius:'8px', fontSize:'12px', fontFamily:'var(--font-m)', marginBottom:'2.5rem' }}>← TalkToX</button>

          {/* Header */}
          <div style={{ marginBottom:'2rem' }} className="fu">
            <div style={{ display:'inline-flex', alignItems:'center', gap:'7px', marginBottom:'1rem' }}>
              <span className="chip" style={{ background:'var(--accent-light)', border:'1px solid rgba(91,33,182,.25)', color:'var(--accent)' }}>
                <span style={{ width:'5px', height:'5px', borderRadius:'50%', background:'var(--green)', display:'inline-block', marginRight:'4px' }} />
                EXPERT DISCOVERY
              </span>
            </div>
            <h1 style={{ fontFamily:'var(--font-d)', fontWeight:400, fontSize:'clamp(1.9rem,4vw,3rem)', lineHeight:1.05, letterSpacing:'-.02em', marginBottom:'.75rem' }}>
              Find real experts.<br />
              <em style={{ color:'var(--accent)' }}>Chat with their knowledge.</em>
            </h1>
            <p style={{ color:'var(--text-muted)', fontSize:'.9rem', fontWeight:300, lineHeight:1.65 }}>
              Every expert is scored algorithmically — semantic depth, LLM quality rating, and posting volume.<br />
              Pick one and drop into a RAG-powered chat grounded in their actual posts.
            </p>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} style={{ marginBottom:'2rem' }}>
            <div style={{ display:'flex', gap:'10px', marginBottom:'10px' }}>
              <div className="sw" style={{ flex:1, display:'flex', alignItems:'center', gap:'10px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:'var(--r)', padding:'10px 14px', boxShadow:'var(--shadow-sm)', transition:'border-color .15s,box-shadow .15s' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink:0, color:'var(--accent)' }}>
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
                {pageStatus === 'loading' ? <><div className="sp" style={{ color:'white' }} />Discovering…</> : 'Find Experts →'}
              </button>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
              {SUGGESTED.map((ex, i) => (
                <button key={ex} type="button" onClick={() => setQuery(ex)} className="btn-g"
                  style={{ padding:'4px 12px', borderRadius:'999px', fontSize:'11px', fontFamily:'var(--font-m)', borderColor: i%3===0 ? 'rgba(91,33,182,.3)' : i%3===1 ? 'rgba(190,24,93,.3)' : 'rgba(4,120,87,.3)', color: i%3===0 ? 'var(--accent)' : i%3===1 ? 'var(--pink)' : 'var(--green)' }}>
                  {ex}
                </button>
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
                  <div key={key} className="panel">
                    <button className="ph" onClick={() => toggleStep(key)}>
                      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        {step.status === 'running' && <div className="sp" style={{ color:'var(--accent)' }} />}
                        {step.status === 'done' && (
                          <div style={{ width:'16px', height:'16px', borderRadius:'50%', background:'var(--success-bg)', border:'1px solid rgba(4,120,87,.3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.5 6L6.5 2" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                        )}
                        <div>
                          <div style={{ fontFamily:'var(--font-b)', fontSize:'13px', fontWeight:600 }}>{meta.label}</div>
                          <div style={{ fontFamily:'var(--font-m)', fontSize:'11px', color:'var(--text-muted)' }}>{meta.detail}</div>
                        </div>
                        {step.status === 'running' && <span style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:'var(--accent)', background:'var(--accent-light)', padding:'1px 7px', borderRadius:'999px', border:'1px solid rgba(91,33,182,.25)' }}>running</span>}
                      </div>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transform:step.open?'rotate(180deg)':'none', transition:'transform .2s', color:'var(--text-muted)', flexShrink:0 }}>
                        <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {step.open && step.data && (
                      <div className="pb">
                        {key === 'query' && (
                          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                            <div><div style={{ fontSize:'11px', fontFamily:'var(--font-m)', color:'var(--text-muted)', marginBottom:'6px' }}>CORE TOPIC</div><span className="tag ta">{step.data.core_topic}</span></div>
                            <div>
                              <div style={{ fontSize:'11px', fontFamily:'var(--font-m)', color:'var(--text-muted)', marginBottom:'6px' }}>TARGET SUBREDDITS</div>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>{step.data.relevant_subreddits?.map((s:string) => <span key={s} className="tag ta">r/{s}</span>)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize:'11px', fontFamily:'var(--font-m)', color:'var(--text-muted)', marginBottom:'6px' }}>EXPERTISE SIGNALS ({step.data.expertise_signals?.length})</div>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>{step.data.expertise_signals?.slice(0,8).map((s:string) => <span key={s} className="tag tp">{s}</span>)}</div>
                            </div>
                          </div>
                        )}
                        {key === 'validate' && (
                          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                            <div style={{ fontSize:'12px', fontFamily:'var(--font-m)', color:'var(--text-muted)' }}>{step.data.total_valid} of {step.data.total_checked} subreddits passed</div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>{step.data.valid_subreddits?.map((s:string) => <span key={s} className="tag tg">r/{s} ✓</span>)}</div>
                          </div>
                        )}
                        {key === 'scrape' && (
                          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                            <div style={{ display:'flex', gap:'16px' }}>
                              {[['posts',step.data.total_posts],['comments',step.data.total_comments],['total',step.data.total_content]].map(([l,v]) => (
                                <div key={l as string} style={{ fontFamily:'var(--font-m)', fontSize:'12px' }}>
                                  <span style={{ color:'var(--accent)', fontWeight:600 }}>{v}</span><span style={{ color:'var(--text-muted)' }}> {l}</span>
                                </div>
                              ))}
                            </div>
                            {step.data.per_subreddit && <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>{Object.entries(step.data.per_subreddit).map(([sub,count]) => <span key={sub} className="tag ta">r/{sub}: {count as number}</span>)}</div>}
                          </div>
                        )}
                        {key === 'filter' && (
                          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                            <div style={{ fontSize:'12px', fontFamily:'var(--font-m)', color:'var(--text-muted)' }}>{step.data.authors_found} authors passed relevance filter</div>
                            {step.data.authors?.slice(0,10).map((a:any) => (
                              <div key={a.username} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                                <span style={{ fontFamily:'var(--font-m)', fontSize:'12px', minWidth:'150px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>u/{a.username}</span>
                                <div className="bar" style={{ flex:1 }}><div className="barf" style={{ width:`${a.avg_similarity*100}%`, background:'var(--accent)' }} /></div>
                                <span style={{ fontFamily:'var(--font-m)', fontSize:'11px', color:'var(--accent)', minWidth:'36px', textAlign:'right' }}>{(a.avg_similarity*100).toFixed(0)}%</span>
                                <span style={{ fontFamily:'var(--font-m)', fontSize:'11px', color:'var(--text-muted)' }}>{a.post_count}p</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {key === 'score' && (
                          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                            {step.data.top_users?.map((u:any) => (
                              <div key={u.username} style={{ padding:'10px 12px', background:'var(--surface2)', borderRadius:'8px', border:'1px solid var(--border)' }}>
                                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}>
                                  <span style={{ fontFamily:'var(--font-b)', fontWeight:600, fontSize:'13px' }}>u/{u.username}</span>
                                  <span style={{ fontFamily:'var(--font-m)', fontSize:'12px', color:'var(--accent)', fontWeight:600 }}>{(u.final_score*100).toFixed(0)} pts</span>
                                </div>
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
                                  {[['Signal A',u.signal_a,'var(--accent)'],['Signal B',u.signal_b,'var(--pink)'],['Signal C',u.signal_c,'var(--green)']].map(([l,v,c]) => (
                                    <div key={l as string}>
                                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
                                        <span style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:'var(--text-muted)' }}>{l}</span>
                                        <span style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:c as string, fontWeight:600 }}>{((v as number)*100).toFixed(0)}%</span>
                                      </div>
                                      <div className="bar"><div className="barf" style={{ width:`${Math.min((v as number)*100,100)}%`, background:c as string }} /></div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {key === 'done' && <div style={{ fontSize:'12px', fontFamily:'var(--font-m)', color:'var(--success)' }}>{step.data.count} expert profile{step.data.count!==1?'s':''} generated successfully</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {pageStatus === 'error' && (
            <div style={{ padding:'12px 16px', background:'var(--danger-bg)', border:'1px solid rgba(220,38,38,.3)', borderRadius:'var(--r)', color:'var(--danger)', fontFamily:'var(--font-m)', fontSize:'13px', marginBottom:'1.5rem' }}>{errorMsg}</div>
          )}

          {pageStatus === 'done' && experts.length === 0 && (
            <div style={{ textAlign:'center', padding:'4rem 2rem', color:'var(--text-muted)', fontFamily:'var(--font-m)', fontSize:'13px' }}>
              <div style={{ fontSize:'2rem', marginBottom:'1rem' }}>∅</div>
              No experts found. Try a more specific technical domain.
            </div>
          )}

          {pageStatus === 'done' && experts.length > 0 && (
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
                <div style={{ fontFamily:'var(--font-d)', fontSize:'1.3rem' }}>{experts.length} expert{experts.length!==1?'s':''} found</div>
                <div style={{ fontSize:'11px', fontFamily:'var(--font-m)', color:'var(--text-muted)' }}>click card to chat · Reddit icon to visit profile</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                {experts.map((expert, i) => (
                  <div key={expert.username} className="card" onClick={() => router.push(`/chat/${expert.username}`)}
                    style={{ animation:'slideIn .4s ease forwards', animationDelay:`${i*.08}s`, opacity:0 }}>

                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px', marginBottom:'1.25rem', flexWrap:'wrap' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                        <div style={{ width:'46px', height:'46px', borderRadius:'12px', background:'var(--surface2)', border:`2px solid ${i<3?rankColors[i]:'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <span style={{ fontFamily:'var(--font-d)', fontSize:'1.15rem', color:i<3?rankColors[i]:'var(--text-muted)' }}>{expert.username[0].toUpperCase()}</span>
                        </div>
                        <div>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px', flexWrap:'wrap' }}>
                            <span style={{ fontFamily:'var(--font-b)', fontWeight:600, fontSize:'1rem' }}>u/{expert.username}</span>
                            {i<3 && <span style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:rankColors[i], background:`rgba(${i===0?'180,83,9':i===1?'107,114,128':'146,64,14'},.1)`, border:`1px solid rgba(${i===0?'180,83,9':i===1?'107,114,128':'146,64,14'},.25)`, padding:'1px 8px', borderRadius:'999px', fontWeight:600 }}>{rankLabels[i]}</span>}
                          </div>
                          {expert.profile?.top_subreddits?.length > 0 && (
                            <div style={{ fontSize:'12px', fontFamily:'var(--font-m)', color:'var(--text-muted)' }}>{expert.profile.top_subreddits.slice(0,3).map((s:string)=>`r/${s}`).join(' · ')}</div>
                          )}
                        </div>
                      </div>

                      <div style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
                        <a href={`https://reddit.com/u/${expert.username}`} target="_blank" rel="noopener noreferrer" className="rb" onClick={e=>e.stopPropagation()}>
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#ff4500"/><path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.26.26 0 00-.31.2l-.73 3.44a7.14 7.14 0 00-3.84 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.55-1.59zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.56 3.56 0 01-2.85.57 3.56 3.56 0 01-2.85-.57.26.26 0 01.37-.37 3.27 3.27 0 002.48.43 3.27 3.27 0 002.48-.43.26.26 0 01.37.37zm-.15-1.65a1 1 0 111-1 1 1 0 01-1 1z" fill="white"/></svg>
                          Profile
                        </a>
                        <a href={`https://www.reddit.com/message/compose/?to=${expert.username}`} target="_blank" rel="noopener noreferrer" className="rb" onClick={e=>e.stopPropagation()}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 8L12 13L4 8V6L12 11L20 6V8Z" fill="currentColor"/></svg>
                          Message
                        </a>
                        <div style={{ textAlign:'center', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'8px 12px' }}>
                          <div style={{ fontFamily:'var(--font-m)', fontWeight:600, fontSize:'1.1rem', color:'var(--accent)', lineHeight:1 }}>{((expert.final_score||expert.preliminary_score||0)*100).toFixed(0)}</div>
                          <div style={{ fontSize:'9px', fontFamily:'var(--font-m)', color:'var(--text-muted)', marginTop:'2px', letterSpacing:'.08em' }}>SCORE</div>
                        </div>
                        <button onClick={e=>{e.stopPropagation();router.push(`/chat/${expert.username}`)}} className="btn-p"
                          style={{ padding:'9px 18px', borderRadius:'10px', fontSize:'13px', fontFamily:'var(--font-b)', fontWeight:600 }}>Chat →</button>
                      </div>
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'1rem' }}>
                      {[
                        { label:'Semantic Depth', value:expert.signal_a||0, color:'var(--accent)', desc:'Avg cosine sim vs expertise signals' },
                        { label:'LLM Quality', value:expert.signal_b||0, color:'var(--pink)', desc:'Gemini-rated technical depth' },
                        { label:'Volume Score', value:Math.min(expert.signal_c||0,1), color:'var(--green)', desc:'Consistent high-quality posting' },
                      ].map(sig => (
                        <div key={sig.label}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'5px' }}>
                            <span style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:'var(--text-muted)' }}>{sig.label}</span>
                            <span style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:sig.color, fontWeight:600 }}>{(Math.min(sig.value,1)*100).toFixed(0)}%</span>
                          </div>
                          <div className="bar"><div className="barf" style={{ width:`${Math.min(sig.value*100,100)}%`, background:sig.color }} /></div>
                          <div style={{ fontSize:'10px', fontFamily:'var(--font-m)', color:'var(--text-muted)', marginTop:'3px', opacity:.7 }}>{sig.desc}</div>
                        </div>
                      ))}
                    </div>

                    {expert.profile && (
                      <div style={{ borderTop:'1px solid var(--border)', paddingTop:'1rem' }}>
                        {expert.profile.style && <p style={{ fontSize:'13px', color:'var(--text-muted)', lineHeight:1.6, marginBottom:expert.profile.topics?.length?'12px':'0', fontStyle:'italic' }}>"{expert.profile.style}"</p>}
                        {expert.profile.topics?.length > 0 && (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:expert.profile.knowledge_boundaries?'10px':'0' }}>
                            {expert.profile.topics.slice(0,6).map((t:string,ti:number) => <span key={t} className={`tag ${ti%3===0?'ta':ti%3===1?'tp':'tg'}`}>{t}</span>)}
                          </div>
                        )}
                        {expert.profile.knowledge_boundaries && (
                          <div style={{ fontSize:'11px', fontFamily:'var(--font-m)', color:'var(--text-muted)', background:'var(--warning-bg)', border:'1px solid rgba(180,83,9,.25)', borderRadius:'8px', padding:'8px 12px', lineHeight:1.5 }}>
                            <span style={{ color:'var(--warning)', fontWeight:600, marginRight:'6px' }}>⚠ Boundaries:</span>{expert.profile.knowledge_boundaries}
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
