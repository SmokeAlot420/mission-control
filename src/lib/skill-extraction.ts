/**
 * Skill Extraction — Pipeline for extracting reusable skills from completed tasks.
 *
 * Inspired by AutoResearch (Karpathy): after a task completes successfully,
 * analyze what was done and extract 0-3 reusable skill playbooks.
 *
 * Two modes:
 *   1. Manual: operator creates skills via API with structured data
 *   2. Prompt-based: buildExtractionPrompt() generates a prompt for external LLM
 *      use; parseExtractionResponse() validates and persists the result
 */

import { getDatabase } from './db'
import { eventBus } from './event-bus'
import {
  recomputeConfidence,
  resolveOutcomeValue,
  computeLifecycleStatus,
  type SkillType,
  type SkillStep,
  type OutcomeLabel,
  type ExtractedSkill,
} from './skill-confidence'
import { logger } from './logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateSkillInput {
  workspace_id: number
  title: string
  description?: string
  skill_type: SkillType
  trigger_keywords?: string[]
  prerequisites?: string[]
  steps: SkillStep[]
  verification?: string
  conditions?: string
  source_task_id?: number
  created_by_agent?: string
  agent_role?: string
  supersedes_skill_id?: number
}

export interface ReportOutcomeInput {
  workspace_id: number
  skill_id: number
  task_id?: number
  outcome: OutcomeLabel
  outcome_value?: number
  quality_weight?: number
  report_source?: string
  notes?: string
  reported_by?: string
}

interface LLMExtractedSkill {
  title: string
  skill_type: string
  trigger_keywords: string[]
  prerequisites: string[]
  steps: Array<{ action: string; command?: string; expected?: string; fallback?: string }>
  verification?: string
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function createExtractedSkill(input: CreateSkillInput): ExtractedSkill {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  const result = db.prepare(`
    INSERT INTO extracted_skills (
      workspace_id, title, description, skill_type,
      trigger_keywords, prerequisites, steps, verification, conditions,
      source_task_id, created_by_agent, agent_role, supersedes_skill_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.workspace_id,
    input.title,
    input.description ?? null,
    input.skill_type,
    JSON.stringify(input.trigger_keywords ?? []),
    JSON.stringify(input.prerequisites ?? []),
    JSON.stringify(input.steps),
    input.verification ?? null,
    input.conditions ?? null,
    input.source_task_id ?? null,
    input.created_by_agent ?? null,
    input.agent_role ?? null,
    input.supersedes_skill_id ?? null,
    now,
    now,
  )

  const skill = db.prepare(
    'SELECT * FROM extracted_skills WHERE id = ?'
  ).get(result.lastInsertRowid) as ExtractedSkill

  eventBus.broadcast('skill.created', {
    id: skill.id,
    title: skill.title,
    skill_type: skill.skill_type,
    workspace_id: skill.workspace_id,
  })

  return skill
}

export function getExtractedSkill(id: number, workspaceId: number): ExtractedSkill | null {
  const db = getDatabase()
  return (db.prepare(
    'SELECT * FROM extracted_skills WHERE id = ? AND workspace_id = ?'
  ).get(id, workspaceId) as ExtractedSkill | undefined) ?? null
}

export function listExtractedSkills(workspaceId: number, opts?: {
  status?: string
  skill_type?: string
  enabled?: boolean
  limit?: number
  offset?: number
}): { skills: ExtractedSkill[]; total: number } {
  const db = getDatabase()
  const conditions = ['workspace_id = ?']
  const params: (string | number)[] = [workspaceId]

  if (opts?.status) {
    conditions.push('status = ?')
    params.push(opts.status)
  }
  if (opts?.skill_type) {
    conditions.push('skill_type = ?')
    params.push(opts.skill_type)
  }
  if (opts?.enabled !== undefined) {
    conditions.push('enabled = ?')
    params.push(opts.enabled ? 1 : 0)
  }

  const where = conditions.join(' AND ')
  const total = (db.prepare(
    `SELECT COUNT(*) as count FROM extracted_skills WHERE ${where}`
  ).get(...params) as { count: number }).count

  const limit = opts?.limit ?? 50
  const offset = opts?.offset ?? 0
  const skills = db.prepare(
    `SELECT * FROM extracted_skills WHERE ${where} ORDER BY confidence DESC, updated_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as ExtractedSkill[]

  return { skills, total }
}

export function updateExtractedSkill(
  id: number,
  workspaceId: number,
  updates: Partial<Pick<ExtractedSkill, 'title' | 'description' | 'skill_type' | 'verification' | 'conditions' | 'status' | 'enabled'>> & {
    trigger_keywords?: string[]
    prerequisites?: string[]
    steps?: SkillStep[]
  },
): ExtractedSkill | null {
  const db = getDatabase()
  const existing = getExtractedSkill(id, workspaceId)
  if (!existing) return null

  const sets: string[] = []
  const params: (string | number | null)[] = []

  if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title) }
  if (updates.description !== undefined) { sets.push('description = ?'); params.push(updates.description) }
  if (updates.skill_type !== undefined) { sets.push('skill_type = ?'); params.push(updates.skill_type) }
  if (updates.verification !== undefined) { sets.push('verification = ?'); params.push(updates.verification) }
  if (updates.conditions !== undefined) { sets.push('conditions = ?'); params.push(updates.conditions) }
  if (updates.status !== undefined) { sets.push('status = ?'); params.push(updates.status) }
  if (updates.enabled !== undefined) { sets.push('enabled = ?'); params.push(updates.enabled ? 1 : 0) }
  if (updates.trigger_keywords !== undefined) { sets.push('trigger_keywords = ?'); params.push(JSON.stringify(updates.trigger_keywords)) }
  if (updates.prerequisites !== undefined) { sets.push('prerequisites = ?'); params.push(JSON.stringify(updates.prerequisites)) }
  if (updates.steps !== undefined) { sets.push('steps = ?'); params.push(JSON.stringify(updates.steps)) }

