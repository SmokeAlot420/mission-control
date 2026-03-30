import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getConvoy, updateConvoyStatus, deleteConvoy } from '@/lib/convoy'
import { logger } from '@/lib/logger'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/convoy/[id] - Get convoy detail with subtasks and edges
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id } = await context.params
    const workspaceId = auth.user.workspace_id ?? 1
    const convoy = getConvoy(Number(id), workspaceId)

    if (!convoy) {
      return NextResponse.json({ error: 'Convoy not found' }, { status: 404 })
    }

    return NextResponse.json({ convoy })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/convoy/[id] error')
    return NextResponse.json({ error: 'Failed to fetch convoy' }, { status: 500 })
  }
}

/**
 * PATCH /api/convoy/[id] - Update convoy status (pause, resume, cancel)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id } = await context.params
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()

    if (!body.status) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 })
    }

    const convoy = updateConvoyStatus(Number(id), workspaceId, body.status)
    return NextResponse.json({ convoy })
  } catch (error: any) {
    logger.error({ err: error }, 'PATCH /api/convoy/[id] error')
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error.message?.includes('Cannot transition')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to update convoy' }, { status: 500 })
  }
}

/**
 * DELETE /api/convoy/[id] - Delete a convoy
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id } = await context.params
    const workspaceId = auth.user.workspace_id ?? 1
    deleteConvoy(Number(id), workspaceId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error({ err: error }, 'DELETE /api/convoy/[id] error')
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to delete convoy' }, { status: 500 })
  }
}
