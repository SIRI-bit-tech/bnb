'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { AdminSessionTimeoutModal } from '@/components/admin/admin-session-timeout-modal'

const IDLE_TIMEOUT_MS = 20 * 60 * 1000 // 20 minutes idle limit
const WARNING_SECONDS = 60 // 60 seconds warning popup

export function useAdminSessionKeeper() {
  const [modalOpen, setModalOpen] = useState(false)
  const [countdown, setCountdown] = useState(WARNING_SECONDS)

  const lastActiveRef = useRef<number>(Date.now())
  const idleTimer = useRef<number | null>(null)
  const countdownTimer = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (idleTimer.current) window.clearInterval(idleTimer.current)
    if (countdownTimer.current) window.clearInterval(countdownTimer.current)
  }, [])

  const resetIdle = useCallback(() => {
    lastActiveRef.current = Date.now()
    if (!modalOpen) {
      setCountdown(WARNING_SECONDS)
    }
  }, [modalOpen])

  const logout = useCallback(() => {
    try {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_refresh_token')
      localStorage.removeItem('admin_id')
      localStorage.removeItem('admin_email')
      localStorage.removeItem('admin_name')
      document.cookie = 'admin_token=; path=/; max-age=0; samesite=lax'
    } catch {}
    window.location.href = `/admin/auth/login?reason=Session%20expired`
  }, [])

  const startIdleWatch = useCallback(() => {
    if (idleTimer.current) window.clearInterval(idleTimer.current)
    idleTimer.current = window.setInterval(() => {
      const idleMs = Date.now() - lastActiveRef.current
      if (!modalOpen && idleMs >= IDLE_TIMEOUT_MS) {
        setModalOpen(true)
        setCountdown(WARNING_SECONDS)
        
        if (countdownTimer.current) window.clearInterval(countdownTimer.current)
        countdownTimer.current = window.setInterval(() => {
          setCountdown((s) => s - 1)
        }, 1000) as unknown as number
      }
    }, 1000) as unknown as number
  }, [modalOpen])

  const staySignedIn = useCallback(() => {
    setModalOpen(false)
    setCountdown(WARNING_SECONDS)
    resetIdle()
    startIdleWatch()
  }, [resetIdle, startIdleWatch])

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    const handler = () => resetIdle()
    events.forEach((ev) => window.addEventListener(ev, handler, { passive: true }))
    startIdleWatch()

    return () => {
      clearTimers()
      events.forEach((ev) => window.removeEventListener(ev, handler))
    }
  }, [resetIdle, startIdleWatch, clearTimers])

  useEffect(() => {
    if (!modalOpen) return
    if (countdown <= 0) {
      logout()
    }
  }, [modalOpen, countdown, logout])

  return (
    <AdminSessionTimeoutModal
      open={modalOpen}
      secondsRemaining={countdown}
      onStaySignedIn={staySignedIn}
      onLogout={logout}
    />
  )
}
