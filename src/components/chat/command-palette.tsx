'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface SlashCommand {
  name: string
  description: string
  action: () => void
}

interface CommandPaletteProps {
  commands: SlashCommand[]
  filter: string
  onSelect: (command: SlashCommand) => void
  onClose: () => void
  visible: boolean
}

export function CommandPalette({ commands, filter, onSelect, onClose, visible }: CommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = commands.filter((cmd) =>
    cmd.name.toLowerCase().includes(filter.toLowerCase())
  )

  // Reset index when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [filter])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex])
        }
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [visible, filtered, selectedIndex, onSelect, onClose]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!visible || filtered.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover/95 backdrop-blur-lg shadow-xl z-20"
    >
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 border-b border-border/50">
        Commands
      </div>
      {filtered.map((cmd, i) => (
        <button
          key={cmd.name}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(cmd)
          }}
          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
            i === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'text-foreground hover:bg-accent/50'
          }`}
        >
          <span className="font-mono text-xs text-primary">/{cmd.name}</span>
          <span className="text-xs text-muted-foreground truncate">{cmd.description}</span>
        </button>
      ))}
    </div>
  )
}

/** Default slash commands for the chat widget. Generic names for white-label compliance. */
export function useWidgetCommands(onExecute: (command: string) => void): SlashCommand[] {
  return [
    {
      name: 'status',
      description: 'Show agent status overview',
      action: () => onExecute('/status'),
    },
    {
      name: 'health',
      description: 'Check agent health',
      action: () => onExecute('/health'),
    },
    {
      name: 'tasks',
      description: 'List recent tasks',
      action: () => onExecute('/tasks'),
    },
    {
      name: 'help',
      description: 'Show available commands',
      action: () => onExecute('/help'),
    },
  ]
}
