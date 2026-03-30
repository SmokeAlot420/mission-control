'use client'

type ConfidenceTier = 'low' | 'medium' | 'high' | 'verified'

function getTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.85) return 'verified'
  if (confidence >= 0.65) return 'high'
  if (confidence >= 0.4) return 'medium'
  return 'low'
}

const TIER_STYLES: Record<ConfidenceTier, string> = {
  low: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  high: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  verified: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
}

const TIER_LABELS: Record<ConfidenceTier, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  verified: 'Verified',
}

export function SkillConfidenceBadge({ confidence, size = 'sm' }: { confidence: number; size?: 'xs' | 'sm' }) {
  const tier = getTier(confidence)
  const pct = Math.round(confidence * 100)
  const sizeClasses = size === 'xs' ? 'text-2xs px-1.5 py-0' : 'text-xs px-2 py-0.5'

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${sizeClasses} ${TIER_STYLES[tier]}`}>
      <span>{TIER_LABELS[tier]}</span>
      <span className="opacity-70">{pct}%</span>
    </span>
  )
}
