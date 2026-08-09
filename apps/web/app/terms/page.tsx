import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = {
  title: '이용약관 | 나테베 친목 RPG',
};

export default function TermsPage() {
  return <>
    <header className="topbar shop-topbar legal-topbar">
      <Link className="brand" href="/"><span className="brand-logo">N</span><span><b>나테베 RPG</b><small>TERMS OF USE</small></span></Link>
      <nav><Link href="/">홈</Link><Link href="/shop">골드 상점</Link></nav>
      <Link className="account-button" href="/">홈으로</Link>
    </header>
    <main className="legal-page legal-page--short">
      <article className="legal-document legal-document--short">
        <header className="legal-document-header">
          <p className="eyebrow">TERMS OF USE</p>
          <h1>이용약관</h1>
        </header>
        <p>오리진 스튜디오 이용약관은 현재 준비 중입니다.</p>
        <p>정식 서비스 및 결제 기능 오픈 전 본 페이지를 통해 안내할 예정입니다.</p>
        <section>
          <h2>문의</h2>
          <p><a className="legal-email" href="mailto:chlwlgns999@naver.com">chlwlgns999@naver.com</a></p>
        </section>
      </article>
    </main>
    <SiteFooter />
  </>;
}
