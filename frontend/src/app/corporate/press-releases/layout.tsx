import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Press Releases & News - Latest Updates | BNB',
  description: 'Read the latest BNB press releases, news announcements, media updates, and corporate communications. Stay informed about financial results, sustainability initiatives, and technology innovations.',
  keywords: 'press releases, news, media center, announcements, corporate news, financial news, banking news, media contacts, press kit, company updates, BNB news',
}

export default function PressReleasesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
