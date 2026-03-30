import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  getExtractedSkill,
  updateExtractedSkill,
  deleteExtractedSkill,
} from '@/lib/skill-extraction'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/skills/extracted/[id] — Get a single extracted skill.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: idStr } = await context.params
  const id = Number(idStr)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid skill ID' }, { status: 400 })
  }

  const skill = getExtractedSkill(id, auth.user.workspace_id)
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  return NextResponse.json({ skill })
}

/**
 * PATCH /api/skills/extracted/[id] — Update an extracted skill.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: idStr } = await context.params
  const id = Number(idStr)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid skill ID' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const skill = updateExtractedSkill(id, auth.user.workspace_id, body)
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  return NextResponse.json({ skill })
}

/**
 * DELETE /api/skills/extracted/[id] — Delete an extracted skill.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: idStr } = await context.params
  const id = Number(idStr)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid skill ID' }, { status: 400 })
  }

  const deleted = deleteExtractedSkill(id, auth.user.workspace_id)
  if (!deleted) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
