/**
 * Message fields: which fields of an account's active script the messages page
 * shows, in what order, and how each is typed and formatted. Platform admins
 * configure them per tenant; everyone who can open the tenant reads them.
 *
 * A field's identity is its `fieldKey`: the script's own field name (an
 * element or call-field `Name` from au-api `/v1/scripts/active`), never the
 * display label. Script names are case-insensitive, so keys are compared
 * through `canonicalFieldKey()`. Message values from au-api `/v1/messages`
 * are requested and joined on this key.
 *
 * Shared by client and server. Imports are explicit (not auto-imports) so unit
 * tests and drizzle-kit can load this file on its own.
 */
import { z } from 'zod'
import { formatPhone } from './recordings'
import { accountNumberSchema } from './schemas'
import type { MessageFieldType } from './messageFieldTypes'

/** More than any script has; keeps a tenant's config a sane size. */
export const MAX_MESSAGE_FIELDS = 200
export const MAX_SELECT_OPTIONS = 500

/** au-api `/v1/messages` returns at most this many fields per request */
export const MAX_RETRIEVED_MESSAGE_FIELDS = 50
/** au-api `/v1/messages` reads at most this many days per request; the page offers no more */
export const MAX_MESSAGE_RANGE_DAYS = 7
/** The field names au-api `/v1/messages` accepts. Other names can't be loaded. */
export const RETRIEVABLE_FIELD_KEY = /^(?!__)[A-Za-z_][A-Za-z0-9_.-]{0,63}$/

export function isRetrievableFieldKey(key: string) {
  return RETRIEVABLE_FIELD_KEY.test(key)
}

/* ---------------------------------------------------------------- formats */

const dateStyleSchema = z.enum(['short', 'medium', 'long'])
const hourCycleSchema = z.enum(['12h', '24h'])

const selectOptionSchema = z.object({
  value: z.string().max(500),
  label: z.string().trim().min(1, 'Give every option a label').max(255)
}).strict()

/** The format options each type accepts. Strict: unknown keys are rejected. */
export const MESSAGE_FIELD_FORMAT_SCHEMAS = {
  text: z.object({}).strict(),
  longText: z.object({
    listMaxChars: z.number().int().min(20, 'At least 20 characters').max(500, 'At most 500 characters')
  }).strict(),
  number: z.object({
    decimals: z.number().int().min(0).max(6, 'At most 6 decimal places'),
    thousands: z.boolean()
  }).strict(),
  currency: z.object({
    currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, like USD'),
    decimals: z.number().int().min(0).max(4, 'At most 4 decimal places')
  }).strict(),
  date: z.object({ style: dateStyleSchema }).strict(),
  time: z.object({ hourCycle: hourCycleSchema }).strict(),
  datetime: z.object({ dateStyle: dateStyleSchema, hourCycle: hourCycleSchema, showZone: z.boolean() }).strict(),
  phone: z.object({ style: z.enum(['national', 'raw']) }).strict(),
  email: z.object({ link: z.boolean() }).strict(),
  boolean: z.object({
    trueLabel: z.string().trim().min(1, 'Enter a label for yes').max(40),
    falseLabel: z.string().trim().min(1, 'Enter a label for no').max(40),
    /** The value the script stores when checked, e.g. "True" or "Yes" */
    trueValue: z.string().max(100).optional()
  }).strict(),
  select: z.object({
    options: z.array(selectOptionSchema)
      .min(1, 'Add at least one option')
      .max(MAX_SELECT_OPTIONS, `At most ${MAX_SELECT_OPTIONS} options`)
      .refine(options => new Set(options.map(option => option.value)).size === options.length, 'Option values must be unique')
  }).strict()
} as const

export type MessageFieldFormats = { [T in MessageFieldType]: z.infer<typeof MESSAGE_FIELD_FORMAT_SCHEMAS[T]> }
export type MessageFieldFormat = MessageFieldFormats[MessageFieldType]

