import { ApiError } from './api';

export type RankingRow = {
  rank: number;
  name: string;
  job: string;
  value: string;
};

export type RankingStatus = 'loading' | 'success' | 'empty' | 'error' | 'unconfigured';

export type RankingParseResult =
  | { ok: true; rows: RankingRow[] }
  | { ok: false; error: 'INVALID_RANKING_RESPONSE' };

export function parseRankingRows(value: unknown): RankingParseResult {
  const source =
    Array.isArray(value)
      ? value
      : value && typeof value === 'object' && 'items' in value
        ? (value as { items?: unknown }).items
        : undefined;

  if (!Array.isArray(source)) {
    return { ok: false, error: 'INVALID_RANKING_RESPONSE' };
  }

  const rows: RankingRow[] = [];
  for (const item of source) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'INVALID_RANKING_RESPONSE' };
    }
    const row = item as Record<string, unknown>;
    const name = row.name ?? row.nickname ?? row.displayName;
    const job = row.job ?? row.className ?? '-';
    const metric = row.value ?? row.metric;
    if (
      typeof name !== 'string'
      || !name.trim()
      || typeof row.rank !== 'number'
      || !Number.isInteger(row.rank)
      || row.rank <= 0
      || !['string', 'number'].includes(typeof metric)
      || (typeof metric === 'number' && !Number.isFinite(metric))
      || (typeof metric === 'string' && !metric.trim())
      || (typeof job !== 'string' && typeof job !== 'number')
    ) {
      return { ok: false, error: 'INVALID_RANKING_RESPONSE' };
    }
    rows.push({
      rank: row.rank,
      name: name.trim(),
      job: String(job),
      value: String(metric),
    });
  }
  return { ok: true, rows };
}

export function rankingResultStatus(rows: RankingRow[]): RankingStatus {
  return rows.length ? 'success' : 'empty';
}

export function rankingFailureStatus(error: unknown): RankingStatus {
  return error instanceof ApiError && error.code === 'RANKING_PROVIDER_NOT_CONFIGURED'
    ? 'unconfigured'
    : 'error';
}
