import { Languages, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { ZedaLogo } from '@/components/brand/ZedaLogo'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  type AppLang,
  setStoredLang,
  SUPPORTED_LANGS,
} from '@/i18n'

export function AppHeader() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()

  const changeLang = (lang: AppLang) => {
    setStoredLang(lang)
    void i18n.changeLanguage(lang)
  }

  return (
    <header className="flex h-12 items-center justify-between gap-3 border-b bg-background/80 px-3 backdrop-blur sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <ZedaLogo title={t('app.name')} />
        <div className="flex min-w-0 items-baseline gap-2">
          <div className="shrink-0 text-lg font-semibold sm:text-xl">{t('app.name')}</div>
          <div className="hidden truncate text-xs text-muted-foreground sm:block">
            {t('app.tagline')}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('theme.label')}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={t('lang.label')}>
              <Languages />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('lang.label')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SUPPORTED_LANGS.map((lang) => (
              <DropdownMenuItem
                key={lang}
                onClick={() => changeLang(lang)}
                className={i18n.language === lang ? 'bg-accent' : undefined}
              >
                {t(`lang.${lang}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
