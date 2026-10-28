import { asc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  return useDb()
    .select({
      id: tables.passkeys.id,
      name: tables.passkeys.name,
      backedUp: tables.passkeys.backedUp,
      createdAt: tables.passkeys.createdAt,
      lastUsedAt: tables.passkeys.lastUsedAt
    })
    .from(tables.passkeys)
    .where(eq(tables.passkeys.userId, user.id))
    .orderBy(asc(tables.passkeys.createdAt))
})
