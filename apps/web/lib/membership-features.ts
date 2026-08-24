import type { PortalDashboard, PortalRankingCategory, PortalRankingRow, PortalRankings } from './api';

export type MembershipTier = 'FREE' | 'MEMBERSHIP';

export type MembershipEntitlement = {
  tier: MembershipTier;
  active: boolean;
};

export const FREE_MEMBERSHIP_ENTITLEMENT: MembershipEntitlement = Object.freeze({
  tier: 'FREE',
  active: false,
});

type MembershipAwareDashboard = PortalDashboard & {
  membership?: { tier?: unknown; active?: unknown };
  membershipActive?: unknown;
};

export function resolveMembershipEntitlement(
  dashboard: PortalDashboard | null | undefined,
): MembershipEntitlement {
  if (!dashboard) return FREE_MEMBERSHIP_ENTITLEMENT;
  const source = dashboard as MembershipAwareDashboard;
  const active = source.membership?.active === true || source.membershipActive === true;
  const invalidFreeTier = source.membership?.tier === 'FREE';
  return active && !invalidFreeTier
    ? { tier: 'MEMBERSHIP', active: true }
    : FREE_MEMBERSHIP_ENTITLEMENT;
}

export function shouldUseMembershipProfileFrame(
  entitlement: MembershipEntitlement,
) {
  return entitlement.active && entitlement.tier === 'MEMBERSHIP';
}

export type RankingNeighbor = {
  rank: number;
  nickname: string;
  value: string;
  difference: number | null;
};

export type RankingMetricComparison = {
  id: 'power' | 'level';
  label: string;
  currentRank: number;
  currentValue: string;
  above: RankingNeighbor | null;
  below: RankingNeighbor | null;
};

export type MembershipRankingComparison = {
  overallRank: number | null;
  jobRank: number | null;
  job: string;
  metrics: RankingMetricComparison[];
};

export function buildMembershipRankingComparison(
  rankings: PortalRankings | undefined,
): MembershipRankingComparison | null {
  if (!rankings) return null;
  const power = findCategory(rankings, 'power');
  const level = findCategory(rankings, 'level');
  const currentPower = power?.rows.find((row) => row.current);
  const currentLevel = level?.rows.find((row) => row.current);
  const current = currentPower ?? currentLevel;
  if (!current) return null;

  const metrics = [power, level].flatMap((category) => {
    const comparison = category && compareCategory(category);
    return comparison ? [comparison] : [];
  });
  const jobRows = jobRowsFor(rankings, current.job);
  const currentJob = jobRows.find((row) => row.current)
    ?? jobRows.find((row) => row.nickname === current.nickname);

  return {
    overallRank: currentPower?.rank ?? null,
    jobRank: currentJob?.rank ?? null,
    job: current.job,
    metrics,
  };
}

function findCategory(
  rankings: PortalRankings,
  id: RankingMetricComparison['id'],
) {
  return rankings.categories.find((category) => category.id === id);
}

function compareCategory(
  category: PortalRankingCategory,
): RankingMetricComparison | null {
  const current = category.rows.find((row) => row.current);
  if (!current || (category.id !== 'power' && category.id !== 'level')) return null;
  const ordered = [...category.rows].sort((left, right) => left.rank - right.rank);
  const index = ordered.findIndex((row) => row.current);
  return {
    id: category.id,
    label: category.label,
    currentRank: current.rank,
    currentValue: current.value,
    above: index > 0 ? neighbor(ordered[index - 1], current) : null,
    below: index >= 0 && index < ordered.length - 1
      ? neighbor(ordered[index + 1], current)
      : null,
  };
}

function neighbor(row: PortalRankingRow, current: PortalRankingRow): RankingNeighbor {
  const rowValue = numericValue(row.value);
  const currentValue = numericValue(current.value);
  return {
    rank: row.rank,
    nickname: row.nickname,
    value: row.value,
    difference: rowValue === null || currentValue === null
      ? null
      : Math.abs(rowValue - currentValue),
  };
}

function numericValue(value: string) {
  const match = value.replaceAll(',', '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function jobRowsFor(rankings: PortalRankings, job: string) {
  const normalized = job.trim().toLowerCase();
  if (normalized === 'warrior' || normalized === '전사') return rankings.byJob?.warrior ?? [];
  if (normalized === 'archer' || normalized === '궁수') return rankings.byJob?.archer ?? [];
  if (normalized === 'mage' || normalized === '마법사') return rankings.byJob?.mage ?? [];
  return [];
}
