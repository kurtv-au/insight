/**
 * Every account is on a plan, which decides the features it has. The list is
 * fixed in code and in tier order (lowest first), so a plan can be compared
 * with another. Platform admins assign plans; adding one means a release and a
 * migration (the column is an enum).
 *
 * PLAN_FEATURES and PLAN_LIMITS mirror Answer United's pricing table, so a
 * change to the table is a change here.
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

/**
 * Users an account can have (members plus pending invitations), and the days
 * of messages and recordings it can load, counting back from now.
 */
export const PLAN_LIMITS: Record<Plan, { maxUsers: number, historyDays: number }> = {
  basic: { maxUsers: 1, historyDays: 365 },
  basic_plus: { maxUsers: 5, historyDays: 1095 },
  pro: { maxUsers: 25, historyDays: 1095 },
  enterprise: { maxUsers: 250, historyDays: 2190 }
}

export const PLAN_FEATURE_KEYS = [
  'dashboard',
  'notifications',
  'messages',
  'recordings',
  'support',
  'export',
  'configurableReporting',
  'multiLocation',
  'userManagement',
  'customDevelopment'
] as const
export type PlanFeature = typeof PLAN_FEATURE_KEYS[number]

export interface PlanFeatureInfo {
  key: PlanFeature
  label: string
  /** The lowest plan that includes it */
  minPlan: Plan
  /**
   * Whether the app enforces it. The others are part of the plan as sold
   * (service levels, or features that aren't built yet) and gate nothing.
   */
  enforced: boolean
}

/** The pricing table's feature rows, in its order */
export const PLAN_FEATURES: readonly PlanFeatureInfo[] = [
  { key: 'dashboard', label: 'Dashboard access', minPlan: 'basic', enforced: false },
  { key: 'notifications', label: 'Notifications', minPlan: 'basic', enforced: false },
  { key: 'messages', label: 'Access to messages', minPlan: 'basic', enforced: false },
  { key: 'recordings', label: 'Listen to call recordings', minPlan: 'basic_plus', enforced: true },
  { key: 'support', label: 'Support', minPlan: 'basic_plus', enforced: false },
  { key: 'export', label: 'Exportable reporting', minPlan: 'basic_plus', enforced: true },
  { key: 'configurableReporting', label: 'Customized configurable reporting', minPlan: 'pro', enforced: false },
  { key: 'multiLocation', label: 'Multi location support', minPlan: 'pro', enforced: false },
  { key: 'userManagement', label: 'User management', minPlan: 'enterprise', enforced: false },
  { key: 'customDevelopment', label: 'Custom development & integration', minPlan: 'enterprise', enforced: false }
]

function featureInfo(feature: PlanFeature) {
  return PLAN_FEATURES.find(info => info.key === feature)!
}

/** Whether the plan includes the feature, enforced or not */
export function planIncludes(plan: Plan, feature: PlanFeature) {
  return PLANS.indexOf(plan) >= PLANS.indexOf(featureInfo(feature).minPlan)
}

export function planMaxUsers(plan: Plan) {
  return PLAN_LIMITS[plan].maxUsers
}

export function planHistoryDays(plan: Plan) {
  return PLAN_LIMITS[plan].historyDays
}

/** "1 year", "3 years" */
export function describeHistoryDays(days: number) {
  const years = days / 365
  if (Number.isInteger(years)) {
    return years === 1 ? '1 year' : `${years} years`
  }
  return days === 1 ? '1 day' : `${days} days`
}

/** "Available on Basic+ and up", or "Available on Enterprise" for the top plan */
export function upgradeHint(feature: PlanFeature) {
  const { minPlan } = featureInfo(feature)
  return minPlan === PLANS[PLANS.length - 1]
    ? `Available on ${PLAN_LABELS[minPlan]}`
    : `Available on ${PLAN_LABELS[minPlan]} and up`
}
