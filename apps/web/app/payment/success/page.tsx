'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { confirmPaymentOrder, getCurrentAuth, type PaymentOrder } from '@/lib/api';

export default function PaymentSuccessPage() {
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [message, setMessage] = useState('Sandbox 결제 승인을 확인하는 중입니다.');

  useEffect(() => {
    let active = true;
    const search = new URL(window.location.href).searchParams;
    const orderId = search.get('orderId') ?? '';
    const paymentKey = search.get('paymentKey') ?? '';
    const amount = Number(search.get('amount'));
    getCurrentAuth().then(async (auth) => {
      if (!auth.authenticated) throw new Error('결제 결과를 확인하려면 웹 인증이 필요합니다.');
      if (!/^GOLD_[A-F0-9]{32}$/.test(orderId)) throw new Error('확인할 주문 정보가 없습니다.');
      if (paymentKey.length < 1 || paymentKey.length > 200) throw new Error('결제 승인 정보가 올바르지 않습니다.');
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('결제 금액 정보가 올바르지 않습니다.');
      const result = await confirmPaymentOrder(orderId, paymentKey, amount);
      if (active) { setOrder(result); setMessage(''); }
    }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : '결제 결과를 확인하지 못했습니다.'); });
    return () => { active = false; };
  }, []);

  return <PaymentResultShell eyebrow="PAYMENT RESULT" title={order?.status === 'completed' ? '결제가 완료되었습니다.' : order?.status === 'paid' ? '테스트 결제가 승인되었습니다.' : '결제 상태를 확인해 주세요.'}>
    {message && <div className="payment-state">{message}</div>}
    {order && <dl className="payment-result-list">
      <div><dt>구매 상품</dt><dd>{formatNumber(order.goldAmount)} 골드</dd></div>
      <div><dt>결제 금액</dt><dd>{formatNumber(order.priceKrw)}원</dd></div>
      <div><dt>지급 상태</dt><dd>{order.status === 'completed' ? '지급 완료' : order.status === 'paid' ? 'Sandbox 승인 완료 · 골드 지급 비활성' : '처리 상태 확인 필요'}</dd></div>
      <div><dt>현재 보유 골드</dt><dd>{order.currentGold ? formatGold(order.currentGold) : '지급 완료 후 표시'}</dd></div>
    </dl>}
  </PaymentResultShell>;
}

function PaymentResultShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <><header className="topbar shop-topbar"><Link className="brand" href="/"><span className="brand-logo">N</span><span><b>나테베 RPG</b><small>PAYMENT</small></span></Link><Link className="account-button" href="/shop">상점으로</Link></header><main className="payment-page"><section className="payment-page-card payment-result-card"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children}<div className="payment-page-actions"><Link className="button glass" href="/">게임 대시보드로 돌아가기</Link><Link className="button primary" href="/shop">골드 상점으로 돌아가기</Link></div></section></main></>;
}

function formatNumber(value: number) { return new Intl.NumberFormat('ko-KR').format(value); }
function formatGold(value: string) {
  try { return new Intl.NumberFormat('ko-KR').format(BigInt(value)); }
  catch { return '보유 골드 확인 필요'; }
}
