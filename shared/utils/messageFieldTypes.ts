/**
 * The types a message field can be shown as. Kept apart from messageFields.ts,
 * with no imports, because server/db/schema.ts loads it outside Nuxt (drizzle-kit).
 */
export const MESSAGE_FIELD_TYPES = [
  'text', 'longText', 'number', 'currency', 'date', 'time', 'datetime', 'phone', 'email', 'boolean', 'select'
] as const
export type MessageFieldType = typeof MESSAGE_FIELD_TYPES[number]

export const MESSAGE_FIELD_TYPE_LABELS: Record<MessageFieldType, string> = {
  text: 'Text',
  longText: 'Long text',
  number: 'Number',
  currency: 'Currency',
  date: 'Date',
  time: 'Time',
  datetime: 'Date and time',
  phone: 'Phone',
  email: 'Email',
  boolean: 'Yes / no',
  select: 'Choice'
}
