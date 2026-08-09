'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SiteFooter } from '@/components/site-footer';

export default function PaymentFailPage() {
  return <Suspense fallback={<PaymentFailContent message="결제 결과를 확인하는 중입니다." />}>
    <PaymentFailResult />
  </Suspense>;
}

function PaymentFailResult() {
  const code = useSearchParams().get('code');
  const message = code === 'PAY_PROCESS_CANCELED'
    ? '사용자가 테스트 결제를 취소했습니다.'
    : code === 'PAY_PROCESS_ABORTED'
      ? '테스트 결제 인증이 중단되었습니다. 다시 시도해 주세요.'
      : '결제가 완료되지 않았습니다. 다시 시도해 주세요.';
  return <PaymentFailContent message={message} />;
}

function PaymentFailContent({ message }: { message: string }) {
  return <>
    <header className="topbar shop-topbar"><Link className="brand" href="/"><span className="brand-logo">N</span><span><b>나테베 RPG</b><small>PAYMENT</small></span></Link><Link className="account-button" href="/shop">상점으로</Link></header>
    <main className="payment-page">
      <section className="payment-page-card payment-result-card">
        <p className="eyebrow">PAYMENT NOT COMPLETED</p>
        <h1>결제가 완료되지 않았습니다.</h1>
        <div className="payment-state">{message}<br />Sandbox 단계에서는 실제 금액이 청구되지 않습니다.</div>
        <div className="payment-page-actions"><Link className="button glass" href="/payment/history">결제 내역</Link><Link className="button primary" href="/shop">골드 상점으로 돌아가기</Link></div>
      </section>
    </main>
    <SiteFooter />
  </>;
}
