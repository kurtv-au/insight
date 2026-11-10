import type { TableColumn } from '@nuxt/ui'
import type { VNode } from 'vue'

/**
 * Table columns for messages, built from a tenant's configured fields. The
 * messages page and the admin preview both use this, so the preview is exactly
 * what the account will see.
 */
export function buildMessageColumns(
  fields: readonly MessageColumnField[],
  options: {
    timeZone: string
    received?: boolean
    /** The person's own choice of field keys; without it, the fields' list setting */
    columns?: readonly string[]
    /** Renders a header, e.g. as a sort button; `fieldKey` is null for Received. Plain text without it. */
    header?: (fieldKey: string | null, label: string) => VNode
  }
): TableColumn<MessageRow>[] {
  const columns: TableColumn<MessageRow>[] = []

  if (options.received !== false) {
    columns.push({
      id: 'createdAt',
      header: options.header ? () => options.header!(null, 'Received') : 'Received',
      cell: ({ row }) => h('span', { class: 'whitespace-nowrap tabular-nums' }, formatDateTime(row.original.createdAt, options.timeZone, { zone: false }))
    })
  }

  for (const field of resolveMessageColumns(fields, options.columns ?? null)) {
    const numeric = field.type === 'number' || field.type === 'currency'
    columns.push({
      id: `field:${field.fieldKey}`,
      header: options.header ? () => options.header!(field.fieldKey, field.label) : field.label,
      cell: ({ row }) => messageCell(row.original.fields[field.fieldKey], field, options.timeZone, 'list'),
      meta: numeric ? { class: { th: 'text-right', td: 'text-right' } } : undefined
    })
  }
  return columns
}

/** One formatted value, as a list cell or in the detail view */
export function messageCell(
  value: MessageFieldValue | undefined,
  field: Pick<MessageColumnField, 'type' | 'format'>,
  timeZone: string,
  context: 'list' | 'detail'
) {
  const text = formatFieldValue(value, field.type, field.format, { timeZone, context })
  if (text === '—') {
    return h('span', { 'class': 'text-dimmed', 'aria-label': 'Empty' }, text)
  }
  if (field.type === 'email' && (field.format as MessageFieldFormats['email']).link && /^[^\s@]+@[^\s@]+$/.test(text)) {
    return h('a', {
      href: `mailto:${text}`,
      class: 'text-primary hover:underline',
      // The row opens the message; the link shouldn't do both
      onClick: (event: Event) => event.stopPropagation()
    }, text)
  }
  const classes = {
    number: 'tabular-nums whitespace-nowrap',
    currency: 'tabular-nums whitespace-nowrap',
    phone: 'tabular-nums whitespace-nowrap',
    date: 'whitespace-nowrap',
    time: 'whitespace-nowrap',
    datetime: 'whitespace-nowrap',
    longText: context === 'list' ? 'block max-w-xs truncate' : 'whitespace-pre-line',
    text: '',
    email: '',
    boolean: '',
    select: ''
  }[field.type]
  const full = context === 'list' && field.type === 'longText' && typeof value === 'string' ? value : undefined
  return h('span', { class: classes, title: full }, text)
}
