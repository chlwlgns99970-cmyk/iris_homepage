import assert from 'node:assert/strict';
import test from 'node:test';
import type { PortalSystem } from './api.ts';
import {
  EQUIPMENT_MOBILE_SYSTEMS,
  GROWTH_MOBILE_SYSTEMS,
  stableMobileSystems,
} from './mobile-system-menu.ts';

function system(id: string, title: string): PortalSystem {
  return {
    id,
    icon: '◆',
    title,
    command: `/${id}`,
    description: 'fixture',
    metrics: [],
    content: { type: 'items', title, rows: [] },
  };
}

test('equipment buttons keep bag, equipment, and titles in a fixed order', () => {
  const source = [system('titles', '실제 칭호'), system('bag', '실제 가방'), system('equipment', '실제 장비창')];
  const before = structuredClone(source);
  const result = stableMobileSystems(source, EQUIPMENT_MOBILE_SYSTEMS);
  assert.deepEqual(result.map(({ id }) => id), ['bag', 'equipment', 'titles']);
  assert.deepEqual(source, before);
  for (let index = 0; index < 10; index += 1) {
    assert.equal(stableMobileSystems(source, EQUIPMENT_MOBILE_SYSTEMS).length, 3);
  }
});

test('missing data keeps the menu button and shows an empty read-only panel', () => {
  const result = stableMobileSystems([system('equipment', '실제 장비창')], EQUIPMENT_MOBILE_SYSTEMS);
  assert.equal(result.length, 3);
  assert.equal(result[2].id, 'titles');
  assert.equal(result[2].title, '칭호');
  assert.deepEqual(result[2].metrics, []);
  assert.deepEqual(result[2].content, {
    type: 'items',
    title: '칭호 현황',
    rows: [],
  });
});

test('growth menu count and source remain stable across repeated selections', () => {
  const source = GROWTH_MOBILE_SYSTEMS.map(({ id, title }) => system(id, title));
  const before = structuredClone(source);
  for (const selected of GROWTH_MOBILE_SYSTEMS) {
    const result = stableMobileSystems(source, GROWTH_MOBILE_SYSTEMS);
    assert.equal(result.length, GROWTH_MOBILE_SYSTEMS.length);
    assert.ok(result.some(({ id }) => id === selected.id));
  }
  assert.deepEqual(source, before);
});
