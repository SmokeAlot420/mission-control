import { logger } from './logger'

const startTime = Date.now()

export interface HealthSummary {
  status: 'ok' | 'degraded' | 'error'
  version: string
  uptime: number
  timestamp: string
}

export interface HealthMetrics {
  status: 'ok' | 'degraded' | 'error'
  version: string
  uptime: number
  timestamp: string
  database: {
    status: 'ok' | 'error'
    latency_ms: number | null
    error?: string
  }
  memory: {
    rss_mb: number
    heap_used_mb: number
    heap_total_mb: number
  }
  process: {
    pid: number
    node_version: string
    platform: string
  }
}

function getVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../package.json').version || 'unknown'
  } catch {
    return 'unknown'
  }
}

export function getHealthSummary(): HealthSummary {
  return {
    status: 'ok',
    version: getVersion(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  }
}

export async function getHealthMetrics(): Promise<HealthMetrics> {
  const version = getVersion()
  const uptime = Math.floor((Date.now() - startTime) / 1000)
  const mem = process.memoryUsage()

  let dbStatus: HealthMetrics['database'] = { status: 'error', latency_ms: null, error: 'not checked' }

  try {
    const { getDatabase } = await import('./db')
    const dbStart = Date.now()
    const db = getDatabase()
    db.prepare('SELECT 1').get()
    const latency = Date.now() - dbStart
    dbStatus = { status: 'ok', latency_ms: latency }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error'
    logger.warn({ err }, 'Health check: database probe failed')
    dbStatus = { status: 'error', latency_ms: null, error: message }
  }

  const overallStatus = dbStatus.status === 'ok' ? 'ok' : 'degraded'

  return {
    status: overallStatus,
    version,
    uptime,
    timestamp: new Date().toISOString(),
    database: dbStatus,
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
    },
    process: {
      pid: process.pid,
      node_version: process.version,
      platform: process.platform,
    },
  }
}

export function formatPrometheus(metrics: HealthMetrics): string {
  const lines: string[] = []

  lines.push('# HELP mc_up Whether the service is up (1) or down (0)')
  lines.push('# TYPE mc_up gauge')
  lines.push(`mc_up ${metrics.status === 'ok' ? 1 : 0}`)

  lines.push('# HELP mc_uptime_seconds Seconds since process started')
  lines.push('# TYPE mc_uptime_seconds gauge')
  lines.push(`mc_uptime_seconds ${metrics.uptime}`)

  lines.push('# HELP mc_db_up Whether the database is reachable (1) or not (0)')
  lines.push('# TYPE mc_db_up gauge')
  lines.push(`mc_db_up ${metrics.database.status === 'ok' ? 1 : 0}`)

  if (metrics.database.latency_ms !== null) {
    lines.push('# HELP mc_db_latency_ms Database query latency in milliseconds')
    lines.push('# TYPE mc_db_latency_ms gauge')
    lines.push(`mc_db_latency_ms ${metrics.database.latency_ms}`)
  }

  lines.push('# HELP mc_memory_rss_bytes Resident set size in bytes')
  lines.push('# TYPE mc_memory_rss_bytes gauge')
  lines.push(`mc_memory_rss_bytes ${Math.round(metrics.memory.rss_mb * 1024 * 1024)}`)

  lines.push('# HELP mc_memory_heap_used_bytes Heap used in bytes')
  lines.push('# TYPE mc_memory_heap_used_bytes gauge')
  lines.push(`mc_memory_heap_used_bytes ${Math.round(metrics.memory.heap_used_mb * 1024 * 1024)}`)

  lines.push('')
  return lines.join('\n')
}
