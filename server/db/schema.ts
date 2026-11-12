import { relations } from 'drizzle-orm'
import {
  boolean,
  datetime,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar
} from 'drizzle-orm/mysql-core'
import { ROLES } from '../../shared/utils/roles.ts'
import { TENANT_STATUSES } from '../../shared/utils/tenants.ts'
import { DEFAULT_PLAN, PLANS } from '../../shared/utils/plans.ts'
import { DEFAULT_TIMEZONE } from '../../shared/utils/timezones.ts'
import { DEFAULT_RECORDING_HISTORY_DAYS } from '../../shared/utils/recordings.ts'
import type { RecordingColumn } from '../../shared/utils/recordings.ts'
import { MESSAGE_FIELD_TYPES } from '../../shared/utils/messageFieldTypes.ts'
import type { MessageFieldFormat } from '../../shared/utils/messageFields.ts'

const id = () => varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID())
const createdAt = () => datetime('created_at').notNull().$defaultFn(() => new Date())
const updatedAt = () => datetime('updated_at').notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date())

export const tenants = mysqlTable('tenants', {
  id: id(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  status: mysqlEnum('status', TENANT_STATUSES).notNull().default('setup'),
  // The plan, which decides the account's features (shared/utils/plans.ts); set by platform admins
  plan: mysqlEnum('plan', PLANS).notNull().default(DEFAULT_PLAN),
  // IANA timezone that messages and recordings are shown in, unless a user picks their own
  timezone: varchar('timezone', { length: 64 }).notNull().default(DEFAULT_TIMEZONE),
  // Recording columns platform admins make available; null means DEFAULT_AVAILABLE_COLUMNS
  recordingColumns: json('recording_columns').$type<RecordingColumn[]>(),
  // Columns members see until they choose their own; null means every available column
  recordingDefaultColumns: json('recording_default_columns').$type<RecordingColumn[]>(),
  // No longer read: history comes from the plan (planHistoryDays()). Kept so a
  // rolled-back release still finds it
  recordingHistoryDays: int('recording_history_days').notNull().default(DEFAULT_RECORDING_HISTORY_DAYS),
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

// Recordings from these account numbers belong to the tenant. Most tenants have one.
export const tenantRecordingAccounts = mysqlTable('tenant_recording_accounts', {
  accountNumber: varchar('account_number', { length: 32 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  createdAt: createdAt()
}, table => [
  index('tenant_recording_accounts_tenant_id_idx').on(table.tenantId)
])

// A user's own settings within one tenant
export const userTenantPreferences = mysqlTable('user_tenant_preferences', {
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Null follows the tenant's default columns
  recordingColumns: json('recording_columns').$type<RecordingColumn[]>(),
  // Message field keys shown as columns; null follows the fields' list setting
  messageColumns: json('message_columns').$type<string[]>(),
  updatedAt: updatedAt()
}, table => [
  primaryKey({ columns: [table.userId, table.tenantId] })
])

// How a tenant's messages page is set up: which account's active script its
// fields come from, and the script as it was at the last save. Set by platform admins.
export const tenantMessageSettings = mysqlTable('tenant_message_settings', {
  tenantId: varchar('tenant_id', { length: 36 }).primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  // The account number (au-api client number) whose active script supplies the fields
  scriptAccountNumber: varchar('script_account_number', { length: 32 }),
  scriptId: int('script_id'),
  scriptVersion: int('script_version'),
  // Canonical (lower-cased) script field keys at the last save; fields not in it show as new
  knownFieldKeys: json('known_field_keys').$type<string[]>(),
  // Bumped on every save, so a stale editor can't overwrite a newer configuration
  revision: int('revision').notNull().default(0),
  // When the message was taken: a default list column, and the message drawer's
  // title. Both off hides it everywhere, the CSV export included.
  receivedInList: boolean('received_in_list').notNull().default(true),
  receivedInDetail: boolean('received_in_detail').notNull().default(true),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt()
}, table => [
  // Named explicitly: the generated name is longer than MySQL's 64-character limit
  foreignKey({
    name: 'tenant_message_settings_script_account_fk',
    columns: [table.scriptAccountNumber],
    foreignColumns: [tenantRecordingAccounts.accountNumber]
  }).onDelete('set null')
])

// The script fields a tenant's messages page shows, keyed by the script's own field name.
// Replaced as a whole on every save.
export const tenantMessageFields = mysqlTable('tenant_message_fields', {
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // The script's field name, as the script spells it; unique per tenant case-insensitively
  fieldKey: varchar('field_key', { length: 128 }).notNull(),
  label: varchar('label', { length: 255 }).notNull(),
  type: mysqlEnum('type', MESSAGE_FIELD_TYPES).notNull(),
  format: json('format').$type<MessageFieldFormat>().notNull(),
  // `order` is a reserved word in SQL
  position: int('position').notNull(),
  showInList: boolean('show_in_list').notNull().default(true),
  showInDetail: boolean('show_in_detail').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  // Not in the source script at the last save; hidden from the messages page unless showIfOrphaned
  orphaned: boolean('orphaned').notNull().default(false),
  showIfOrphaned: boolean('show_if_orphaned').notNull().default(false),
  sourceScriptId: int('source_script_id'),
  sourceScriptVersion: int('source_script_version'),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt()
}, table => [
  primaryKey({ columns: [table.tenantId, table.fieldKey] }),
  uniqueIndex('tenant_message_fields_tenant_position_uq').on(table.tenantId, table.position)
])

// Named message filters an account's owners and admins assign to members. A
// member with any assigned sees only messages where one of them matches
// (see shared/utils/messageFilters.ts).
export const tenantMessageFilters = mysqlTable('tenant_message_filters', {
  id: id(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  // The script's field name, as the script spells it; matched case-insensitively
  fieldKey: varchar('field_key', { length: 128 }).notNull(),
  // Matched exactly after trimming, ignoring case
  value: varchar('value', { length: 255 }).notNull(),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, table => [
  index('tenant_message_filters_tenant_id_idx').on(table.tenantId)
])

// Which filters apply to which member. Removed with the membership or the filter.
export const membershipMessageFilters = mysqlTable('membership_message_filters', {
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  filterId: varchar('filter_id', { length: 36 }).notNull(),
  createdAt: createdAt()
}, table => [
  primaryKey({ columns: [table.tenantId, table.userId, table.filterId] }),
  index('membership_message_filters_filter_id_idx').on(table.filterId),
  // Named explicitly: the generated names are longer than MySQL's 64-character limit
  foreignKey({
    name: 'membership_message_filters_filter_fk',
    columns: [table.filterId],
    foreignColumns: [tenantMessageFilters.id]
  }).onDelete('cascade'),
  foreignKey({
    name: 'membership_message_filters_membership_fk',
    columns: [table.tenantId, table.userId],
    foreignColumns: [memberships.tenantId, memberships.userId]
  }).onDelete('cascade')
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

// Who changed access or setup, and when (server/utils/audit.ts). No foreign
// keys: names are copied in, so the history outlives a deleted account.
export const auditEvents = mysqlTable('audit_events', {
  id: id(),
  // To the millisecond, so events from one request or second keep their order
  createdAt: datetime('created_at', { fsp: 3 }).notNull().$defaultFn(() => new Date()),
  actorUserId: varchar('actor_user_id', { length: 36 }),
  actorEmail: varchar('actor_email', { length: 255 }).notNull(),
  // e.g. member.role_changed (shared/utils/audit.ts)
  action: varchar('action', { length: 64 }).notNull(),
  tenantId: varchar('tenant_id', { length: 36 }),
  tenantName: varchar('tenant_name', { length: 255 }),
  // The person, filter or account number affected, as it was named then
  targetLabel: varchar('target_label', { length: 255 }),
  details: json('details').$type<Record<string, unknown>>()
}, table => [
  index('audit_events_created_at_idx').on(table.createdAt),
  index('audit_events_tenant_id_created_at_idx').on(table.tenantId, table.createdAt)
])

export const tenantsRelations = relations(tenants, ({ many }) => ({
  memberships: many(memberships),
  invitations: many(invitations),
  recordingAccounts: many(tenantRecordingAccounts)
}))

export const tenantRecordingAccountsRelations = relations(tenantRecordingAccounts, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantRecordingAccounts.tenantId], references: [tenants.id] })
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
