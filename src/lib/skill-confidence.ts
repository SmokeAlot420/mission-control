/**
 * Skill Confidence — Weighted Beta-Bernoulli scoring with recency decay.
 *
 * confidence = Pr(theta >= tau_use | data)  (NOT raw posterior mean)
 *
 * Uses weighted evidence from skill_reports (outcome_value, quality_weight,
 * recency decay) with hierarchical fallback priors by (agent_role, skill_type).
 */

import { getDatabase } from './db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkillType = 'build' | 'deploy' | 'test' | 'fix' | 'config' | 'pattern'
export type SkillStatus = 'draft' | 'active' | 'deprecated'
export type OutcomeLabel = 'success' | 'minor_fix' | 'partial' | 'weak_partial' | 'failure'

export interface ExtractedSkill {
  id: number
  workspace_id: number
  title: string
  description: string | null
  skill_type: SkillType
  trigger_keywords: string[]
  prerequisites: string[]
  steps: SkillStep[]
  verification: string | null
  conditions: string | null
  times_used: number
  times_succeeded: number
  times_failed: number
  prior_alpha: number
  prior_beta: number
  posterior_alpha: number
  posterior_beta: number
  expected_success: number
  confidence: number
  lower90: number
  effective_trials: number
  last_reported_at: number | null
  source_task_id: number | null
  created_by_agent: string | null
  agent_role: string | null
  supersedes_skill_id: number | null
  status: SkillStatus
  enabled: number
  last_used_at: number | null
  created_at: number
  updated_at: number
}

export interface SkillStep {
  action: string
  command?: string
  expected?: string
  fallback?: string
}

export interface SkillReport {
  id: number
  workspace_id: number
  skill_id: number
  task_id: number | null
  outcome: OutcomeLabel
  outcome_value: number
  quality_weight: number
  report_source: string
  notes: string | null
  reported_by: string
  reviewed_by_human: number
  created_at: number
}

export interface ConfidenceUpdate {
  posterior_alpha: number
  posterior_beta: number
  expected_success: number
  confidence: number
  lower90: number
  effective_trials: number
}

export interface MatchedSkill extends ExtractedSkill {
  match_score: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAU_USE = 0.5
const RECENCY_HALF_LIFE_DAYS = 30
const MIN_WEIGHT = 0.05

const OUTCOME_VALUES: Record<OutcomeLabel, number> = {
  success: 1.0,
  minor_fix: 0.8,
  partial: 0.5,
  weak_partial: 0.25,
  failure: 0.0,
}

const ROLE_SKILL_AFFINITY: Record<string, SkillType[]> = {
  builder: ['build', 'config', 'pattern', 'fix'],
  tester: ['test', 'config'],
  reviewer: ['pattern', 'config'],
  verifier: ['test', 'pattern'],
  deployer: ['deploy', 'config'],
  fixer: ['fix', 'build', 'config'],
}

// Hierarchical fallback priors: (role, type) -> (alpha, beta)
const FALLBACK_PRIORS: Record<string, { alpha: number; beta: number }> = {
  'builder:build': { alpha: 3, beta: 2 },
  'builder:fix': { alpha: 2.5, beta: 2 },
  'tester:test': { alpha: 3, beta: 2 },
  'deployer:deploy': { alpha: 2.5, beta: 2.5 },
}

const GLOBAL_PRIOR = { alpha: 2, beta: 2 }

// Confidence tiers for display
export type ConfidenceTier = 'low' | 'medium' | 'high' | 'verified'

export function getConfidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.85) return 'verified'
  if (confidence >= 0.65) return 'high'
  if (confidence >= 0.4) return 'medium'
  return 'low'
}

// ---------------------------------------------------------------------------
// Beta distribution helpers
// ---------------------------------------------------------------------------

/**
 * Regularized incomplete beta function I_x(a, b) via continued fraction.
 * Used to compute Pr(theta >= tau | alpha, beta).
 */
function betaIncomplete(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b)
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a

  // Lentz continued fraction
  const maxIter = 200
  const eps = 1e-10
  let f = 1 + cfTerm(1, a, b, x)
  if (Math.abs(f) < 1e-30) f = 1e-30
  let C = f
  let D = 0
  for (let m = 1; m <= maxIter; m++) {
    const d = cfTerm(m + 1, a, b, x)
    D = 1 + d * D
    if (Math.abs(D) < 1e-30) D = 1e-30
    D = 1 / D
    C = 1 + d / C
    if (Math.abs(C) < 1e-30) C = 1e-30
    const delta = C * D
    f *= delta
    if (Math.abs(delta - 1) < eps) break
  }

  const result = front * f
  return Math.min(Math.max(result, 0), 1)
}

