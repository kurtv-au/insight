import { eq, sql } from 'drizzle-orm'

// Signs out every other session, keeping this one
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb()

  await db.update(tables.users)
    .set({ sessionVersion: sql`${tables.users.sessionVersion} + 1` })
    .where(eq(tables.users.id, user.id))

  const updated = (await db.query.users.findFirst({ where: eq(tables.users.id, user.id) }))!
  await startSession(event, updated)
  return { ok: true }
})
