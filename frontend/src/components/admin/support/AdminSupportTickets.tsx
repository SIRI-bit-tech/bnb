'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { colors } from '@/types'
import type { AdminSupportTicket, SupportAgent, TicketReply } from '@/types'
import { useAdminRealtime } from '@/hooks/use-admin-realtime'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDateTime } from '@/lib/utils'
import {
  Send,
  ShieldCheck,
  Clock,
  Search,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  Image as ImageIcon,
  X,
  ExternalLink
} from 'lucide-react'

function StatusPill({ status }: { status: AdminSupportTicket['status'] }) {
  const map: Record<AdminSupportTicket['status'], { bg: string; text: string; border: string }> = {
    open: { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
    in_progress: { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
    waiting_customer: { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
    resolved: { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
    closed: { bg: '#F1F5F9', text: '#64748B', border: '#CBD5E1' },
  }
  const cfg = map[status] || { bg: '#F1F5F9', text: '#64748B', border: '#CBD5E1' }
  return (
    <span
      className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border inline-flex items-center gap-1"
      style={{ backgroundColor: cfg.bg, color: cfg.text, borderColor: cfg.border }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.text }} />
      {status.replace('_', ' ')}
    </span>
  )
}

function PriorityTag({ priority }: { priority: string }) {
  const isHigh = priority?.toLowerCase() === 'high' || priority?.toLowerCase() === 'urgent'
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded ${isHigh ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
        } capitalize`}
    >
      {priority || 'normal'}
    </span>
  )
}

function parseMessageContent(text: string) {
  const imgUrlRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s]*)?|https:\/\/res\.cloudinary\.com\/[^\s]+)/gi
  const matches = text.match(imgUrlRegex)

  return {
    cleanText: text.replace(imgUrlRegex, '').replace(/Attachment:\s*/gi, '').trim(),
    imageUrls: matches || []
  }
}

export function AdminSupportTickets() {
  const [items, setItems] = useState<AdminSupportTicket[]>([])
  const [agents, setAgents] = useState<SupportAgent[]>([])
  const [active, setActive] = useState<AdminSupportTicket | null>(null)
  const [replies, setReplies] = useState<TicketReply[]>([])
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [isCustomerTyping, setIsCustomerTyping] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  // Image attachment & Lightbox
  const [adminImage, setAdminImage] = useState<File | null>(null)
  const [adminImagePreview, setAdminImagePreview] = useState<string | null>(null)
  const [selectedLightboxImage, setSelectedLightboxImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeRef = useRef<AdminSupportTicket | null>(null)
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastTypingSentRef = useRef<number>(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef<boolean>(true)
  const repliesLengthRef = useRef<number>(0)

  // Track if user has scrolled up
  const handleScroll = () => {
    if (!scrollContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 80
  }

  // Auto-scroll to bottom of conversation safely
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  async function load() {
    try {
      const res = await apiClient.get<{ success: boolean; data: AdminSupportTicket[] }>('/admin/support/tickets?limit=100')
      if (res?.success && Array.isArray(res.data)) {
        setItems(res.data)
        // If we have an active ticket, update its reference in state
        if (activeRef.current) {
          const updated = res.data.find((t) => t.id === activeRef.current?.id)
          if (updated) setActive(updated)
        }
      }
    } catch (e) {
      console.error('Error fetching support tickets:', e)
    }
  }

  async function loadAgents() {
    try {
      const res = await apiClient.get<{ success: boolean; data: SupportAgent[] }>('/admin/support/agents')
      if (res?.success && Array.isArray(res.data)) setAgents(res.data)
    } catch { }
  }

  async function loadDetail(id: string, forceScroll = false) {
    try {
      const msgs = await apiClient.get<{ success: boolean; data: TicketReply[] }>(`/admin/support/tickets/${id}/replies`)
      if (msgs?.success && Array.isArray(msgs.data)) {
        const hasNewMessages = msgs.data.length > repliesLengthRef.current
        repliesLengthRef.current = msgs.data.length
        setReplies(msgs.data)

        // Only scroll if explicitly forced (e.g. ticket clicked / sent) OR if new messages arrived while already at bottom
        if (forceScroll || (hasNewMessages && isAtBottomRef.current)) {
          setTimeout(() => scrollToBottom(false), 40)
        }
      }
    } catch (e) {
      console.error('Error loading ticket replies:', e)
    }
  }

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    load()
    loadAgents()
  }, [])

  // Live polling backup every 3.5s for seamless real-time syncing across all browsers
  useEffect(() => {
    const interval = setInterval(() => {
      load()
      if (activeRef.current?.id) {
        loadDetail(activeRef.current.id, false)
      }
    }, 3500)
    return () => clearInterval(interval)
  }, [])

  // Real-time Ably hook
  useAdminRealtime('admin:support', (payload) => {
    load()
    const cur = activeRef.current
    if (cur) {
      loadDetail(cur.id, false)
    }
    if (payload?.type === 'typing' && payload?.ticket_id === activeRef.current?.id) {
      setIsCustomerTyping(payload.is_typing)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (payload.is_typing) {
        typingTimerRef.current = setTimeout(() => setIsCustomerTyping(false), 3500)
      }
    }
  })

  // Broadcast typing indicator to user
  const handleTyping = (text: string) => {
    setReplyText(text)
    if (!active?.id) return
    const now = Date.now()
    if (now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now
      apiClient.post(`/admin/support/tickets/${active.id}/typing`, { is_typing: true }).catch(() => { })
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) return
      setAdminImage(file)
      setAdminImagePreview(URL.createObjectURL(file))
    }
  }

  const removeAdminImage = () => {
    setAdminImage(null)
    if (adminImagePreview) URL.revokeObjectURL(adminImagePreview)
    setAdminImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const filteredTickets = useMemo(() => {
    return items.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchNumber = t.ticket_number?.toLowerCase().includes(q)
        const matchSubj = t.subject?.toLowerCase().includes(q)
        const matchUser = t.user_name?.toLowerCase().includes(q) || t.user_email?.toLowerCase().includes(q)
        if (!matchNumber && !matchSubj && !matchUser) return false
      }
      return true
    })
  }, [items, statusFilter, searchQuery])

  const counts = useMemo(() => {
    return {
      all: items.length,
      open: items.filter((t) => t.status === 'open').length,
      in_progress: items.filter((t) => t.status === 'in_progress').length,
      waiting_customer: items.filter((t) => t.status === 'waiting_customer').length,
      resolved: items.filter((t) => t.status === 'resolved').length,
    }
  }, [items])

  async function assignAgent(id: string, agent_id: string) {
    try {
      await apiClient.put(`/admin/support/tickets/${id}/assign`, { agent_id })
      await load()
      if (active?.id === id) await loadDetail(id, false)
    } catch (e: any) {
      console.error('Failed to assign agent', e)
      setActionError('Failed to assign agent')
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await apiClient.put(`/admin/support/tickets/${id}/status`, { status })
      await load()
      if (active?.id === id) await loadDetail(id, false)
    } catch (e: any) {
      console.error('Failed to update status', e)
      setActionError('Failed to update status')
    }
  }

  async function sendReply(id: string) {
    const messageToSend = replyText.trim()
    if ((!messageToSend && !adminImage) || sending) return

    setActionError(null)
    setSending(true)

    try {
      let finalMessage = messageToSend

      // If staff attached screenshot, upload to Cloudinary
      if (adminImage) {
        const formData = new FormData()
        formData.append('file', adminImage)
        const uploadRes: any = await apiClient.post('/admin/support/upload-attachment', formData, {
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
        ticket_id: id,
        author_id: 'me',
        author_name: 'Broadmont Support',
        message: finalMessage,
        is_from_staff: true,
        created_at: new Date().toISOString(),
      }
      setReplies((prev) => [...prev, optimisticReply])
      setReplyText('')
      removeAdminImage()
      setTimeout(() => scrollToBottom(true), 40)

      const res: any = await apiClient.post(`/admin/support/tickets/${id}/replies`, { message: finalMessage })
      if (res?.success) {
        await loadDetail(id, true)
        await load()
      }
    } catch (e: any) {
      console.error('Failed to send reply', e)
      setActionError('Failed to dispatch reply. Please try again.')
    } finally {
      setSending(false)
      // Clear typing indicator
      apiClient.post(`/admin/support/tickets/${id}/typing`, { is_typing: false }).catch(() => { })
    }
  }

  return (
    <div className="space-y-4">
      {/* Lightbox for Full-Size Screenshot View */}
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Support Desk Workspace</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time client conversations, ticket escalation, and resolution management.
          </p>
        </div>
        <button
          onClick={() => {
            load()
            if (active?.id) loadDetail(active.id, false)
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors shadow-2xs self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Sync Feed</span>
        </button>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-500 hover:text-red-700 text-xs font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Split-Pane Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[680px]">
        {/* Left Column: Ticket Queue List (5 cols) */}
        <div className="lg:col-span-5 flex flex-col bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: colors.border }}>
          {/* Queue Filter Bar */}
          <div className="p-4 border-b space-y-3 bg-slate-50/50" style={{ borderColor: colors.borderLight }}>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search ticket #, subject, client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs bg-white h-9 rounded-xl border-slate-200"
              />
            </div>

            {/* Status Pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {[
                { id: 'all', label: 'All', count: counts.all },
                { id: 'open', label: 'Open', count: counts.open, highlight: counts.open > 0 },
                { id: 'in_progress', label: 'In Progress', count: counts.in_progress },
                { id: 'waiting_customer', label: 'Waiting Client', count: counts.waiting_customer },
                { id: 'resolved', label: 'Resolved', count: counts.resolved },
              ].map((tab) => {
                const isActive = statusFilter === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-2 ${isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    {tab.label}
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive
                        ? 'bg-slate-700 text-white'
                        : tab.highlight
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                        }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Ticket Queue Stream */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-[580px]">
            {filteredTickets.map((t) => {
              const isSelected = active?.id === t.id
              const customerInitials = t.user_name
                ? t.user_name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)
                : 'CL'

              return (
                <div
                  key={t.id}
                  onClick={() => {
                    setActive(t)
                    repliesLengthRef.current = 0
                    loadDetail(t.id, true)
                  }}
                  className={`p-4 transition-all cursor-pointer relative flex flex-col gap-2 ${isSelected ? 'bg-blue-50/70 border-l-4 border-l-blue-600' : 'hover:bg-slate-50/80 border-l-4 border-l-transparent'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 shrink-0">
                        {customerInitials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-blue-600">
                            #{t.ticket_number}
                          </span>
                          <span className="text-[11px] text-slate-400">•</span>
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {t.user_name || t.user_email || 'Verified Client'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 truncate font-medium mt-0.5">
                          {t.subject}
                        </p>
                      </div>
                    </div>
                    <StatusPill status={t.status} />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 pt-1 border-t border-slate-100/80">
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-medium">
                        {t.category || 'General'}
                      </span>
                      <PriorityTag priority={t.priority} />
                    </div>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDateTime(t.created_at)}
                    </span>
                  </div>
                </div>
              )
            })}

            {filteredTickets.length === 0 && (
              <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
                <MessageSquare className="w-8 h-8 stroke-1 text-slate-300 mb-2" />
                <p className="text-xs font-medium">No tickets match the selected filter.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Live Conversation View (7 cols) */}
        <div className="lg:col-span-7 flex flex-col bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: colors.border }}>
          {active ? (
            <div className="flex flex-col h-full">
              {/* Conversation Header */}
              <div className="p-4 border-b bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: colors.borderLight }}>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">{active.subject}</h2>
                    <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      #{active.ticket_number}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Client: <strong className="text-slate-800">{active.user_name || active.user_email}</strong> ({active.user_email})
                  </div>
                </div>

                {/* Quick Controls */}
                <div className="flex items-center gap-2">
                  <Select
                    value={active.status}
                    onValueChange={(val) => updateStatus(active.id, val)}
                  >
                    <SelectTrigger className="h-8 text-xs w-[130px] bg-white border-slate-200">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="waiting_customer">Waiting Client</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={active.assigned_to_id || 'unassigned'}
                    onValueChange={(val) => assignAgent(active.id, val === 'unassigned' ? '' : val)}
                  >
                    <SelectTrigger className="h-8 text-xs w-[130px] bg-white border-slate-200">
                      <SelectValue placeholder="Assign" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {agents.map((ag) => (
                        <SelectItem key={ag.id} value={ag.id}>
                          {ag.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Original Customer Inquiry Note */}
              {(() => {
                const { cleanText, imageUrls } = parseMessageContent(active.description || '')
                return (
                  <div className="p-3.5 bg-slate-50/80 border-b text-xs text-slate-700 leading-relaxed" style={{ borderColor: colors.borderLight }}>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Original Inquiry Summary
                    </div>
                    {cleanText ? (
                      <div className="whitespace-pre-wrap">{cleanText}</div>
                    ) : (
                      !imageUrls.length && <div className="text-slate-400 italic">No initial description text provided.</div>
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

              {/* Message Thread Window */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/40 min-h-[340px] max-h-[460px]"
              >
                {replies.map((r) => {
                  const isStaff = r.is_from_staff || r.author_id === 'me' || r.author_id === 'support' || (r.author_name && r.author_name.toLowerCase().includes('support'))
                  const { cleanText, imageUrls } = parseMessageContent(r.message || '')

                  return (
                    <div
                      key={r.id}
                      className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[11px] font-bold text-slate-700">
                          {isStaff ? (
                            <span className="text-blue-700 flex items-center gap-1 font-bold">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Broadmont Support
                            </span>
                          ) : (
                            r.author_name || active.user_name || 'Customer'
                          )}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatDateTime(r.created_at)}
                        </span>
                      </div>

                      <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-sm ${isStaff
                          ? 'bg-[#0056B3] text-white rounded-tr-none'
                          : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/90'
                          }`}
                      >
                        {cleanText && <div className="whitespace-pre-wrap break-words">{cleanText}</div>}

                        {/* Render Attached Images in Chat */}
                        {imageUrls.map((url, imgIdx) => (
                          <div key={imgIdx} className="mt-2 group relative">
                            <img
                              src={url}
                              alt="Screenshot attachment"
                              onClick={() => setSelectedLightboxImage(url)}
                              className="max-h-56 rounded-xl object-cover border border-slate-200 shadow-2xs cursor-pointer hover:opacity-95 transition-opacity"
                            />
                            <div
                              onClick={() => setSelectedLightboxImage(url)}
                              className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer"
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
                  <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400 text-xs">
                    <p className="font-medium">No replies on this ticket yet.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Send a reply below to update the client.</p>
                  </div>
                )}

                {/* Customer typing indicator */}
                {isCustomerTyping && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 bg-white p-2 rounded-full border border-slate-200 w-fit shadow-2xs">
                    <div className="flex items-center gap-1 px-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span>{active.user_name || 'Customer'} is typing…</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Chat Composer */}
              <div className="p-3.5 border-t bg-white flex flex-col gap-2 mt-auto" style={{ borderColor: colors.borderLight }}>
                {/* Admin Image Pending Preview */}
                {adminImagePreview && (
                  <div className="relative w-fit rounded-xl border border-slate-200 p-1 bg-slate-50 mb-1">
                    <img
                      src={adminImagePreview}
                      alt="Selected screenshot"
                      className="h-16 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={removeAdminImage}
                      className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5 shadow hover:bg-red-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2">
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
                    placeholder="Type an official reply to the client (Press Enter to send)…"
                    value={replyText}
                    onChange={(e) => handleTyping(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if (active) sendReply(active.id)
                      }
                    }}
                    className="text-xs sm:text-sm bg-slate-50 border-slate-200 h-10 rounded-xl focus-visible:ring-1 focus-visible:ring-blue-500"
                  />
                  <button
                    disabled={sending || (!replyText.trim() && !adminImage)}
                    onClick={() => active && sendReply(active.id)}
                    className="h-10 px-5 rounded-xl text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 shrink-0 transition-all disabled:opacity-40 hover:brightness-105 active:scale-95 shadow-sm"
                    style={{ backgroundColor: colors.primary }}
                  >
                    {sending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Send</span>
                        <Send className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                  <span>Press <strong>Enter</strong> to send • Real-time broadcast active</span>
                  <span className="font-mono text-[10px]">Ticket #{active.ticket_number}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center text-slate-400">
              <MessageSquare className="w-12 h-12 stroke-1 text-slate-300 mb-3" />
              <h3 className="text-sm font-semibold text-slate-700">No Ticket Selected</h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Select an open service inquiry from the queue on the left to start responding in real time.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
