import { getDatabase } from './db'
import { eventBus } from './event-bus'
import { logger } from './logger'

// ── Types ──────────────────────────────────────────────────────────────────

export type ConvoyStatus = 'draft' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type SubtaskStatus = 'pending' | 'ready' | 'dispatched' | 'running' | 'completed' | 'failed' | 'cancelled' | 'stalled'
export type DecompositionMode = 'manual' | 'ai_assisted'
export type MergeStrategy = 'squash' | 'merge' | 'rebase'

export interface Convoy {
  id: number
  workspace_id: number
  title: string
  description: string | null
  status: ConvoyStatus
  decomposition_mode: DecompositionMode
  created_by: string
  base_branch: string
  repo_path: string | null
  merge_strategy: MergeStrategy
  total_subtasks: number
  completed_subtasks: number
  failed_subtasks: number
  started_at: number | null
  completed_at: number | null
  metadata: string | null
  created_at: number
  updated_at: number
}

export interface ConvoySubtask {
  id: number
  convoy_id: number
  workspace_id: number
  title: string
  description: string | null
  status: SubtaskStatus
  assigned_agent_id: string | null
  assigned_agent_name: string | null
  paperclip_issue_id: string | null
  remaining_dependencies: number
  port_allocated: number | null
  worktree_path: string | null
  worktree_branch: string | null
  merge_commit: string | null
  error_message: string | null
  stall_detected_at: number | null
  dispatched_at: number | null
  started_at: number | null
  completed_at: number | null
  seq: number
  metadata: string | null
  created_at: number
  updated_at: number
}

export interface DependencyEdge {
  id: number
  workspace_id: number
  convoy_id: number
  from_subtask_id: number
  to_subtask_id: number
}

export interface ConvoyWithSubtasks extends Convoy {
  subtasks: ConvoySubtask[]
  edges: DependencyEdge[]
}

export interface CreateConvoyInput {
  title: string
  description?: string
  created_by: string
  base_branch?: string
  repo_path?: string
  merge_strategy?: MergeStrategy
  decomposition_mode?: DecompositionMode
  subtasks?: CreateSubtaskInput[]
}

export interface CreateSubtaskInput {
  title: string
  description?: string
  assigned_agent_id?: string
  assigned_agent_name?: string
  depends_on?: number[] // indices into the subtasks array (for creation) or subtask IDs (for add)
  metadata?: string
}

// Terminal statuses that won't change
const TERMINAL_STATUSES: SubtaskStatus[] = ['completed', 'failed', 'cancelled']

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Create a convoy with optional subtasks and dependency edges.
 * Validates no cycles exist in the dependency graph.
 */