export const DEFAULT_MESSAGE_FIELD_FORMATS: MessageFieldFormats = {
  text: {},
  longText: { listMaxChars: 80 },
  number: { decimals: 0, thousands: true },
  currency: { currency: 'USD', decimals: 2 },
  date: { style: 'medium' },
  time: { hourCycle: '12h' },
  datetime: { dateStyle: 'medium', hourCycle: '12h', showZone: true },
  phone: { style: 'national' },
  email: { link: true },
  boolean: { trueLabel: 'Yes', falseLabel: 'No' },
  select: { options: [] }
}

/* ----------------------------------------------------------- config schema */

export const fieldKeySchema = z.string()
  .trim()
  .min(1, 'Field key is required')
  .max(128, 'Field key is too long')
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\u0000-\u001F\u007F]+$/, 'Field key has invalid characters')

const fieldBaseShape = {
  fieldKey: fieldKeySchema,
  label: z.string().trim().min(1, 'Every field needs a label').max(255),
  order: z.number().int().min(0),
  showInList: z.boolean(),
  showInDetail: z.boolean(),
  isActive: z.boolean(),
  /** Keep showing the field on the messages page after it left the script */
  showIfOrphaned: z.boolean()
}

function fieldVariant<T extends MessageFieldType>(type: T) {
  return z.object({ ...fieldBaseShape, type: z.literal(type), format: MESSAGE_FIELD_FORMAT_SCHEMAS[type] })
}

/** One configured field, with the format checked against its type. */
export const messageFieldSchema = z.discriminatedUnion('type', [
  fieldVariant('text'),
  fieldVariant('longText'),
  fieldVariant('number'),
  fieldVariant('currency'),
  fieldVariant('date'),
  fieldVariant('time'),
  fieldVariant('datetime'),
  fieldVariant('phone'),
  fieldVariant('email'),
  fieldVariant('boolean'),
  fieldVariant('select')
])

/**
 * The body of a save. The whole configuration is replaced at once, so `order`
 * must be exactly 0..n-1 and keys unique (case-insensitively). `revision` is the
 * revision the editor loaded; a stale one is rejected so two admins can't
 * silently overwrite each other.
 */
export const messageFieldConfigInputSchema = z.object({
  revision: z.number().int().min(0),
  scriptAccountNumber: accountNumberSchema.nullable(),
  fields: z.array(messageFieldSchema).max(MAX_MESSAGE_FIELDS, `At most ${MAX_MESSAGE_FIELDS} fields`)
}).superRefine((data, ctx) => {
  const seen = new Map<string, number>()
  data.fields.forEach((field, index) => {
    const key = canonicalFieldKey(field.fieldKey)
    if (seen.has(key)) {
      ctx.addIssue({ code: 'custom', path: ['fields', index, 'fieldKey'], message: `"${field.fieldKey}" is added more than once` })
    }
    seen.set(key, index)
  })
  const orders = data.fields.map(field => field.order).sort((a, z) => a - z)
  if (orders.some((order, index) => order !== index)) {
    ctx.addIssue({ code: 'custom', path: ['fields'], message: 'Field order must run 0, 1, 2… with no gaps or repeats' })
  }
  if (data.fields.filter(field => field.isActive).length > MAX_RETRIEVED_MESSAGE_FIELDS) {
    ctx.addIssue({ code: 'custom', path: ['fields'], message: `Messages can show at most ${MAX_RETRIEVED_MESSAGE_FIELDS} fields; turn some off` })
  }
})

export type MessageFieldInput = z.infer<typeof messageFieldSchema>
export type MessageFieldConfigInput = z.infer<typeof messageFieldConfigInputSchema>

/** A configured field as the editor and the messages page handle it. */
export interface MessageFieldConfig {
  fieldKey: string
  label: string
  type: MessageFieldType
  format: MessageFieldFormat
  order: number
  showInList: boolean
  showInDetail: boolean
  isActive: boolean
  showIfOrphaned: boolean
}

/** A saved field, with what the server worked out at the last save. */
export interface SavedMessageField extends MessageFieldConfig {
  /** Not in the source script at the last save */
  orphaned: boolean
  sourceScriptId: number | null
  sourceScriptVersion: number | null
}

