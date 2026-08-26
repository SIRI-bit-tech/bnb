import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Careers - Join Broadmont National Bank | Global Banking Jobs',
  description: 'Build your career with BNB. Explore banking jobs, graduate programs, internships, and early career opportunities across 60 markets in Asia, Africa, and the Middle East.',
  keywords: 'banking careers, BNB jobs, banking jobs, graduate programs, internships, early careers, financial services careers, international banking careers, diversity and inclusion, career opportunities',
}

export default function CareersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
