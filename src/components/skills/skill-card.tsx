'use client'

import { SkillConfidenceBadge } from './skill-confidence-badge'

interface SkillStep {
  action: string
  command?: string
  expected?: string
  fallback?: string
}

interface ExtractedSkillSummary {
  id: number
  title: string
  description: string | null
  skill_type: string
  confidence: number
  expected_success: number
  times_used: number
  times_succeeded: number
  times_failed: number
  status: string
  enabled: number
  created_by_agent: string | null
  agent_role: string | null
  trigger_keywords: string | string[]
  steps: string | SkillStep[]
  created_at: number
  updated_at: number
}

const TYPE_COLORS: Record<string, string> = {
  build: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  deploy: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  test: 'bg-green-500/10 text-green-400 border-green-500/30',
  fix: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  config: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  pattern: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'text-muted-foreground/60',
  active: 'text-emerald-400',
  deprecated: 'text-rose-400',
}

export function SkillCard({
  skill,
  onSelect,
  onReport,
}: {
  skill: ExtractedSkillSummary
  onSelect?: (skill: ExtractedSkillSummary) => void
  onReport?: (skillId: number) => void
}) {
  const keywords = typeof skill.trigger_keywords === 'string'
    ? safeParseArray(skill.trigger_keywords)
    : skill.trigger_keywords

  const steps = typeof skill.steps === 'string'
    ? safeParseArray(skill.steps)
    : skill.steps

  return (
    <div
      className={`rounded-lg border bg-card p-3 transition-colors hover:border-border/80 ${
        !skill.enabled ? 'opacity-50' : ''
      } ${onSelect ? 'cursor-pointer' : ''}`}
      onClick={() => onSelect?.(skill)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-foreground truncate">{skill.title}</h4>
            <span className={`text-2xs font-medium ${STATUS_STYLES[skill.status] ?? 'text-muted-foreground'}`}>
              {skill.status}
            </span>
          </div>
          {skill.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{skill.description}</p>
          )}
        </div>
        <SkillConfidenceBadge confidence={skill.confidence} size="xs" />
      </div>

      {/* Confidence bar */}
      <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            skill.confidence >= 0.85 ? 'bg-cyan-400'
            : skill.confidence >= 0.65 ? 'bg-emerald-400'
            : skill.confidence >= 0.4 ? 'bg-amber-400'
            : 'bg-zinc-500'
          }`}
          style={{ width: `${Math.round(skill.confidence * 100)}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-2xs rounded-full border px-1.5 py-0 ${TYPE_COLORS[skill.skill_type] ?? TYPE_COLORS.pattern}`}>
            {skill.skill_type}
          </span>
          {skill.created_by_agent && (
            <span className="text-2xs text-muted-foreground/60">
              by {skill.created_by_agent}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-2xs text-muted-foreground">
          <span>{skill.times_used} uses</span>
          <span className="text-emerald-400/70">{skill.times_succeeded} ok</span>
          {skill.times_failed > 0 && (
            <span className="text-rose-400/70">{skill.times_failed} fail</span>
          )}
        </div>
      </div>

      {keywords.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {keywords.slice(0, 5).map((kw: string, i: number) => (
            <span key={i} className="text-2xs rounded bg-secondary/50 border border-border px-1.5 py-0 text-muted-foreground">
              {kw}
            </span>
          ))}
          {keywords.length > 5 && (
            <span className="text-2xs text-muted-foreground/50">+{keywords.length - 5}</span>
          )}
        </div>
      )}

      {onReport && skill.status === 'active' && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); onReport(skill.id) }}
            className="text-2xs text-primary hover:underline"
          >
            Report outcome
          </button>
        </div>
      )}
    </div>
  )
}

function safeParseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
