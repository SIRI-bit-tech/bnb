'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/lib/store'
import type { SupportTicket, FaqItem } from '@/types'
import { QuickActions, type SupportSection, type Action } from '@/components/support/QuickActions'
import { TicketTable } from '@/components/support/TicketTable'
import { CreateTicketForm } from '@/components/support/CreateTicketForm'
import { FAQSearch } from '@/components/support/FAQSearch'
import { ContactInfo } from '@/components/support/ContactInfo'
import { ChatWidget } from '@/components/support/ChatWidget'
import { SupportTicketDetail } from '@/components/support/SupportTicketDetail'

const faqs: FaqItem[] = [
  { id: 'f1', question: 'How do I reset my password?', answer: 'Use "Forgot Password" on the login page and follow the email instructions.', category: 'Security', tags: ['password', 'login'] },
  { id: 'f2', question: 'What are transfer fees?', answer: 'Internal transfers are free; domestic $2.50; international $25.', category: 'Transfers', tags: ['fees', 'transfers'] },
  { id: 'f3', question: 'How long do transfers take?', answer: 'Internal instant; domestic 1-2 business days; international 3-5 business days.', category: 'Transfers' },
  { id: 'f4', question: 'How do I enable two-factor authentication (2FA)?', answer: 'Go to Profile -> Security and select Enable 2FA. Scan the QR code with an authenticator app and confirm with a 6-digit code.', category: 'Security', tags: ['2fa', 'security'] },
  { id: 'f5', question: 'How do I dispute a card transaction?', answer: 'Freeze the card if needed, then contact Support via Live Chat or Create Ticket -> Transaction dispute. Include date, amount and last 4 digits.', category: 'Cards', tags: ['dispute', 'card'] },
  { id: 'f6', question: 'Where can I download account statements?', answer: 'Open Accounts, select an account, then Statements to download monthly PDFs.', category: 'Accounts', tags: ['statements'] },
  { id: 'f7', question: 'What are daily transfer limits?', answer: 'Limits vary by account and verification status. You can see your limit on the transfer review screen; contact Support to request a change.', category: 'Transfers', tags: ['limits'] },
  { id: 'f8', question: 'How do I update my address or phone number?', answer: 'Go to Profile -> Personal Info and edit your details. Changes save immediately.', category: 'Profile', tags: ['profile'] },
  { id: 'f9', question: 'Why was my international transfer delayed?', answer: 'International transfers can take 3-5 business days due to correspondent banks and compliance checks. We will notify you if additional documents are required.', category: 'Transfers', tags: ['international', 'delay'] },
  { id: 'f10', question: 'What exchange rate do you use for international transfers?', answer: 'Rates are sourced from our treasury and shown on the transfer review screen before you confirm.', category: 'Transfers', tags: ['fx', 'exchange'] },
  { id: 'f11', question: 'How do I report a lost or stolen card?', answer: 'Freeze your card immediately in Cards, then contact Support to arrange a replacement.', category: 'Cards', tags: ['lost', 'stolen'] },
  { id: 'f12', question: 'Can I schedule transfers and bill payments?', answer: 'Yes. On the transfer or bill payment form, set a future date or repeat frequency before confirming.', category: 'Payments', tags: ['schedule'] },
  { id: 'f13', question: 'How do I cancel a scheduled transfer or bill payment?', answer: 'Open Transfers or Bills -> Scheduled, select the item and choose Cancel before the cutoff time.', category: 'Payments', tags: ['scheduled', 'cancel'] },
  { id: 'f14', question: 'What are the daily cut-off times for transfers?', answer: 'Domestic transfers submitted after 5:00 PM local time process the next business day. International transfers after 3:00 PM GMT process the next business day.', category: 'Transfers', tags: ['cutoff'] },
  { id: 'f15', question: 'How do I set or change my transfer PIN?', answer: 'Go to Security -> Transfer PIN and follow the prompts to set or update your PIN.', category: 'Security', tags: ['pin'] },
  { id: 'f16', question: 'How do I activate a new card?', answer: 'Open Cards and select the new card, then choose Activate and follow the on-screen steps.', category: 'Cards', tags: ['activate'] },
  { id: 'f17', question: 'Why was my login session ended?', answer: 'For security, sessions expire after a period of inactivity. Log in again and consider enabling 2FA and trusted devices.', category: 'Security', tags: ['session'] },
  { id: 'f18', question: 'Can I change or remove a saved beneficiary?', answer: 'Yes. During transfer, choose Manage beneficiaries to edit or remove saved recipients.', category: 'Transfers', tags: ['beneficiary'] },
  { id: 'f19', question: 'How do I update notification preferences?', answer: 'Go to Profile -> Notifications to enable or disable email/SMS alerts for transfers, logins and statements.', category: 'Profile', tags: ['notifications'] },
  { id: 'f20', question: 'What are support hours and response times?', answer: 'Live Chat and tickets are monitored 24/7. Most tickets receive a first response within 24 hours. Email us at support@broadmontnationalb.com for general inquiries.', category: 'Support', tags: ['support'] },
  { id: 'f21', question: 'How can I contact customer support?', answer: 'You can reach us via Live Chat (24/7), email at support@broadmontnationalb.com for ticket assistance, or info@broadmontnationalb.com for general inquiries.', category: 'Support', tags: ['contact', 'email'] },
]

