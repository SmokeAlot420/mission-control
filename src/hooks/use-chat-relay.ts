'use client'

import { useRef, useCallback } from 'react'
import { useMissionControl, type ChatAttachment } from '@/store'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('useChatRelay')

/**
 * Reusable hook for sending chat messages with optimistic updates.
 * Extracted from ChatWorkspace to share between panel and widget.
 * Uses the existing /api/chat/messages POST endpoint — no new backend.
 */
export function useChatRelay() {
  const {
    activeConversation,
    addChatMessage,
    replacePendingMessage,
    updatePendingMessage,
  } = useMissionControl()

  const pendingIdRef = useRef(-1)

  const sendMessage = useCallback(
    async (content: string, attachments?: ChatAttachment[]) => {
      if (!activeConversation) return

      const mentionMatch = content.match(/^@(\w+)\s/)
      let to = mentionMatch ? mentionMatch[1] : null
      const cleanContent = mentionMatch ? content.slice(mentionMatch[0].length) : content

      if (!to && activeConversation.startsWith('agent_')) {
        to = activeConversation.replace('agent_', '')
      }

      // Create optimistic message with negative temp ID
      pendingIdRef.current -= 1
      const tempId = pendingIdRef.current
      const optimisticMessage = {
        id: tempId,
        conversation_id: activeConversation,
        from_agent: 'human',
        to_agent: to,
        content: cleanContent,
        message_type: 'text' as const,
        attachments,
        created_at: Math.floor(Date.now() / 1000),
        pendingStatus: 'sending' as const,
      }

      addChatMessage(optimisticMessage)

      try {
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'human',
            to,
            content: cleanContent,
            conversation_id: activeConversation,
            message_type: 'text',
            attachments,
            forward: true,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          if (data.message) {
            replacePendingMessage(tempId, data.message)
          }
          return { success: true }
        } else {
          updatePendingMessage(tempId, { pendingStatus: 'failed' })
          return { success: false }
        }
      } catch (err) {
        log.error('Failed to send message:', err)
        updatePendingMessage(tempId, { pendingStatus: 'failed' })
        return { success: false }
      }
    },
    [activeConversation, addChatMessage, replacePendingMessage, updatePendingMessage]
  )

  return { sendMessage }
}