  if (sets.length === 0) return existing

  sets.push('updated_at = ?')
  params.push(Math.floor(Date.now() / 1000))
  params.push(id, workspaceId)

  db.prepare(
    `UPDATE extracted_skills SET ${sets.join(', ')} WHERE id = ? AND workspace_id = ?`
  ).run(...params)

  const updated = getExtractedSkill(id, workspaceId)
  if (updated) {
    eventBus.broadcast('skill.updated', {
      id: updated.id,
      title: updated.title,
      workspace_id: updated.workspace_id,
    })
  }
  return updated
}

export function deleteExtractedSkill(id: number, workspaceId: number): boolean {
  const db = getDatabase()
  const result = db.prepare(
    'DELETE FROM extracted_skills WHERE id = ? AND workspace_id = ?'
  ).run(id, workspaceId)
  if (result.changes > 0) {
    eventBus.broadcast('skill.deleted', { id, workspace_id: workspaceId })
  }
  return result.changes > 0
}

// ---------------------------------------------------------------------------
// Outcome reporting
// ---------------------------------------------------------------------------

export function reportOutcome(input: ReportOutcomeInput): { report_id: number; skill: ExtractedSkill | null } {
  const db = getDatabase()
  const skill = getExtractedSkill(input.skill_id, input.workspace_id)
  if (!skill) return { report_id: -1, skill: null }

  const outcomeValue = input.outcome_value ?? resolveOutcomeValue(input.outcome)
  const qualityWeight = input.quality_weight ?? 0.35
  const now = Math.floor(Date.now() / 1000)

  const result = db.prepare(`
    INSERT INTO skill_reports (
      workspace_id, skill_id, task_id, outcome, outcome_value,
      quality_weight, report_source, notes, reported_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.workspace_id,
    input.skill_id,
    input.task_id ?? null,
    input.outcome,
    outcomeValue,
    qualityWeight,
    input.report_source ?? 'origin_task',
    input.notes ?? null,
    input.reported_by ?? 'system',
    now,
  )

  // Update counters
  const isSuccess = outcomeValue >= 0.5
  db.prepare(`
    UPDATE extracted_skills SET
      times_used = times_used + 1,
      times_succeeded = times_succeeded + ${isSuccess ? 1 : 0},
      times_failed = times_failed + ${isSuccess ? 0 : 1},
      last_reported_at = ?,
      last_used_at = ?,
      updated_at = ?
    WHERE id = ? AND workspace_id = ?
  `).run(now, now, now, input.skill_id, input.workspace_id)

  // Recompute Bayesian confidence
  const update = recomputeConfidence(
    input.skill_id,
    input.workspace_id,
    skill.agent_role,
    skill.skill_type,
  )

  // Determine lifecycle transition
  const newTimesUsed = skill.times_used + 1
  const newTimesSucceeded = skill.times_succeeded + (isSuccess ? 1 : 0)
  const newStatus = computeLifecycleStatus(
    skill.status,
    newTimesUsed,
    newTimesSucceeded,
    update.confidence,
  )

  db.prepare(`
    UPDATE extracted_skills SET
      posterior_alpha = ?, posterior_beta = ?,
      expected_success = ?, confidence = ?,
      lower90 = ?, effective_trials = ?,
      status = ?, updated_at = ?
    WHERE id = ? AND workspace_id = ?
  `).run(
    update.posterior_alpha,
    update.posterior_beta,
    update.expected_success,
    update.confidence,
    update.lower90,
    update.effective_trials,
    newStatus,
    now,
    input.skill_id,
    input.workspace_id,
  )

  const updated = getExtractedSkill(input.skill_id, input.workspace_id)

  eventBus.broadcast('skill.reported', {
    skill_id: input.skill_id,
    outcome: input.outcome,
    confidence: update.confidence,
    status: newStatus,
    workspace_id: input.workspace_id,
  })

  return { report_id: Number(result.lastInsertRowid), skill: updated }
}

// ---------------------------------------------------------------------------
// LLM extraction prompt
// ---------------------------------------------------------------------------

const VALID_SKILL_TYPES = new Set(['build', 'deploy', 'test', 'fix', 'config', 'pattern'])

/**
 * Build a prompt for an LLM to extract reusable skills from a completed task.
 * The caller is responsible for sending this to the LLM and parsing the response.
 */
export function buildExtractionPrompt(task: {
  title: string
  description?: string
  outcome?: string
  activities?: string[]
}): string {
  const activityBlock = task.activities && task.activities.length > 0
    ? `\n\nActivity log:\n${task.activities.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
    : ''

  return `Analyze this completed task and extract 0-3 reusable skill playbooks.

Task: ${task.title}
${task.description ? `Description: ${task.description}` : ''}
Outcome: ${task.outcome || 'success'}${activityBlock}

For each skill, return a JSON array with objects containing:
- title (string): short, descriptive name
- skill_type (string): one of "build", "deploy", "test", "fix", "config", "pattern"
- trigger_keywords (string[]): 3-5 keywords that would indicate this skill is relevant
- prerequisites (string[]): what must be true before applying this skill
- steps (array of objects): each with "action" (required), "command" (optional), "expected" (optional), "fallback" (optional)
- verification (string): how to verify the skill was applied correctly

Return ONLY a JSON array. If no reusable skills can be extracted, return [].`
}

/**
 * Parse and validate an LLM extraction response, persisting valid skills.
 */
export function parseAndPersistExtraction(
  rawJson: string,
  workspaceId: number,
  sourceTaskId: number,
  agentName?: string,
  agentRole?: string,
): ExtractedSkill[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    logger.warn({ rawJson: rawJson.slice(0, 200) }, 'Skill extraction: invalid JSON response')
    return []
  }

  if (!Array.isArray(parsed)) return []

  const skills: ExtractedSkill[] = []
  const items = parsed.slice(0, 3) as LLMExtractedSkill[]

  for (const item of items) {
    if (!item.title || typeof item.title !== 'string') continue
    if (!item.steps || !Array.isArray(item.steps) || item.steps.length === 0) continue

    const skillType = VALID_SKILL_TYPES.has(item.skill_type)
      ? (item.skill_type as SkillType)
      : 'pattern'

    try {
      const skill = createExtractedSkill({
        workspace_id: workspaceId,
        title: item.title.slice(0, 200),
        skill_type: skillType,
        trigger_keywords: Array.isArray(item.trigger_keywords)
          ? item.trigger_keywords.filter(k => typeof k === 'string').slice(0, 10)
          : [],
        prerequisites: Array.isArray(item.prerequisites)
          ? item.prerequisites.filter(p => typeof p === 'string').slice(0, 10)
          : [],
        steps: item.steps
          .filter(s => s && typeof s.action === 'string')
          .slice(0, 20)
          .map(s => ({
            action: s.action,
            command: typeof s.command === 'string' ? s.command : undefined,
            expected: typeof s.expected === 'string' ? s.expected : undefined,
            fallback: typeof s.fallback === 'string' ? s.fallback : undefined,
          })),
        verification: typeof item.verification === 'string' ? item.verification : undefined,
        source_task_id: sourceTaskId,
        created_by_agent: agentName,
        agent_role: agentRole,
      })
      skills.push(skill)
    } catch (err) {
      logger.warn({ err, title: item.title }, 'Skill extraction: failed to persist skill')
    }
  }

  return skills
}
