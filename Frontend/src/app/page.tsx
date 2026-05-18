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
        if (data.scrape_status === 'idle' && data.total_posts > 0) { router.push(`/chat/${clean}`); return }
        if (data.scrape_status === 'in_progress') {
          setStatus('polling'); setStatusText('Scrape already running — checking progress...')
          await pollUntilDone(clean); return
        }
      }
      setStatus('scraping'); setStatusText(`Scraping u/${clean}...`)
      const scrapeRes = await fetch(`${API_URL}/api/v1/scrape/${clean}`, { method: 'POST' })
      if (!scrapeRes.ok) { const err = await scrapeRes.json(); throw new Error(err.detail || 'Scrape failed') }
      setStatus('polling'); await pollUntilDone(clean)
    } catch (err: any) { setStatus('error'); setErrorMsg(err.message || 'Something went wrong') }
  }

  async function pollUntilDone(clean: string) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000))
      try {
        const res = await fetch(`${API_URL}/api/v1/status/${clean}`)
        if (!res.ok) continue
        const data = await res.json()
        setStatusText(`${data.total_posts || 0} posts · ${data.total_comments || 0} comments indexed`)
        if (data.scrape_status === 'idle' && data.total_posts > 0) { setStatus('done'); setTimeout(() => router.push(`/chat/${clean}`), 600); return }
        if (data.scrape_status === 'failed') throw new Error('Scrape failed on server')
      } catch (err: any) { setStatus('error'); setErrorMsg(err.message || 'Failed to get status'); return }
    }
    setStatus('error'); setErrorMsg('Timed out waiting for scrape to complete')
  }

  const isLoading = ['loading', 'scraping', 'polling'].includes(status)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@400;500&display=swap');
        :root{
          --bg:#f8f4ff;--surface:#ffffff;--surface2:#f0e8ff;--border:#ddd0f5;
          --text:#0a0010;--text-muted:#6b4f8a;
          --accent:#5b21b6;--accent-light:#ede9fe;--accent-hover:#4c1d95;
          --pink:#be185d;--pink-light:#fce7f3;
          --green:#047857;--green-bg:#ecfdf5;
          --success:#047857;--danger:#dc2626;--danger-bg:#fef2f2;
          --shadow-sm:0 1px 3px rgba(91,33,182,0.08);
          --shadow-md:0 4px 20px rgba(91,33,182,0.10);
          --font-d:'Instrument Serif',Georgia,serif;
          --font-b:'DM Sans',system-ui,sans-serif;
          --font-m:'JetBrains Mono',monospace;
          --r:12px;--rl:20px;
        }
        [data-theme="dark"]{
          --bg:#080010;--surface:#110022;--surface2:#1c0038;--border:#3a1a60;
          --text:#ffffff;--text-muted:#b89fd4;
          --accent:#9333ea;--accent-light:#2e1065;--accent-hover:#a855f7;
          --pink:#ec4899;--pink-light:#500724;
          --green:#10b981;--green-bg:#022c22;
          --success:#10b981;--danger:#f87171;--danger-bg:#2a0a0a;
          --shadow-sm:0 1px 3px rgba(0,0,0,0.5);
          --shadow-md:0 4px 20px rgba(0,0,0,0.5);
        }
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:var(--bg);color:var(--text);font-family:var(--font-b);transition:background .3s,color .3s}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .fu{animation:fadeUp .5s ease forwards}
        .fu1{animation:fadeUp .5s .1s ease forwards;opacity:0}
        .fu2{animation:fadeUp .5s .2s ease forwards;opacity:0}
        .btn-g{background:transparent;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:6px}
        .btn-g:hover{border-color:var(--accent);color:var(--accent)}
        .btn-p{background:var(--accent);color:#fff;border:none;cursor:pointer;transition:background .15s,transform .1s,box-shadow .15s}
        .btn-p:hover:not(:disabled){background:var(--accent-hover);box-shadow:0 4px 14px rgba(91,33,182,0.35)}
        .btn-p:active:not(:disabled){transform:scale(.98)}
        .btn-p:disabled{opacity:.45;cursor:not-allowed}
        .iw:focus-within{border-color:var(--accent)!important;box-shadow:0 0 0 3px rgba(91,33,182,0.12)!important}
        .ef{background:var(--surface);border:1.5px solid var(--border);border-radius:var(--rl);cursor:pointer;transition:all .2s;box-shadow:var(--shadow-sm)}
        .ef:hover{border-color:var(--accent);box-shadow:var(--shadow-md);background:var(--accent-light)}
        .sp{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
        .dot{width:5px;height:5px;border-radius:50%;display:inline-block}
        .badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:10px;font-family:var(--font-m);letter-spacing:.1em;font-weight:500;background:var(--accent-light);border:1px solid rgba(91,33,182,.25);color:var(--accent)}
      `}</style>

      <button onClick={() => setDark(d => !d)} className="btn-g" style={{ position:'fixed', top:20, right:20, padding:'8px 14px', borderRadius:'8px', fontSize:'13px', fontFamily:'var(--font-m)', zIndex:100 }}>
        <span>{dark ? '☀' : '◐'}</span><span>{dark ? 'Light' : 'Dark'}</span>
      </button>

      <main style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'2rem' }}>
        <div style={{ width:'100%', maxWidth:'480px' }}>

          {/* Wordmark */}
          <div style={{ marginBottom:'2.5rem', textAlign:'center' }} className="fu">
            <div style={{ display:'inline-flex', alignItems:'center', gap:'10px', marginBottom:'1.5rem' }}>
              <div style={{ width:'34px', height:'34px', background:'var(--accent)', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px rgba(91,33,182,0.3)' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4.5C2 3.12 3.12 2 4.5 2h7C12.88 2 14 3.12 14 4.5v4C14 9.88 12.88 11 11.5 11H9l-3 3v-3H4.5C3.12 11 2 9.88 2 8.5v-4z" fill="white"/>
                </svg>
              </div>
              <span style={{ fontFamily:'var(--font-d)', fontWeight:400, fontSize:'1.5rem', letterSpacing:'-.01em' }}>TalkToX</span>
            </div>
            <h1 style={{ fontFamily:'var(--font-d)', fontWeight:400, fontSize:'clamp(2rem,5vw,3rem)', lineHeight:1.1, letterSpacing:'-.02em', marginBottom:'.85rem' }}>
              Converse with<br />
              <em style={{ fontStyle:'italic', color:'var(--accent)' }}>any Reddit user</em>
            </h1>
            <p style={{ color:'var(--text-muted)', fontSize:'.9rem', lineHeight:1.65, fontWeight:300 }}>
              We index their posts into a knowledge base.<br />
              You chat with an AI grounded in exactly what they wrote.
            </p>
          </div>

          {/* ExpertFinder PRIMARY CTA */}
          <div className="fu1" style={{ marginBottom:'1.25rem' }}>
            <button onClick={() => router.push('/expertfinder')} className="ef" style={{ width:'100%', padding:'1.4rem 1.5rem', textAlign:'left' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ marginBottom:'6px' }}>
                    <span className="badge"><span className="dot" style={{ background:'var(--green)' }} />RECOMMENDED</span>
                  </div>
                  <div style={{ fontFamily:'var(--font-d)', fontSize:'1.25rem', marginBottom:'4px', letterSpacing:'-.01em' }}>Find Expert & Chat</div>
                  <div style={{ fontSize:'12px', color:'var(--text-muted)', fontFamily:'var(--font-m)', lineHeight:1.5 }}>
                    Don't know who to talk to? We discover real<br />topic experts algorithmically — then chat with them.
                  </div>
                </div>
                <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="8" cy="8" r="5" stroke="white" strokeWidth="1.5"/>
                    <path d="M12 12L16 16" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
            </button>
          </div>

          {/* Divider */}
          <div className="fu2" style={{ display:'flex', alignItems:'center', gap:'12px', margin:'1.25rem 0' }}>
            <div style={{ flex:1, height:'1px', background:'var(--border)' }} />
            <span style={{ fontSize:'11px', fontFamily:'var(--font-m)', color:'var(--text-muted)', padding:'2px 8px', border:'1px solid var(--border)', borderRadius:'999px' }}>or chat directly</span>
            <div style={{ flex:1, height:'1px', background:'var(--border)' }} />
          </div>

          {/* Username input SECONDARY */}
          <div className="fu2">
            <form onSubmit={handleSubmit} style={{ marginBottom:'1rem' }}>
              <div className="iw" style={{ background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:'var(--rl)', padding:'1rem 1.25rem .9rem', marginBottom:'10px', boxShadow:'var(--shadow-sm)', transition:'border-color .15s,box-shadow .15s' }}>
                <label style={{ display:'block', fontSize:'10px', fontFamily:'var(--font-m)', color:'var(--text-muted)', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:'8px', fontWeight:500 }}>Know who you want to chat with?</label>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ color:'var(--accent)', fontFamily:'var(--font-m)', fontSize:'1rem', userSelect:'none', fontWeight:500 }}>u/</span>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="enter username" disabled={isLoading} autoFocus
                    style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'var(--text)', fontFamily:'var(--font-b)', fontWeight:500, fontSize:'1.1rem', letterSpacing:'-.01em' }} />
                </div>
              </div>
              <button type="submit" disabled={isLoading || !username.trim()} className="btn-p"
                style={{ width:'100%', padding:'13px', borderRadius:'var(--r)', fontSize:'15px', fontFamily:'var(--font-b)', fontWeight:600, letterSpacing:'-.01em', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}>
                {isLoading ? (
                  <><div className="sp" /><span style={{ fontFamily:'var(--font-m)', fontSize:'13px' }}>{statusText || 'Working…'}</span></>
                ) : status === 'done' ? (
                  <><span style={{ color:'var(--green)' }}>✓</span>Redirecting…</>
                ) : <>Start chatting <span style={{ opacity:.7 }}>→</span></>}
              </button>
            </form>
            {status === 'error' && (
              <div style={{ marginTop:'10px', padding:'11px 16px', background:'var(--danger-bg)', border:'1px solid rgba(220,38,38,0.3)', borderRadius:'var(--r)', color:'var(--danger)', fontSize:'13px', fontFamily:'var(--font-m)', lineHeight:1.5 }}>{errorMsg}</div>
            )}
          </div>

          <p style={{ textAlign:'center', marginTop:'2rem', fontSize:'11px', color:'var(--text-muted)', fontFamily:'var(--font-m)', opacity:.7 }}>
            Only public Reddit data · Every answer cites the source post
          </p>
        </div>
      </main>
    </>
  )
}
