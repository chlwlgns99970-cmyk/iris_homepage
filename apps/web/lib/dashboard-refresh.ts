export const DASHBOARD_REFRESH_DEDUP_MS = 1_000;

export function shouldRefreshDashboard(
  lastRequestedAt: number,
  now: number,
  minimumIntervalMs = DASHBOARD_REFRESH_DEDUP_MS,
) {
  return !Number.isFinite(lastRequestedAt)
    || lastRequestedAt <= 0
    || now - lastRequestedAt >= minimumIntervalMs;
}
