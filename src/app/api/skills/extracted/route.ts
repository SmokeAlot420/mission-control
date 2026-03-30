import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  listExtractedSkills,
  createExtractedSkill,
  buildExtractionPrompt,
  parseAndPersistExtraction,
} from '@/lib/skill-extraction'
import type { SkillType, SkillStep } from '@/lib/skill-confidence'

/**
 * GET /api/skills/extracted — List extracted skills for the authenticated workspace.
 * Query params: status, skill_type, enabled, limit, offset
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const workspaceId = auth.user.workspace_id

  const result = listExtractedSkills(workspaceId, {
    status: searchParams.get('status') ?? undefined,
    skill_type: searchParams.get('skill_type') ?? undefined,
    enabled: searchParams.has('enabled') ? searchParams.get('enabled') === 'true' : undefined,
    limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : undefined,
    offset: searchParams.has('offset') ? Number(searchParams.get('offset')) : undefined,
  })

  return NextResponse.json(result)
}

/**
 * POST /api/skills/extracted — Create an extracted skill or parse LLM extraction.
 *
 * Body modes:
 *   1. Direct creation: { title, skill_type, steps, ... }
 *   2. LLM extraction parse: { mode: "parse", raw_json, source_task_id, agent_name?, agent_role? }
 *   3. Extraction prompt: { mode: "prompt", task_title, task_description?, activities? }
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const workspaceId = auth.user.workspace_id
  const body = await request.json().catch(() => ({}))

  // Mode: generate extraction prompt
  if (body.mode === 'prompt') {
    const prompt = buildExtractionPrompt({
      title: body.task_title ?? '',
      description: body.task_description,
      outcome: body.outcome,
      activities: Array.isArray(body.activities) ? body.activities : undefined,
    })
    return NextResponse.json({ prompt })
  }

  // Mode: parse LLM extraction response
  if (body.mode === 'parse') {
    if (typeof body.raw_json !== 'string') {
      return NextResponse.json({ error: 'raw_json is required' }, { status: 400 })
    }
    const skills = parseAndPersistExtraction(
      body.raw_json,
      workspaceId,
      typeof body.source_task_id === 'number' ? body.source_task_id : 0,
      typeof body.agent_name === 'string' ? body.agent_name : undefined,
      typeof body.agent_role === 'string' ? body.agent_role : undefined,
    )
    return NextResponse.json({ skills, count: skills.length })
  }

  // Mode: direct creation
  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!body.steps || !Array.isArray(body.steps) || body.steps.length === 0) {
    return NextResponse.json({ error: 'steps array is required and must not be empty' }, { status: 400 })
  }

  const validTypes = new Set(['build', 'deploy', 'test', 'fix', 'config', 'pattern'])
  const skillType: SkillType = validTypes.has(body.skill_type) ? body.skill_type : 'pattern'

  const skill = createExtractedSkill({
    workspace_id: workspaceId,
    title: body.title.slice(0, 200),
    description: typeof body.description === 'string' ? body.description : undefined,
    skill_type: skillType,
    trigger_keywords: Array.isArray(body.trigger_keywords) ? body.trigger_keywords.filter((k: unknown) => typeof k === 'string') : undefined,
    prerequisites: Array.isArray(body.prerequisites) ? body.prerequisites.filter((p: unknown) => typeof p === 'string') : undefined,
    steps: (body.steps as SkillStep[]).filter((s: SkillStep) => s && typeof s.action === 'string'),
    verification: typeof body.verification === 'string' ? body.verification : undefined,
    conditions: typeof body.conditions === 'string' ? body.conditions : undefined,
    source_task_id: typeof body.source_task_id === 'number' ? body.source_task_id : undefined,
    created_by_agent: typeof body.created_by_agent === 'string' ? body.created_by_agent : undefined,
    agent_role: typeof body.agent_role === 'string' ? body.agent_role : undefined,
    supersedes_skill_id: typeof body.supersedes_skill_id === 'number' ? body.supersedes_skill_id : undefined,
  })

  return NextResponse.json({ skill }, { status: 201 })
}

export const dynamic = 'force-dynamic'
