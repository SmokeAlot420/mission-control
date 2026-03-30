import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { listConvoys, createConvoy } from '@/lib/convoy'
import { logger } from '@/lib/logger'

/**
 * GET /api/convoy - List convoys for the workspace
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const workspaceId = auth.user.workspace_id ?? 1
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as any
    const convoys = listConvoys(workspaceId, status || undefined)
    return NextResponse.json({ convoys })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/convoy error')
    return NextResponse.json({ error: 'Failed to list convoys' }, { status: 500 })
  }
}

/**
 * POST /api/convoy - Create a new convoy
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()

    if (!body.title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const convoy = createConvoy({
      title: body.title,
      description: body.description,
      created_by: auth.user.username,
      base_branch: body.base_branch,
      repo_path: body.repo_path,
      merge_strategy: body.merge_strategy,
      decomposition_mode: body.decomposition_mode,
      subtasks: body.subtasks,
    }, workspaceId)

    return NextResponse.json({ convoy }, { status: 201 })
  } catch (error: any) {
    logger.error({ err: error }, 'POST /api/convoy error')
    if (error.message?.includes('cycle')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create convoy' }, { status: 500 })
  }
}
