import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { handleSubtaskCompletion, handleSubtaskFailure, getReadySubtasks, dispatchSubtask } from '@/lib/convoy'
import { releasePort } from '@/lib/workspace-isolation'
import { verifyWebhookSignature } from '@/lib/webhooks'
import { logger } from '@/lib/logger'
import { createHash } from 'crypto'

const CONVOY_WEBHOOK_SECRET = process.env.CONVOY_WEBHOOK_SECRET || ''

/**
 * POST /api/webhooks/convoy - Agent self-report webhook
 *
 * Agents call this to report subtask progress/completion.
 * Implements: immutable webhook receipt BEFORE state mutation.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()

    // Verify HMAC if secret is configured
    if (CONVOY_WEBHOOK_SECRET) {
      const signature = request.headers.get('X-MC-Signature')
      if (!verifyWebhookSignature(CONVOY_WEBHOOK_SECRET, rawBody, signature)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const body = JSON.parse(rawBody)
    const { event_type, subtask_id, convoy_id, workspace_id, payload } = body

    if (!event_type || !subtask_id) {
      return NextResponse.json({ error: 'event_type and subtask_id are required' }, { status: 400 })
    }

    const db = getDatabase()
    const resolvedWorkspaceId = workspace_id ?? 1

    // Generate idempotency key from event content
    const idempotencyKey = createHash('sha256')
      .update(`${event_type}:${subtask_id}:${JSON.stringify(payload || {})}`)
      .digest('hex')

    // Step 1: Atomic idempotent receipt — INSERT OR IGNORE + check if we won the insert
    const receiptResult = db.prepare(`
      INSERT OR IGNORE INTO mc_paperclip_webhook_receipts (workspace_id, event_type, payload, paperclip_issue_id, convoy_id, subtask_id, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      resolvedWorkspaceId,
      event_type,
      rawBody,
      body.paperclip_issue_id ?? null,
      convoy_id ?? null,
      subtask_id,
      idempotencyKey,
    )

    if (receiptResult.changes === 0) {
      // Another request already inserted this receipt — idempotent return
      const existing = db.prepare(
        'SELECT id FROM mc_paperclip_webhook_receipts WHERE idempotency_key = ?'
      ).get(idempotencyKey) as { id: number }
      return NextResponse.json({ status: 'already_processed', receipt_id: existing.id })
    }
    const receiptId = Number(receiptResult.lastInsertRowid)

    // Step 2: Process the event (state mutation)
    try {
      switch (event_type) {
        case 'subtask.completed': {
          const result = handleSubtaskCompletion(subtask_id, resolvedWorkspaceId)
          releasePort(subtask_id, resolvedWorkspaceId)

          // Auto-dispatch newly ready subtasks
          if (result.newlyReady.length > 0 && !result.convoyCompleted) {
            for (const ready of result.newlyReady) {
              try {
                dispatchSubtask(ready.id, resolvedWorkspaceId)
              } catch (err) {
                logger.warn({ err, subtaskId: ready.id }, 'Auto-dispatch failed for newly ready subtask')
              }
            }
          }
          break
        }

        case 'subtask.failed': {
          handleSubtaskFailure(subtask_id, resolvedWorkspaceId, payload?.error_message)
          releasePort(subtask_id, resolvedWorkspaceId)
          break
        }

        case 'subtask.started': {
          const now = Math.floor(Date.now() / 1000)
          db.prepare(
            "UPDATE mc_convoy_subtasks SET status = 'running', started_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?"
          ).run(now, now, subtask_id, resolvedWorkspaceId)
          break
        }

        case 'subtask.stalled': {
          const now = Math.floor(Date.now() / 1000)
          db.prepare(
            "UPDATE mc_convoy_subtasks SET status = 'stalled', stall_detected_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?"
          ).run(now, now, subtask_id, resolvedWorkspaceId)
          break
        }

        default:
          logger.warn({ event_type }, 'Unknown convoy webhook event type')
      }

      // Mark receipt as processed
      db.prepare(
        'UPDATE mc_paperclip_webhook_receipts SET processed_at = ? WHERE id = ?'
      ).run(Math.floor(Date.now() / 1000), receiptId)

    } catch (processErr) {
      logger.error({ err: processErr, receiptId }, 'Failed to process convoy webhook event')
      return NextResponse.json({ error: 'Processing failed', receipt_id: receiptId }, { status: 500 })
    }

    return NextResponse.json({ status: 'processed', receipt_id: receiptId })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/webhooks/convoy error')
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
