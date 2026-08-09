import type { PortalFortune } from './api';

export type FortuneView = {
  active: boolean;
  eyebrow: string;
  title: string;
  description: string;
  expiry?: string;
};

export function fortuneView(fortune?: PortalFortune): FortuneView {
  if (!fortune?.active) {
    return {
      active: false,
      eyebrow: '오늘의 운세',
      title: '오늘의 운세를 아직 확인하지 않았습니다.',
      description: '카카오톡에서 /오늘운세를 입력해 주세요.',
    };
  }
  return {
    active: true,
    eyebrow: '오늘의 운세',
    title: fortune.name,
    description: fortune.description,
    expiry: '오늘 23:59까지',
  };
}
