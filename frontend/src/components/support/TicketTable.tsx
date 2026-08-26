'use client'

import Link from 'next/link'
import type { SupportTicket } from '@/types'
import { formatDateShort } from '@/lib/utils'
import { colors } from '@/types'
import { MessageSquare, Clock } from 'lucide-react'

function StatusPill({ status }: { status: SupportTicket['status'] }) {
  const map: Record<SupportTicket['status'], { bg: string; text: string; border: string }> = {
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

interface TicketTableProps {
  items: SupportTicket[]
  onSelectTicket?: (ticketId: string) => void
}

export function TicketTable({ items, onSelectTicket }: TicketTableProps) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden" style={{ borderColor: colors.border }}>
      <div className="flex items-center justify-between px-5 py-4 border-b bg-slate-50/70" style={{ borderColor: colors.borderLight }}>
        <div>
          <h3 className="text-sm font-bold text-slate-900">Your Support Tickets</h3>
          <p className="text-xs text-slate-500">Track and continue conversations with client services</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wider bg-slate-50/50 border-b border-slate-100">
              <th className="text-left py-3 px-5">Ticket ID</th>
              <th className="text-left py-3 px-5">Subject</th>
              <th className="text-left py-3 px-5">Date Logged</th>
              <th className="text-left py-3 px-5">Status</th>
              <th className="text-right py-3 px-5">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((t) => (
              <tr
                key={t.id}
                onClick={() => onSelectTicket ? onSelectTicket(t.id) : null}
                className="hover:bg-slate-50/80 transition-colors cursor-pointer"
              >
                <td className="py-3.5 px-5 font-mono text-xs font-bold text-blue-600">
                  #{t.ticket_number}
                </td>
                <td className="py-3.5 px-5">
                  <div className="font-semibold text-slate-800 text-xs sm:text-sm">{t.subject}</div>
                  <div className="text-[11px] text-slate-400">{t.category || 'General Banking'}</div>
                </td>
                <td className="py-3.5 px-5 text-xs text-slate-500 whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {formatDateShort(t.created_at)}
                  </span>
                </td>
                <td className="py-3.5 px-5 whitespace-nowrap">
                  <StatusPill status={t.status} />
                </td>
                <td className="py-3.5 px-5 text-right whitespace-nowrap">
                  {onSelectTicket ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectTicket(t.id)
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#0056B3] hover:bg-[#004494] transition-all shadow-2xs"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Open Thread</span>
                    </button>
                  ) : (
                    <Link
                      href={`/dashboard/support/tickets/${t.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#0056B3] hover:bg-[#004494] transition-all shadow-2xs"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>View Details</span>
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="py-10 px-5 text-center text-slate-400 text-xs" colSpan={5}>
                  No support tickets logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
