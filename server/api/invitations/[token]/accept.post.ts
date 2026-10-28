import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  name: nameSchema.optional(),
  password: passwordSchema.optional()
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  await rateLimitAuth(event, 'invite-accept')

  const invitation = await findPendingInvitation(getRouterParam(event, 'token')!)
  if (!invitation) {
    throw createError({ statusCode: 404, message: 'This invitation is invalid or has expired.' })
  }

  const existing = await findUserByEmail(invitation.email)

  if (existing) {
    // Existing accounts must be signed in as the invited email
    const session = await getUserSession(event)
    if (!session.user) {
      throw createError({ statusCode: 401, message: `Sign in as ${invitation.email} to accept this invitation.` })
    }
    const current = await requireUser(event)
    if (current.id !== existing.id) {
      throw createError({ statusCode: 403, message: `This invitation was sent to ${invitation.email}. Sign in with that account to accept it.` })
    }
  } else if (!body.name) {
    throw createError({ statusCode: 400, message: 'Name is required' })
  }

  const passwordHash = !existing && body.password ? await hashPassword(body.password) : null
  const db = useDb()

  const userId = await db.transaction(async (tx) => {
    const [result] = await tx.update(tables.invitations)
      .set({ acceptedAt: new Date() })
      .where(and(eq(tables.invitations.id, invitation.id), isNull(tables.invitations.acceptedAt)))
    if (result.affectedRows !== 1) {
      return null
    }

    let id = existing?.id
    if (!id) {
      id = crypto.randomUUID()
      await tx.insert(tables.users).values({
        id,
        email: invitation.email,
        name: body.name!,
        passwordHash,
        // The invitation link was delivered to this address
        emailVerifiedAt: new Date()
      })
    }

    // Keep an existing membership's role rather than overwrite it
    await tx.insert(tables.memberships)
      .values({ tenantId: invitation.tenantId, userId: id, role: invitation.role })
      .onDuplicateKeyUpdate({ set: { tenantId: invitation.tenantId } })
    return id
  })
  if (!userId) {
    throw createError({ statusCode: 404, message: 'This invitation has already been accepted.' })
  }

  const user = (await db.query.users.findFirst({ where: eq(tables.users.id, userId) }))!
  await startSession(event, user)
  return { tenantSlug: invitation.tenant.slug, tenantStatus: invitation.tenant.status }
})
