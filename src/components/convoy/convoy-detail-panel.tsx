'use client'

import { useState, useEffect, useCallback } from 'react'
import { DependencyGraph } from './dependency-graph'
import { SubtaskCard } from './subtask-card'
import { MailboxViewer } from './mailbox-viewer'

interface Convoy {
  id: number
  title: string
  description: string | null
  status: string
  base_branch: string
  merge_strategy: string
  total_subtasks: number
  completed_subtasks: number
  failed_subtasks: number
  created_by: string
  started_at: number | null
  completed_at: number | null
  created_at: number
  subtasks: any[]
  edges: any[]
}

type Tab = 'graph' | 'subtasks' | 'mailbox'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-zinc-700 text-zinc-300',
  active: 'bg-blue-900 text-blue-300',
  paused: 'bg-yellow-900 text-yellow-300',
  completed: 'bg-green-900 text-green-300',
  failed: 'bg-red-900 text-red-300',
  cancelled: 'bg-zinc-800 text-zinc-400',
}

interface ConvoyDetailPanelProps {
  convoyId: number
  onBack: () => void
}

export function ConvoyDetailPanel({ convoyId, onBack }: ConvoyDetailPanelProps) {
  const [convoy, setConvoy] = useState<Convoy | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('graph')
  const [dispatching, setDispatching] = useState(false)

  const fetchConvoy = useCallback(async () => {
    try {
      const res = await fetch(`/api/convoy/${convoyId}`)
      if (res.ok) {
        const data = await res.json()
        setConvoy(data.convoy)
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [convoyId])

  useEffect(() => {
    fetchConvoy()
    const interval = setInterval(fetchConvoy, 5000)
    return () => clearInterval(interval)
  }, [fetchConvoy])

  async function handleStatusChange(newStatus: string) {
    try {
      const res = await fetch(`/api/convoy/${convoyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) await fetchConvoy()
    } catch { /* ignore */ }
  }

  async function handleDispatchAll() {
    setDispatching(true)
    try {
      await fetch(`/api/convoy/${convoyId}/dispatch`, { method: 'POST' })
      await fetchConvoy()
    } catch { /* ignore */ } finally {
      setDispatching(false)
    }
  }

  async function handleSubtaskStatus(subtaskId: number, status: string) {
    try {
      await fetch(`/api/convoy/${convoyId}/subtasks/${subtaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await fetchConvoy()
    } catch { /* ignore */ }
  }

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading convoy...</div>
  }

  if (!convoy) {
    return <div className="p-4 text-sm text-muted-foreground">Convoy not found.</div>
  }

  const readyCount = convoy.subtasks.filter((s: any) => s.status === 'ready').length
  const progress = convoy.total_subtasks > 0
    ? Math.round((convoy.completed_subtasks / convoy.total_subtasks) * 100)
    : 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1">
            &larr; Back to convoys
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{convoy.title}</h2>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[convoy.status] || ''}`}>
              {convoy.status}
            </span>
          </div>
          {convoy.description && (
            <p className="text-sm text-muted-foreground mt-1">{convoy.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>Branch: {convoy.base_branch}</span>
            <span>Strategy: {convoy.merge_strategy}</span>
            <span>By: {convoy.created_by}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {readyCount > 0 && convoy.status !== 'paused' && (
            <button
              onClick={handleDispatchAll}
              disabled={dispatching}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {dispatching ? 'Dispatching...' : `Dispatch ${readyCount} Ready`}
            </button>
          )}
          {convoy.status === 'active' && (
            <button
              onClick={() => handleStatusChange('paused')}
              className="px-3 py-1.5 text-xs rounded bg-yellow-900 text-yellow-300 hover:bg-yellow-800 transition-colors"
            >
              Pause
            </button>
          )}
          {convoy.status === 'paused' && (
            <button
              onClick={() => handleStatusChange('active')}
              className="px-3 py-1.5 text-xs rounded bg-blue-900 text-blue-300 hover:bg-blue-800 transition-colors"
            >
              Resume
            </button>
          )}
          {(convoy.status === 'active' || convoy.status === 'paused' || convoy.status === 'draft') && (
            <button
              onClick={() => handleStatusChange('cancelled')}
              className="px-3 py-1.5 text-xs rounded bg-red-900 text-red-300 hover:bg-red-800 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>{convoy.completed_subtasks}/{convoy.total_subtasks} completed</span>
          {convoy.failed_subtasks > 0 && (
            <span className="text-red-400">{convoy.failed_subtasks} failed</span>
          )}
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['graph', 'subtasks', 'mailbox'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'graph' ? 'Dependency Graph' : tab === 'subtasks' ? `Subtasks (${convoy.total_subtasks})` : 'Mailbox'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'graph' && (
        <DependencyGraph subtasks={convoy.subtasks} edges={convoy.edges} />
      )}

      {activeTab === 'subtasks' && (
        <div className="space-y-2">
          {convoy.subtasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subtasks.</p>
          ) : (
            convoy.subtasks.map((s: any) => (
              <SubtaskCard key={s.id} subtask={s} onStatusChange={handleSubtaskStatus} />
            ))
          )}
        </div>
      )}

      {activeTab === 'mailbox' && (
        <MailboxViewer convoyId={convoyId} />
      )}
    </div>
  )
}