/** What the messages page gets: visible fields only, no admin state. */
export type MessageColumnField = Pick<MessageFieldConfig, 'fieldKey' | 'label' | 'type' | 'format' | 'order' | 'showInList' | 'showInDetail'>

/* ----------------------------------------------------- script field (au-api) */

/** au-api's open set of control hints. Unknown values are treated as text. */
export type ScriptInputType = 'text' | 'multiline' | 'phone' | 'number' | 'postalCode' | 'date' | 'time' | 'datetime' | 'email' | 'checkbox' | 'list'

/** One field of an active script, as au-api `/v1/scripts/active` publishes it. */
export interface ScriptFieldDto {
  key: string
  label: string | null
  inputType: ScriptInputType | (string & {}) | null
  required: boolean
  choices: { value: string, label: string }[] | null
  checkbox: { checkedValue: string, uncheckedValue: string } | null
  sources: ('screen' | 'callField' | 'variable')[]
  screens: string[]
}

export interface ActiveScriptDto {
  scriptId: number
  name: string
  versionNumber: number
  modifiedAt: string | null
  /** False when part of the script couldn't be read: missing fields aren't necessarily gone */
  complete: boolean
  fields: ScriptFieldDto[]
}

/** Script names compare case-insensitively */
export function canonicalFieldKey(key: string) {
  return key.trim().toLowerCase()
}