export function createConvoy(input: CreateConvoyInput, workspaceId: number): ConvoyWithSubtasks {
  const db = getDatabase()

  return db.transaction(() => {
    const convoyResult = db.prepare(`
      INSERT INTO mc_convoys (workspace_id, title, description, created_by, base_branch, repo_path, merge_strategy, decomposition_mode, total_subtasks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workspaceId,
      input.title,
      input.description ?? null,
      input.created_by,
      input.base_branch ?? 'main',
      input.repo_path ?? null,
      input.merge_strategy ?? 'squash',
      input.decomposition_mode ?? 'manual',
      input.subtasks?.length ?? 0,
    )
    const convoyId = Number(convoyResult.lastInsertRowid)

    const subtaskRows: ConvoySubtask[] = []
    const edges: DependencyEdge[] = []

    if (input.subtasks && input.subtasks.length > 0) {
      const insertSubtask = db.prepare(`
        INSERT INTO mc_convoy_subtasks (convoy_id, workspace_id, title, description, assigned_agent_id, assigned_agent_name, remaining_dependencies, seq, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      // First pass: create all subtasks
      const subtaskIds: number[] = []
      for (let i = 0; i < input.subtasks.length; i++) {
        const s = input.subtasks[i]
        const depCount = s.depends_on?.length ?? 0
        const result = insertSubtask.run(
          convoyId, workspaceId, s.title, s.description ?? null,
          s.assigned_agent_id ?? null, s.assigned_agent_name ?? null,
          depCount, i, s.metadata ?? null,
        )
        subtaskIds.push(Number(result.lastInsertRowid))
      }

      // Second pass: insert edges and validate no cycles
      const insertEdge = db.prepare(`
        INSERT INTO mc_convoy_dependency_edges (workspace_id, convoy_id, from_subtask_id, to_subtask_id)
        VALUES (?, ?, ?, ?)
      `)

      for (let i = 0; i < input.subtasks.length; i++) {
        const s = input.subtasks[i]
        if (s.depends_on) {
          for (const depIdx of s.depends_on) {
            if (depIdx < 0 || depIdx >= subtaskIds.length) continue
            const fromId = subtaskIds[depIdx]
            const toId = subtaskIds[i]
            const edgeResult = insertEdge.run(workspaceId, convoyId, fromId, toId)
            edges.push({
              id: Number(edgeResult.lastInsertRowid),
              workspace_id: workspaceId,
              convoy_id: convoyId,
              from_subtask_id: fromId,
              to_subtask_id: toId,
            })
          }
        }
      }

      // Validate no cycles
      if (detectCycleInConvoy(convoyId)) {
        throw new Error('Dependency cycle detected in convoy subtasks')
      }

      // Mark subtasks with 0 dependencies as 'ready'
      db.prepare(`
        UPDATE mc_convoy_subtasks SET status = 'ready'
        WHERE convoy_id = ? AND remaining_dependencies = 0
      `).run(convoyId)

      // Reload subtasks
      subtaskRows.push(
        ...(db.prepare('SELECT * FROM mc_convoy_subtasks WHERE convoy_id = ? ORDER BY seq').all(convoyId) as ConvoySubtask[])
      )
    }

    const convoy = db.prepare('SELECT * FROM mc_convoys WHERE id = ?').get(convoyId) as Convoy

    eventBus.broadcast('convoy.created', { convoy, subtasks: subtaskRows })

    return { ...convoy, subtasks: subtaskRows, edges }
  })()
}

/**
 * Get a convoy with all subtasks and edges.
 */
export function getConvoy(convoyId: number, workspaceId: number): ConvoyWithSubtasks | null {
  const db = getDatabase()
  const convoy = db.prepare(
    'SELECT * FROM mc_convoys WHERE id = ? AND workspace_id = ?'
  ).get(convoyId, workspaceId) as Convoy | undefined

  if (!convoy) return null

  const subtasks = db.prepare(
    'SELECT * FROM mc_convoy_subtasks WHERE convoy_id = ? ORDER BY seq'
  ).all(convoyId) as ConvoySubtask[]

  const edges = db.prepare(
    'SELECT * FROM mc_convoy_dependency_edges WHERE convoy_id = ?'
  ).all(convoyId) as DependencyEdge[]

  return { ...convoy, subtasks, edges }
}

/**
 * List convoys for a workspace.
 */
export function listConvoys(workspaceId: number, status?: ConvoyStatus): Convoy[] {
  const db = getDatabase()
  if (status) {
    return db.prepare(
      'SELECT * FROM mc_convoys WHERE workspace_id = ? AND status = ? ORDER BY updated_at DESC'
    ).all(workspaceId, status) as Convoy[]
  }
  return db.prepare(
    'SELECT * FROM mc_convoys WHERE workspace_id = ? ORDER BY updated_at DESC'
  ).all(workspaceId) as Convoy[]
}

/**
 * Get subtasks that are ready to dispatch (pending with 0 remaining deps).
 */
export function getReadySubtasks(convoyId: number): ConvoySubtask[] {
  const db = getDatabase()
  return db.prepare(
    "SELECT * FROM mc_convoy_subtasks WHERE convoy_id = ? AND status = 'ready' AND remaining_dependencies = 0 ORDER BY seq"
  ).all(convoyId) as ConvoySubtask[]
}

/**
 * Mark a subtask as dispatched with a stable idempotency key.
 */
export function dispatchSubtask(subtaskId: number, workspaceId: number, paperclipIssueId?: string): void {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  const subtask = db.prepare(
    'SELECT * FROM mc_convoy_subtasks WHERE id = ? AND workspace_id = ?'
  ).get(subtaskId, workspaceId) as ConvoySubtask | undefined

  if (!subtask) throw new Error(`Subtask ${subtaskId} not found`)
  if (subtask.status !== 'ready') throw new Error(`Subtask ${subtaskId} is not ready (status: ${subtask.status})`)

  // Generate stable attempt key
  const attemptKey = `convoy:${subtask.convoy_id}:subtask:${subtaskId}:attempt:1`

  db.transaction(() => {
    // Record attempt (idempotent via UNIQUE key)
    db.prepare(`
      INSERT OR IGNORE INTO mc_convoy_attempts (workspace_id, convoy_id, subtask_id, attempt_key, action, status)
      VALUES (?, ?, ?, ?, 'dispatch', 'sent')
    `).run(workspaceId, subtask.convoy_id, subtaskId, attemptKey)

    // Update subtask status
    db.prepare(`
      UPDATE mc_convoy_subtasks SET status = 'dispatched', dispatched_at = ?, paperclip_issue_id = ?, updated_at = ?
      WHERE id = ?
    `).run(now, paperclipIssueId ?? null, now, subtaskId)

    // Activate convoy if still draft
    const convoy = db.prepare('SELECT status FROM mc_convoys WHERE id = ?').get(subtask.convoy_id) as { status: string } | undefined
    if (convoy?.status === 'draft') {
      db.prepare(
        "UPDATE mc_convoys SET status = 'active', started_at = ?, updated_at = ? WHERE id = ?"
      ).run(now, now, subtask.convoy_id)
    }
  })()

  eventBus.broadcast('convoy.subtask_dispatched', { subtask_id: subtaskId, convoy_id: subtask.convoy_id })
}

/**
 * Handle subtask completion. Decrement remaining_dependencies on downstream tasks.
 * Dispatch newly-ready subtasks. Check convoy completion.
 */
export function handleSubtaskCompletion(subtaskId: number, workspaceId: number): { newlyReady: ConvoySubtask[], convoyCompleted: boolean } {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  const subtask = db.prepare(
    'SELECT * FROM mc_convoy_subtasks WHERE id = ? AND workspace_id = ?'
  ).get(subtaskId, workspaceId) as ConvoySubtask | undefined

  if (!subtask) throw new Error(`Subtask ${subtaskId} not found`)

  return db.transaction(() => {
    // Mark completed
    db.prepare(`
      UPDATE mc_convoy_subtasks SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, subtaskId)

    // Find downstream edges and decrement their remaining_dependencies
    const downstreamEdges = db.prepare(
      'SELECT to_subtask_id FROM mc_convoy_dependency_edges WHERE from_subtask_id = ?'
    ).all(subtaskId) as { to_subtask_id: number }[]

    const decrementStmt = db.prepare(`
      UPDATE mc_convoy_subtasks SET remaining_dependencies = MAX(0, remaining_dependencies - 1), updated_at = ?
      WHERE id = ? AND status = 'pending'
    `)

    for (const edge of downstreamEdges) {
      decrementStmt.run(now, edge.to_subtask_id)
    }

    // Mark newly-ready subtasks
    db.prepare(`
      UPDATE mc_convoy_subtasks SET status = 'ready'
      WHERE convoy_id = ? AND status = 'pending' AND remaining_dependencies = 0
    `).run(subtask.convoy_id)

    const newlyReady = db.prepare(
      "SELECT * FROM mc_convoy_subtasks WHERE convoy_id = ? AND status = 'ready' ORDER BY seq"
    ).all(subtask.convoy_id) as ConvoySubtask[]

    // Update convoy progress counters
    updateConvoyProgress(subtask.convoy_id)

    // Check completion
    const convoyCompleted = checkConvoyCompletion(subtask.convoy_id)

    eventBus.broadcast('convoy.subtask_completed', {
      subtask_id: subtaskId,
      convoy_id: subtask.convoy_id,
      newly_ready: newlyReady.map(s => s.id),
    })

    return { newlyReady, convoyCompleted }
  })()
}

/**
 * Handle subtask failure.
 */
export function handleSubtaskFailure(subtaskId: number, workspaceId: number, errorMessage?: string): { convoyFailed: boolean } {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  const subtask = db.prepare(
    'SELECT * FROM mc_convoy_subtasks WHERE id = ? AND workspace_id = ?'
  ).get(subtaskId, workspaceId) as ConvoySubtask | undefined

  if (!subtask) throw new Error(`Subtask ${subtaskId} not found`)

  return db.transaction(() => {
    db.prepare(`
      UPDATE mc_convoy_subtasks SET status = 'failed', error_message = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(errorMessage ?? null, now, now, subtaskId)

    updateConvoyProgress(subtask.convoy_id)
    const convoyFailed = checkConvoyCompletion(subtask.convoy_id)

    eventBus.broadcast('convoy.subtask_failed', {
      subtask_id: subtaskId,
      convoy_id: subtask.convoy_id,
      error: errorMessage,
    })

    return { convoyFailed }
  })()
}

/**
 * Recalculate convoy progress counters from actual subtask statuses.
 */
function updateConvoyProgress(convoyId: number): void {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM mc_convoy_subtasks WHERE convoy_id = ?
  `).get(convoyId) as { total: number; completed: number; failed: number }

  db.prepare(`
    UPDATE mc_convoys SET total_subtasks = ?, completed_subtasks = ?, failed_subtasks = ?, updated_at = ?
    WHERE id = ?
  `).run(stats.total, stats.completed, stats.failed, now, convoyId)

  eventBus.broadcast('convoy.progress', { convoy_id: convoyId, ...stats })
}

/**
 * Check if convoy is complete (all done or too many failures).
 * Returns true if convoy transitioned to a terminal state.
 */
function checkConvoyCompletion(convoyId: number): boolean {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  const convoy = db.prepare('SELECT * FROM mc_convoys WHERE id = ?').get(convoyId) as Convoy
  if (!convoy || TERMINAL_STATUSES.includes(convoy.status as SubtaskStatus)) return false

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM mc_convoy_subtasks WHERE convoy_id = ?
  `).get(convoyId) as { total: number; completed: number; failed: number }

  if (stats.total === 0) return false

  // All completed
  if (stats.completed >= stats.total) {
    db.prepare(
      "UPDATE mc_convoys SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?"
    ).run(now, now, convoyId)
    eventBus.broadcast('convoy.completed', { convoy_id: convoyId })
    return true
  }

  // More than half failed
  if (stats.failed > stats.total / 2) {
    db.prepare(
      "UPDATE mc_convoys SET status = 'failed', completed_at = ?, updated_at = ? WHERE id = ?"
    ).run(now, now, convoyId)
    eventBus.broadcast('convoy.failed', { convoy_id: convoyId })
    return true
  }

  // All terminal (completed + failed + cancelled = total)
  const terminalCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM mc_convoy_subtasks
    WHERE convoy_id = ? AND status IN ('completed', 'failed', 'cancelled')
  `).get(convoyId) as { cnt: number }

  if (terminalCount.cnt >= stats.total) {
    const finalStatus = stats.failed > 0 ? 'failed' : 'completed'
    db.prepare(
      `UPDATE mc_convoys SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?`
    ).run(finalStatus, now, now, convoyId)
    eventBus.broadcast(`convoy.${finalStatus}`, { convoy_id: convoyId })
    return true
  }

  return false
}

/**
 * Update convoy lifecycle status (pause, resume, cancel).
 */
export function updateConvoyStatus(convoyId: number, workspaceId: number, newStatus: ConvoyStatus): Convoy {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  const convoy = db.prepare(
    'SELECT * FROM mc_convoys WHERE id = ? AND workspace_id = ?'
  ).get(convoyId, workspaceId) as Convoy | undefined
  if (!convoy) throw new Error(`Convoy ${convoyId} not found`)

  // Validate transitions
  const validTransitions: Record<string, ConvoyStatus[]> = {
    draft: ['active', 'cancelled'],
    active: ['paused', 'cancelled'],
    paused: ['active', 'cancelled'],
  }

  const allowed = validTransitions[convoy.status]
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(`Cannot transition convoy from '${convoy.status}' to '${newStatus}'`)
  }

  db.transaction(() => {
    db.prepare(
      'UPDATE mc_convoys SET status = ?, updated_at = ? WHERE id = ?'
    ).run(newStatus, now, convoyId)

    // Cancel all non-terminal subtasks when cancelling
    if (newStatus === 'cancelled') {
      db.prepare(`
        UPDATE mc_convoy_subtasks SET status = 'cancelled', updated_at = ?
        WHERE convoy_id = ? AND status NOT IN ('completed', 'failed', 'cancelled')
      `).run(now, convoyId)
    }
  })()

  const updated = db.prepare('SELECT * FROM mc_convoys WHERE id = ?').get(convoyId) as Convoy
  eventBus.broadcast('convoy.status_changed', { convoy_id: convoyId, status: newStatus })
  return updated
}

/**
 * Add subtasks to an existing convoy. Validates no cycles.
 */
export function addSubtasks(
  convoyId: number,
  workspaceId: number,
  subtasks: CreateSubtaskInput[],
): ConvoySubtask[] {
  const db = getDatabase()

  return db.transaction(() => {
    const maxSeq = db.prepare(
      'SELECT COALESCE(MAX(seq), -1) as max_seq FROM mc_convoy_subtasks WHERE convoy_id = ?'
    ).get(convoyId) as { max_seq: number }

    const insertStmt = db.prepare(`
      INSERT INTO mc_convoy_subtasks (convoy_id, workspace_id, title, description, assigned_agent_id, assigned_agent_name, remaining_dependencies, seq, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertEdge = db.prepare(`
      INSERT INTO mc_convoy_dependency_edges (workspace_id, convoy_id, from_subtask_id, to_subtask_id)
      VALUES (?, ?, ?, ?)
    `)

    const newIds: number[] = []
    for (let i = 0; i < subtasks.length; i++) {
      const s = subtasks[i]
      const depCount = s.depends_on?.length ?? 0
      const result = insertStmt.run(
        convoyId, workspaceId, s.title, s.description ?? null,
        s.assigned_agent_id ?? null, s.assigned_agent_name ?? null,
        depCount, maxSeq.max_seq + 1 + i, s.metadata ?? null,
      )
      newIds.push(Number(result.lastInsertRowid))
    }

    // Insert edges - depends_on references existing subtask IDs
    for (let i = 0; i < subtasks.length; i++) {
      const s = subtasks[i]
      if (s.depends_on) {
        for (const depId of s.depends_on) {
          insertEdge.run(workspaceId, convoyId, depId, newIds[i])
        }
      }
    }

    // Validate no cycles
    if (detectCycleInConvoy(convoyId)) {
      throw new Error('Adding these subtasks would create a dependency cycle')
    }

    // Mark ready those with 0 deps
    db.prepare(`
      UPDATE mc_convoy_subtasks SET status = 'ready'
      WHERE convoy_id = ? AND status = 'pending' AND remaining_dependencies = 0
    `).run(convoyId)

    // Update total
    const total = db.prepare(
      'SELECT COUNT(*) as cnt FROM mc_convoy_subtasks WHERE convoy_id = ?'
    ).get(convoyId) as { cnt: number }
    db.prepare(
      'UPDATE mc_convoys SET total_subtasks = ?, updated_at = ? WHERE id = ?'
    ).run(total.cnt, Math.floor(Date.now() / 1000), convoyId)

    return db.prepare(
      'SELECT * FROM mc_convoy_subtasks WHERE id IN (' + newIds.map(() => '?').join(',') + ') ORDER BY seq'
    ).all(...newIds) as ConvoySubtask[]
  })()
}

