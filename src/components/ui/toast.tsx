'use client'

import { useEffect, useState } from 'react'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  message: string
  variant: ToastVariant
  duration: number
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-green-500/40 bg-green-950/80 text-green-200',
  error: 'border-red-500/40 bg-red-950/80 text-red-200',
  info: 'border-blue-500/40 bg-blue-950/80 text-blue-200',
  warning: 'border-amber-500/40 bg-amber-950/80 text-amber-200',
}

const VARIANT_ICONS: Record<ToastVariant, string> = {
  success: 'ok',
  error: '!!',
  info: 'i',
  warning: '!',
}

export function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(show)
  }, [])

  useEffect(() => {
    if (item.duration <= 0) return
    const timer = setTimeout(() => {
      setExiting(true)
      setTimeout(() => onDismiss(item.id), 200)
    }, item.duration)
    return () => clearTimeout(timer)
  }, [item.id, item.duration, onDismiss])

  const handleDismiss = () => {
    setExiting(true)
    setTimeout(() => onDismiss(item.id), 200)
  }

  return (
    <div
      role="alert"
      className={`
        flex items-start gap-2 px-3 py-2.5 rounded-md border text-sm shadow-lg
        transition-all duration-200 ease-out max-w-sm
        ${VARIANT_STYLES[item.variant]}
        ${visible && !exiting ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}
      `}
    >
      <span className="font-mono text-xs font-bold opacity-70 mt-0.5 shrink-0">
        [{VARIANT_ICONS[item.variant]}]
      </span>
      <span className="flex-1 leading-snug">{item.message}</span>
      <button
        onClick={handleDismiss}
        className="shrink-0 opacity-50 hover:opacity-100 transition-opacity text-xs mt-0.5"
        aria-label="Dismiss"
      >
        x
      </button>
    </div>
  )
}
