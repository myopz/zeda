import { cn } from '@/lib/utils'

type Props = {
  className?: string
  title?: string
}

/** Brand mark: ANSI-style AND body + Z notch, uses currentColor. */
export function ZedaLogo({ className, title = 'zeda' }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={28}
      height={28}
      className={cn('shrink-0 text-primary', className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* AND-like body */}
      <path
        d="M6 7h9c6.2 0 11 4.03 11 9s-4.8 9-11 9H6V7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Input leads */}
      <path
        d="M2 12h4M2 20h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Output lead */}
      <path
        d="M26 16h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Inner Z mark */}
      <path
        d="M11 12.5h7.5L11 19.5h7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
