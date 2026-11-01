import { DEFAULT_CIRCUIT_GROUP } from '../types'

/**
 * Built-in palette / meta groups (stable keys for i18n).
 * Order: functional categories first, default last among presets.
 */
export const PRESET_CIRCUIT_GROUPS = [
  'adder',
  'encoder',
  'decoder',
  'ttl',
  DEFAULT_CIRCUIT_GROUP,
] as const

export type PresetCircuitGroup = (typeof PRESET_CIRCUIT_GROUPS)[number]

const PRESET_INDEX = new Map<string, number>(
  PRESET_CIRCUIT_GROUPS.map((key, i) => [key, i]),
)

export function isPresetCircuitGroup(group: string): group is PresetCircuitGroup {
  return PRESET_INDEX.has(group)
}

/** Localized label for a group key; unknown keys show as-is. */
export function circuitGroupLabel(
  group: string,
  t: (key: string) => string,
): string {
  if (group === DEFAULT_CIRCUIT_GROUP) return t('circuits.groupDefault')
  const catKey = `circuits.category.${group}`
  const localized = t(catKey)
  return localized === catKey ? group : localized
}

/**
 * Sort group keys: presets in {@link PRESET_CIRCUIT_GROUPS} order,
 * then custom groups by localized label.
 */
export function sortCircuitGroups(
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
    return circuitGroupLabel(a, t).localeCompare(circuitGroupLabel(b, t), undefined, {
      sensitivity: 'base',
    })
  })
}
