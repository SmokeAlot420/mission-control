import { getDatabase } from './db'
import { logger } from './logger'
import type { ConvoySubtask } from './convoy'

const PORT_RANGE_START = parseInt(process.env.CONVOY_PORT_RANGE_START || '4200', 10)
const PORT_RANGE_END = parseInt(process.env.CONVOY_PORT_RANGE_END || '4299', 10)

/**
 * Allocate a port for a convoy subtask from the configured range.
 * Uses the mc_convoy_subtasks.port_allocated column as the lease table.
 * Returns the allocated port number.
 */
export function allocatePort(subtaskId: number, convoyId: number, workspaceId: number): number {
  const db = getDatabase()

  // Get all currently allocated ports
  const allocated = db.prepare(`
    SELECT port_allocated FROM mc_convoy_subtasks
    WHERE port_allocated IS NOT NULL
      AND status NOT IN ('completed', 'failed', 'cancelled')
      AND workspace_id = ?
  `).all(workspaceId) as { port_allocated: number }[]

  const usedPorts = new Set(allocated.map(r => r.port_allocated))

  // Linear scan for first available port
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedPorts.has(port)) {
      db.prepare(`
        UPDATE mc_convoy_subtasks SET port_allocated = ?, updated_at = ?
        WHERE id = ? AND workspace_id = ?
      `).run(port, Math.floor(Date.now() / 1000), subtaskId, workspaceId)

      logger.info({ subtaskId, port }, 'Port allocated for convoy subtask')
      return port
    }
  }

  throw new Error(`Port exhaustion: all ports in range ${PORT_RANGE_START}-${PORT_RANGE_END} are allocated`)
}

/**
 * Release port on terminal status.
 */
export function releasePort(subtaskId: number, workspaceId: number): void {
  const db = getDatabase()
  db.prepare(`
    UPDATE mc_convoy_subtasks SET port_allocated = NULL, updated_at = ?
    WHERE id = ? AND workspace_id = ?
  `).run(Math.floor(Date.now() / 1000), subtaskId, workspaceId)
}

/**
 * Build markdown instructions for the agent's worktree setup.
 * This is ADVISORY — Bridge does not execute git commands.
 * The agent receives these instructions in its Paperclip issue description.
 */
export function buildWorktreeInstructions(subtask: ConvoySubtask, baseBranch: string, repoPath?: string | null): string {
  const branch = subtask.worktree_branch || `convoy/${subtask.convoy_id}/subtask-${subtask.id}`
  const port = subtask.port_allocated

  const lines = [
    '## Workspace Isolation Instructions',
    '',
    '```bash',
    `# Create isolated worktree for this subtask`,
  ]

  if (repoPath) {
    lines.push(`cd ${repoPath}`)
  }

  lines.push(
    `git worktree add -b ${branch} .worktrees/${branch} ${baseBranch}`,
    `cd .worktrees/${branch}`,
  )

  if (port) {
    lines.push(`# Development server port: ${port}`)
    lines.push(`export PORT=${port}`)
  }

  lines.push('```', '')
  lines.push(`**Branch**: \`${branch}\``)
  lines.push(`**Base**: \`${baseBranch}\``)
  if (port) lines.push(`**Port**: \`${port}\``)

  return lines.join('\n')
}

/**
 * Get count of active (non-terminal) subtask ports.
 */
export function getActivePortCount(workspaceId: number): number {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT COUNT(*) as cnt FROM mc_convoy_subtasks
    WHERE port_allocated IS NOT NULL
      AND status NOT IN ('completed', 'failed', 'cancelled')
      AND workspace_id = ?
  `).get(workspaceId) as { cnt: number }
  return row.cnt
}
