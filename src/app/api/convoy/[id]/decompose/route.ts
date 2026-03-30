import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getConvoy, addSubtasks } from '@/lib/convoy'
import { logger } from '@/lib/logger'

interface RouteContext {
  params: Promise<{ id: string }>
}

const RELAY_URL = process.env.RELAY_URL || process.env.NEXT_PUBLIC_RELAY_URL || ''

/**
 * POST /api/convoy/[id]/decompose - AI-assisted task decomposition via relay
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id } = await context.params
    const convoyId = Number(id)
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()

    const convoy = getConvoy(convoyId, workspaceId)
    if (!convoy) {
      return NextResponse.json({ error: 'Convoy not found' }, { status: 404 })
    }

    if (!RELAY_URL) {
      return NextResponse.json({ error: 'RELAY_URL not configured' }, { status: 503 })
    }

    const prompt = body.prompt || convoy.description || convoy.title

    // Call relay for AI decomposition
    const relayResponse = await fetch(`${RELAY_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are a task decomposition assistant. Break down the given task into 2-8 subtasks suitable for parallel execution by AI agents. Return a JSON array of objects with: title (string), description (string), depends_on (array of 0-based indices of subtasks this depends on). Only output the JSON array, no other text.`,
          },
          {
            role: 'user',
            content: `Decompose this task for a convoy of AI agents:\n\n${prompt}`,
          },
        ],
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!relayResponse.ok) {
      return NextResponse.json({ error: 'AI decomposition failed' }, { status: 503 })
    }

    const relayData = await relayResponse.json()
    const content = relayData.choices?.[0]?.message?.content || relayData.content || ''

    // Parse JSON from response (handle markdown code blocks)
    let subtaskDefs: { title: string; description?: string; depends_on?: number[] }[]
    try {
      const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      subtaskDefs = JSON.parse(jsonStr)
      if (!Array.isArray(subtaskDefs)) throw new Error('Not an array')
    } catch {
      return NextResponse.json({
        error: 'Failed to parse AI decomposition result',
        raw: content,
      }, { status: 422 })
    }

    // Add subtasks to the convoy
    const subtasks = addSubtasks(convoyId, workspaceId, subtaskDefs.map(s => ({
      title: s.title,
      description: s.description,
      depends_on: s.depends_on,
    })))

    return NextResponse.json({ subtasks, decomposition_mode: 'ai_assisted' })
  } catch (error: any) {
    logger.error({ err: error }, 'POST /api/convoy/[id]/decompose error')
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return NextResponse.json({ error: 'AI decomposition timed out' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Failed to decompose' }, { status: 500 })
  }
}
