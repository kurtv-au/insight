import { relations } from 'drizzle-orm'
import {
  boolean,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  varchar
} from 'drizzle-orm/mysql-core'
import { ROLES } from '../../shared/utils/roles.ts'
import { TENANT_STATUSES } from '../../shared/utils/tenants.ts'
import { DEFAULT_TIMEZONE } from '../../shared/utils/timezones.ts'

const id = () => varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID())
const createdAt = () => datetime('created_at').notNull().$defaultFn(() => new Date())
const updatedAt = () => datetime('updated_at').notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date())

export const tenants = mysqlTable('tenants', {
  id: id(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  status: mysqlEnum('status', TENANT_STATUSES).notNull().default('setup'),
  // IANA timezone that messages and recordings are shown in, unless a user picks their own
  timezone: varchar('timezone', { length: 64 }).notNull().default(DEFAULT_TIMEZONE),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const users = mysqlTable('users', {
  id: id(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull().default(''),
  passwordHash: varchar('password_hash', { length: 255 }),
  emailVerifiedAt: datetime('email_verified_at'),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  disabledAt: datetime('disabled_at'),
  // Incremented to invalidate every existing session for the user
  sessionVersion: int('session_version').notNull().default(1),
  lastLoginAt: datetime('last_login_at'),
  // Null follows the timezone of the account being viewed
  timezone: varchar('timezone', { length: 64 }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const memberships = mysqlTable('memberships', {
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: mysqlEnum('role', ROLES).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, table => [
  primaryKey({ columns: [table.tenantId, table.userId] }),
  index('memberships_user_id_idx').on(table.userId)
])

export const invitations = mysqlTable('invitations', {
  id: id(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  role: mysqlEnum('role', ROLES).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  invitedByUserId: varchar('invited_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  expiresAt: datetime('expires_at').notNull(),
  acceptedAt: datetime('accepted_at'),
  revokedAt: datetime('revoked_at'),
  createdAt: createdAt()
}, table => [
  index('invitations_tenant_id_idx').on(table.tenantId),
  index('invitations_email_idx').on(table.email)
])

export const emailTokens = mysqlTable('email_tokens', {
  id: id(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  purpose: mysqlEnum('purpose', ['login', 'password_reset']).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  codeHash: varchar('code_hash', { length: 64 }),
  attempts: int('attempts').notNull().default(0),
  expiresAt: datetime('expires_at').notNull(),
  usedAt: datetime('used_at'),
  createdAt: createdAt()
}, table => [
  index('email_tokens_user_id_idx').on(table.userId)
])

export const passkeys = mysqlTable('passkeys', {
  // WebAuthn credential ID (base64url)
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull().default('Passkey'),
  publicKey: text('public_key').notNull(),
  counter: int('counter').notNull().default(0),
  backedUp: boolean('backed_up').notNull().default(false),
  transports: json('transports').$type<string[]>(),
  lastUsedAt: datetime('last_used_at'),
  createdAt: createdAt()
}, table => [
  index('passkeys_user_id_idx').on(table.userId)
])

export const webauthnChallenges = mysqlTable('webauthn_challenges', {
  attemptId: varchar('attempt_id', { length: 64 }).primaryKey(),
  challenge: varchar('challenge', { length: 255 }).notNull(),
  expiresAt: datetime('expires_at').notNull()
})

export const tenantsRelations = relations(tenants, ({ many }) => ({
  memberships: many(memberships),
  invitations: many(invitations)
}))

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  passkeys: many(passkeys)
}))

export const membershipsRelations = relations(memberships, ({ one }) => ({
  tenant: one(tenants, { fields: [memberships.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] })
}))

export const invitationsRelations = relations(invitations, ({ one }) => ({
  tenant: one(tenants, { fields: [invitations.tenantId], references: [tenants.id] }),
  invitedBy: one(users, { fields: [invitations.invitedByUserId], references: [users.id] })
}))

export const passkeysRelations = relations(passkeys, ({ one }) => ({
  user: one(users, { fields: [passkeys.userId], references: [users.id] })
}))
