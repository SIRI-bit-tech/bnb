'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import type { SupportTicketDetail, TicketReply } from '@/types'
import { colors } from '@/types'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/utils'
import { useUserRealtime } from '@/hooks/use-user-realtime'
import {
  Send,
  ShieldCheck,
  Clock,
  RefreshCw,
  ArrowLeft,
  Image as ImageIcon,
  X,
  ExternalLink,
  Lock
} from 'lucide-react'

interface SupportTicketDetailProps {
  ticketId: string
  onBack?: () => void
}

function parseMessageContent(text: string) {
  // Check for image URLs
  const imgUrlRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s]*)?|https:\/\/res\.cloudinary\.com\/[^\s]+)/gi
  const matches = text.match(imgUrlRegex)

  return {
    cleanText: text.replace(imgUrlRegex, '').replace(/Attachment:\s*/gi, '').trim(),
    imageUrls: matches || []
  }
}

export function SupportTicketDetail({ ticketId, onBack }: SupportTicketDetailProps) {
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null)
  const [replies, setReplies] = useState<TicketReply[]>([])
  const [replyText, setReplyText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [isSupportTyping, setIsSupportTyping] = useState(false)

  // In-chat screenshot upload state
  const [chatImage, setChatImage] = useState<File | null>(null)
  const [chatImagePreview, setChatImagePreview] = useState<string | null>(null)
  const [selectedLightboxImage, setSelectedLightboxImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastTypingSentRef = useRef<number>(0)

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  async function load(initial = false) {
    if (initial) setLoading(true)
    try {
      const t = await apiClient.get<{ success: boolean; data: SupportTicketDetail }>(`/api/v1/support/tickets/${ticketId}`)
      if (t?.success) setTicket(t.data)
    } catch { }
    try {
      const r = await apiClient.get<{ success: boolean; data: TicketReply[] }>(`/api/v1/support/tickets/${ticketId}/replies`)
      if (r?.success && Array.isArray(r.data)) {
        setReplies(r.data)
        if (initial) setTimeout(() => scrollToBottom(false), 50)
      }
    } catch { }
    if (initial) setLoading(false)
  }

  useEffect(() => {
    load(true)
  }, [ticketId])

  // Live polling backup every 3.5s for seamless real-time syncing
  useEffect(() => {
    const interval = setInterval(() => {
      load(false)
    }, 3500)
    return () => clearInterval(interval)
  }, [ticketId])

  // Ably Real-Time listener for instant replies & typing indicator
  useUserRealtime(`banking:support:${ticketId}`, (payload) => {
    if (payload?.type === 'typing') {
      setIsSupportTyping(payload.is_typing)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (payload.is_typing) {
        typingTimerRef.current = setTimeout(() => setIsSupportTyping(false), 3500)
      }
      return
    }

    // New message event
    load(false)
    setIsSupportTyping(false)
    setTimeout(() => scrollToBottom(true), 50)
  })

  // Broadcast typing indicator to support agent
  const handleTyping = (text: string) => {
    setReplyText(text)
    const now = Date.now()
    if (now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now
      apiClient.post(`/api/v1/support/tickets/${ticketId}/typing`, { is_typing: true }).catch(() => { })
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) return
      setChatImage(file)
      setChatImagePreview(URL.createObjectURL(file))
    }
  }

  const removeChatImage = () => {
    setChatImage(null)
    if (chatImagePreview) URL.revokeObjectURL(chatImagePreview)
    setChatImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function sendReply() {
    const messageToSend = replyText.trim()
    if ((!messageToSend && !chatImage) || sending) return
    setSending(true)

    try {
      let finalMessage = messageToSend

      // If user attached an image, upload to Cloudinary first
      if (chatImage) {
        const formData = new FormData()
        formData.append('file', chatImage)
        const uploadRes: any = await apiClient.post('/api/v1/support/upload-attachment', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        if (uploadRes?.success && uploadRes?.data?.url) {
          const imgUrl = uploadRes.data.url
          finalMessage = finalMessage ? `${finalMessage}\n\nAttachment: ${imgUrl}` : `Attachment: ${imgUrl}`
        }
      }

      // Optimistic message append
      const tempId = 'temp-' + Date.now()
      const optimisticReply: TicketReply = {
        id: tempId,
        ticket_id: ticketId,
        author_id: 'me',
        author_name: 'You',
        message: finalMessage,
        is_from_staff: false,
        created_at: new Date().toISOString(),
      }
      setReplies((prev) => [...prev, optimisticReply])
      setReplyText('')
      removeChatImage()
      setTimeout(() => scrollToBottom(true), 40)

      await apiClient.post(`/api/v1/support/tickets/${ticketId}/replies`, { message: finalMessage })
      await load(false)
    } catch (err) {
      console.error('Failed to send reply:', err)
      await load(false)
    } finally {
      setSending(false)
      apiClient.post(`/api/v1/support/tickets/${ticketId}/typing`, { is_typing: false }).catch(() => { })
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-8 flex items-center justify-center gap-3 text-slate-500 shadow-sm" style={{ borderColor: colors.border }}>
        <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
        <span className="text-sm font-medium">Connecting to secure ticket thread…</span>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center text-slate-500 shadow-sm" style={{ borderColor: colors.border }}>
        <p className="text-sm font-medium">Ticket record not found.</p>
        {onBack && (
          <button onClick={onBack} className="mt-3 text-xs text-blue-600 font-semibold underline">
            Back to Ticket Center
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Lightbox for Image Zoom */}
      {selectedLightboxImage && (
        <div
          onClick={() => setSelectedLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs cursor-pointer"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
            <img
              src={selectedLightboxImage}
              alt="Screenshot attachment"
              className="max-w-full max-h-[85vh] object-contain rounded-xl"
            />
            <button
              onClick={() => setSelectedLightboxImage(null)}
              className="absolute top-3 right-3 bg-white/90 text-slate-800 p-1.5 rounded-full shadow hover:bg-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Ticket Header & Context Bar */}
      <div className="rounded-2xl border bg-white p-4 sm:p-5 shadow-sm space-y-3.5" style={{ borderColor: colors.border }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3" style={{ borderColor: colors.borderLight }}>
          <div className="flex items-start gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="mt-0.5 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shrink-0"
                title="Back to Tickets"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base sm:text-lg font-bold text-slate-900">
                  {ticket.subject}
                </span>
                <span className="text-xs font-mono bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md font-bold">
                  #{ticket.ticket_number}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700">{ticket.category || 'General Banking'}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {formatDateTime(ticket.created_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${ticket.status === 'resolved'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : ticket.status === 'closed'
                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${ticket.status === 'resolved'
                    ? 'bg-emerald-500'
                    : ticket.status === 'closed'
                      ? 'bg-slate-500'
                      : 'bg-blue-500 animate-pulse'
                  }`}
              />
              {ticket.status?.replace('_', ' ') || 'Open'}
            </span>
          </div>
        </div>

        {/* Original Description */}
        {(() => {
          const { cleanText, imageUrls } = parseMessageContent(ticket.description || '')
          return (
            <div className="text-xs sm:text-sm text-slate-700 bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80 leading-relaxed">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Original Inquiry Summary
              </div>
              {cleanText ? (
                <div className="whitespace-pre-wrap">{cleanText}</div>
              ) : (
                !imageUrls.length && <div className="text-slate-400 italic">No description provided.</div>
              )}
              {imageUrls.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {imageUrls.map((url, imgIdx) => (
                    <div key={imgIdx} className="group relative">
                      <img
                        src={url}
                        alt="Inquiry attachment"
                        onClick={() => setSelectedLightboxImage(url)}
                        className="h-28 max-w-xs rounded-xl object-cover border border-slate-200 shadow-2xs cursor-pointer hover:opacity-90 transition-opacity bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedLightboxImage(url)}
                        className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View Image
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Conversation Thread Window */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden flex flex-col h-[520px] sm:h-[560px]" style={{ borderColor: colors.border }}>
        {/* Thread Header */}
        <div className="p-3.5 sm:p-4 border-b bg-slate-50/70 flex items-center justify-between" style={{ borderColor: colors.borderLight }}>
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-bold text-slate-900">Secure Direct Support Thread</span>
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${ticket.status === 'resolved' || ticket.status === 'closed'
                ? 'bg-slate-100 text-slate-600 border-slate-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ticket.status === 'resolved' || ticket.status === 'closed' ? 'bg-slate-400' : 'bg-emerald-500 animate-pulse'
                }`} />
              {ticket.status === 'resolved' || ticket.status === 'closed' ? 'Case Concluded' : 'Live Connected'}
            </div>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {replies.length} {replies.length === 1 ? 'message' : 'messages'}
          </span>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 p-3.5 sm:p-4 space-y-4 overflow-y-auto bg-slate-50/30">
          {replies.map((r) => {
            const isMe = r.author_id === 'me' || (!r.is_from_staff && r.author_id !== 'support' && !r.author_name?.toLowerCase().includes('support'))
            const { cleanText, imageUrls } = parseMessageContent(r.message || '')

            return (
              <div key={r.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[11px] font-bold text-slate-700">
                    {isMe ? (
                      'You'
                    ) : (
                      <span className="text-blue-700 flex items-center gap-1 font-bold">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Broadmont Support
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-slate-400">{formatDateTime(r.created_at)}</span>
                </div>

                <div
                  className={`max-w-[90%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-sm ${isMe
                      ? 'text-white rounded-br-none'
                      : 'bg-white text-slate-800 rounded-bl-none border border-slate-200/90'
                    }`}
                  style={{ backgroundColor: isMe ? colors.primary : undefined }}
                >
                  {cleanText && <div className="whitespace-pre-wrap break-words">{cleanText}</div>}

                  {/* Render Image Attachments in Chat */}
                  {imageUrls.map((url, imgIdx) => (
                    <div key={imgIdx} className="mt-2 group relative">
                      <img
                        src={url}
                        alt="Screenshot attachment"
                        onClick={() => setSelectedLightboxImage(url)}
                        className="max-h-48 rounded-xl object-cover border border-white/20 shadow-xs cursor-pointer hover:opacity-95 transition-opacity"
                      />
                      <div
                        onClick={() => setSelectedLightboxImage(url)}
                        className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Zoom
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {replies.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 text-xs">
              <p className="font-semibold text-slate-600">Connecting you to an advisor…</p>
              <p className="text-slate-400 mt-1">Your inquiry has been submitted and is currently in queue.</p>
            </div>
          )}

          {/* Live Support Typing Indicator */}
          {isSupportTyping && (
            <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50/80 p-2.5 rounded-full border border-blue-200 w-fit shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-semibold">Broadmont Support is typing…</span>
              <div className="flex items-center gap-1 px-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Reply Composer or Closed Notice */}
        {ticket.status === 'resolved' || ticket.status === 'closed' ? (
          <div className="p-4 sm:p-5 border-t bg-slate-50/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left" style={{ borderColor: colors.borderLight }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-200/90 flex items-center justify-center text-slate-600 shrink-0">
                <Lock className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <div className="text-xs sm:text-sm font-bold text-slate-800">
                  This support case has been marked as {ticket.status}.
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Direct replies are locked on completed cases. If you need further assistance, please submit a new ticket.
                </div>
              </div>
            </div>
            {onBack && (
              <button
                onClick={onBack}
                className="px-4 py-2.5 rounded-xl text-white font-semibold text-xs transition-all shadow-sm hover:brightness-105 shrink-0"
                style={{ backgroundColor: colors.primary }}
              >
                Create New Ticket
              </button>
            )}
          </div>
        ) : (
          <div className="p-3 sm:p-4 border-t bg-white flex flex-col gap-2" style={{ borderColor: colors.borderLight }}>
            {/* Chat Image Pending Preview */}
            {chatImagePreview && (
              <div className="relative w-fit rounded-xl border border-slate-200 p-1 bg-slate-50 mb-1">
                <img
                  src={chatImagePreview}
                  alt="Selected screenshot"
                  className="h-16 rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={removeChatImage}
                  className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5 shadow hover:bg-red-700"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="flex gap-2 items-center">
              {/* Screenshot attachment button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-10 w-10 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors shrink-0"
                title="Attach Screenshot"
              >
                <ImageIcon className="w-4 h-4 text-blue-600" />
              </button>

              <Input
                placeholder="Type your response to customer support (Press Enter to send)…"
                value={replyText}
                onChange={(e) => handleTyping(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendReply()
                  }
                }}
                className="text-xs sm:text-sm bg-slate-50 border-slate-200 h-10 rounded-xl focus-visible:ring-1 focus-visible:ring-blue-500"
              />

              <button
                disabled={sending || (!replyText.trim() && !chatImage)}
                onClick={sendReply}
                className="h-10 px-4 sm:px-5 rounded-xl text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 shrink-0 transition-all disabled:opacity-40 hover:brightness-105 active:scale-95 shadow-sm"
                style={{ backgroundColor: colors.primary }}
              >
                {sending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span className="hidden sm:inline">Send</span>
                    <Send className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span>Press <strong>Enter</strong> to send • Attach screenshots via image icon</span>
              {onBack && (
                <button onClick={onBack} className="text-blue-600 hover:underline font-semibold">
                  Close Chat
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
