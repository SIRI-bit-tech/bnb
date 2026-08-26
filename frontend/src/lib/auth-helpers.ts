'use client'

/**
 * Safely retrieves the active admin ID from localStorage or JWT admin_token fallback.
 * Prevents unnecessary logouts if admin_id is temporarily missing in localStorage.
 */
export function getAdminId(): string | null {
  if (typeof window === 'undefined') return null

  // 1. Direct check
  const storedId = localStorage.getItem('admin_id')
  if (storedId && storedId.trim() !== '' && storedId !== 'undefined' && storedId !== 'null') {
    return storedId.trim()
  }

  // 2. Fallback: Parse sub (admin ID) directly from JWT token
  const token = localStorage.getItem('admin_token')
  if (token) {
    try {
      const parts = token.split('.')
      if (parts.length === 3) {
        const base64Url = parts[1]
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        )
        const parsed = JSON.parse(jsonPayload)
        if (parsed?.sub) {
          const subId = String(parsed.sub).trim()
          localStorage.setItem('admin_id', subId)
          return subId
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return null
}
