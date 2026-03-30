'use client'

import { useMissionControl } from '@/store'
import { Button } from '@/components/ui/button'

interface ChatWidgetHomeProps {
  onSelectConversation: (conversationId: string) => void
  onNewChat: () => void
}

function timeAgo(timestamp: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestamp
  if (diff <= 0 || diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

export function ChatWidgetHome({ onSelectConversation, onNewChat }: ChatWidgetHomeProps) {
  const { conversations, agents } = useMissionControl()

  // Show recent conversations, sorted by updatedAt, max 6
  const recentConversations = [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6)

  const onlineAgentCount = agents.filter(
    (a) => a.status === 'busy' || a.status === 'idle'
  ).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/50">
        <h3 className="text-sm font-semibold text-foreground">Chat</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {onlineAgentCount > 0
            ? `${onlineAgentCount} agent${onlineAgentCount !== 1 ? 's' : ''} online`
            : 'No agents online'}
        </p>
      </div>

      {/* Quick actions */}
      <div className="px-3 py-2 border-b border-border/30">
        <Button
          onClick={onNewChat}
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs h-8"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
          New conversation
        </Button>
      </div>

      {/* Recent conversations */}
      <div className="flex-1 overflow-y-auto">
        {recentConversations.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground/50">
            No recent conversations
          </div>
        ) : (
          <div className="py-1">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/50">
              Recent
            </div>
            {recentConversations.map((conv) => {
              const displayName = conv.name || conv.id.replace('agent_', '').replace('session:', '')
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-accent/50 transition-colors"
                >
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold text-muted-foreground">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground truncate">
                        {displayName}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                        {conv.unreadCount > 0 && (
                          <span className="bg-primary text-primary-foreground text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-medium">
                            {conv.unreadCount}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/40">
                          {conv.updatedAt ? timeAgo(conv.updatedAt) : ''}
                        </span>
                      </div>
                    </div>
                    {conv.lastMessage && (
                      <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                        {conv.lastMessage.from_agent === 'human'
                          ? `You: ${conv.lastMessage.content}`
                          : conv.lastMessage.content}
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