/** "FirstName" / "first_name" → "First name", for fields the script doesn't label */
export function humanizeFieldKey(key: string) {
  const words = key.replace(/[_\-.]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2').trim().split(/\s+/)
  const text = words.map((word, i) => (i === 0 ? word : /^[A-Z\d]+$/.test(word) ? word : word.toLowerCase())).join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** The type a script field starts as when an admin adds it */
export function defaultTypeForScriptField(field: Pick<ScriptFieldDto, 'inputType' | 'choices'>): MessageFieldType {
  switch (field.inputType) {
    case 'phone': return 'phone'
    case 'number': return 'number'
    case 'multiline': return 'longText'
    case 'date': return 'date'
    case 'time': return 'time'
    case 'datetime': return 'datetime'
    case 'email': return 'email'
    case 'checkbox': return 'boolean'
    case 'list': return field.choices?.length ? 'select' : 'text'
    default: return 'text'
  }
}

/** A fresh format for a type, seeded from the script where it knows better */
export function defaultFormatFor(type: MessageFieldType, field?: Pick<ScriptFieldDto, 'choices' | 'checkbox'> | null): MessageFieldFormat {
  if (type === 'select') {
    return { options: (field?.choices ?? []).slice(0, MAX_SELECT_OPTIONS).map(choice => ({ value: choice.value, label: choice.label || choice.value })) }
  }
  if (type === 'boolean') {
    return { ...DEFAULT_MESSAGE_FIELD_FORMATS.boolean, ...(field?.checkbox ? { trueValue: field.checkbox.checkedValue } : {}) }
  }
  return structuredClone(DEFAULT_MESSAGE_FIELD_FORMATS[type])
}

/** Fields shown as list columns by default when added */
const DEFAULT_LIST_COLUMNS = 6

export function newFieldFromScript(field: ScriptFieldDto, order: number): MessageFieldConfig {
  const type = defaultTypeForScriptField(field)
  return {
    fieldKey: field.key,
    label: field.label ?? humanizeFieldKey(field.key),
    type,
    format: defaultFormatFor(type, field),
    order,
    showInList: order < DEFAULT_LIST_COLUMNS && type !== 'longText',
    showInDetail: true,
    isActive: true,
    showIfOrphaned: false
  }
}

/* ------------------------------------------------------------------ drift */

/**
 * Types a script hint is consistent with. null means the hint has no opinion
 * (plain text, postal code, no control): any type is a fine refinement, so an
 * admin who types a text box as a date isn't nagged about it.
 */
export function compatibleTypes(field: Pick<ScriptFieldDto, 'inputType' | 'choices'>): MessageFieldType[] | null {
  switch (field.inputType) {
    case 'phone': return ['phone']
    case 'number': return ['number', 'currency']
    case 'date': return ['date', 'datetime']
    case 'time': return ['time']
    case 'datetime': return ['datetime', 'date']
    case 'email': return ['email']
    case 'checkbox': return ['boolean']
    case 'multiline': return ['longText', 'text']
    case 'list': return field.choices?.length ? ['select'] : null
    default: return null
  }
}

export type AvailableFieldState = 'new' | 'added' | 'available'

export interface ScriptDrift {
  /** The script's fields, marked against the configuration */
  available: (ScriptFieldDto & { state: AvailableFieldState })[]
  /** Canonical keys of configured fields that aren't in the script */
  orphanedKeys: Set<string>
  /** Canonical key → the type the script suggests, where it disagrees with the saved type */
  typeMismatches: Map<string, MessageFieldType>
}

/**
 * Compares a configuration with the active script.
 *
 * - A configured field missing from the script is orphaned (kept, flagged).
 *   With `script` null (no active script) every configured field is orphaned.
 *   An incomplete script can't prove a field is gone, so nothing is orphaned.
 * - A script field not in `knownKeys` (the script's keys at the last save) is
 *   new. Before the first save there's nothing to compare with, so nothing is.
 * - A specific script hint (phone, number, checkbox…) that the saved type
 *   doesn't fit is a mismatch. The admin's choice still wins.
 */
export function diffScriptFields(input: {
  configured: readonly Pick<MessageFieldConfig, 'fieldKey' | 'type'>[]
  script: ActiveScriptDto | null
  knownKeys?: readonly string[] | null
}): ScriptDrift {
  const configured = new Map(input.configured.map(field => [canonicalFieldKey(field.fieldKey), field]))
  const known = input.knownKeys?.length ? new Set(input.knownKeys.map(canonicalFieldKey)) : null
  const scriptKeys = new Set((input.script?.fields ?? []).map(field => canonicalFieldKey(field.key)))

  const available = (input.script?.fields ?? []).map((field) => {
    const key = canonicalFieldKey(field.key)
    const state: AvailableFieldState = configured.has(key) ? 'added' : known && !known.has(key) ? 'new' : 'available'
    return { ...field, state }
  })

  const orphanedKeys = new Set<string>()
  if (!input.script || input.script.complete) {
    for (const key of configured.keys()) {
      if (!scriptKeys.has(key)) {
        orphanedKeys.add(key)
      }
    }
  }

  const typeMismatches = new Map<string, MessageFieldType>()
  for (const field of input.script?.fields ?? []) {
    const key = canonicalFieldKey(field.key)
    const saved = configured.get(key)
    const fits = compatibleTypes(field)
    if (saved && fits && !fits.includes(saved.type)) {
      typeMismatches.set(key, defaultTypeForScriptField(field))
    }
  }

  return { available, orphanedKeys, typeMismatches }
}

/* ------------------------------------------------------------- visibility */

export function isVisibleOnMessages(field: Pick<SavedMessageField, 'isActive' | 'orphaned' | 'showIfOrphaned'>) {
  return field.isActive && (!field.orphaned || field.showIfOrphaned)
}

function byOrder<T extends { order: number }>(fields: readonly T[]) {
  return [...fields].sort((a, z) => a.order - z.order)
}

/** Columns of the messages list, in order */
export function listFields<T extends Pick<MessageFieldConfig, 'order' | 'showInList'>>(fields: readonly T[]) {
  return byOrder(fields.filter(field => field.showInList))
}

/** Fields of the message detail view, in order */
export function detailFields<T extends Pick<MessageFieldConfig, 'order' | 'showInDetail'>>(fields: readonly T[]) {
  return byOrder(fields.filter(field => field.showInDetail))
}

/* ------------------------------------------------------------- message row */

export type MessageFieldValue = string | number | boolean | null

/**
 * A message as the browser gets it. `fields` is keyed by the configured
 * `fieldKey` exactly (the server canonicalises), so values can't collide with
 * metadata such as `id` even if a script names a field "id".
 */
export interface MessageRow {
  id: string
  /** ISO 8601 instant; null if the store has no time for the message */
  createdAt: string | null
  accountNumber: string | null
  fields: Record<string, MessageFieldValue>
}

/* -------------------------------------------------------------- formatting */

export interface FormatFieldOptions {
  /** IANA zone for instants. Wall-clock values (date-only, naive times) are never shifted. */
  timeZone?: string
  /** `list` truncates long text to the field's `listMaxChars` */
  context?: 'list' | 'detail'
}

const EMPTY = '—'
const LOCALE = 'en-US'

function isEmpty(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string') {
    return null
  }
  const cleaned = value.trim().replace(/[\s,$€£]/g, '')
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(cleaned)) {
    return null
  }
  return Number(cleaned)
}

