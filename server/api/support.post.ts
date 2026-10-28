import { and, eq } from 'drizzle-orm'
import { supportEmail } from '../emails/support'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, supportRequestSchema.parse)
  await rateLimit(`support:user:${user.id}`, 5, 60 * 60)

  // Checked directly rather than with requireTenantRole, so people can still ask
  // about an account that is being set up or is suspended
  let tenantName: string | undefined
  if (body.tenantId) {
    const db = useDb()
    const tenant = await db.query.tenants.findFirst({ where: eq(tables.tenants.id, body.tenantId) })
    const isMember = !!tenant && (user.isPlatformAdmin || !!await db.query.memberships.findFirst({
      where: and(eq(tables.memberships.tenantId, tenant.id), eq(tables.memberships.userId, user.id))
    }))
    if (!tenant || !isMember) {
      throw createError({ statusCode: 403, message: 'You don’t have access to that account.' })
    }
    tenantName = tenant.name
  }

  const to = useRuntimeConfig().support.email
  if (!to) {
    console.error('[support] NUXT_SUPPORT_EMAIL is not set')
    throw createError({ statusCode: 503, message: 'The support form isn’t available right now. Please call or email us instead.' })
  }

  // Awaited so a failed send is reported to the user instead of silently dropped
  await sendEmail(to, supportEmail({
    name: user.name,
    email: user.email,
    topic: SUPPORT_TOPIC_LABELS[body.topic],
    tenantName,
    subject: body.subject,
    message: body.message
  }), { replyTo: user.email })

  return { ok: true }
})
