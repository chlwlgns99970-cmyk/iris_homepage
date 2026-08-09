import assert from 'node:assert/strict';
import test from 'node:test';
import { fortuneView } from './fortune-display.ts';

test('missing fortune renders the KakaoTalk guidance without a draw action', () => {
  assert.deepEqual(fortuneView(), {
    active: false,
    eyebrow: '오늘의 운세',
    title: '오늘의 운세를 아직 확인하지 않았습니다.',
    description: '카카오톡에서 /오늘운세를 입력해 주세요.',
  });
});

test('active fortune uses only server-provided display fields', () => {
  assert.deepEqual(fortuneView({
    active: true,
    type: 'boss_damage',
    name: '보스타격가',
    description: '일반·미니·공유보스 피해 +5%',
    expiresAt: '2026-08-09T14:59:59.999Z',
  }), {
    active: true,
    eyebrow: '오늘의 운세',
    title: '보스타격가',
    description: '일반·미니·공유보스 피해 +5%',
    expiry: '오늘 23:59까지',
  });
});