interface WallClock {
  year: number
  month: number
  day: number
  hour?: number
  minute?: number
  second?: number
}

/** Values with no zone: "2026-10-28", "10/28/2026", "2026-10-28 14:30", "10/28/2026 2:30 PM" */
function parseWallClock(value: string): WallClock | null {
  const text = value.trim()
  let match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(text)
  if (match) {
    const [, y, mo, d, h, mi, s] = match
    return checkWallClock({ year: +y!, month: +mo!, day: +d!, ...(h ? { hour: +h, minute: +mi!, second: s ? +s : 0 } : {}) })
  }
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/.exec(text)
  if (match) {
    const [, mo, d, y, h, mi, s, ampm] = match
    let hour = h ? +h : undefined
    if (hour !== undefined && ampm) {
      hour = (hour % 12) + (/p/i.test(ampm) ? 12 : 0)
    }
    return checkWallClock({ year: +y!, month: +mo!, day: +d!, ...(hour !== undefined ? { hour, minute: +mi!, second: s ? +s : 0 } : {}) })
  }
  return null
}

function checkWallClock(clock: WallClock): WallClock | null {
  const date = new Date(Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour ?? 0, clock.minute ?? 0, clock.second ?? 0))
  const valid = date.getUTCFullYear() === clock.year && date.getUTCMonth() === clock.month - 1 && date.getUTCDate() === clock.day
    && (clock.hour === undefined || (clock.hour < 24 && (clock.minute ?? 0) < 60 && (clock.second ?? 0) < 60))
  return valid ? clock : null
}

/** "14:30", "2:30 PM", "14:30:05" */
function parseTimeOfDay(value: string): { hour: number, minute: number, second: number } | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(value.trim())
  if (!match) {
    return null
  }
  const [, h, m, s, ampm] = match
  let hour = +h!
  if (ampm) {
    if (hour < 1 || hour > 12) {
      return null
    }
    hour = (hour % 12) + (/p/i.test(ampm) ? 12 : 0)
  }
  const minute = +m!
  const second = s ? +s : 0
  return hour < 24 && minute < 60 && second < 60 ? { hour, minute, second } : null
}

/** A real instant: a Date, epoch milliseconds, or an ISO string with Z or an offset */
function toInstant(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) {
    const date = new Date(value.trim())
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function wallClockDate(clock: WallClock) {
  return new Date(Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour ?? 0, clock.minute ?? 0, clock.second ?? 0))
}

function hourOptions(cycle: '12h' | '24h'): Intl.DateTimeFormatOptions {
  return { hour: 'numeric', minute: '2-digit', hourCycle: cycle === '24h' ? 'h23' : 'h12' }
}

function dateOptions(style: 'short' | 'medium' | 'long'): Intl.DateTimeFormatOptions {
  return style === 'short'
    ? { year: 'numeric', month: 'numeric', day: 'numeric' }
    : { year: 'numeric', month: style === 'long' ? 'long' : 'short', day: 'numeric' }
}

function safeTimeZone(timeZone: string | undefined) {
  if (!timeZone) {
    return undefined
  }
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone })
    return timeZone
  } catch {
    return undefined
  }
}

function formatNumber(value: number, decimals: number, grouping: boolean) {
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping }).format(value)
}

