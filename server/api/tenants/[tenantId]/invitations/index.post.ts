import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  email: emailSchema,
  role: roleSchema
})

export default defineEventHandler(async (event) => {
  const { user, tenant, role: actorRole } = await requireTenantRole(event, getRouterParam(event, 'tenantId')!, 'admin')
  const { email, role } = await readValidatedBody(event, bodySchema.parse)

  if (role === 'owner' && actorRole !== 'owner') {
    throw createError({ statusCode: 403, message: 'Only owners can invite owners' })
  }

  const existing = await findUserByEmail(email)
  if (existing) {
    const membership = await useDb().query.memberships.findFirst({
      where: and(eq(tables.memberships.tenantId, tenant.id), eq(tables.memberships.userId, existing.id))
    })
    if (membership) {
      throw createError({ statusCode: 409, message: `${existing.email} is already a member` })
    }
  }

  const id = await createInvitation({ tenant, email, role, invitedBy: user })
  return { id }
})
