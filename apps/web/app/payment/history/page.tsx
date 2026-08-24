import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';

export default function PaymentHistoryPage() {
  return <>
    <PaymentHeader />
    <main className="payment-page">
      <section className="payment-page-card payment-history-card">
        <p className="eyebrow">MY ORDERS</p>
        <h1>멤버십 결제 내역</h1>
        <p>현재 멤버십 결제 서비스는 준비 중이며 실제 청구는 발생하지 않습니다.</p>
        <div className="payment-state">아직 멤버십 결제 내역이 없습니다.</div>
        <div className="payment-page-actions"><Link className="button glass" href="/">게임 대시보드</Link><Link className="button primary" href="/membership">오리진 멤버십</Link></div>
      </section>
    </main>
    <SiteFooter />
  </>;
}

function PaymentHeader() {
  return <header className="topbar shop-topbar"><Link className="brand" href="/"><span className="brand-logo">N</span><span><b>나테베 친목 RPG</b><small>PAYMENT HISTORY</small></span></Link><nav><Link href="/">홈</Link><Link href="/membership">멤버십</Link></nav><Link className="account-button" href="/membership">멤버십으로</Link></header>;
}
