import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getConvoy, getReadySubtasks, dispatchSubtask } from '@/lib/convoy'
import { allocatePort, buildWorktreeInstructions } from '@/lib/workspace-isolation'
import { logger } from '@/lib/logger'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/convoy/[id]/dispatch - Dispatch all ready subtasks
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id } = await context.params
    const convoyId = Number(id)
    const workspaceId = auth.user.workspace_id ?? 1

    const convoy = getConvoy(convoyId, workspaceId)
    if (!convoy) {
      return NextResponse.json({ error: 'Convoy not found' }, { status: 404 })
    }

    if (convoy.status === 'paused' || convoy.status === 'cancelled') {
      return NextResponse.json({ error: `Cannot dispatch: convoy is ${convoy.status}` }, { status: 400 })
    }

    const ready = getReadySubtasks(convoyId)
    if (ready.length === 0) {
      return NextResponse.json({ dispatched: [], message: 'No subtasks ready for dispatch' })
    }

    const dispatched: { subtask_id: number; port: number | null; instructions: string | null }[] = []

    for (const subtask of ready) {
      try {
        // Allocate port
        let port: number | null = null
        try {
          port = allocatePort(subtask.id, convoyId, workspaceId)
        } catch (portErr: any) {
          logger.warn({ err: portErr, subtaskId: subtask.id }, 'Port allocation failed, dispatching without port')
        }

        // Build worktree instructions
        const instructions = buildWorktreeInstructions(subtask, convoy.base_branch, convoy.repo_path)

        // Dispatch (mark as dispatched with idempotent attempt key)
        dispatchSubtask(subtask.id, workspaceId)

        dispatched.push({ subtask_id: subtask.id, port, instructions })
      } catch (err: any) {
        logger.error({ err, subtaskId: subtask.id }, 'Failed to dispatch subtask')
      }
    }

    return NextResponse.json({ dispatched, total: dispatched.length })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/convoy/[id]/dispatch error')
    return NextResponse.json({ error: 'Failed to dispatch subtasks' }, { status: 500 })
  }
}
