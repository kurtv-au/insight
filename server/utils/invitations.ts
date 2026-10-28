import { and, eq, gt, isNull } from 'drizzle-orm'
import { invitationEmail } from '../emails/invitation'

const INVITATION_TTL_DAYS = 7

/** Creates an invitation (replacing any pending one for the same email) and emails it */
export async function createInvitation({ tenant, email, role, invitedBy }: {
  tenant: DbTenant
  email: string
  role: Role
  invitedBy: DbUser
}) {
  const db = useDb()
  const normalizedEmail = normalizeEmail(email)
  const token = generateToken()

  await db.update(tables.invitations)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(tables.invitations.tenantId, tenant.id),
      eq(tables.invitations.email, normalizedEmail),
      isNull(tables.invitations.acceptedAt),
      isNull(tables.invitations.revokedAt)
    ))

  const id = crypto.randomUUID()
  await db.insert(tables.invitations).values({
    id,
    tenantId: tenant.id,
    email: normalizedEmail,
    role,
    tokenHash: hashToken(token),
    invitedByUserId: invitedBy.id,
    expiresAt: minutesFromNow(INVITATION_TTL_DAYS * 24 * 60)
  })

  await sendEmail(normalizedEmail, invitationEmail({
    url: appUrl(`/invite/${token}`),
    tenantName: tenant.name,
    inviterName: invitedBy.name || invitedBy.email
  }))

  return id
}

/** Finds a pending, unexpired invitation by its raw token */
export async function findPendingInvitation(token: string) {
  return useDb().query.invitations.findFirst({
    where: and(
      eq(tables.invitations.tokenHash, hashToken(token)),
      isNull(tables.invitations.acceptedAt),
      isNull(tables.invitations.revokedAt),
      gt(tables.invitations.expiresAt, new Date())
    ),
    with: { tenant: true }
  })
}

export function pendingInvitationsWhere(tenantId: string) {
  return and(
    eq(tables.invitations.tenantId, tenantId),
    isNull(tables.invitations.acceptedAt),
    isNull(tables.invitations.revokedAt),
    gt(tables.invitations.expiresAt, new Date())
  )
}
