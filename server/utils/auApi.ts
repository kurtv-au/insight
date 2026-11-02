/**
 * A GET against au-api's customer API (/v1), with this environment's insight key.
 *
 * Returns null on a 404, which au-api uses both for "doesn't exist" and "not on
 * this key". Anything else (unreachable, 5xx, a rejected key) is logged by
 * status only, because the error's request details include the key header, and
 * becomes a 503 carrying `unavailableMessage` for the user.
 */
export async function auApiGet<T>(
  path: string,
  query: Record<string, string | number | undefined> | undefined,
  options: { tag: string, unavailableMessage: string }
): Promise<T | null> {
  const { url, key } = useRuntimeConfig().auApi
  try {
    // An external URL: the cast stops Nitro typing it as one of insight's own routes
    return await $fetch<T>(path, { baseURL: url, query, headers: { Authorization: `Bearer ${key}` } }) as T
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404) {
      return null
    }
    console.error(`[${options.tag}] au-api ${path} failed:`, status ?? (err as Error).message)
    throw createError({ statusCode: 503, message: options.unavailableMessage })
  }
}
