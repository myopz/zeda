import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'

type Props = {
  value: number
  disabled?: boolean
  /** Digits only; committed on blur / Enter. */
  onCommit: (value: number) => void
  className?: string
  id?: string
}

/**
 * Number field with a local draft so clearing/replacing is not clamped
 * back to the previous value on every keystroke.
 */
export function DraftNumberInput({
  value,
  disabled,
  onCommit,
  className,
  id,
}: Props) {
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [focused, value])

  const commit = () => {
    const n = Number(draft)
    if (!Number.isFinite(n)) {
      setDraft(String(value))
      return
    }
    onCommit(n)
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      disabled={disabled}
      className={className}
      onFocus={(e) => {
        setFocused(true)
        e.target.select()
      }}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onChange={(e) => {
        setDraft(e.target.value.replace(/\D/g, ''))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
