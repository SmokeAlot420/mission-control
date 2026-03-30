import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { sendMessage, getConvoyMessages } from '@/lib/mailbox'
import { getConvoy } from '@/lib/convoy'
import { logger } from '@/lib/logger'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/convoy/[id]/mailbox - Get all messages for a convoy
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id } = await context.params
    const convoyId = Number(id)
    const workspaceId = auth.user.workspace_id ?? 1

    const convoy = getConvoy(convoyId, workspaceId)
    if (!convoy) {
      return NextResponse.json({ error: 'Convoy not found' }, { status: 404 })
    }

    const messages = getConvoyMessages(convoyId, workspaceId)
    return NextResponse.json({ messages })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/convoy/[id]/mailbox error')
    return NextResponse.json({ error: 'Failed to fetch mailbox' }, { status: 500 })
  }
}

/**
 * POST /api/convoy/[id]/mailbox - Send a message in a convoy
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id } = await context.params
    const convoyId = Number(id)
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()

    if (!body.from_agent || !body.body) {
      return NextResponse.json({ error: 'from_agent and body are required' }, { status: 400 })
    }

    if (!body.recipients || !Array.isArray(body.recipients) || body.recipients.length === 0) {
      return NextResponse.json({ error: 'recipients array is required' }, { status: 400 })
    }

    const message = sendMessage({
      convoy_id: convoyId,
      from_agent: body.from_agent,
      recipients: body.recipients,
      message_type: body.message_type,
      subject: body.subject,
      body: body.body,
      artifact_refs: body.artifact_refs,
      dedupe_key: body.dedupe_key,
    }, workspaceId)

    return NextResponse.json({ message }, { status: 201 })
  } catch (error: any) {
    logger.error({ err: error }, 'POST /api/convoy/[id]/mailbox error')
    return NextResponse.json({ error: error.message || 'Failed to send message' }, { status: 500 })
  }
}
