'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getCurrentAuth, getPaymentHistory, type PaymentOrder } from '@/lib/api';

const statusLabels: Record<PaymentOrder['status'], string> = {
  pending: '결제 대기',
  paid: '결제 승인',
  fulfilling: '지급 처리 중',
  completed: '지급 완료',
  failed: '실패',
  cancelled: '결제 취소',
  refunded: '환불',
};

export default function PaymentHistoryPage() {
  const [state, setState] = useState<'loading' | 'guest' | 'ready' | 'error'>('loading');
  const [orders, setOrders] = useState<PaymentOrder[]>([]);

  useEffect(() => {
    let active = true;
    getCurrentAuth().then(async (auth) => {
      if (!active) return;
      if (!auth.authenticated) return setState('guest');
      try {
        const history = await getPaymentHistory();
        if (active) { setOrders(history.items); setState('ready'); }
      } catch {
        if (active) setState('error');
      }
    }).catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, []);

  return <>
    <PaymentHeader />
    <main className="payment-page">
      <section className="payment-page-card payment-history-card">
        <p className="eyebrow">MY ORDERS</p>
        <h1>결제 내역</h1>
        <p>로그인한 계정의 주문만 표시됩니다.</p>
        {state === 'loading' && <div className="payment-state">결제 내역을 불러오는 중입니다.</div>}
        {state === 'guest' && <div className="payment-state"><b>웹 인증이 필요합니다.</b><Link className="button primary" href="/connect">웹 인증하기</Link></div>}
        {state === 'error' && <div className="payment-state">결제 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>}
        {state === 'ready' && orders.length === 0 && <div className="payment-state">아직 결제 내역이 없습니다.</div>}
        {state === 'ready' && orders.length > 0 && <div className="payment-history-list">
          {orders.map((order) => <article key={order.orderId}>
            <div><time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time><h2>{formatNumber(order.goldAmount)} GOLD</h2><p>{formatNumber(order.priceKrw)}원</p></div>
            <span className={`payment-status ${order.status}`}>{statusLabels[order.status]}</span>
          </article>)}
        </div>}
        <div className="payment-page-actions"><Link className="button glass" href="/">게임 대시보드</Link><Link className="button primary" href="/shop">골드 상점</Link></div>
      </section>
    </main>
  </>;
}

function PaymentHeader() {
  return <header className="topbar shop-topbar"><Link className="brand" href="/"><span className="brand-logo">N</span><span><b>나테베 RPG</b><small>PAYMENT HISTORY</small></span></Link><nav><Link href="/">홈</Link><Link href="/shop">골드 상점</Link></nav><Link className="account-button" href="/shop">상점으로</Link></header>;
}

function formatNumber(value: number) { return new Intl.NumberFormat('ko-KR').format(value); }
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '날짜 정보 없음' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
