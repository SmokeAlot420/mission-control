import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getMatchedSkills, formatSkillsForDispatch } from '@/lib/skill-confidence'

/**
 * GET /api/skills/inject — Get top-N matched skills formatted for dispatch context.
 *
 * Query params:
 *   agent_role  — filter by role affinity
 *   keywords    — comma-separated trigger keywords
 *   task_title  — task title for overlap matching
 *   limit       — max skills to return (default 5)
 *   format      — "markdown" (default) or "json"
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const workspaceId = auth.user.workspace_id

  const agentRole = searchParams.get('agent_role') ?? undefined
  const keywordsRaw = searchParams.get('keywords') ?? ''
  const keywords = keywordsRaw ? keywordsRaw.split(',').map(k => k.trim()).filter(Boolean) : undefined
  const taskTitle = searchParams.get('task_title') ?? undefined
  const limit = searchParams.has('limit') ? Math.min(Number(searchParams.get('limit')) || 5, 20) : 5
  const format = searchParams.get('format') ?? 'markdown'

  const matched = getMatchedSkills(workspaceId, {
    agentRole,
    keywords,
    taskTitle,
    limit,
  })

  if (format === 'json') {
    return NextResponse.json({
      skills: matched,
      count: matched.length,
    })
  }

  const markdown = formatSkillsForDispatch(matched)
  return NextResponse.json({
    markdown,
    count: matched.length,
  })
}

export const dynamic = 'force-dynamic'
