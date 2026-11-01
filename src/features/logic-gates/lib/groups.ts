import { DEFAULT_GATE_GROUP } from '../types'

/**
 * Built-in palette / meta groups (stable keys for i18n).
 * Order: basic first, default last among presets.
 */
export const PRESET_GATE_GROUPS = ['basic', DEFAULT_GATE_GROUP] as const

export type PresetGateGroup = (typeof PRESET_GATE_GROUPS)[number]

const PRESET_INDEX = new Map<string, number>(
  PRESET_GATE_GROUPS.map((key, i) => [key, i]),
)

export function isPresetGateGroup(group: string): group is PresetGateGroup {
  return PRESET_INDEX.has(group)
}

/** Localized label for a group key; unknown keys show as-is. */
export function gateGroupLabel(
  group: string,
  t: (key: string) => string,
): string {
  if (group === DEFAULT_GATE_GROUP) return t('gates.groupDefault')
  const catKey = `gates.category.${group}`
  const localized = t(catKey)
  return localized === catKey ? group : localized
}

/**
 * Sort group keys: presets in {@link PRESET_GATE_GROUPS} order,
 * then custom groups by localized label.
 */
export function sortGateGroups(
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
    return gateGroupLabel(a, t).localeCompare(gateGroupLabel(b, t), undefined, {
      sensitivity: 'base',
    })
  })
}
