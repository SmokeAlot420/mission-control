'use client'

import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import { Toast, type ToastItem, type ToastVariant } from './toast'

export interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  success: 5000,
  error: 15000,
  info: 5000,
  warning: 5000,
}

let globalToastRef: ToastContextValue | null = null

/**
 * Show a toast from outside React (SSE handlers, event callbacks).
 * Only works after ToastProvider mounts.
 */
export function showToast(message: string, variant: ToastVariant = 'info', duration?: number) {
  globalToastRef?.toast(message, variant, duration)
}

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastsRef = useRef(toasts)
  toastsRef.current = toasts

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message: string, variant: ToastVariant = 'info', duration?: number) => {
    const id = `toast-${++nextId}-${Date.now()}`
    const resolvedDuration = duration ?? DEFAULT_DURATIONS[variant]
    setToasts(prev => [...prev.slice(-9), { id, message, variant, duration: resolvedDuration }])
  }, [])

  useEffect(() => {
    globalToastRef = { toast, dismiss }
    return () => { globalToastRef = null }
  }, [toast, dismiss])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-auto"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map(item => (
          <Toast key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
