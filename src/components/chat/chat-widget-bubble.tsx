'use client'

import { useMissionControl } from '@/store'

export function ChatWidgetBubble() {
  const { chatWidgetOpen, setChatWidgetOpen, conversations } = useMissionControl()

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  return (
    <button
      onClick={() => setChatWidgetOpen(!chatWidgetOpen)}
      className="fixed bottom-6 right-6 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95 md:h-14 md:w-14"
      title={chatWidgetOpen ? 'Close chat' : 'Open chat'}
      aria-label={chatWidgetOpen ? 'Close chat widget' : 'Open chat widget'}
    >
      {chatWidgetOpen ? (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 10c0 .37-.1.7-.28 1-.53.87-2.2 3-5.72 3-4.42 0-6-3-6-4V4a2 2 0 012-2h8a2 2 0 012 2v6z" />
          <path d="M6 7h.01M10 7h.01" />
        </svg>
      )}

      {/* Unread badge */}
      {!chatWidgetOpen && totalUnread > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
          {totalUnread > 99 ? '99+' : totalUnread}
        </span>
      )}
    </button>
  )
}
