import type { PortalSystem } from './api';

export type EquipmentRenameView = {
  ticketQuantity: string;
  command: string;
};

export function equipmentRenameView(system: Pick<PortalSystem, 'id' | 'metrics'>): EquipmentRenameView | null {
  if (system.id !== 'equipment') return null;
  const ticket = system.metrics.find(([label]) => label === '이름 변경권');
  return {
    ticketQuantity: ticket?.[1] ?? '0개',
    command: '/장비이름변경 번호 새이름 · /장비이름변경 장착 새이름',
  };
}