const TRUE_TOKENS = new Set(['true', 'yes', 'y', '1', 'checked', 'on', 'x'])
const FALSE_TOKENS = new Set(['false', 'no', 'n', '0', 'unchecked', 'off'])

/**
 * Renders one field value for display. Never throws: empty values become "—",
 * and a value that doesn't fit its type (text in a number field, an
 * unparseable date, an unknown choice) is shown as given rather than hidden.
 */
export function formatFieldValue(value: unknown, type: MessageFieldType, format: MessageFieldFormat | null | undefined, options: FormatFieldOptions = {}): string {
  if (isEmpty(value)) {
    return EMPTY
  }
  let raw: string
  try {
    raw = value instanceof Date ? value.toISOString() : String(value)
  } catch {
    // An invalid Date, or an object whose toString throws
    return EMPTY
  }
  const f = { ...DEFAULT_MESSAGE_FIELD_FORMATS[type], ...(format ?? {}) } as never
  try {
    return formatByType(value, raw, type, f, options)
  } catch {
    return raw
  }
}

function formatByType(value: unknown, raw: string, type: MessageFieldType, f: never, options: FormatFieldOptions): string {
  const timeZone = safeTimeZone(options.timeZone)
  switch (type) {
    case 'text':
    case 'email':
      return raw.trim()
    case 'longText': {
      const text = raw.trim()
      const { listMaxChars } = f as MessageFieldFormats['longText']
      if (options.context === 'list') {
        const oneLine = text.replace(/\s+/g, ' ')
        return oneLine.length > listMaxChars ? `${oneLine.slice(0, listMaxChars - 1).trimEnd()}…` : oneLine
      }
      return text
    }
    case 'number': {
      const n = toNumber(value)
      const { decimals, thousands } = f as MessageFieldFormats['number']
      return n === null ? raw : formatNumber(n, decimals, thousands)
    }
    case 'currency': {
      const n = toNumber(value)
      const { currency, decimals } = f as MessageFieldFormats['currency']
      if (n === null) {
        return raw
      }
      try {
        return new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)
      } catch {
        return formatNumber(n, decimals, true)
      }
    }
    case 'date': {
      const { style } = f as MessageFieldFormats['date']
      const clock = typeof value === 'string' ? parseWallClock(value) : null
      if (clock) {
        return new Intl.DateTimeFormat(LOCALE, { ...dateOptions(style), timeZone: 'UTC' }).format(wallClockDate(clock))
      }
      const instant = toInstant(value)
      return instant ? new Intl.DateTimeFormat(LOCALE, { ...dateOptions(style), timeZone }).format(instant) : raw
    }
    case 'time': {
      const { hourCycle } = f as MessageFieldFormats['time']
      const time = typeof value === 'string' ? parseTimeOfDay(value) : null
      if (time) {
        return new Intl.DateTimeFormat(LOCALE, { ...hourOptions(hourCycle), timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, time.hour, time.minute)))
      }
      const clock = typeof value === 'string' ? parseWallClock(value) : null
      if (clock?.hour !== undefined) {
        return new Intl.DateTimeFormat(LOCALE, { ...hourOptions(hourCycle), timeZone: 'UTC' }).format(wallClockDate(clock))
      }
      const instant = toInstant(value)
      return instant ? new Intl.DateTimeFormat(LOCALE, { ...hourOptions(hourCycle), timeZone }).format(instant) : raw
    }
    case 'datetime': {
      const { dateStyle, hourCycle, showZone } = f as MessageFieldFormats['datetime']
      const instant = toInstant(value)
      if (instant) {
        return new Intl.DateTimeFormat(LOCALE, { ...dateOptions(dateStyle), ...hourOptions(hourCycle), ...(showZone ? { timeZoneName: 'short' } : {}), timeZone }).format(instant)
      }
      const clock = typeof value === 'string' ? parseWallClock(value) : null
      if (clock) {
        // No zone in the value: show the wall-clock reading as recorded, without a zone name
        const parts = clock.hour === undefined ? dateOptions(dateStyle) : { ...dateOptions(dateStyle), ...hourOptions(hourCycle) }
        return new Intl.DateTimeFormat(LOCALE, { ...parts, timeZone: 'UTC' }).format(wallClockDate(clock))
      }
      return raw
    }
    case 'phone': {
      const { style } = f as MessageFieldFormats['phone']
      return style === 'raw' ? raw.trim() : formatPhone(raw.trim())
    }
    case 'boolean': {
      const { trueLabel, falseLabel, trueValue } = f as MessageFieldFormats['boolean']
      if (value === true || value === false) {
        return value ? trueLabel : falseLabel
      }
      const token = raw.trim().toLowerCase()
      if ((trueValue && token === trueValue.trim().toLowerCase()) || TRUE_TOKENS.has(token)) {
        return trueLabel
      }
      return FALSE_TOKENS.has(token) ? falseLabel : raw
    }
    case 'select': {
      const { options: choices } = f as MessageFieldFormats['select']
      const exact = choices.find(choice => choice.value === raw)
      const loose = exact ?? choices.find(choice => choice.value.trim().toLowerCase() === raw.trim().toLowerCase())
      return loose ? loose.label : raw
    }
  }
}

