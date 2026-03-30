'use client'

import { useEffect, useCallback, useState } from 'react'
import { useMissionControl, type ChatAttachment } from '@/store'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { createClientLogger } from '@/lib/client-logger'
import { ChatWidgetBubble } from './chat-widget-bubble'
import { ChatWidgetHome } from './chat-widget-home'
import { MessageList } from './message-list'
import { ChatInput } from './chat-input'
import { useChatRelay } from '@/hooks/use-chat-relay'
import { Button } from '@/components/ui/button'

const log = createClientLogger('ChatWidget')

export function ChatWidget() {
  const {
    chatWidgetOpen,
    setChatWidgetOpen,
    chatWidgetView,
    setChatWidgetView,
    activeConversation,
    setActiveConversation,
    setChatMessages,
    agents,
    setAgents,
    conversations,
    markConversationRead,
    chatPanelOpen,
  } = useMissionControl()

  const { sendMessage } = useChatRelay()
  const [isGenerating, setIsGenerating] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Load agents for the widget
  useEffect(() => {
    if (!chatWidgetOpen) return
    fetch('/api/agents')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.agents) setAgents(data.agents) })
      .catch((err) => log.error('Failed to load agents:', err))
  }, [chatWidgetOpen, setAgents])

  // Load messages when conversation changes (widget view)
  const loadMessages = useCallback(async () => {
    if (!activeConversation || chatWidgetView !== 'chat') return
    if (activeConversation.startsWith('session:')) {
      setChatMessages([])
      return
    }
    try {
      const res = await fetch(
        `/api/chat/messages?conversation_id=${encodeURIComponent(activeConversation)}&limit=50`
      )
      if (!res.ok) return
      const data = await res.json()
      if (data.messages) setChatMessages(data.messages)
    } catch (err) {
      log.error('Failed to load messages:', err)
    }
  }, [activeConversation, chatWidgetView, setChatMessages])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  // Poll for new messages when widget is open and in chat view
  useSmartPoll(loadMessages, 15000, {
    enabled: chatWidgetOpen && chatWidgetView === 'chat' && !!activeConversation,
    pauseWhenSseConnected: true,
  })

  // Close widget on Escape
  useEffect(() => {
    if (!chatWidgetOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (chatWidgetView === 'chat') {
          setChatWidgetView('home')
        } else {
          setChatWidgetOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [chatWidgetOpen, chatWidgetView, setChatWidgetOpen, setChatWidgetView])

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      setActiveConversation(conversationId)
      markConversationRead(conversationId)
      setChatWidgetView('chat')
    },
    [setActiveConversation, markConversationRead, setChatWidgetView]
  )

  const handleNewChat = useCallback(() => {
    // Pick first online agent, or clear conversation for generic chat
    const onlineAgent = agents.find(
      (a) => a.status === 'idle' || a.status === 'busy'
    )
    if (onlineAgent) {
      const convId = `agent_${onlineAgent.name}`
      setActiveConversation(convId)
      setChatWidgetView('chat')
    }
  }, [agents, setActiveConversation, setChatWidgetView])

  const handleBackToHome = useCallback(() => {
    setChatWidgetView('home')
    setActiveConversation(null)
  }, [setChatWidgetView, setActiveConversation])

  const handleSend = useCallback(
    async (content: string, attachments?: ChatAttachment[]) => {
      setIsGenerating(true)
      await sendMessage(content, attachments)
      setIsGenerating(false)
    },
    [sendMessage]
  )

  const handleAbort = useCallback(() => {
    if (!activeConversation) return
    try {
      const ws = (window as { __mcWebSocket?: WebSocket }).__mcWebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'req',
            method: 'chat.cancel',
            id: `mc-cancel-${Date.now()}`,
            params: { sessionId: activeConversation },
          })
        )
      }
    } catch (err) {
      log.error('Failed to send abort:', err)
    }
    setIsGenerating(false)
  }, [activeConversation])

  // Don't render widget when chat panel is open (avoid two chat surfaces)
  if (chatPanelOpen) return <ChatWidgetBubble />

  const canSendMessage =
    !!activeConversation && !activeConversation.startsWith('session:')

  const selectedConversation = conversations.find(
    (c) => c.id === activeConversation
  )
  const displayName = selectedConversation
    ? selectedConversation.name || selectedConversation.id.replace('agent_', '')
    : ''

  return (
    <>
      <ChatWidgetBubble />

      {chatWidgetOpen && (
        <div
          className={`fixed z-[59] flex flex-col bg-card border border-border shadow-2xl overflow-hidden transition-all duration-200 ${
            isMobile
              ? 'inset-0'
              : 'bottom-24 right-6 w-[380px] h-[520px] rounded-xl'
          }`}
        >
          {chatWidgetView === 'home' ? (
            <ChatWidgetHome
              onSelectConversation={handleSelectConversation}
              onNewChat={handleNewChat}
            />
          ) : (
            <>
              {/* Chat view header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-card flex-shrink-0">
                <Button
                  onClick={handleBackToHome}
                  variant="ghost"
                  size="icon-xs"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 12L6 8l4-4" />
                  </svg>
                </Button>
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold text-muted-foreground">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium text-foreground truncate flex-1">
                  {displayName}
                </span>
                <Button
                  onClick={() => setChatWidgetOpen(false)}
                  variant="ghost"
                  size="icon-xs"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </Button>
              </div>

              {/* Reuse existing message list + chat input */}
              <MessageList />
              <ChatInput
                onSend={handleSend}
                onAbort={handleAbort}
                disabled={!canSendMessage}
                agents={agents.map((a) => ({ name: a.name, role: a.role }))}
                isGenerating={isGenerating}
                compact
              />
            </>
          )}
        </div>
      )}
    </>
  )
}
