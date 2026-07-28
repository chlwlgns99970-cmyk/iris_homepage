import assert from 'node:assert/strict';
import test from 'node:test';
import type { PortalDashboard } from './api.ts';
import {
  charactersWithDisplayFallback,
  isDisplayFallbackCharacter,
  resolveCharacterImage,
  resolvePortalNickname,
} from './character-image.ts';

const emptyCharacterDashboard: PortalDashboard = {
  meta: { version: 1, generatedAt: '2026-07-28T00:00:00.000Z' },
  summary: [],
  characters: [],
  artworks: [],
  systems: [{
    id: 'rankings',
    icon: '🏆',
    title: '랭킹',
    command: '/랭킹',
    description: '실제 랭킹',
    metrics: [],
    content: { type: 'items', title: '랭킹', rows: [] },
    rankings: {
      categories: [{
        id: 'power',
        label: '전투력',
        rows: [{ rank: 1, nickname: '단지얌', job: '전사', value: '100', current: true }],
      }],
    },
  }],
};

test('empty API characters create three display-only job fallbacks', () => {
  const nickname = resolvePortalNickname(emptyCharacterDashboard);
  const characters = charactersWithDisplayFallback(emptyCharacterDashboard.characters, nickname);

  assert.equal(nickname, '단지얌');
  assert.deepEqual(characters.map(({ job, name }) => ({ job, name })), [
    { job: 'warrior', name: '단지얌의 전사' },
    { job: 'archer', name: '단지얌의 궁수' },
    { job: 'mage', name: '단지얌의 마법사' },
  ]);
  assert.ok(characters.every((character) => isDisplayFallbackCharacter(character)));
  assert.deepEqual(characters.map((character) => resolveCharacterImage(character.job, character.gender)), [
    '/assets/basic-warrior.webp',
    '/assets/basic-archer.webp',
    '/assets/basic-mage.webp',
  ]);
});

test('stored character rows are returned unchanged', () => {
  const stored = [{
    id: 'warrior',
    job: 'warrior' as const,
    gender: 'male' as const,
    current: true,
    name: '토도리의 전사',
    level: 'LV.10',
  }];

  const result = charactersWithDisplayFallback(stored, '단지얌');

  assert.equal(result, stored);
  assert.equal(isDisplayFallbackCharacter(result[0]), false);
  assert.equal(resolveCharacterImage(result[0].job, result[0].gender), '/assets/characters/warrior-male.png');
});
