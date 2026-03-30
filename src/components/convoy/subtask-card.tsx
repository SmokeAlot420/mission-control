'use client'

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-zinc-700', text: 'text-zinc-300', label: 'Pending' },
  ready: { bg: 'bg-blue-900', text: 'text-blue-300', label: 'Ready' },
  dispatched: { bg: 'bg-indigo-900', text: 'text-indigo-300', label: 'Dispatched' },
  running: { bg: 'bg-yellow-900', text: 'text-yellow-300', label: 'Running' },
  completed: { bg: 'bg-green-900', text: 'text-green-300', label: 'Completed' },
  failed: { bg: 'bg-red-900', text: 'text-red-300', label: 'Failed' },
  cancelled: { bg: 'bg-zinc-800', text: 'text-zinc-400', label: 'Cancelled' },
  stalled: { bg: 'bg-orange-900', text: 'text-orange-300', label: 'Stalled' },
}

interface SubtaskCardProps {
  subtask: {
    id: number
    title: string
    status: string
    assigned_agent_name?: string | null
    port_allocated?: number | null
    error_message?: string | null
    description?: string | null
  }
  onStatusChange?: (subtaskId: number, status: string) => void
}

export function SubtaskCard({ subtask, onStatusChange }: SubtaskCardProps) {
  const style = STATUS_STYLES[subtask.status] || STATUS_STYLES.pending

  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium truncate">{subtask.title}</h4>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium ${style.bg} ${style.text}`}>
              {style.label}
            </span>
          </div>
          {subtask.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{subtask.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-2xs text-muted-foreground">
            {subtask.assigned_agent_name && (
              <span>Agent: {subtask.assigned_agent_name}</span>
            )}
            {subtask.port_allocated && (
              <span>Port: {subtask.port_allocated}</span>
            )}
          </div>
          {subtask.error_message && (
            <p className="text-xs text-red-400 mt-1 truncate">{subtask.error_message}</p>
          )}
        </div>
        {onStatusChange && subtask.status === 'running' && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onStatusChange(subtask.id, 'completed')}
              className="px-2 py-1 text-2xs rounded bg-green-900 text-green-300 hover:bg-green-800 transition-colors"
            >
              Done
            </button>
            <button
              onClick={() => onStatusChange(subtask.id, 'failed')}
              className="px-2 py-1 text-2xs rounded bg-red-900 text-red-300 hover:bg-red-800 transition-colors"
            >
              Fail
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
