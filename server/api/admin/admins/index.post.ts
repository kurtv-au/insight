import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { platformAdminEmail } from '../../../emails/platformAdmin'

const bodySchema = z.object({
  email: emailSchema,
  name: z.string().trim().max(255).optional(),
  notify: z.boolean().default(true)
})

/**
 * Makes someone a platform admin: promotes an existing user, or creates one
 * with no password, who signs in by emailed link. The email only says so;
 * signing in is what proves they own the address.
 */
export default defineEventHandler(async (event) => {
  const admin = await requirePlatformAdmin(event)
  const { email, name, notify } = await readValidatedBody(event, bodySchema.parse)
  const normalized = normalizeEmail(email)

  const existing = await findUserByEmail(normalized)
  if (existing?.isPlatformAdmin) {
    throw createError({ statusCode: 409, message: `${normalized} is already a platform admin` })
  }
  if (existing?.disabledAt) {
    throw createError({ statusCode: 409, message: `${normalized} is disabled. Enable them before making them an admin.` })
  }

  let id: string
  if (existing) {
    id = existing.id
    await useDb().update(tables.users)
      // A name they already have is kept
      .set({ isPlatformAdmin: true, ...(!existing.name && name ? { name } : {}) })
      .where(eq(tables.users.id, id))
  } else {
    id = crypto.randomUUID()
    await useDb().insert(tables.users).values({ id, email: normalized, name: name ?? '', isPlatformAdmin: true })
  }

  // They're an admin either way; a failed email is reported, not undone
  let emailed = false
  if (notify) {
    try {
      await sendEmail(normalized, platformAdminEmail({ url: appUrl('/login'), inviterName: admin.name || admin.email }))
      emailed = true
    } catch (err) {
      console.error('[admins] email to a new platform admin failed:', (err as Error).message)
    }
  }
  return { id, created: !existing, emailed }
})
