import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { addSubtasks, getConvoy } from '@/lib/convoy'
import { logger } from '@/lib/logger'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/convoy/[id]/subtasks - Add subtasks to an existing convoy
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id } = await context.params
    const convoyId = Number(id)
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()

    if (!Array.isArray(body.subtasks) || body.subtasks.length === 0) {
      return NextResponse.json({ error: 'subtasks array is required' }, { status: 400 })
    }

    // Verify convoy exists
    const convoy = getConvoy(convoyId, workspaceId)
    if (!convoy) {
      return NextResponse.json({ error: 'Convoy not found' }, { status: 404 })
    }

    const subtasks = addSubtasks(convoyId, workspaceId, body.subtasks)
    return NextResponse.json({ subtasks }, { status: 201 })
  } catch (error: any) {
    logger.error({ err: error }, 'POST /api/convoy/[id]/subtasks error')
    if (error.message?.includes('cycle')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to add subtasks' }, { status: 500 })
  }
}