function cfTerm(m: number, a: number, b: number, x: number): number {
  const k = Math.floor(m / 2)
  if (m % 2 === 0) {
    return (k * (b - k) * x) / ((a + 2 * k - 1) * (a + 2 * k))
  }
  return -((a + k) * (a + b + k) * x) / ((a + 2 * k) * (a + 2 * k + 1))
}

function lnGamma(z: number): number {
  // Lanczos approximation
  const g = 7
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  }
  z -= 1
  let x = coef[0]
  for (let i = 1; i < g + 2; i++) {
    x += coef[i] / (z + i)
  }
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

/**
 * Pr(theta >= tau | alpha, beta) = 1 - I_tau(alpha, beta)
 * This is the actual confidence measure per the PRP.
 */
function probAboveThreshold(alpha: number, beta: number, tau: number = TAU_USE): number {
  // Use symmetry for better numerical accuracy when x > 0.5
  if (tau <= 0) return 1
  if (tau >= 1) return 0
  const ix = betaIncomplete(tau, alpha, beta)
  return 1 - ix
}

/**
 * Lower 90% credible bound: find x such that Pr(theta >= x) = 0.9
 * i.e., the 10th percentile of Beta(alpha, beta).
 */
function lower90Bound(alpha: number, beta: number): number {
  // Binary search for the 10th percentile
  let lo = 0, hi = 1
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const cdf = betaIncomplete(mid, alpha, beta)
    if (cdf < 0.1) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// ---------------------------------------------------------------------------
// Recency decay
// ---------------------------------------------------------------------------

function recencyWeight(reportTimestamp: number, nowSeconds: number): number {
  const daysDiff = (nowSeconds - reportTimestamp) / 86400
  const w = Math.pow(0.5, daysDiff / RECENCY_HALF_LIFE_DAYS)
  return Math.max(w, MIN_WEIGHT)
}

// ---------------------------------------------------------------------------
// Core scoring
// ---------------------------------------------------------------------------

/**
 * Resolve prior (alpha, beta) using hierarchical fallback:
 * 1. (agent_role, skill_type) specific prior
 * 2. Global cold-start prior
 */
function resolvePrior(agentRole: string | null, skillType: SkillType): { alpha: number; beta: number } {
  if (agentRole) {
    const key = `${agentRole.toLowerCase()}:${skillType}`
    if (FALLBACK_PRIORS[key]) return FALLBACK_PRIORS[key]
  }
  return GLOBAL_PRIOR
}

/**
 * Recompute posterior from all reports for a skill.
 * Uses weighted Beta-Bernoulli update with recency decay.
 */
export function recomputeConfidence(
  skillId: number,
  workspaceId: number,
  agentRole: string | null,
  skillType: SkillType,
): ConfidenceUpdate {
  const db = getDatabase()
  const prior = resolvePrior(agentRole, skillType)

  const reports = db.prepare(
    'SELECT outcome_value, quality_weight, created_at FROM skill_reports WHERE skill_id = ? AND workspace_id = ? ORDER BY created_at ASC'
  ).all(skillId, workspaceId) as Array<{ outcome_value: number; quality_weight: number; created_at: number }>

  const now = Math.floor(Date.now() / 1000)
  let weightedAlpha = prior.alpha
  let weightedBeta = prior.beta
  let totalEffective = 0

  for (const r of reports) {
    const decay = recencyWeight(r.created_at, now)
    const w = r.quality_weight * decay
    weightedAlpha += r.outcome_value * w
    weightedBeta += (1 - r.outcome_value) * w
    totalEffective += w
  }

  const expectedSuccess = weightedAlpha / (weightedAlpha + weightedBeta)
  const confidence = probAboveThreshold(weightedAlpha, weightedBeta, TAU_USE)
  const lb90 = lower90Bound(weightedAlpha, weightedBeta)

  return {
    posterior_alpha: weightedAlpha,
    posterior_beta: weightedBeta,
    expected_success: expectedSuccess,
    confidence,
    lower90: lb90,
    effective_trials: totalEffective,
  }
}

/**
 * Resolve default outcome_value for a label.
 */
export function resolveOutcomeValue(outcome: OutcomeLabel): number {
  return OUTCOME_VALUES[outcome] ?? 0.5
}

// ---------------------------------------------------------------------------
// Lifecycle transitions
// ---------------------------------------------------------------------------

/**
 * Determine new status based on confidence and usage.
 * Draft -> Active: 2+ successes AND confidence >= 0.6
 * Active -> Deprecated: 3+ uses AND confidence < 0.3
 */
export function computeLifecycleStatus(
  currentStatus: SkillStatus,
  timesUsed: number,
  timesSucceeded: number,
  confidence: number,
): SkillStatus {
  if (currentStatus === 'draft') {
    if (timesSucceeded >= 2 && confidence >= 0.6) return 'active'
    return 'draft'
  }
  if (currentStatus === 'active') {
    if (timesUsed >= 3 && confidence < 0.3) return 'deprecated'
    return 'active'
  }
  return currentStatus
}

// ---------------------------------------------------------------------------
// Skill matching
// ---------------------------------------------------------------------------

/**
 * Find top-N matching skills for a task dispatch context.
 *
 * Scoring: confidence + role match bonus + keyword match bonus + title overlap.
 */
export function getMatchedSkills(
  workspaceId: number,
  opts: {
    agentRole?: string
    keywords?: string[]
    taskTitle?: string
    limit?: number
  },
): MatchedSkill[] {
  const db = getDatabase()
  const limit = opts.limit ?? 5

  const rows = db.prepare(
    `SELECT * FROM extracted_skills
     WHERE workspace_id = ? AND enabled = 1 AND status = 'active' AND confidence >= 0.4
     ORDER BY confidence DESC`
  ).all(workspaceId) as ExtractedSkill[]

  const scored: MatchedSkill[] = []

  for (const row of rows) {
    let score = row.confidence

    // Parse stored JSON
    const triggerKeywords = parseJsonArray(row.trigger_keywords as unknown as string)
    const steps = parseJsonArray(row.steps as unknown as string) as SkillStep[]

    // Role match bonus
    if (opts.agentRole) {
      const affinityTypes = ROLE_SKILL_AFFINITY[opts.agentRole.toLowerCase()] || []
      if (affinityTypes.includes(row.skill_type)) {
        score += 0.2
      }
    }

    // Keyword match bonus
    if (opts.keywords && opts.keywords.length > 0 && triggerKeywords.length > 0) {
      const kwLower = opts.keywords.map(k => k.toLowerCase())
      const matches = triggerKeywords.filter(tk =>
        kwLower.some(k => k.includes(String(tk).toLowerCase()) || String(tk).toLowerCase().includes(k))
      )
      if (triggerKeywords.length > 0) {
        score += 0.3 * (matches.length / triggerKeywords.length)
      }
    }

    // Title overlap bonus
    if (opts.taskTitle) {
      const titleWords = opts.taskTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2)
      const skillWords = row.title.toLowerCase().split(/\s+/).filter(w => w.length > 2)
      if (skillWords.length > 0) {
        const overlapping = skillWords.filter(sw => titleWords.some(tw => tw.includes(sw) || sw.includes(tw)))
        score += 0.1 * (overlapping.length / skillWords.length)
      }
    }

    scored.push({
      ...row,
      trigger_keywords: triggerKeywords as string[],
      steps,
      prerequisites: parseJsonArray(row.prerequisites as unknown as string) as string[],
      match_score: score,
    })
  }

  // Sort by score, deduplicate (prefer newer if supersedes)
  scored.sort((a, b) => b.match_score - a.match_score)

  const seen = new Set<number>()
  const result: MatchedSkill[] = []
  for (const skill of scored) {
    if (seen.has(skill.id)) continue
    if (skill.supersedes_skill_id && !seen.has(skill.supersedes_skill_id)) {
      seen.add(skill.supersedes_skill_id)
    }
    seen.add(skill.id)
    result.push(skill)
    if (result.length >= limit) break
  }

  return result
}

/**
 * Format matched skills as markdown for dispatch context injection.
 */
export function formatSkillsForDispatch(skills: MatchedSkill[]): string {
  if (skills.length === 0) return ''

  const blocks = skills.map((skill, i) => {
    const tier = getConfidenceTier(skill.confidence)
    const pct = Math.round(skill.confidence * 100)
    const stepsText = skill.steps
      .map((s, j) => {
        let line = `  ${j + 1}. ${s.action}`
        if (s.command) line += `\n     Command: \`${s.command}\``
        if (s.expected) line += `\n     Expected: ${s.expected}`
        if (s.fallback) line += `\n     Fallback: ${s.fallback}`
        return line
      })
      .join('\n')

    const prereqs = skill.prerequisites.length > 0
      ? `\n- Prerequisites: ${skill.prerequisites.join(', ')}`
      : ''

    return `### ${i + 1}. ${skill.title} [${skill.skill_type}] — ${pct}% confidence (${tier})${prereqs}
- Steps:
${stepsText}${skill.verification ? `\n- Verification: ${skill.verification}` : ''}`
  })

  return `## Relevant Skills from Prior Tasks\n\n${blocks.join('\n\n')}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
