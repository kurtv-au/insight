import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  ownerEmail: emailSchema.optional(),
  timezone: timezoneSchema.optional()
})

// Creates a tenant in `setup`, optionally inviting its first owner straight away
export default defineEventHandler(async (event) => {
  const admin = await requirePlatformAdmin(event)
  const { name, slug, ownerEmail, timezone } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  if (await db.query.tenants.findFirst({ where: eq(tables.tenants.slug, slug) })) {
    throw createError({ statusCode: 409, message: `The slug "${slug}" is already in use` })
  }

  const id = crypto.randomUUID()
  await db.insert(tables.tenants).values({ id, name, slug, timezone })
  const tenant = (await db.query.tenants.findFirst({ where: eq(tables.tenants.id, id) }))!

  if (ownerEmail) {
    await createInvitation({ tenant, email: ownerEmail, role: 'owner', invitedBy: admin })
  }
  return { id, slug, invited: !!ownerEmail }
})
