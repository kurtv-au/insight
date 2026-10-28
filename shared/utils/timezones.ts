/**
 * Timezones offered in Insight. The stored value is the canonical IANA ID; the
 * label is the familiar name people pick from.
 */
export const TIMEZONES = [
  { id: 'America/New_York', label: 'US/Eastern', group: 'US' },
  { id: 'America/Chicago', label: 'US/Central', group: 'US' },
  { id: 'America/Denver', label: 'US/Mountain', group: 'US' },
  { id: 'America/Phoenix', label: 'US/Arizona', group: 'US' },
  { id: 'America/Los_Angeles', label: 'US/Pacific', group: 'US' },
  { id: 'America/Anchorage', label: 'US/Alaska', group: 'US' },
  { id: 'Pacific/Honolulu', label: 'US/Hawaii', group: 'US' },
  { id: 'America/Puerto_Rico', label: 'Puerto Rico', group: 'US' },
  { id: 'America/St_Johns', label: 'Canada/Newfoundland', group: 'Canada' },
  { id: 'America/Halifax', label: 'Canada/Atlantic', group: 'Canada' },
  { id: 'America/Toronto', label: 'Canada/Eastern', group: 'Canada' },
  { id: 'America/Winnipeg', label: 'Canada/Central', group: 'Canada' },
  { id: 'America/Regina', label: 'Canada/Saskatchewan', group: 'Canada' },
  { id: 'America/Edmonton', label: 'Canada/Mountain', group: 'Canada' },
  { id: 'America/Vancouver', label: 'Canada/Pacific', group: 'Canada' },
  { id: 'UTC', label: 'UTC', group: 'Other' }
] as const

export type Timezone = typeof TIMEZONES[number]['id']

export const TIMEZONE_IDS = TIMEZONES.map(tz => tz.id) as [Timezone, ...Timezone[]]

/** Answer United is in Michigan */
export const DEFAULT_TIMEZONE: Timezone = 'America/New_York'

export function timezoneLabel(id: string | null | undefined) {
  return TIMEZONES.find(tz => tz.id === id)?.label ?? id ?? ''
}

/** Grouped items for a USelect, with a label row per group */
export function timezoneItems() {
  const groups = [...new Set(TIMEZONES.map(tz => tz.group))]
  return groups.map(group => [
    { type: 'label' as const, label: group as string },
    ...TIMEZONES.filter(tz => tz.group === group).map(tz => ({ label: tz.label as string, value: tz.id }))
  ])
}
