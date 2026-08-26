'use client'

import { useEffect } from 'react'
import { DashboardHeader } from '@/components/dashboard/dashboard-header'
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar'
import { TradingViewTicker } from '@/components/dashboard/tradingview-ticker'
import BottomNavbar from '@/components/navigation/bottom-navbar'
import { apiClient } from '@/lib/api-client'
import { SessionKeeper } from '@/hooks/use-session-keeper'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { LinkClickLoader } from '@/components/ui/link-click-loader'
import Script from 'next/script'

import { RestrictionProvider } from '@/components/auth/RestrictionProvider'
import { UserRestrictionsProvider } from '@/contexts/user-restrictions-context'
import { useAuthStore } from '@/lib/store'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, setUser } = useAuthStore()

  // Ensure API client sends Bearer token for authenticated requests
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token')
      if (token) apiClient.setAuthToken(token)
    }
  }, [])

  useEffect(() => {
    // Sync user data from localStorage 'user' key to Zustand store on mount
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem('user')
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser)
          if (userData.transfer_pin_set && user && !user.transfer_pin_set) {
            setUser(userData)
          }
        } catch (e) {
          console.error('Failed to sync user data', e)
        }
      }
    }
  }, [user, setUser])

  return (
    <RestrictionProvider>
      <div className="flex h-screen bg-background">
        <Script id="boot-preloader" strategy="beforeInteractive">
          {`(function(){try{document.documentElement.classList.add('app-preloading');var d=document.createElement('div');d.id='app-boot-preloader';d.innerHTML='<div class="dot"></div>';document.body.appendChild(d);}catch(e){}})();`}
        </Script>
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0 xl:pb-0 pb-20 overflow-hidden">
          <DashboardHeader />
          <TradingViewTicker />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
            <UserRestrictionsProvider userId={user?.id}>
              {children}
            </UserRestrictionsProvider>
          </main>
          <SessionKeeper />
        </div>
        <LoadingOverlay />
        <LinkClickLoader />
        <BottomNavbar />
      </div>
    </RestrictionProvider>
  )
}