/* ------------------------------------------------------------- sample data */

const SAMPLES: Record<Exclude<MessageFieldType, 'boolean' | 'select'>, MessageFieldValue[]> = {
  text: ['Jordan Avery', 'Northside Dental', 'Unit 4B', 'Priya Natarajan'],
  longText: [
    'Caller says the water heater in the basement is leaking and would like someone to come out today if possible.',
    'Wants to reschedule Thursday\'s appointment to next week, mornings preferred.',
    'Asked for a call back about the invoice from last month. Not urgent.'
  ],
  number: [3, 12, 1250.5, 42],
  currency: [149.99, 1200, 37.5, 89],
  date: ['2026-10-28', '2026-11-03', '2026-09-15', '2026-12-01'],
  time: ['09:15', '14:40', '18:05', '07:30'],
  datetime: ['2026-10-28T13:15:00Z', '2026-11-02T20:40:00Z', '2026-10-30T15:05:00Z', '2026-11-01T11:30:00Z'],
  phone: ['2695550134', '6165550199', '3125550148', '2485550107'],
  email: ['jordan.avery@example.com', 'office@example.org', 'priya@example.net', 'billing@example.com']
}

function sampleValue(field: Pick<MessageFieldConfig, 'type' | 'format'>, index: number): MessageFieldValue {
  if (field.type === 'boolean') {
    const { trueValue } = field.format as MessageFieldFormats['boolean']
    return index % 2 === 0 ? (trueValue ?? 'True') : 'False'
  }
  if (field.type === 'select') {
    const options = (field.format as MessageFieldFormats['select']).options ?? []
    return options.length ? options[index % options.length]!.value : null
  }
  const pool = SAMPLES[field.type]
  return pool[index % pool.length] ?? null
}

/**
 * Deterministic example messages for a configuration: the admin preview and the
 * development mock. Each row leaves one field empty so empty handling shows.
 */
export function sampleMessageRows(
  fields: readonly Pick<MessageFieldConfig, 'fieldKey' | 'type' | 'format'>[],
  options: { count?: number, seed?: number, now?: Date, accountNumber?: string | null } = {}
): MessageRow[] {
  const count = options.count ?? 3
  const seed = options.seed ?? 0
  const now = options.now ?? new Date('2026-11-02T15:00:00Z')
  return Array.from({ length: count }, (_, row) => {
    const n = row + seed
    const values: Record<string, MessageFieldValue> = {}
    fields.forEach((field, column) => {
      values[field.fieldKey] = fields.length > 1 && column === n % fields.length ? null : sampleValue(field, n + column)
    })
    return {
      id: `sample-${n}`,
      createdAt: new Date(now.getTime() - (n * 97 + 11) * 60 * 1000).toISOString(),
      accountNumber: options.accountNumber ?? null,
      fields: values
    }
  })
}
