'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api-client'
import { colors } from '@/types'
import { MessageSquare, X, Send, Bot, User as UserIcon, ShieldCheck, Ticket, CheckCircle2, ChevronRight, RefreshCw } from 'lucide-react'

interface Message {
  id: string
  text: string
  isAgent: boolean
  time: string
  suggestTicket?: boolean
  suggestedSubject?: string
  suggestedCategory?: string
  ticketCreated?: boolean
  ticketNumber?: string
}

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes inactivity limit

const QUICK_PROMPTS = [
  'How do I check my transfer limits?',
  'What is your routing number and SWIFT code?',
  'How do I report a lost or stolen card?',
  'Why is my account/transfer restricted?',
  'How do I apply for a loan?',
  'I want to speak with a human advisor',
]

const getInitialWelcomeMessage = (): Message => ({
  id: 'welcome-init',
  text: 'Hello! Welcome to Broadmont National Bank 24/7 Digital Support. How can I assist you with your accounts, transfers, loans, cards, or security settings today?',
  isAgent: true,
  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
})

export function ChatWidget({ embedded = false }: { embedded?: boolean }) {
  const [isOpen, setIsOpen] = useState(embedded)
  const [chatId, setChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([getInitialWelcomeMessage()])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [creatingTicketForId, setCreatingTicketForId] = useState<string | null>(null)
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastActiveRef = useRef<number>(Date.now())

  const markActive = () => {
    const now = Date.now()
    lastActiveRef.current = now
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('bnb_chat_last_active', String(now))
      } catch { }
    }
  }

  // Periodic 15-minute inactivity watchdog
  useEffect(() => {
    const interval = setInterval(() => {
      let lastTime = lastActiveRef.current
      if (typeof window !== 'undefined') {
        const saved = sessionStorage.getItem('bnb_chat_last_active')
        if (saved) lastTime = parseInt(saved, 10)
      }

      if (Date.now() - lastTime >= INACTIVITY_TIMEOUT_MS) {
        // Clear chat due to inactivity
        setChatId(null)
        setMessages([getInitialWelcomeMessage()])
        setSessionNotice('Chat session was cleared due to 15 minutes of inactivity.')
        markActive()
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.removeItem('bnb_chat_id')
          } catch { }
        }
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (embedded) setIsOpen(true)
  }, [embedded])

  useEffect(() => {
    if (isOpen && !chatId) {
      initChat()
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isOpen, sending])

  const initChat = async () => {
    markActive()
    try {
      const res = await apiClient.post<{ success: boolean; data: { chat_id: string } }>('/api/v1/support/chat/start', {})
      if (res?.success && res.data.chat_id) {
        setChatId(res.data.chat_id)
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('bnb_chat_id', res.data.chat_id)
          } catch { }
        }
        try {
          const mRes = await apiClient.get<{ success: boolean; data: any[] }>(`/api/v1/support/chat/${res.data.chat_id}/messages`)
          if (mRes?.success && mRes.data.length > 0) {
            const formatted: Message[] = mRes.data
              .slice()
              .reverse()
              .map((m) => ({
                id: m.id,
                text: m.message,
                isAgent: m.is_from_agent,
                time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              }))
            if (formatted.length > 0) {
              setMessages(formatted)
            }
          }
        } catch { }
      }
    } catch { }
  }

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim()
    if (!text || sending) return

    markActive()
    setSessionNotice(null)

    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      text,
      isAgent: false,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    if (!textToSend) setInput('')
    setSending(true)

    try {
      let currentChatId = chatId
      if (!currentChatId) {
        const cRes = await apiClient.post<{ success: boolean; data: { chat_id: string } }>('/api/v1/support/chat/start', {})
        if (cRes?.success) {
          currentChatId = cRes.data.chat_id
          setChatId(currentChatId)
        }
      }

      if (currentChatId) {
        const res = await apiClient.post<{
          success: boolean
          data: {
            assistant_reply: string
            assistant_message_id: string
            suggest_ticket?: boolean
            suggested_subject?: string
            suggested_category?: string
          }
        }>(`/api/v1/support/chat/${currentChatId}/message`, { message: text })

        if (res?.success && res.data.assistant_reply) {
          const botMsg: Message = {
            id: res.data.assistant_message_id || `bot-${Date.now()}`,
            text: res.data.assistant_reply,
            isAgent: true,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            suggestTicket: res.data.suggest_ticket,
            suggestedSubject: res.data.suggested_subject || 'Client Support Inquiry',
            suggestedCategory: res.data.suggested_category || 'General',
          }
          setMessages((prev) => [...prev, botMsg])
          markActive()
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          text: 'Thank you for your message. Would you like me to open an official Support Ticket so an assigned specialist can follow up with you directly?',
          isAgent: true,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestTicket: true,
          suggestedSubject: text.slice(0, 50) || 'Support Inquiry',
          suggestedCategory: 'General',
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const handleCreateTicketFromChat = async (msg: Message) => {
    if (!chatId || creatingTicketForId) return
    markActive()
    setCreatingTicketForId(msg.id)

    try {
      const res = await apiClient.post<{
        success: boolean
        data: { ticket_id: string; ticket_number: string; confirmation_message: string }
      }>(`/api/v1/support/chat/${chatId}/create-ticket`, {
        subject: msg.suggestedSubject || 'Client Support Inquiry',
        description: `Customer requested ticket creation from 24/7 Digital Assistant.\nTopic: ${msg.suggestedSubject || 'General Inquiry'}`,
        category: msg.suggestedCategory || 'General',
        priority: 'medium',
      })

      if (res?.success && res.data) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? {
                ...m,
                suggestTicket: false,
                ticketCreated: true,
                ticketNumber: res.data.ticket_number,
              }
              : m
          )
        )
        markActive()
      }
    } catch {
      alert('Unable to generate ticket automatically. Please use the Create Ticket tab.')
    } finally {
      setCreatingTicketForId(null)
    }
  }

  const resetChatManually = () => {
    setChatId(null)
    setMessages([getInitialWelcomeMessage()])
    setSessionNotice('Chat session has been reset.')
    markActive()
    initChat()
  }

  // Embedded view (Inside Support Center Tab)
  if (embedded) {
    return (
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col h-[540px]" style={{ borderColor: colors.border }}>
        {/* Header */}
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ backgroundColor: colors.primary, color: '#ffffff' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">BNB Digital Assistant</div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                24/7 Automated Banking Support
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetChatManually}
              title="Reset conversation"
              className="p-1.5 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition text-xs flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
            <div className="flex items-center gap-1 text-xs bg-white/10 px-2.5 py-1 rounded-md text-white/90">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Encrypted</span>
            </div>
          </div>
        </div>

        {/* Inactivity notice */}
        {sessionNotice && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-[11px] text-amber-800 flex items-center justify-between">
            <span>{sessionNotice}</span>
            <button onClick={() => setSessionNotice(null)} className="text-amber-700 hover:text-amber-900 font-bold ml-2">✕</button>
          </div>
        )}

        {/* Conversation */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-50/50">
          {messages.map((m) => (
            <div key={m.id} className={`flex flex-col ${m.isAgent ? 'items-start' : 'items-end'}`}>
              <div className={`flex gap-2.5 max-w-[85%] ${m.isAgent ? 'flex-row' : 'flex-row-reverse'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${m.isAgent ? 'bg-blue-100 text-blue-700' : 'bg-slate-800 text-white'}`}>
                  {m.isAgent ? <Bot className="w-4 h-4" /> : <UserIcon className="w-3.5 h-3.5" />}
                </div>
                <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.isAgent ? 'bg-white text-slate-800 border border-slate-200/80 shadow-sm rounded-tl-none' : 'text-white rounded-br-none shadow-sm'}`} style={{ backgroundColor: m.isAgent ? undefined : colors.primary }}>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  <div className={`text-[10px] mt-1 text-right ${m.isAgent ? 'text-slate-400' : 'text-blue-100'}`}>{m.time}</div>
                </div>
              </div>

              {/* Interactive Ticket Escalation Action Card */}
              {m.suggestTicket && (
                <div className="ml-9 mt-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3 max-w-[80%] shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <Ticket className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-slate-900">Direct Case Escalation</div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Would you like to open an official Support Ticket for: <strong>"{m.suggestedSubject}"</strong>?
                      </p>
                      <button
                        disabled={creatingTicketForId === m.id}
                        onClick={() => handleCreateTicketFromChat(m)}
                        className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all hover:brightness-105 active:scale-95 shadow-sm"
                        style={{ backgroundColor: colors.primary }}
                      >
                        {creatingTicketForId === m.id ? 'Creating Ticket…' : 'Create Support Ticket Now'}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Ticket Created Confirmation Badge */}
              {m.ticketCreated && (
                <div className="ml-9 mt-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 max-w-[80%] flex items-center gap-2 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Support Ticket <strong>#{m.ticketNumber}</strong> has been created and emailed to support & your inbox.</span>
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex gap-2.5 items-start">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-sm text-slate-400 rounded-tl-none flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick prompt chips */}
        <div className="px-4 py-2 bg-white border-t border-slate-100 flex gap-1.5 overflow-x-auto no-scrollbar">
          {QUICK_PROMPTS.map((p, idx) => (
            <button
              key={idx}
              disabled={sending}
              onClick={() => handleSend(p)}
              className="text-xs whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded-full transition-colors shrink-0"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t flex gap-2" style={{ borderColor: colors.borderLight }}>
          <input
            type="text"
            placeholder="Ask a question about your accounts, transfers, limits, or security…"
            value={input}
            onChange={(e) => { setInput(e.target.value); markActive() }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 outline-none focus:border-blue-500 transition"
          />
          <button
            disabled={sending || !input.trim()}
            onClick={() => handleSend()}
            className="px-4 py-2 rounded-lg text-white font-medium text-sm transition-all disabled:opacity-50 hover:brightness-105 flex items-center gap-1.5"
            style={{ backgroundColor: colors.primary }}
          >
            <span>Send</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // Floating Chat Widget
  return (
    <>
      {/* Floating Toggle Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => { setIsOpen((prev) => !prev); markActive() }}
          className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-white transition-all transform hover:scale-105 active:scale-95 relative"
          style={{ backgroundColor: colors.primary }}
          aria-label="Open support chat"
        >
          {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
          {!isOpen && (
            <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
          )}
        </button>
      </div>

      {/* Floating Chat Modal */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[380px] max-w-[calc(100vw-32px)] h-[550px] max-h-[calc(100vh-120px)] bg-white rounded-2xl shadow-2xl border flex flex-col z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200" style={{ borderColor: colors.border }}>
          {/* Header */}
          <div className="px-4 py-3.5 flex items-center justify-between" style={{ backgroundColor: colors.primary, color: '#ffffff' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-semibold text-sm leading-tight">BNB Digital Assistant</div>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Online 24/7
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={resetChatManually}
                title="Reset conversation"
                className="p-1 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Inactivity notice */}
          {sessionNotice && (
            <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 text-[10px] text-amber-800 flex items-center justify-between">
              <span>{sessionNotice}</span>
              <button onClick={() => setSessionNotice(null)} className="text-amber-700 hover:text-amber-900 font-bold ml-1">✕</button>
            </div>
          )}

          {/* Conversation */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-50/60">
            {messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.isAgent ? 'items-start' : 'items-end'}`}>
                <div className={`flex gap-2 max-w-[85%] ${m.isAgent ? 'flex-row' : 'flex-row-reverse'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${m.isAgent ? 'bg-blue-100 text-blue-700' : 'bg-slate-800 text-white'}`}>
                    {m.isAgent ? <Bot className="w-3.5 h-3.5" /> : <UserIcon className="w-3 h-3" />}
                  </div>
                  <div className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${m.isAgent ? 'bg-white text-slate-800 border border-slate-200/80 shadow-sm rounded-tl-none' : 'text-white rounded-br-none shadow-sm'}`} style={{ backgroundColor: m.isAgent ? undefined : colors.primary }}>
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    <div className={`text-[9px] mt-1 text-right ${m.isAgent ? 'text-slate-400' : 'text-blue-100'}`}>{m.time}</div>
                  </div>
                </div>

                {/* Escalation Prompt Card */}
                {m.suggestTicket && (
                  <div className="ml-8 mt-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-2.5 max-w-[85%] shadow-sm">
                    <div className="text-[11px] font-semibold text-slate-900">Need direct escalation?</div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Open official ticket for: <strong>"{m.suggestedSubject}"</strong>
                    </p>
                    <button
                      disabled={creatingTicketForId === m.id}
                      onClick={() => handleCreateTicketFromChat(m)}
                      className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-white transition hover:brightness-105"
                      style={{ backgroundColor: colors.primary }}
                    >
                      {creatingTicketForId === m.id ? 'Creating…' : 'Create Ticket Now'}
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Ticket Created Notification */}
                {m.ticketCreated && (
                  <div className="ml-8 mt-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-2 max-w-[85%] flex items-center gap-1.5 text-[11px] font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Ticket <strong>#{m.ticketNumber}</strong> created & sent to support & email.</span>
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="flex gap-2 items-start">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs shrink-0">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl px-3.5 py-2 text-xs text-slate-400 rounded-tl-none flex items-center gap-1 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          <div className="px-3 py-1.5 bg-white border-t border-slate-100 flex gap-1.5 overflow-x-auto no-scrollbar">
            {QUICK_PROMPTS.map((p, idx) => (
              <button
                key={idx}
                disabled={sending}
                onClick={() => handleSend(p)}
                className="text-[11px] whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full transition-colors shrink-0"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-2.5 bg-white border-t flex gap-2" style={{ borderColor: colors.borderLight }}>
            <input
              type="text"
              placeholder="Ask anything…"
              value={input}
              onChange={(e) => { setInput(e.target.value); markActive() }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition"
            />
            <button
              disabled={sending || !input.trim()}
              onClick={() => handleSend()}
              className="px-3 py-2 rounded-lg text-white font-medium text-xs transition-all disabled:opacity-50 hover:brightness-105 flex items-center justify-center"
              style={{ backgroundColor: colors.primary }}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
