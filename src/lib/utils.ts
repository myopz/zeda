import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { snowflake } from './snowflake'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Snowflake decimal string id. */
export function createId(_prefix?: string): string {
  return snowflake.next()
}

export function compareSnowflakeId(a: string, b: string): number {
  const aNum = /^\d+$/.test(a)
  const bNum = /^\d+$/.test(b)
  if (aNum && bNum) {
    const diff = BigInt(a) - BigInt(b)
    return diff === 0n ? 0 : diff < 0n ? -1 : 1
  }
  if (aNum !== bNum) return aNum ? -1 : 1
  return a.localeCompare(b)
}
