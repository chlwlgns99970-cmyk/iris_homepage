import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';

export default function PaymentFailPage() {
  return <PaymentFailContent />;
}

function PaymentFailContent() {
  return <>
    <header className="topbar shop-topbar"><Link className="brand" href="/"><span className="brand-logo">N</span><span><b>나테베 친목 RPG</b><small>PAYMENT</small></span></Link><Link className="account-button" href="/membership">멤버십으로</Link></header>
    <main className="payment-page">
      <section className="payment-page-card payment-result-card">
        <p className="eyebrow">PAYMENT NOT COMPLETED</p>
        <h1>멤버십 결제는 아직 시작되지 않았습니다.</h1>
        <div className="payment-state">현재 결제 시스템은 준비 중이며 실제 금액은 청구되지 않습니다.<br />정식 오픈 후 멤버십 페이지에서 안내하겠습니다.</div>
        <div className="payment-page-actions"><Link className="button glass" href="/payment/history">결제 내역</Link><Link className="button primary" href="/membership">멤버십으로 돌아가기</Link></div>
      </section>
    </main>
    <SiteFooter />
  </>;
}
