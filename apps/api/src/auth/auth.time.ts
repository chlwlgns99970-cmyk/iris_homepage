export const WEB_SESSION_DURATION_SECONDS = 2_592_000;
export const WEB_SESSION_DURATION_MS = WEB_SESSION_DURATION_SECONDS * 1_000;

// The expiry is fixed at issuance and is never extended by later requests.
export function fixedWebSessionExpiry(issuedAt = new Date()): Date {
  const issuedAtMs = issuedAt.getTime();
  if (!Number.isFinite(issuedAtMs)) {
    throw new Error('Unable to calculate the web session expiry');
  }
  return new Date(issuedAtMs + WEB_SESSION_DURATION_MS);
}
