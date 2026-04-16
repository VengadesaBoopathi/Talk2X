'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function ChatPage() {
  const params = useParams()
  const router = useRouter()
  const username = params.username as string

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [userInfo, setUserInfo] = useState<any>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchUserInfo()
  }, [username])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchUserInfo() {
    try {
      const res = await fetch(`${API_URL}/api/v1/status/${username}`)
      if (res.ok) {
        const data = await res.json()
        setUserInfo(data)
        if (data.scrape_status !== 'idle') {
          router.push('/')
        }
      } else {
        router.push('/')
      }
    } catch {
      router.push('/')
    }
  }

  async function sendMessage() {
    if (!input.trim() || isStreaming) return

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    const historyForApi = messages.map(m => ({
      role: m.role,
      content: m.content,
    }))

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsStreaming(true)

    // Add empty assistant message to stream into
    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, assistantMessage])

    try {
      const res = await fetch(`${API_URL}/api/v1/chat/${username}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userMessage.content,
          chat_history: historyForApi,
        }),
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
        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk

        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: accumulated,
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

  function formatTime(date: Date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Extract URLs from message for citation display
  function extractUrls(content: string): string[] {
    const urlRegex = /https?:\/\/reddit\.com[^\s\)\"]+/g
    return [...new Set(content.match(urlRegex) || [])]
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
    }}>
      {/* Header */}
      <header style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexShrink: 0,
      }}>
        <button
          onClick={() => router.push('/')}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '6px 10px',
            borderRadius: '8px',
            fontSize: '12px',
            fontFamily: 'DM Mono, monospace',
            transition: 'all 0.2s',
          }}
        >← back</button>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--success)',
              boxShadow: '0 0 6px var(--success)',
            }} />
            <span style={{
              fontWeight: 700,
              fontSize: '1rem',
              letterSpacing: '-0.01em',
            }}>u/{username}</span>
          </div>
          {userInfo && (
            <div style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontFamily: 'DM Mono, monospace',
              marginTop: '2px',
            }}>
              {userInfo.total_posts} posts · {userInfo.total_comments} comments indexed
            </div>
          )}
        </div>

        <div style={{
          fontSize: '11px',
          fontFamily: 'DM Mono, monospace',
          color: 'var(--text-muted)',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          padding: '4px 10px',
          borderRadius: '999px',
        }}>RAG · Gemini</div>
      </header>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}>
        {messages.length === 0 && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            opacity: 0.5,
            animation: 'fadeUp 0.5s ease forwards',
          }}>
            <div style={{ fontSize: '2.5rem' }}>💬</div>
            <p style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: '0.875rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
              lineHeight: 1.6,
            }}>
              Ask anything about u/{username}<br />
              All answers are grounded in their actual posts
            </p>

            {/* Suggested questions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '0.5rem' }}>
              {[
                'What topics do they post about most?',
                'What are their opinions on AI?',
                'What subreddits are they active in?',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus() }}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    padding: '8px 14px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontFamily: 'DM Mono, monospace',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const urls = msg.role === 'assistant' ? extractUrls(msg.content) : []
          return (
            <div
              key={i}
              className="fade-up"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: '6px',
              }}
            >
              <div style={{
                fontSize: '11px',
                fontFamily: 'DM Mono, monospace',
                color: 'var(--text-muted)',
                paddingInline: '4px',
              }}>
                {msg.role === 'user' ? 'you' : `u/${username} (AI)`} · {formatTime(msg.timestamp)}
              </div>

              <div
                className={msg.role === 'user' ? 'message-user' : 'message-assistant'}
                style={{
                  maxWidth: '80%',
                  padding: '1rem 1.25rem',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  fontSize: '0.9375rem',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.content}
                {isStreaming && i === messages.length - 1 && msg.role === 'assistant' && (
                  <span className="cursor-blink" style={{ marginLeft: '2px', color: 'var(--accent)' }}>▊</span>
                )}
              </div>

              {/* Reddit source links */}
              {urls.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingInline: '4px' }}>
                  {urls.map((url, j) => (
                    <a
                      key={j}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="source-chip"
                    >
                      ↗ source {j + 1}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '1rem 1.5rem',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-end',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '10px 10px 10px 16px',
          transition: 'border-color 0.2s',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about u/${username}...`}
            disabled={isStreaming}
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontFamily: 'Syne, sans-serif',
              fontSize: '0.9375rem',
              lineHeight: 1.6,
              resize: 'none',
              maxHeight: '120px',
              overflowY: 'auto',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              border: 'none',
              background: !input.trim() || isStreaming
                ? 'var(--border)'
                : 'linear-gradient(135deg, var(--accent), #5b4fd4)',
              color: 'white',
              cursor: !input.trim() || isStreaming ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              flexShrink: 0,
              transition: 'all 0.2s',
            }}
          >
            {isStreaming ? '⏸' : '↑'}
          </button>
        </div>
        <p style={{
          textAlign: 'center',
          marginTop: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          fontFamily: 'DM Mono, monospace',
        }}>
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}
