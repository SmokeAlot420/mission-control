import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { reportOutcome } from '@/lib/skill-extraction'
import type { OutcomeLabel } from '@/lib/skill-confidence'

interface RouteContext {
  params: Promise<{ id: string }>
}

const VALID_OUTCOMES = new Set(['success', 'minor_fix', 'partial', 'weak_partial', 'failure'])

/**
 * POST /api/skills/extracted/[id]/report — Report an outcome for a skill usage.
 * Updates Bayesian confidence and lifecycle status.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: idStr } = await context.params
  const skillId = Number(idStr)
  if (!Number.isFinite(skillId) || skillId <= 0) {
    return NextResponse.json({ error: 'Invalid skill ID' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const outcome = body.outcome as string
  if (!outcome || !VALID_OUTCOMES.has(outcome)) {
    return NextResponse.json({
      error: `outcome must be one of: ${[...VALID_OUTCOMES].join(', ')}`,
    }, { status: 400 })
  }

  const result = reportOutcome({
    workspace_id: auth.user.workspace_id,
    skill_id: skillId,
    task_id: typeof body.task_id === 'number' ? body.task_id : undefined,
    outcome: outcome as OutcomeLabel,
    outcome_value: typeof body.outcome_value === 'number' ? body.outcome_value : undefined,
    quality_weight: typeof body.quality_weight === 'number' ? body.quality_weight : undefined,
    report_source: typeof body.report_source === 'string' ? body.report_source : undefined,
    notes: typeof body.notes === 'string' ? body.notes : undefined,
    reported_by: auth.user.username,
  })

  if (!result.skill) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
  }

  return NextResponse.json({
    report_id: result.report_id,
    skill: result.skill,
  })
}

export const dynamic = 'force-dynamic'
