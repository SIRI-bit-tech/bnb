'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Loader2, Lock } from 'lucide-react'
import { colors } from '@/types'

interface TransferPinModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (pin: string) => Promise<void>
  error?: string
  onClearError?: () => void
  onForgotPin?: () => void
  onResendOtp?: () => Promise<void>
  userEmail?: string
}

function maskEmail(email?: string): string {
  if (!email || !email.includes('@')) return ''
  const [local, domain] = email.split('@')
  if (local.length <= 3) {
    return `${local[0]}***@${domain}`
  }
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`
}

/** Modal for entering 4-digit transfer OTP PIN sent to email before confirming transfer. */
export function TransferPinModal({
  open,
  onOpenChange,
  onConfirm,
  error,
  onClearError,
  onForgotPin,
  onResendOtp,
  userEmail,
}: TransferPinModalProps) {
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const maskedEmail = maskEmail(userEmail)

  const handleConfirm = async () => {
    if (pin.length !== 4) return
    setLoading(true)
    try {
      await onConfirm(pin)
      setPin('')
      onOpenChange(false)
    } catch {
      // Error shown by parent
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!onResendOtp || resending) return
    setResending(true)
    setResendMessage('')
    try {
      await onResendOtp()
      setResendMessage('A new 4-digit code has been sent to your email.')
    } catch {
      // Error handled by parent
    } finally {
      setResending(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPin('')
      setResendMessage('')
      onClearError?.()
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" style={{ color: colors.primary }} />
            Enter Authorization Code
          </DialogTitle>
          <DialogDescription>
            A 4-digit OTP code has been sent to your email address {maskedEmail ? `(${maskedEmail})` : ''}. Enter it below to authorize this transfer.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {error && (
            <p className="text-sm font-medium text-center" style={{ color: colors.error }}>
              {error}
            </p>
          )}
          {resendMessage && (
            <p className="text-xs font-medium text-center text-emerald-600">
              {resendMessage}
            </p>
          )}
          <InputOTP
            maxLength={4}
            value={pin}
            onChange={(value) => setPin(value)}
          >
            <InputOTPGroup className="gap-2">
              <InputOTPSlot index={0} className="h-12 w-12 text-lg" />
              <InputOTPSlot index={1} className="h-12 w-12 text-lg" />
              <InputOTPSlot index={2} className="h-12 w-12 text-lg" />
              <InputOTPSlot index={3} className="h-12 w-12 text-lg" />
            </InputOTPGroup>
          </InputOTP>

          <div className="w-full flex items-center justify-between px-1">
            {onResendOtp && (
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                onClick={handleResend}
                disabled={resending}
              >
                {resending ? 'Sending...' : 'Resend Code'}
              </button>
            )}
            {onForgotPin && (
              <button
                type="button"
                className="text-xs underline ml-auto"
                onClick={() => {
                  onOpenChange(false)
                  onForgotPin()
                }}
                style={{ color: colors.textSecondary }}
              >
                Need help?
              </button>
            )}
          </div>

          <Button
            className="w-full"
            onClick={handleConfirm}
            disabled={pin.length !== 4 || loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Authorizing...
              </>
            ) : (
              'Confirm Transfer'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
