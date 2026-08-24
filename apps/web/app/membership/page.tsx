import type { Metadata } from 'next';
import { OriginMembershipClient } from './membership-client';

export const metadata: Metadata = {
  title: '오리진 멤버십 | 오리진 스튜디오',
  description: '오리진 RPG 포털의 프리미엄 기능을 이용할 수 있는 월 정액 멤버십 서비스입니다.',
  openGraph: {
    title: '오리진 멤버십 | 오리진 스튜디오',
    description: '오리진 RPG 포털의 프리미엄 기능을 이용할 수 있는 월 정액 멤버십 서비스입니다.',
    type: 'website',
  },
};

export default function OriginMembershipPage() {
  return <OriginMembershipClient />;
}
