import type { PortalSystem } from './api';

export type MobileSystemDefinition = Readonly<{
  id: string;
  icon: string;
  title: string;
  command: string;
}>;

export const EQUIPMENT_MOBILE_SYSTEMS: readonly MobileSystemDefinition[] = Object.freeze([
  { id: 'bag', icon: '🎒', title: '가방', command: '/가방' },
  { id: 'equipment', icon: '🗡️', title: '장비창', command: '/장비창' },
  { id: 'titles', icon: '🏷️', title: '칭호', command: '/보유칭호' },
]);

export const GROWTH_MOBILE_SYSTEMS: readonly MobileSystemDefinition[] = Object.freeze([
  { id: 'profile', icon: '👤', title: '내정보', command: '/내정보' },
  { id: 'attendance', icon: '📅', title: '출석', command: '/출석' },
  { id: 'boss', icon: '🐲', title: '일일 보스', command: '/보스' },
  { id: 'weekly-boss', icon: '🐉', title: '주간 보스', command: '/주간보스' },
  { id: 'raid', icon: '🔥', title: '100단계 레이드', command: '/레이드' },
  { id: 'tower', icon: '🗼', title: '시련의 탑', command: '/탑' },
  { id: 'palace', icon: '🏛️', title: '왕궁', command: '/왕궁' },
]);

function emptySystem(definition: MobileSystemDefinition): PortalSystem {
  return {
    ...definition,
    description: '아직 표시할 게임 데이터가 없습니다.',
    metrics: [],
    content: {
      type: 'items',
      title: `${definition.title} 현황`,
      rows: [],
    },
  };
}

export function stableMobileSystems(
  systems: readonly PortalSystem[] | undefined,
  definitions: readonly MobileSystemDefinition[],
): PortalSystem[] {
  const byId = new Map((systems ?? []).map((system) => [system.id, system]));
  return definitions.map((definition) => byId.get(definition.id) ?? emptySystem(definition));
}
