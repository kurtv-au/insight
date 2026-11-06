/**
 * Liveness for the ALB target group and `deploy/activate.sh`: the process is up
 * and serving, and which release it is. Deliberately no database or au-api
 * call: the deploy has already proved the database by running migrations, and
 * an au-api outage must not take the instance out of the load balancer or
 * read as a failed deploy. Public, so it says nothing beyond the version.
 */
export default defineEventHandler(() => {
  return { ok: true, version: useRuntimeConfig().public.appVersion }
})
