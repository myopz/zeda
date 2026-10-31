import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        {children}
      </ThemeProvider>
    </I18nextProvider>
  )
}
