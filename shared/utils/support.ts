export const SUPPORT_TOPICS = ['service', 'billing', 'technical', 'feedback'] as const
export type SupportTopic = typeof SUPPORT_TOPICS[number]

export const SUPPORT_TOPIC_LABELS: Record<SupportTopic, string> = {
  service: 'Customer service',
  billing: 'Billing',
  technical: 'Technical issue',
  feedback: 'Feedback'
}
