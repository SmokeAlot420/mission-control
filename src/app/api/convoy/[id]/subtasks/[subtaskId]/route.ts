import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { handleSubtaskCompletion, handleSubtaskFailure } from '@/lib/convoy'
import { releasePort } from '@/lib/workspace-isolation'
import { logger } from '@/lib/logger'

interface RouteContext {
  params: Promise<{ id: string; subtaskId: string }>
}

/**
 * PATCH /api/convoy/[id]/subtasks/[subtaskId] - Update subtask status/fields
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { subtaskId } = await context.params
    const id = Number(subtaskId)
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()
    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)

    const subtask = db.prepare(
      'SELECT * FROM mc_convoy_subtasks WHERE id = ? AND workspace_id = ?'
    ).get(id, workspaceId) as any

    if (!subtask) {
      return NextResponse.json({ error: 'Subtask not found' }, { status: 404 })
    }

    // Handle status transitions
    if (body.status) {
      if (body.status === 'completed') {
        const result = handleSubtaskCompletion(id, workspaceId)
        releasePort(id, workspaceId)
        return NextResponse.json({
          success: true,
          newly_ready: result.newlyReady.map(s => s.id),
          convoy_completed: result.convoyCompleted,
        })
      }

      if (body.status === 'failed') {
        const result = handleSubtaskFailure(id, workspaceId, body.error_message)
        releasePort(id, workspaceId)
        return NextResponse.json({
          success: true,
          convoy_failed: result.convoyFailed,
        })
      }

      if (body.status === 'running') {
        db.prepare(
          'UPDATE mc_convoy_subtasks SET status = ?, started_at = ?, updated_at = ? WHERE id = ?'
        ).run('running', now, now, id)
      } else if (body.status === 'cancelled') {
        db.prepare(
          'UPDATE mc_convoy_subtasks SET status = ?, updated_at = ? WHERE id = ?'
        ).run('cancelled', now, id)
        releasePort(id, workspaceId)
      }
    }

    // Handle field updates
    const updates: string[] = ['updated_at = ?']
    const params: (string | number | null)[] = [now]

    if (body.assigned_agent_id !== undefined) { updates.push('assigned_agent_id = ?'); params.push(body.assigned_agent_id) }
    if (body.assigned_agent_name !== undefined) { updates.push('assigned_agent_name = ?'); params.push(body.assigned_agent_name) }
    if (body.error_message !== undefined) { updates.push('error_message = ?'); params.push(body.error_message) }
    if (body.worktree_branch !== undefined) { updates.push('worktree_branch = ?'); params.push(body.worktree_branch) }
    if (body.merge_commit !== undefined) { updates.push('merge_commit = ?'); params.push(body.merge_commit) }

    if (updates.length > 1) {
      params.push(id, workspaceId)
      db.prepare(
        `UPDATE mc_convoy_subtasks SET ${updates.join(', ')} WHERE id = ? AND workspace_id = ?`
      ).run(...params)
    }

    const updated = db.prepare('SELECT * FROM mc_convoy_subtasks WHERE id = ?').get(id)
    return NextResponse.json({ subtask: updated })
  } catch (error: any) {
    logger.error({ err: error }, 'PATCH subtask error')
    return NextResponse.json({ error: error.message || 'Failed to update subtask' }, { status: 500 })
  }
}
