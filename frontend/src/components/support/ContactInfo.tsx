import { colors } from '@/types'
import { Mail, Clock, ShieldCheck, ArrowUpRight } from 'lucide-react'

export function ContactInfo() {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm" style={{ borderColor: colors.border }}>
      <div className="max-w-2xl space-y-6">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Direct Support Channels</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Reach out to our specialized banking desks. All inquiries are encrypted and responded to promptly.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Client Support */}
          <a
            href="mailto:support@broadmontnationalb.com"
            className="group rounded-xl border p-4 transition-all hover:border-blue-500 hover:shadow-md flex flex-col justify-between bg-slate-50/50"
            style={{ borderColor: colors.borderLight }}
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 mb-3">
                <Mail className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Client Support & Tickets</div>
              <div className="text-sm font-semibold text-blue-600 group-hover:underline break-all mt-0.5">
                support@broadmontnationalb.com
              </div>
              <div className="text-[11px] text-slate-500 mt-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Monitored 24/7 (Instant Queue)</span>
              </div>
            </div>
          </a>

          {/* General Information */}
          <a
            href="mailto:info@broadmontnationalb.com"
            className="group rounded-xl border p-4 transition-all hover:border-blue-500 hover:shadow-md flex flex-col justify-between bg-slate-50/50"
            style={{ borderColor: colors.borderLight }}
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 mb-3">
                <Mail className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">General Inquiries & Corporate</div>
              <div className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 group-hover:underline break-all mt-0.5">
                info@broadmontnationalb.com
              </div>
              <div className="text-[11px] text-slate-500 mt-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>Official Communications Desk</span>
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}
