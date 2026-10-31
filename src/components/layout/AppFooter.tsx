import { useTranslation } from 'react-i18next'

export function AppFooter() {
  const { t } = useTranslation()
  return (
    <footer className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
      {t('app.footer')}
    </footer>
  )
}
