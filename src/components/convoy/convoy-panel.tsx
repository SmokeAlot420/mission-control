'use client'

import { useState, useEffect } from 'react'
import { useMissionControl } from '@/store'
import { ConvoyDetailPanel } from './convoy-detail-panel'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-zinc-700 text-zinc-300',
  active: 'bg-blue-900 text-blue-300',
  paused: 'bg-yellow-900 text-yellow-300',
  completed: 'bg-green-900 text-green-300',
  failed: 'bg-red-900 text-red-300',
  cancelled: 'bg-zinc-800 text-zinc-400',
}

export function ConvoyPanel() {
  const { convoys, setConvoys, selectedConvoyId, setSelectedConvoyId } = useMissionControl()
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [creating, setCreating] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')

  useEffect(() => {
    fetchConvoys()
  }, [statusFilter])

  async function fetchConvoys() {
    try {
      const url = statusFilter ? `/api/convoy?status=${statusFilter}` : '/api/convoy'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setConvoys(data.convoys || [])
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!title.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/convoy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          base_branch: baseBranch,
        }),
      })
      if (res.ok) {
        setTitle('')
        setDescription('')
        setBaseBranch('main')
        setShowCreate(false)
        await fetchConvoys()
      }
    } catch { /* ignore */ } finally {
      setCreating(false)
    }
  }

  // Detail view
  if (selectedConvoyId !== null) {
    return (
      <div className="p-4">
        <ConvoyDetailPanel
          convoyId={selectedConvoyId}
          onBack={() => setSelectedConvoyId(null)}
        />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Convoy Mode</h1>
          <p className="text-sm text-muted-foreground">Parallel multi-agent execution with DAG orchestration</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          {showCreate ? 'Cancel' : 'New Convoy'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
          <h3 className="text-sm font-medium">Create Convoy</h3>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Convoy title..."
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)..."
            rows={3}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded resize-none"
          />
          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Base Branch</label>
              <input
                value={baseBranch}
                onChange={e => setBaseBranch(e.target.value)}
                className="px-2 py-1.5 text-sm bg-background border border-border rounded w-40"
              />
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !title.trim()}
            className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {creating ? 'Creating...' : 'Create Convoy'}
          </button>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-1">
        {['', 'draft', 'active', 'paused', 'completed', 'failed'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading convoys...</p>
      ) : convoys.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">No convoys yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Create one to start parallel multi-agent execution.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {convoys.map(c => {
            const progress = c.total_subtasks > 0
              ? Math.round((c.completed_subtasks / c.total_subtasks) * 100)
              : 0

            return (
              <button
                key={c.id}
                onClick={() => setSelectedConvoyId(c.id)}
                className="w-full text-left border border-border rounded-lg p-4 bg-card hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{c.title}</h3>
                    <span className={`px-1.5 py-0.5 rounded text-2xs font-medium ${STATUS_BADGE[c.status] || ''}`}>
                      {c.status}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {c.completed_subtasks}/{c.total_subtasks}
                  </span>
                </div>
                {c.total_subtasks > 0 && (
                  <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-600 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
                <div className="text-2xs text-muted-foreground mt-2">
                  {new Date(c.created_at * 1000).toLocaleDateString()}
                  {c.failed_subtasks > 0 && (
                    <span className="text-red-400 ml-2">{c.failed_subtasks} failed</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
