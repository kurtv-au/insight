// Replaces a tenant's message-field configuration. Platform admins only, checked
// before the body is even read.
export default defineEventHandler(async (event) => {
  const user = await requirePlatformAdmin(event)
  const tenantId = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, messageFieldConfigInputSchema.parse)
  const { accountNumbers, tenant } = await adminMessageConfig(tenantId)

  if (body.scriptAccountNumber && !accountNumbers.includes(body.scriptAccountNumber)) {
    throw createError({ statusCode: 400, message: 'That account number isn’t connected to this tenant' })
  }
  if (!body.scriptAccountNumber && body.fields.length) {
    throw createError({ statusCode: 400, message: 'Choose the account whose script these fields come from' })
  }

  // Orphan state is decided against the live script, never taken from the client
  let script: ActiveScriptDto | null = null
  if (body.scriptAccountNumber) {
    const lookup = await getActiveScript(body.scriptAccountNumber)
    if (lookup.status === 'unknown_account') {
      throw createError({ statusCode: 404, message: `No client record for account ${body.scriptAccountNumber} is visible to Insight` })
    }
    script = lookup.status === 'ok' ? lookup.script : null
  }

  await saveMessageFieldConfig({
    tenantId,
    userId: user.id,
    revision: body.revision,
    scriptAccountNumber: body.scriptAccountNumber,
    fields: body.fields,
    received: body.received,
    script
  })
  await recordAudit(user, {
    action: 'message_fields.saved',
    tenant,
    details: { fields: body.fields.length, scriptAccountNumber: body.scriptAccountNumber ?? null }
  })
  return adminMessageConfig(tenantId)
})
