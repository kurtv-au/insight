// How each enforced feature is named when a plan refuses it
const REFUSED: Partial<Record<PlanFeature, string>> = {
  messages: 'Messages aren’t',
  recordings: 'Call recordings aren’t',
  export: 'Exports aren’t'
}

/**
 * Refuses a feature the tenant's plan doesn't include. Platform admins get
 * past it, so staff can support any account. Call after requireTenantRole().
 */
export function requirePlanFeature(access: { tenant: { plan: Plan }, user: { isPlatformAdmin: boolean } }, feature: PlanFeature) {
  if (access.user.isPlatformAdmin || planIncludes(access.tenant.plan, feature)) {
    return
  }
  const subject = REFUSED[feature] ?? 'That isn’t'
  throw createError({
    statusCode: 403,
    message: `${subject} included in this account’s ${PLAN_LABELS[access.tenant.plan]} plan. ${upgradeHint(feature)}.`
  })
}

/** Why an account can't take another user */
export function seatLimitMessage(plan: Plan) {
  const max = planMaxUsers(plan)
  return `This account’s ${PLAN_LABELS[plan]} plan includes up to ${max} ${max === 1 ? 'user' : 'users'}. Remove someone or contact us to add more.`
}
