import { z } from 'zod'

const querySchema = z.object({
  account: accountNumberSchema.optional()
})

// The fields of an account's active script, from au-api. Defaults to the
// account the configuration was saved with, else the tenant's first one.
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const tenantId = getRouterParam(event, 'id')!
  const query = await getValidatedQuery(event, querySchema.parse)
  const { accountNumbers, settings } = await adminMessageConfig(tenantId)

  if (!accountNumbers.length) {
    throw createError({ statusCode: 409, message: 'Connect an account number in Settings first. Message fields come from its active script.' })
  }
  const accountNumber = query.account ?? settings.scriptAccountNumber ?? accountNumbers[0]!
  if (!accountNumbers.includes(accountNumber)) {
    throw createError({ statusCode: 400, message: 'That account number isn’t connected to this tenant' })
  }

  const lookup = await getActiveScript(accountNumber)
  if (lookup.status === 'unknown_account') {
    throw createError({
      statusCode: 404,
      message: `No client record for account ${accountNumber} is visible to Insight. Check the number, and that it’s on Insight’s au-api key.`
    })
  }
  return { accountNumber, script: lookup.status === 'ok' ? lookup.script : null }
})
