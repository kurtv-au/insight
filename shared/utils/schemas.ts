import { z } from 'zod'

export const emailSchema = z.email('Enter a valid email address').max(255)

export const passwordSchema = z.string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')

export const nameSchema = z.string().trim().min(1, 'Name is required').max(255)

export const slugSchema = z.string()
  .min(2, 'Slug must be at least 2 characters')
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')

export const roleSchema = z.enum(ROLES)

export const tenantStatusSchema = z.enum(TENANT_STATUSES)

export const supportRequestSchema = z.object({
  topic: z.enum(SUPPORT_TOPICS),
  tenantId: z.string().optional(),
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  message: z.string().trim().min(10, 'Tell us a little more (at least 10 characters)').max(5000)
})

export const timezoneSchema = z.enum(TIMEZONE_IDS)

export const recordingColumnsSchema = z.array(z.enum(RECORDING_COLUMNS)).max(RECORDING_COLUMNS.length)

export const accountNumberSchema = z.string()
  .trim()
  .regex(/^[A-Za-z0-9-]{1,32}$/, 'Use up to 32 letters, numbers and hyphens')
