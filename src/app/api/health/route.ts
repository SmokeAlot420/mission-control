import { NextResponse } from 'next/server'
import { getHealthSummary } from '@/lib/health'

/**
 * GET /api/health - Public health check endpoint.
 * Returns basic status, version, and uptime. No authentication required.
 */
export async function GET() {
  const summary = getHealthSummary()
  return NextResponse.json(summary, {
    status: summary.status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
