import { DEFAULT_FF_GROUP } from '../types'

export const PRESET_FF_GROUPS = [
  'latch',
  'edge',
  'ttl',
  DEFAULT_FF_GROUP,
] as const

export type PresetFfGroup = (typeof PRESET_FF_GROUPS)[number]

const PRESET_INDEX = new Map<string, number>(
  PRESET_FF_GROUPS.map((key, i) => [key, i]),
)

export function isPresetFfGroup(group: string): group is PresetFfGroup {
  return PRESET_INDEX.has(group)
}

export function ffGroupLabel(group: string, t: (key: string) => string): string {
  if (group === DEFAULT_FF_GROUP) return t('flipflops.groupDefault')
  const catKey = `flipflops.category.${group}`
  const localized = t(catKey)
  return localized === catKey ? group : localized
}

export function sortFfGroups(
  groups: Iterable<string>,
  t: (key: string) => string,
): string[] {
  const unique = [...new Set(groups)]
  return unique.sort((a, b) => {
    const ia = PRESET_INDEX.get(a)
    const ib = PRESET_INDEX.get(b)
    if (ia != null && ib != null) return ia - ib
    if (ia != null) return -1
    if (ib != null) return 1
    return ffGroupLabel(a, t).localeCompare(ffGroupLabel(b, t), undefined, {
      sensitivity: 'base',
    })
  })
}