/**
 * Delete a convoy and cascade to subtasks, edges, etc.
 */
export function deleteConvoy(convoyId: number, workspaceId: number): void {
  const db = getDatabase()
  const result = db.prepare(
    'DELETE FROM mc_convoys WHERE id = ? AND workspace_id = ?'
  ).run(convoyId, workspaceId)
  if (result.changes === 0) throw new Error(`Convoy ${convoyId} not found`)
  eventBus.broadcast('convoy.deleted', { convoy_id: convoyId })
}

// ── Cycle Detection ────────────────────────────────────────────────────────

/**
 * Detect cycles in a convoy's DAG using DFS.
 */
function detectCycleInConvoy(convoyId: number): boolean {
  const db = getDatabase()
  const edges = db.prepare(
    'SELECT from_subtask_id, to_subtask_id FROM mc_convoy_dependency_edges WHERE convoy_id = ?'
  ).all(convoyId) as { from_subtask_id: number; to_subtask_id: number }[]

  // Build adjacency list
  const adj = new Map<number, number[]>()
  const nodes = new Set<number>()
  for (const e of edges) {
    nodes.add(e.from_subtask_id)
    nodes.add(e.to_subtask_id)
    if (!adj.has(e.from_subtask_id)) adj.set(e.from_subtask_id, [])
    adj.get(e.from_subtask_id)!.push(e.to_subtask_id)
  }

  // DFS with coloring: 0=white, 1=gray(visiting), 2=black(done)
  const color = new Map<number, number>()
  for (const n of nodes) color.set(n, 0)

  function dfs(node: number): boolean {
    color.set(node, 1)
    for (const neighbor of (adj.get(node) ?? [])) {
      const c = color.get(neighbor) ?? 0
      if (c === 1) return true // back edge = cycle
      if (c === 0 && dfs(neighbor)) return true
    }
    color.set(node, 2)
    return false
  }

  for (const n of nodes) {
    if (color.get(n) === 0 && dfs(n)) return true
  }
  return false
}

/**
 * Check if adding an edge would create a cycle (for single-edge validation).
 */
export function wouldCreateCycle(convoyId: number, fromId: number, toId: number): boolean {
  const db = getDatabase()
  const edges = db.prepare(
    'SELECT from_subtask_id, to_subtask_id FROM mc_convoy_dependency_edges WHERE convoy_id = ?'
  ).all(convoyId) as { from_subtask_id: number; to_subtask_id: number }[]

  // Add the proposed edge
  edges.push({ from_subtask_id: fromId, to_subtask_id: toId })

  // DFS from toId to see if we can reach fromId
  const adj = new Map<number, number[]>()
  for (const e of edges) {
    if (!adj.has(e.from_subtask_id)) adj.set(e.from_subtask_id, [])
    adj.get(e.from_subtask_id)!.push(e.to_subtask_id)
  }

  const visited = new Set<number>()
  const stack = [toId]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === fromId) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const neighbor of (adj.get(current) ?? [])) {
      stack.push(neighbor)
    }
  }
  return false
}
