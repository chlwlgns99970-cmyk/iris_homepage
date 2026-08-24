import type { PortalRankings } from '@/lib/api';
import { buildMembershipRankingComparison, type RankingNeighbor } from '@/lib/membership-features';
import styles from './membership-features.module.css';

export function MembershipRankingInsights({
  rankings,
  active,
}: {
  rankings?: PortalRankings;
  active: boolean;
}) {
  if (!active) {
    return <aside className={`${styles.rankingInsights} ${styles.rankingInsightsLocked}`} aria-label="멤버십 상세 랭킹 비교">
      <div><small>MEMBERSHIP DETAIL</small><strong>상세 랭킹 비교</strong></div>
      <p>멤버십 활성화 후 전체·직업별 순위와 인접 순위의 전투력·레벨 차이를 확인할 수 있습니다.</p>
      <span>멤버십 전용</span>
    </aside>;
  }

  const comparison = buildMembershipRankingComparison(rankings);
  if (!comparison) {
    return <aside className={styles.rankingInsights} aria-label="멤버십 상세 랭킹 비교">
      <div><small>MEMBERSHIP DETAIL</small><strong>상세 랭킹 비교</strong></div>
      <p>현재 계정의 랭킹 기록이 생성되면 실제 데이터로 비교 정보를 제공합니다.</p>
    </aside>;
  }

  return <aside className={styles.rankingInsights} aria-label="멤버십 상세 랭킹 비교">
    <div className={styles.insightHeader}><div><small>MEMBERSHIP DETAIL</small><strong>상세 랭킹 비교</strong></div><span>이용 중</span></div>
    <dl className={styles.rankSummary}>
      <div><dt>전체 순위</dt><dd>{rankText(comparison.overallRank)}</dd></div>
      <div><dt>{comparison.job} 직업 순위</dt><dd>{rankText(comparison.jobRank)}</dd></div>
    </dl>
    <div className={styles.metricGrid}>
      {comparison.metrics.map((metric) => <article key={metric.id}>
        <header><span>{metric.label}</span><strong>{metric.currentRank}위 · {metric.currentValue}</strong></header>
        <p>바로 위 {neighborText(metric.above)}</p>
        <p>바로 아래 {neighborText(metric.below)}</p>
      </article>)}
    </div>
  </aside>;
}

function rankText(rank: number | null) {
  return rank === null ? '기록 없음' : `${rank}위`;
}

function neighborText(neighbor: RankingNeighbor | null) {
  if (!neighbor) return '없음';
  const difference = neighbor.difference === null
    ? '차이 계산 불가'
    : `차이 ${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(neighbor.difference)}`;
  return `${neighbor.rank}위 ${neighbor.nickname} · ${neighbor.value} · ${difference}`;
}
