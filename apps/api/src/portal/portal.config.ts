function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function getPortalConfig(env: NodeJS.ProcessEnv = process.env) {
  const enabled = String(env.PORTAL_ENABLED ?? 'false').toLowerCase() === 'true';
  const url = String(env.BOT_INTERNAL_API_URL ?? '').replace(/\/+$/, '');
  const token = String(env.BOT_INTERNAL_API_TOKEN ?? '');
  if (enabled) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error('BOT_INTERNAL_API_URL must be a valid URL'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error('BOT_INTERNAL_API_URL must be a safe http(s) URL');
    }
    if (token.length < 32) throw new Error('BOT_INTERNAL_API_TOKEN must be at least 32 characters');
    const forbidden = [env.WEB_AUTH_INTERNAL_TOKEN, env.SESSION_SECRET, env.TOKEN_HASH_SECRET].filter(Boolean);
    if (forbidden.includes(token)) throw new Error('BOT_INTERNAL_API_TOKEN must be dedicated');
  }
  return {
    enabled,
    url,
    token,
    timeoutMs: positiveInteger(env.PORTAL_REQUEST_TIMEOUT_MS, 3000, 'PORTAL_REQUEST_TIMEOUT_MS'),
    maxResponseBytes: positiveInteger(env.PORTAL_MAX_RESPONSE_BYTES, 524288, 'PORTAL_MAX_RESPONSE_BYTES'),
    cacheTtlMs: positiveInteger(env.PORTAL_CACHE_TTL_MS, 3000, 'PORTAL_CACHE_TTL_MS'),
  };
}
