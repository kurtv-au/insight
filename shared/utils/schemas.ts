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
