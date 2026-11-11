/**
 * Every account is on a plan, which will decide the features it has. The list
 * is fixed in code and in tier order (lowest first), so a plan can be compared
 * with another. Platform admins assign plans; adding one means a release and a
 * migration (the column is an enum).
 */
export const PLANS = ['basic', 'basic_plus', 'pro', 'enterprise'] as const
export type Plan = typeof PLANS[number]

export const PLAN_LABELS: Record<Plan, string> = {
  basic: 'Basic',
  basic_plus: 'Basic+',
  pro: 'Pro',
  enterprise: 'Enterprise'
}

/** New accounts start here, and accounts that existed before plans were put here */
export const DEFAULT_PLAN: Plan = 'basic_plus'
