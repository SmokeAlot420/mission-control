'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { SkillConfidenceBadge } from './skill-confidence-badge'

interface SkillStep {
  action: string
  command?: string
  expected?: string
  fallback?: string
}

interface ExtractedSkillDetail {
  id: number
  title: string
  description: string | null
  skill_type: string
  confidence: number
  expected_success: number
  lower90: number
  effective_trials: number
  times_used: number
  times_succeeded: number
  times_failed: number
  status: string
  enabled: number
  trigger_keywords: string | string[]
  prerequisites: string | string[]
  steps: string | SkillStep[]
  verification: string | null
  conditions: string | null
  created_by_agent: string | null
  agent_role: string | null
  source_task_id: number | null
  created_at: number
  updated_at: number
}

const SKILL_TYPES = ['build', 'deploy', 'test', 'fix', 'config', 'pattern'] as const
const STATUSES = ['draft', 'active', 'deprecated'] as const

export function SkillEditDrawer({
  skillId,
  onClose,
  onSaved,
}: {
  skillId: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [skill, setSkill] = useState<ExtractedSkillDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [skillType, setSkillType] = useState<string>('pattern')
  const [status, setStatus] = useState<string>('draft')
  const [enabled, setEnabled] = useState(true)
  const [verification, setVerification] = useState('')
  const [conditions, setConditions] = useState('')
  const [keywordsText, setKeywordsText] = useState('')
  const [prerequisitesText, setPrerequisitesText] = useState('')
  const [steps, setSteps] = useState<SkillStep[]>([{ action: '' }])
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => { setIsMounted(true) }, [])

  const loadSkill = useCallback(async () => {
    if (!skillId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/skills/extracted/${skillId}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load')
      const s = body.skill as ExtractedSkillDetail
      setSkill(s)
      setTitle(s.title)
      setDescription(s.description || '')
      setSkillType(s.skill_type)
      setStatus(s.status)
      setEnabled(!!s.enabled)
      setVerification(s.verification || '')
      setConditions(s.conditions || '')
      const kw = typeof s.trigger_keywords === 'string' ? safeParse(s.trigger_keywords) : s.trigger_keywords
      setKeywordsText(Array.isArray(kw) ? kw.join(', ') : '')
      const pr = typeof s.prerequisites === 'string' ? safeParse(s.prerequisites) : s.prerequisites
      setPrerequisitesText(Array.isArray(pr) ? pr.join(', ') : '')
      const st = typeof s.steps === 'string' ? safeParse(s.steps) : s.steps
      setSteps(Array.isArray(st) && st.length > 0 ? (st as SkillStep[]) : [{ action: '' }])
    } catch (err: any) {
      setError(err?.message || 'Failed to load skill')
    } finally {
      setLoading(false)
    }
  }, [skillId])

  useEffect(() => { loadSkill() }, [loadSkill])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    if (!skillId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/skills/extracted/${skillId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || null,
          skill_type: skillType,
          status,
          enabled,
          verification: verification || null,
          conditions: conditions || null,
          trigger_keywords: keywordsText.split(',').map(k => k.trim()).filter(Boolean),
          prerequisites: prerequisitesText.split(',').map(p => p.trim()).filter(Boolean),
          steps: steps.filter(s => s.action.trim()),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to save')
      onSaved()
    } catch (err: any) {
      setError(err?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const addStep = () => setSteps(prev => [...prev, { action: '' }])
  const removeStep = (idx: number) => setSteps(prev => prev.filter((_, i) => i !== idx))
  const updateStep = (idx: number, field: keyof SkillStep, value: string) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value || undefined } : s))
  }

  if (!isMounted || !skillId) return null

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-[min(48rem,100vw)] bg-card border-l border-border shadow-2xl flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {skill ? `Edit: ${skill.title}` : 'Loading...'}
            </h3>
            {skill && (
              <div className="flex items-center gap-2 mt-0.5">
                <SkillConfidenceBadge confidence={skill.confidence} size="xs" />
                <span className="text-2xs text-muted-foreground">
                  {skill.times_used} uses | E[s]={Math.round(skill.expected_success * 100)}% | lower90={Math.round(skill.lower90 * 100)}%
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={save} disabled={saving || loading}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {skill && !loading && (
            <>
              {/* Title */}
              <div>
                <label className="text-xs text-muted-foreground">Title</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-secondary/50 px-3 text-sm text-foreground focus:outline-none focus:border-primary/40"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-muted-foreground">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-border bg-secondary/50 p-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              {/* Type + Status + Enabled */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Type</label>
                  <select
                    value={skillType}
                    onChange={e => setSkillType(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-secondary/50 px-2 text-xs text-foreground"
                  >
                    {SKILL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Status</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-secondary/50 px-2 text-xs text-foreground"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="accent-primary" />
                    Enabled
                  </label>
                </div>
              </div>

              {/* Keywords + Prerequisites */}
              <div>
                <label className="text-xs text-muted-foreground">Trigger Keywords (comma-separated)</label>
                <input
                  value={keywordsText}
                  onChange={e => setKeywordsText(e.target.value)}
                  placeholder="deploy, docker, kubernetes"
                  className="mt-1 h-9 w-full rounded-md border border-border bg-secondary/50 px-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Prerequisites (comma-separated)</label>
                <input
                  value={prerequisitesText}
                  onChange={e => setPrerequisitesText(e.target.value)}
                  placeholder="Docker installed, CI configured"
                  className="mt-1 h-9 w-full rounded-md border border-border bg-secondary/50 px-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                />
              </div>

              {/* Steps editor */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Steps</label>
                  <button onClick={addStep} className="text-2xs text-primary hover:underline">+ Add step</button>
                </div>
                <div className="mt-1 space-y-2">
                  {steps.map((step, idx) => (
                    <div key={idx} className="rounded-md border border-border bg-secondary/30 p-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-2xs text-muted-foreground/50 w-5 shrink-0">{idx + 1}.</span>
                        <input
                          value={step.action}
                          onChange={e => updateStep(idx, 'action', e.target.value)}
                          placeholder="Action description"
                          className="h-7 flex-1 rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-none"
                        />
                        {steps.length > 1 && (
                          <button onClick={() => removeStep(idx)} className="text-2xs text-destructive/70 hover:text-destructive">x</button>
                        )}
                      </div>
                      <input
                        value={step.command ?? ''}
                        onChange={e => updateStep(idx, 'command', e.target.value)}
                        placeholder="Command (optional)"
                        className="h-7 w-full rounded border border-border bg-card px-2 text-xs font-mono text-muted-foreground focus:outline-none"
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          value={step.expected ?? ''}
                          onChange={e => updateStep(idx, 'expected', e.target.value)}
                          placeholder="Expected result"
                          className="h-7 rounded border border-border bg-card px-2 text-xs text-muted-foreground focus:outline-none"
                        />
                        <input
                          value={step.fallback ?? ''}
                          onChange={e => updateStep(idx, 'fallback', e.target.value)}
                          placeholder="Fallback"
                          className="h-7 rounded border border-border bg-card px-2 text-xs text-muted-foreground focus:outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Verification + Conditions */}
              <div>
                <label className="text-xs text-muted-foreground">Verification</label>
                <textarea
                  value={verification}
                  onChange={e => setVerification(e.target.value)}
                  rows={2}
                  placeholder="How to verify this skill was applied correctly"
                  className="mt-1 w-full rounded-md border border-border bg-secondary/50 p-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Conditions</label>
                <textarea
                  value={conditions}
                  onChange={e => setConditions(e.target.value)}
                  rows={2}
                  placeholder="When this skill should NOT be used"
                  className="mt-1 w-full rounded-md border border-border bg-secondary/50 p-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                />
              </div>

              {/* Metadata */}
              <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-1 text-2xs text-muted-foreground">
                <div>Source task: {skill.source_task_id ?? 'manual'}</div>
                <div>Agent: {skill.created_by_agent ?? 'unknown'} {skill.agent_role ? `(${skill.agent_role})` : ''}</div>
                <div>Effective trials: {skill.effective_trials.toFixed(1)}</div>
                <div>Created: {new Date(skill.created_at * 1000).toLocaleString()}</div>
                <div>Updated: {new Date(skill.updated_at * 1000).toLocaleString()}</div>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body
  )
}

function safeParse(raw: string): unknown[] {
  try {
    const p = JSON.parse(raw)
    return Array.isArray(p) ? p : []
  } catch {
    return []
  }
}
