export const MEMBERSHIP_PRICE_KRW = 5_900;

export type MembershipAvailability = '이용 가능' | '준비 중' | '순차 제공 예정';

export const MEMBERSHIP_BENEFITS = [
  { id: 'battle-history', icon: '⚔️', title: '상세 전투 기록', availability: '순차 제공 예정', description: '전투의 흐름과 성장 변화를 더 오래, 더 자세히 확인합니다.', items: ['최근 전투 기록', '보스·레이드 전투 결과', '전투력 변화 기록'] },
  { id: 'monthly-report', icon: '📈', title: '월간 성장 리포트', availability: '준비 중', description: '한 달 동안 쌓인 캐릭터 성장과 콘텐츠 진행을 한눈에 정리합니다.', items: ['레벨·전투력 변화', '주요 콘텐츠 진행 현황', '월간 플레이 요약'] },
  { id: 'ranking-detail', icon: '🏆', title: '상세 랭킹 비교', availability: '이용 가능', description: '로그인 계정의 실제 랭킹을 기준으로 전체·직업별 순위와 인접 순위 차이를 확인합니다.', items: ['전체·직업별 현재 순위', '바로 위·아래 순위', '전투력·레벨 차이'] },
  { id: 'profile-style', icon: '✨', title: '멤버십 전용 프로필 프레임', availability: '이용 가능', description: '능력치에 영향을 주지 않는 보라·금색 계열 전용 프로필 프레임을 제공합니다.', items: ['전용 프로필 프레임', '멤버십 표시 배지', 'RPG 능력치 영향 없음'] },
  { id: 'history-retention', icon: '🗂️', title: '기록 보관 확장', availability: '준비 중', description: '일반 사용자보다 더 긴 기간의 전투 및 성장 기록을 확인합니다.', items: ['장기 성장 이력', '이전 전투 기록', '기간별 변화 비교'] },
  { id: 'character-tools', icon: '🛡️', title: '캐릭터·장비 비교', availability: '준비 중', description: '여러 성장 정보와 장비를 비교하고 관리하기 쉬운 도구를 준비하고 있습니다.', items: ['캐릭터 비교', '장비 비교', '성장 현황 한눈에 보기'] },
] as const;

export const MEMBERSHIP_COMPARISON = [
  { feature: '기본 RPG 대시보드', free: '이용 가능', membership: '이용 가능' },
  { feature: '캐릭터 정보', free: '이용 가능', membership: '이용 가능' },
  { feature: '기본 랭킹', free: '이용 가능', membership: '이용 가능' },
  { feature: '상세 랭킹 비교', free: '제한', membership: '이용 가능' },
  { feature: '전용 프로필 프레임', free: '기본', membership: '멤버십 전용' },
  { feature: '상세 전투 기록', free: '기본 정보', membership: '순차 제공 예정' },
  { feature: '월간 성장 리포트', free: '미제공', membership: '준비 중' },
  { feature: '장기 기록 보관', free: '기본 기간', membership: '준비 중' },
  { feature: '캐릭터·장비 비교', free: '미제공', membership: '준비 중' },
] as const;
