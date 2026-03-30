'use client'

import { useState, useEffect } from 'react'

interface MailMessage {
  id: number
  from_agent: string
  message_type: string
  subject: string | null
  body: string
  created_at: number
  deliveries: { recipient_agent: string; status: string }[]
}

interface MailboxViewerProps {
  convoyId: number
}

export function MailboxViewer({ convoyId }: MailboxViewerProps) {
  const [messages, setMessages] = useState<MailMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [showCompose, setShowCompose] = useState(false)
  const [fromAgent, setFromAgent] = useState('')
  const [toAgent, setToAgent] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchMessages()
  }, [convoyId])

  async function fetchMessages() {
    try {
      const res = await fetch(`/api/convoy/${convoyId}/mailbox`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    if (!fromAgent || !toAgent || !body) return
    setSending(true)
    try {
      const res = await fetch(`/api/convoy/${convoyId}/mailbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_agent: fromAgent,
          recipients: [toAgent],
          subject: subject || undefined,
          body,
        }),
      })
      if (res.ok) {
        setShowCompose(false)
        setFromAgent('')
        setToAgent('')
        setSubject('')
        setBody('')
        await fetchMessages()
      }
    } catch { /* ignore */ } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Loading mailbox...</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Mailbox ({messages.length})</h3>
        <button
          onClick={() => setShowCompose(!showCompose)}
          className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          {showCompose ? 'Cancel' : 'Compose'}
        </button>
      </div>

      {showCompose && (
        <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={fromAgent}
              onChange={e => setFromAgent(e.target.value)}
              placeholder="From agent..."
              className="px-2 py-1.5 text-xs bg-background border border-border rounded"
            />
            <input
              value={toAgent}
              onChange={e => setToAgent(e.target.value)}
              placeholder="To agent..."
              className="px-2 py-1.5 text-xs bg-background border border-border rounded"
            />
          </div>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Subject (optional)..."
            className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded"
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Message body..."
            rows={3}
            className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded resize-none"
          />
          <button
            onClick={handleSend}
            disabled={sending || !fromAgent || !toAgent || !body}
            className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      )}

      {messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">No messages yet.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {messages.map(msg => (
            <div key={msg.id} className="border border-border rounded-lg p-3 bg-card">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium">{msg.from_agent}</span>
                <span className="text-muted-foreground">-&gt;</span>
                <span>{msg.deliveries.map(d => d.recipient_agent).join(', ')}</span>
                <span className="ml-auto text-muted-foreground">
                  {new Date(msg.created_at * 1000).toLocaleTimeString()}
                </span>
              </div>
              {msg.subject && (
                <p className="text-xs font-medium mt-1">{msg.subject}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{msg.body}</p>
              <div className="flex gap-1 mt-1">
                <span className="text-2xs px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">{msg.message_type}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
