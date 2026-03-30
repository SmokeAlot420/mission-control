import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getHealthMetrics, formatPrometheus } from '@/lib/health'

/**
 * GET /api/health/metrics - Authenticated metrics endpoint.
 * Returns detailed health metrics. Supports JSON (default) and Prometheus text format.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const metrics = await getHealthMetrics()
  const accept = request.headers.get('accept') || ''

  if (accept.includes('text/plain') || accept.includes('text/plain; version=0.0.4')) {
    return new NextResponse(formatPrometheus(metrics), {
      status: metrics.status === 'ok' ? 200 : 503,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  }

  return NextResponse.json(metrics, {
    status: metrics.status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
