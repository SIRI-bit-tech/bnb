'use client'

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ShieldAlert, LogOut, CheckCircle2 } from 'lucide-react'

interface AdminSessionTimeoutModalProps {
  open: boolean
  secondsRemaining: number
  onStaySignedIn: () => void
  onLogout: () => void
}

export function AdminSessionTimeoutModal({
  open,
  secondsRemaining,
  onStaySignedIn,
  onLogout,
}: AdminSessionTimeoutModalProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-md border-0 shadow-2xl overflow-hidden p-0">
        <div className="h-2 bg-gradient-to-r from-[#0A2540] via-[#0073CF] to-[#D4AF37]" />
        
        <div className="p-6">
          <AlertDialogHeader className="text-center sm:text-left">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-[#0A2540]/10 flex items-center justify-center text-[#0A2540] shrink-0">
                <ShieldAlert className="w-6 h-6 text-[#0A2540]" />
              </div>
              <AlertDialogTitle className="text-xl font-bold text-gray-900">
                Are you still active?
              </AlertDialogTitle>
            </div>
            
            <AlertDialogDescription className="text-sm text-gray-600 leading-relaxed pt-1">
              You have been inactive for a while. To protect administrative data, your session will automatically close soon.
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs font-semibold text-center">
                Session closing in <span className="text-amber-700 text-sm font-bold">{Math.max(0, secondsRemaining)}</span> seconds
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="mt-6 flex flex-col-reverse sm:flex-row gap-3 sm:gap-2">
            <AlertDialogCancel asChild>
              <Button
                variant="outline"
                onClick={onLogout}
                className="w-full sm:w-auto h-11 text-gray-700 hover:bg-gray-100 font-semibold border-gray-300"
              >
                <LogOut className="w-4 h-4 mr-2" />
                No, Log Me Out
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                onClick={onStaySignedIn}
                className="w-full sm:w-auto h-11 bg-[#0A2540] hover:bg-[#061324] text-white font-bold shadow-md"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Yes, Stay Logged In
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
