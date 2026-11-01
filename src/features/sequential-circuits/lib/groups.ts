import { DEFAULT_SEQ_GROUP } from '../types'

export const PRESET_SEQ_GROUPS = [
  'flipflop',
  'register',
  'counter',
  'ttl',
  DEFAULT_SEQ_GROUP,
] as const

export type PresetSeqGroup = (typeof PRESET_SEQ_GROUPS)[number]

const PRESET_INDEX = new Map<string, number>(
  PRESET_SEQ_GROUPS.map((key, i) => [key, i]),
)

export function isPresetSeqGroup(group: string): group is PresetSeqGroup {
  return PRESET_INDEX.has(group)
}

export function seqGroupLabel(group: string, t: (key: string) => string): string {
  if (group === DEFAULT_SEQ_GROUP) return t('sequential.groupDefault')
  const catKey = `sequential.category.${group}`
  const localized = t(catKey)
  return localized === catKey ? group : localized
}

export function sortSeqGroups(
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
    return seqGroupLabel(a, t).localeCompare(seqGroupLabel(b, t), undefined, {
      sensitivity: 'base',
    })
  })
}
