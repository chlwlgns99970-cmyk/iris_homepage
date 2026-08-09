import assert from 'node:assert/strict';
import test from 'node:test';
import { equipmentRenameView } from './equipment-rename-display.ts';

test('equipment rename view is read-only and uses the server-provided ticket quantity', () => {
  assert.deepEqual(equipmentRenameView({
    id: 'equipment',
    metrics: [['이름 변경권', '3개', '카카오톡 전용']],
  }), {
    ticketQuantity: '3개',
    command: '/장비이름변경 번호 새이름 · /장비이름변경 장착 새이름',
  });
  assert.equal(equipmentRenameView({ id:'bag', metrics:[] }), null);
});
