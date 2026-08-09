'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  createPaymentOrder,
  getCurrentAuth,
  getPaymentProducts,
  getPortalDashboard,
  logout,
  type GoldProduct,
  type PaymentStorefront,
  type PortalDashboard,
} from '@/lib/api';
import { resolvePortalCurrentJob, resolvePortalNickname } from '@/lib/character-image';
import { businessInformation, paymentLegalContent } from '@/lib/payment-content';
import { openTossPaymentWindow } from '@/lib/toss-payments';

const jobLabels = { warrior: '전사', archer: '궁수', mage: '마법사', unknown: '직업 정보 없음' } as const;

type AuthState = 'loading' | 'guest' | 'authenticated';

export default function GoldShopPage() {
  const [auth, setAuth] = useState<AuthState>('loading');
  const [storefront, setStorefront] = useState<PaymentStorefront | null>(null);
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null);
  const [selected, setSelected] = useState<GoldProduct | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let active = true;
    getPaymentProducts()
      .then((products) => {
        if (active) setStorefront(products);
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : '상점 정보를 불러오지 못했습니다.');
      });

    getCurrentAuth()
      .then(async (session) => {
        if (!active) return;
        setAuth(session.authenticated ? 'authenticated' : 'guest');
        if (!session.authenticated) return;
        try {
          const portal = await getPortalDashboard();
          if (active) setDashboard(portal);
        } catch {
          if (active) setDashboard(null);
        }
      })
      .catch(() => {
        if (active) setAuth('guest');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected(null);
        setAccepted(false);
        window.setTimeout(() => openerRef.current?.focus(), 0);
      }
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
      document.body.style.overflow = previousOverflow;
    };
  }, [selected]);

  const purchaseTarget = useMemo(() => {
    if (!dashboard) return '캐릭터 정보 확인 중';
    const nickname = resolvePortalNickname(dashboard) || '이름 없는 캐릭터';
    const job = resolvePortalCurrentJob(dashboard);
    return `${nickname} · ${jobLabels[job]}`;
  }, [dashboard]);

  function openModal(product: GoldProduct, button: HTMLButtonElement) {
    openerRef.current = button;
    setAccepted(false);
    setMessage('');
    setSelected(product);
  }

  function closeModal() {
    setSelected(null);
    setAccepted(false);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }

  async function purchase() {
    if (!selected || !storefront || busy) return;
    if (!storefront.enabled) {
      setMessage('현재 결제 시스템 준비 중입니다.');
      return;
    }
    if (!accepted) return;
    setBusy(true);
    setMessage('');
    try {
      const idempotencyKey = crypto.randomUUID().replaceAll('-', '_');
      const result = await createPaymentOrder(selected.id, idempotencyKey);
      if (
        result.order.productId !== selected.id
        || result.order.priceKrw !== selected.priceKrw
        || result.order.goldAmount !== selected.goldAmount
      ) {
        throw new Error('서버 주문 정보가 선택한 상품과 일치하지 않습니다.');
      }
      if (result.checkout?.kind === 'toss-widget') {
        const origin = window.location.origin;
        await openTossPaymentWindow({
          clientKey: result.checkout.clientKey,
          customerKey: result.checkout.customerKey,
          orderId: result.order.orderId,
          orderName: result.order.productName,
          amount: result.order.priceKrw,
          successUrl: `${origin}/payment/success`,
          failUrl: `${origin}/payment/fail`,
        });
        return;
      }
      if (!result.checkoutUrl) throw new Error('결제창 연결 정보가 없습니다.');
      const checkout = new URL(result.checkoutUrl);
      if (checkout.protocol !== 'https:') throw new Error('안전한 결제 주소를 확인할 수 없습니다.');
      window.location.assign(checkout.toString());
    } catch (error) {
      setMessage(error instanceof ApiError || error instanceof Error
        ? error.message
        : '주문을 생성하지 못했습니다.');
      setBusy(false);
    }
  }

  async function signOut() {
    await logout().catch(() => undefined);
    setAuth('guest');
    setDashboard(null);
  }

  return (
    <>
      <ShopHeader auth={auth} signOut={signOut} />
      <main className="shop-page">
        <section className="shop-hero">
          <p className="eyebrow">SAFE GOLD STORE</p>
          <h1>골드 상점</h1>
          <p>필요한 골드를 안전하게 충전하세요.</p>
          <div className="shop-rate"><b>100원</b><span>=</span><strong>200,000 GOLD</strong></div>
          {!storefront?.enabled && (
            <div className="shop-disabled-notice" role="status">
              실제 PG 연동 전 안전 점검 단계입니다. 현재 결제와 골드 지급은 활성화되지 않았습니다.
            </div>
          )}
          {storefront?.enabled && storefront.sandbox && (
            <div className="shop-disabled-notice" role="status">
              토스 Sandbox 테스트 결제입니다. 실제 청구는 발생하지 않으며
              {!storefront.fulfillmentEnabled && ' 골드 지급도 비활성화되어 있습니다.'}
            </div>
          )}
        </section>

        <section className="shop-section" aria-labelledby="products-title">
          <div className="shop-section-heading">
            <div><p className="eyebrow">GOLD PACKAGES</p><h2 id="products-title">판매 상품</h2></div>
            <Link className="shop-text-link" href="/payment/history">내 결제 내역</Link>
          </div>
          {auth === 'guest' && (
            <div className="shop-auth-notice">
              <div><b>골드 구매는 웹 인증 후 이용할 수 있습니다.</b><span>UID는 상점 화면에 표시하지 않습니다.</span></div>
              <Link className="button primary" href="/connect">웹 인증하기</Link>
            </div>
          )}
          {auth === 'authenticated' && (
            <div className="shop-target"><small>구매 대상</small><b>{purchaseTarget}</b></div>
          )}
          <div className="gold-product-grid">
            {(storefront?.products ?? []).map((product) => (
              <article className="gold-product-card" key={product.id}>
                <span className="gold-product-icon" aria-hidden="true">G</span>
                <small>{product.id}</small>
                <h3>{formatNumber(product.goldAmount)} GOLD</h3>
                <p>{formatNumber(product.priceKrw)}원</p>
                {storefront?.enabled && auth === 'guest' ? (
                  <Link className="gold-buy-button" href="/connect">웹 인증하기</Link>
                ) : (
                  <button
                    className="gold-buy-button"
                    type="button"
                    disabled={Boolean(storefront?.enabled && auth !== 'authenticated')}
                    onClick={(event) => openModal(product, event.currentTarget)}
                  >
                    {storefront?.sandbox ? '테스트 결제' : '구매하기'}
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>

        <LegalAndBusiness />
      </main>

      {selected && (
        <div className="payment-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeModal();
        }}>
          <section className="payment-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
            <button ref={closeRef} className="payment-modal-close" type="button" aria-label="닫기" onClick={closeModal}>×</button>
            <p className="eyebrow">PURCHASE CONFIRMATION</p>
            <h2 id="payment-modal-title">구매 내용을 확인해 주세요</h2>
            <dl>
              <div><dt>구매 상품</dt><dd>{formatNumber(selected.goldAmount)} 골드</dd></div>
              <div><dt>결제 금액</dt><dd>{formatNumber(selected.priceKrw)}원</dd></div>
              <div><dt>지급 대상</dt><dd>{purchaseTarget}</dd></div>
            </dl>
            <p className="payment-modal-guide">결제 승인과 서버 검증이 완료된 뒤 해당 캐릭터에 골드가 지급됩니다.</p>
            <label className="payment-agreement">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>상품·공급 시기·청약철회 및 환불 안내를 확인했습니다.</span>
            </label>
            {message && <p className="payment-error" role="alert">{message}</p>}
            <div className="payment-modal-actions">
              <button type="button" onClick={closeModal}>취소</button>
              <button
                className="primary"
                type="button"
                disabled={busy || Boolean(storefront?.enabled && !accepted)}
                onClick={purchase}
              >
                {storefront?.sandbox
                  ? `${formatNumber(selected.priceKrw)}원 테스트 결제`
                  : `${formatNumber(selected.priceKrw)}원 결제하기`}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function ShopHeader({ auth, signOut }: { auth: AuthState; signOut: () => void }) {
  return <header className="topbar shop-topbar">
    <Link className="brand" href="/"><span className="brand-logo">N</span><span><b>나테베 RPG</b><small>GOLD STORE</small></span></Link>
    <nav><Link href="/">홈</Link><Link href="/shop">골드 상점</Link><Link href="/payment/history">결제 내역</Link></nav>
    {auth === 'authenticated'
      ? <button className="account-button" type="button" onClick={signOut}>로그아웃</button>
      : <Link className="account-button" href="/connect">웹 인증</Link>}
  </header>;
}

function LegalAndBusiness() {
  return <section className="shop-section legal-section" aria-labelledby="legal-title">
    <div className="shop-section-heading"><div><p className="eyebrow">PURCHASE INFORMATION</p><h2 id="legal-title">거래 및 환불 안내</h2></div></div>
    <div className="legal-grid">
      <article><h3>상품 공급</h3><p>상품명·가격·지급 골드는 각 상품 카드와 구매 확인창에 표시됩니다.</p><p>{paymentLegalContent.supply}</p></article>
      <article><h3>청약철회 및 환불</h3><p>{paymentLegalContent.withdrawal}</p><p>{paymentLegalContent.refund}</p></article>
      <article><h3>미성년자 안내</h3><p>{paymentLegalContent.minor}</p></article>
      <article><h3>약관과 개인정보</h3><p>실제 결제 오픈 전 사업자가 검토한 이용약관과 개인정보처리방침의 최종본을 게시합니다.</p></article>
    </div>
    <div className="business-card">
      <h3>사업자 정보</h3>
      <dl>{businessInformation.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value?.trim() || '정보 입력 전'}</dd></div>)}</dl>
      <p>실제 값은 공개 환경변수로만 표시하며, 비밀번호·PG secret·관리자 키는 브라우저에 전달하지 않습니다.</p>
    </div>
  </section>;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value);
}
