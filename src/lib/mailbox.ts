import { getDatabase } from './db'
import { eventBus } from './event-bus'
import { randomUUID } from 'crypto'

// ── Types ──────────────────────────────────────────────────────────────────

export type MessageType =
  | 'command' | 'approval_request' | 'clarification'
  | 'exception' | 'handoff' | 'interrupt' | 'cancel'
  | 'result' | 'status' | 'message'

export type DeliveryStatus = 'pending' | 'seen' | 'claimed' | 'acked' | 'nacked' | 'expired' | 'dead_lettered'

export interface AgentMessage {
  id: number
  workspace_id: number
  convoy_id: number | null
  thread_id: number | null
  correlation_id: string | null
  causation_id: string | null
  reply_to_message_id: number | null
  from_agent: string
  message_type: MessageType
  subject: string | null
  body: string
  artifact_refs: string | null
  dedupe_key: string | null
  created_at: number
}

export interface AgentDelivery {
  id: number
  workspace_id: number
  message_id: number
  recipient_agent: string
  status: DeliveryStatus
  claim_token: string | null
  claimed_at: number | null
  acked_at: number | null
  created_at: number
}

export interface MessageWithDeliveries extends AgentMessage {
  deliveries: AgentDelivery[]
}

export interface SendMessageInput {
  convoy_id?: number
  thread_id?: number
  correlation_id?: string
  causation_id?: string
  reply_to_message_id?: number
  from_agent: string
  recipients: string[]
  message_type?: MessageType
  subject?: string
  body: string
  artifact_refs?: Record<string, unknown>
  dedupe_key?: string
}

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Send a message to one or more agents. Creates the immutable message
 * and per-recipient delivery records. Broadcasts a mailbox event.
 */
export function sendMessage(input: SendMessageInput, workspaceId: number): AgentMessage {
  const db = getDatabase()

  if (!input.recipients.length) {
    throw new Error('At least one recipient is required')
  }

  return db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO agent_messages (workspace_id, convoy_id, thread_id, correlation_id, causation_id, reply_to_message_id, from_agent, message_type, subject, body, artifact_refs, dedupe_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workspaceId,
      input.convoy_id ?? null,
      input.thread_id ?? null,
      input.correlation_id ?? null,
      input.causation_id ?? null,
      input.reply_to_message_id ?? null,
      input.from_agent,
      input.message_type ?? 'message',
      input.subject ?? null,
      input.body,
      input.artifact_refs ? JSON.stringify(input.artifact_refs) : null,
      input.dedupe_key ?? null,
    )

    const messageId = Number(result.lastInsertRowid)

    const insertDelivery = db.prepare(`
      INSERT INTO agent_deliveries (workspace_id, message_id, recipient_agent)
      VALUES (?, ?, ?)
    `)

    for (const recipient of input.recipients) {
      insertDelivery.run(workspaceId, messageId, recipient)
    }

    const message = db.prepare('SELECT * FROM agent_messages WHERE id = ?').get(messageId) as AgentMessage

    eventBus.broadcast('convoy.mail_received', {
      message_id: messageId,
      convoy_id: input.convoy_id,
      from: input.from_agent,
      recipients: input.recipients,
    })

    return message
  })()
}

/**
 * Claim pending deliveries for an agent. Uses a claim token for exactly-once processing.
 */
