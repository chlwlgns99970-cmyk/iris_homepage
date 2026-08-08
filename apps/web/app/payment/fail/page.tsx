import Link from 'next/link';

export default function PaymentFailPage() {
  return <>
    <header className="topbar shop-topbar"><Link className="brand" href="/"><span className="brand-logo">N</span><span><b>나테베 RPG</b><small>PAYMENT</small></span></Link><Link className="account-button" href="/shop">상점으로</Link></header>
    <main className="payment-page">
      <section className="payment-page-card payment-result-card">
        <p className="eyebrow">PAYMENT NOT COMPLETED</p>
        <h1>결제가 완료되지 않았습니다.</h1>
        <div className="payment-state">결제 금액은 청구되지 않았거나 결제가 취소되었습니다.<br />필요하면 다시 시도해 주세요.</div>
        <div className="payment-page-actions"><Link className="button glass" href="/payment/history">결제 내역</Link><Link className="button primary" href="/shop">골드 상점으로 돌아가기</Link></div>
      </section>
    </main>
  </>;
}