export default function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<SupportSection>('chat')
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null)
  const { user } = useAuthStore()

  useEffect(() => {
    load()
  }, [user])

  const load = async () => {
    if (!user) return
    try {
      const res = await apiClient.get<{ success: boolean; data: SupportTicket[] }>(`/api/v1/support/tickets?limit=20`)
      if (res?.success) setTickets(res.data)
    } finally {
      setLoading(false)
    }
  }

  const actions: Action[] = [
    { key: 'chat', label: 'Live Chat', subtitle: 'Agent online', icon: 'chat', active: active === 'chat' },
    { key: 'ticket', label: 'Create Ticket', subtitle: 'Request help', icon: 'ticket', active: active === 'ticket' },
    { key: 'faq', label: 'FAQs', subtitle: 'Search topics', icon: 'faq', active: active === 'faq' },
    { key: 'contact', label: 'Contact Info', subtitle: 'Email support', icon: 'contact', active: active === 'contact' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Support & Help Center</h1>
        <p className="text-muted-foreground">How can we help you today?</p>
      </div>
      <QuickActions
        items={actions}
        onSelect={(section) => {
          setActive(section)
          if (section !== 'ticket') setActiveTicketId(null)
        }}
      />
      {active === 'chat' && <ChatOnly />}
      {active === 'ticket' && (
        <div className="space-y-5">
          {activeTicketId ? (
            <SupportTicketDetail
              ticketId={activeTicketId}
              onBack={() => {
                setActiveTicketId(null)
                load()
              }}
            />
          ) : (
            <>
              <CreateTicketForm
                onCreated={(newTicket) => {
                  load()
                  if (newTicket?.id) {
                    setActiveTicketId(newTicket.id)
                  }
                }}
              />
              <TicketTable
                items={loading ? [] : tickets}
                onSelectTicket={(id) => setActiveTicketId(id)}
              />
              {loading && <div className="text-center py-8 text-sm text-muted-foreground">Loading tickets...</div>}
            </>
          )}
        </div>
      )}
      {active === 'faq' && (
        <div id="faqs" className="space-y-2">
          <h2 className="text-xl font-semibold">FAQs</h2>
          <FAQSearch items={faqs} />
        </div>
      )}
      {active === 'contact' && (
        <div id="contact" className="space-y-2">
          <h2 className="text-xl font-semibold">Contact Info</h2>
          <ContactInfo />
        </div>
      )}
    </div>
  )
}

function ChatOnly() {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">24/7 Live Banking Assistant</h2>
        <p className="text-xs text-muted-foreground">Ask questions regarding your accounts, transfers, limits, card security, and loan facilities.</p>
      </div>
      <ChatWidget embedded={true} />
    </div>
  )
}