export function claimDeliveries(agentId: string, workspaceId: number, convoyId?: number, limit: number = 10): MessageWithDeliveries[] {
  const db = getDatabase()
  const claimToken = randomUUID()
  const now = Math.floor(Date.now() / 1000)

  let deliveryQuery = `
    SELECT d.id as delivery_id, d.message_id
    FROM agent_deliveries d
    JOIN agent_messages m ON m.id = d.message_id
    WHERE d.workspace_id = ? AND d.recipient_agent = ? AND d.status = 'pending'
  `
  const params: (string | number)[] = [workspaceId, agentId]

  if (convoyId !== undefined) {
    deliveryQuery += ' AND m.convoy_id = ?'
    params.push(convoyId)
  }
  deliveryQuery += ' ORDER BY m.created_at ASC LIMIT ?'
  params.push(limit)

  return db.transaction(() => {
    const pending = db.prepare(deliveryQuery).all(...params) as { delivery_id: number; message_id: number }[]

    if (pending.length === 0) return []

    // Claim deliveries
    const claimStmt = db.prepare(`
      UPDATE agent_deliveries SET status = 'claimed', claim_token = ?, claimed_at = ?
      WHERE id = ? AND status = 'pending'
    `)
    for (const d of pending) {
      claimStmt.run(claimToken, now, d.delivery_id)
    }

    // Fetch full messages with deliveries
    const messageIds = [...new Set(pending.map(d => d.message_id))]
    const messages: MessageWithDeliveries[] = []
    for (const msgId of messageIds) {
      const msg = db.prepare('SELECT * FROM agent_messages WHERE id = ?').get(msgId) as AgentMessage
      const deliveries = db.prepare('SELECT * FROM agent_deliveries WHERE message_id = ?').all(msgId) as AgentDelivery[]
      messages.push({ ...msg, deliveries })
    }

    return messages
  })()
}

/**
 * Acknowledge a delivery.
 */
export function ackDelivery(deliveryId: number, workspaceId: number): void {
  const db = getDatabase()
  db.prepare(`
    UPDATE agent_deliveries SET status = 'acked', acked_at = ?
    WHERE id = ? AND workspace_id = ?
  `).run(Math.floor(Date.now() / 1000), deliveryId, workspaceId)
}

/**
 * Get all messages for a convoy, ordered by time.
 */
export function getConvoyMessages(convoyId: number, workspaceId: number): MessageWithDeliveries[] {
  const db = getDatabase()
  const messages = db.prepare(`
    SELECT * FROM agent_messages
    WHERE convoy_id = ? AND workspace_id = ?
    ORDER BY created_at ASC
  `).all(convoyId, workspaceId) as AgentMessage[]

  return messages.map(msg => {
    const deliveries = db.prepare(
      'SELECT * FROM agent_deliveries WHERE message_id = ?'
    ).all(msg.id) as AgentDelivery[]
    return { ...msg, deliveries }
  })
}

/**
 * Format unread mail for dispatch context injection.
 * Marks deliveries as 'seen' after formatting.
 */
export function formatMailForDispatch(agentId: string, workspaceId: number, convoyId?: number): string | null {
  const db = getDatabase()

  let query = `
    SELECT m.*, d.id as delivery_id
    FROM agent_messages m
    JOIN agent_deliveries d ON d.message_id = m.id
    WHERE d.workspace_id = ? AND d.recipient_agent = ? AND d.status IN ('pending', 'claimed')
  `
  const params: (string | number)[] = [workspaceId, agentId]

  if (convoyId !== undefined) {
    query += ' AND m.convoy_id = ?'
    params.push(convoyId)
  }
  query += ' ORDER BY m.created_at ASC'

  const rows = db.prepare(query).all(...params) as (AgentMessage & { delivery_id: number })[]

  if (rows.length === 0) return null

  // Format as markdown
  const lines: string[] = ['## Unread Messages', '']
  for (const msg of rows) {
    lines.push(`**From**: ${msg.from_agent}`)
    if (msg.subject) lines.push(`**Subject**: ${msg.subject}`)
    lines.push(`**Type**: ${msg.message_type}`)
    lines.push(`**Time**: ${new Date(msg.created_at * 1000).toISOString()}`)
    lines.push('')
    lines.push(msg.body)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // Mark as seen
  const markSeen = db.prepare(`
    UPDATE agent_deliveries SET status = 'seen'
    WHERE id = ? AND status IN ('pending', 'claimed')
  `)
  for (const row of rows) {
    markSeen.run(row.delivery_id)
  }

  return lines.join('\n')
}
