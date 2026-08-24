export const MEMBERSHIP_PRICE_KRW = 5_900;

export const MEMBERSHIP_BENEFITS = [
  { id: 'battle-history', icon: '⚔️', title: '상세 전투 기록', availability: '순차 제공 예정', description: '전투의 흐름과 성장 변화를 더 오래, 더 자세히 확인합니다.', items: ['최근 전투 기록', '보스·레이드 전투 결과', '전투력 변화 기록'] },
  { id: 'monthly-report', icon: '📈', title: '월간 성장 리포트', availability: '준비 중', description: '한 달 동안 쌓인 캐릭터 성장과 콘텐츠 진행을 한눈에 정리합니다.', items: ['레벨·전투력 변화', '주요 콘텐츠 진행 현황', '월간 플레이 요약'] },
  { id: 'ranking-detail', icon: '🏆', title: '랭킹 상세 정보', availability: '순차 제공 예정', description: '현재 제공 중인 기본 랭킹을 넘어 비교와 변화 기록을 확장할 예정입니다.', items: ['직업별 상세 비교', '본인 순위 변화', '세부 기록 비교'] },
  { id: 'profile-style', icon: '✨', title: '프로필 꾸미기', availability: '준비 중', description: '멤버십 이용자를 위한 전용 프로필 표현 기능을 준비하고 있습니다.', items: ['전용 프로필 프레임', '프로필 강조 스타일', '멤버십 배지'] },
  { id: 'history-retention', icon: '🗂️', title: '기록 보관 확장', availability: '준비 중', description: '일반 사용자보다 더 긴 기간의 전투 및 성장 기록을 확인합니다.', items: ['장기 성장 이력', '이전 전투 기록', '기간별 변화 비교'] },
  { id: 'character-tools', icon: '🛡️', title: '캐릭터 관리 편의 기능', availability: '준비 중', description: '여러 성장 정보를 비교하고 관리하기 쉬운 도구를 제공합니다.', items: ['캐릭터 비교', '장비 비교', '성장 현황 한눈에 보기'] },
] as const;

export const MEMBERSHIP_COMPARISON = [
  { feature: '기본 RPG 대시보드', free: '이용 가능', membership: '이용 가능' },
  { feature: '캐릭터 정보', free: '이용 가능', membership: '이용 가능' },
  { feature: '기본 랭킹', free: '이용 가능', membership: '이용 가능' },
  { feature: '상세 전투 기록', free: '기본 정보', membership: '확장 제공 예정' },
  { feature: '월간 성장 리포트', free: '미제공', membership: '제공 예정' },
  { feature: '랭킹 상세 비교', free: '기본 랭킹', membership: '확장 제공 예정' },
  { feature: '프로필 프레임', free: '기본 스타일', membership: '전용 스타일 예정' },
  { feature: '장기 기록 보관', free: '기본 기간', membership: '확장 제공 예정' },
] as const;
