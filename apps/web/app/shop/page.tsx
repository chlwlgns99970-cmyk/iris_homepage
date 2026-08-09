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
  type PaymentStorefront,
  type PortalDashboard,
} from '@/lib/api';
import { resolvePortalCurrentJob, resolvePortalNickname } from '@/lib/character-image';
import { businessInformation, paymentLegalContent } from '@/lib/payment-content';
import { openTossPaymentWindow } from '@/lib/toss-payments';

const jobLabels = { warrior: '전사', archer: '궁수', mage: '마법사', unknown: '직업 정보 없음' } as const;
const quickAmountsKrw = [1_000, 5_000, 10_000, 30_000, 50_000] as const;

type AuthState = 'loading' | 'guest' | 'authenticated';
type PurchaseQuote = { priceKrw: number; goldAmount: number };
type AmountValidation = { valid: true; priceKrw: number } | { valid: false; message: string };

export default function GoldShopPage() {
  const [auth, setAuth] = useState<AuthState>('loading');
  const [storefront, setStorefront] = useState<PaymentStorefront | null>(null);
  const [storefrontError, setStorefrontError] = useState('');
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [inputFormatMessage, setInputFormatMessage] = useState('');
  const [selected, setSelected] = useState<PurchaseQuote | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let active = true;
    getPaymentProducts()
      .then((response) => {
        if (!active) return;
        setStorefront(response);
        setStorefrontError('');
      })
      .catch((error) => {
        if (!active) return;
        setStorefrontError(error instanceof Error ? error.message : '상점 정보를 불러오지 못했습니다.');
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

  const currentGold = useMemo(() => resolveCurrentGold(dashboard), [dashboard]);
  const amountValidation = useMemo(
    () => validatePaymentAmount(amountInput, storefront?.policy ?? null),
    [amountInput, storefront],
  );
  const validationMessage = inputFormatMessage || (amountValidation.valid ? '' : amountValidation.message);
  const estimatedGold = amountValidation.valid && !inputFormatMessage && storefront
    ? amountValidation.priceKrw * storefront.policy.goldPerKrw
    : 0;

  function updateAmount(rawValue: string) {
    const withoutGrouping = rawValue.replaceAll(',', '');
    const digitsOnly = withoutGrouping.replace(/\D/g, '');
    const normalized = digitsOnly.replace(/^0+(?=\d)/, '');
    setAmountInput(normalized);
    setInputFormatMessage(withoutGrouping === digitsOnly
      ? ''
      : '숫자만 입력해 주세요. 음수와 소수점은 사용할 수 없습니다.');
    setMessage('');
  }

  function chooseQuickAmount(priceKrw: number) {
    setAmountInput(String(priceKrw));
    setInputFormatMessage('');
    setMessage('');
  }

  function openModal(button: HTMLButtonElement) {
    if (!amountValidation.valid || inputFormatMessage || !storefront) return;
    openerRef.current = button;
    setAccepted(false);
    setMessage('');
    setSelected({
      priceKrw: amountValidation.priceKrw,
      goldAmount: amountValidation.priceKrw * storefront.policy.goldPerKrw,
    });
  }

  function closeModal() {
    setSelected(null);
    setAccepted(false);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }

  async function purchase() {
    if (!selected || !storefront || busy) return;
    if (!storefront.enabled) {
      setMessage('현재 결제 시스템 준비 중입니다. 정식 결제 오픈 후 이용할 수 있습니다.');
      return;
    }
    if (auth !== 'authenticated' || !accepted) return;
    setBusy(true);
    setMessage('');
    try {
      const idempotencyKey = crypto.randomUUID().replaceAll('-', '_');
      const result = await createPaymentOrder(selected.priceKrw, idempotencyKey);
      if (
        result.order.productId !== 'GOLD_CUSTOM'
        || result.order.priceKrw !== selected.priceKrw
        || result.order.goldAmount !== selected.goldAmount
      ) {
        throw new Error('서버 주문 정보가 입력한 금액과 일치하지 않습니다.');
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
          <p className="eyebrow">SAFE GOLD CHARGE</p>
          <h1>골드 충전</h1>
          <p>원하는 금액을 직접 입력하고 지급 예정 골드를 확인하세요.</p>
          <div className="shop-rate"><b>100원</b><span>=</span><strong>200,000 GOLD</strong></div>
          {storefront?.enabled === false && (
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

        <section className="shop-section" aria-labelledby="charge-title">
          <div className="shop-section-heading">
            <div><p className="eyebrow">CUSTOM AMOUNT</p><h2 id="charge-title">원하는 만큼 충전</h2></div>
            <Link className="shop-text-link" href="/payment/history">내 결제 내역</Link>
          </div>
          {auth === 'guest' && (
            <div className="shop-auth-notice">
              <div><b>골드 충전은 웹 인증 후 이용할 수 있습니다.</b><span>기존 홈페이지 로그인 세션을 그대로 사용합니다.</span></div>
              <Link className="button primary" href="/connect">웹 인증하기</Link>
            </div>
          )}

          <div className="gold-charge-layout">
            <article className="gold-charge-card">
              <span className="gold-charge-symbol" aria-hidden="true">G</span>
              <div>
                <p className="eyebrow">GOLD CHARGE</p>
                <h3>결제 금액을 입력하세요</h3>
                <p className="gold-charge-rate">100원당 <strong>200,000 골드</strong></p>
              </div>

              <label className="payment-input-label" htmlFor="payment-amount">
                <span>결제 금액</span>
                <div className="payment-amount-control">
                  <input
                    id="payment-amount"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9,]*"
                    autoComplete="off"
                    placeholder="결제할 금액을 입력하세요."
                    value={displayAmountInput(amountInput)}
                    disabled={!storefront}
                    aria-invalid={Boolean(validationMessage)}
                    aria-describedby="payment-amount-help"
                    onChange={(event) => updateAmount(event.target.value)}
                  />
                  <span>원</span>
                </div>
              </label>
              <p id="payment-amount-help" className={validationMessage ? 'payment-amount-error' : 'payment-amount-help'}>
                {validationMessage || (storefront
                  ? `${formatNumber(storefront.policy.minPaymentKrw)}원부터 ${formatNumber(storefront.policy.maxPaymentKrw)}원까지 ${formatNumber(storefront.policy.paymentStepKrw)}원 단위로 입력할 수 있습니다.`
                  : '결제 정책을 불러오는 중입니다.')}
              </p>
              {storefrontError && <p className="payment-amount-error" role="alert">{storefrontError}</p>}

              <div className="gold-estimate" aria-live="polite">
                <span>지급 예정 골드</span>
                <strong>{formatNumber(estimatedGold)} GOLD</strong>
              </div>

              <div className="quick-amounts" aria-label="빠른 금액 선택">
                {quickAmountsKrw.map((priceKrw) => (
                  <button
                    key={priceKrw}
                    type="button"
                    disabled={!storefront || priceKrw > storefront.policy.maxPaymentKrw}
                    onClick={() => chooseQuickAmount(priceKrw)}
                  >
                    {formatNumber(priceKrw)}원
                  </button>
                ))}
              </div>

              {auth === 'guest' ? (
                <Link className="gold-charge-submit" href="/connect">웹 인증 후 구매 확인</Link>
              ) : (
                <button
                  className="gold-charge-submit"
                  type="button"
                  disabled={auth !== 'authenticated' || !amountValidation.valid || Boolean(inputFormatMessage) || !storefront}
                  onClick={(event) => openModal(event.currentTarget)}
                >
                  구매 확인
                </button>
              )}
            </article>

            <aside className="shop-account-summary" aria-label="충전 대상 정보">
              <p className="eyebrow">CHARGE TARGET</p>
              <h3>충전 대상</h3>
              <dl>
                <div><dt>현재 캐릭터</dt><dd>{purchaseTarget}</dd></div>
                <div><dt>현재 보유 골드</dt><dd>{currentGold}</dd></div>
                <div><dt>결제 상태</dt><dd>{storefront?.enabled ? (storefront.sandbox ? 'Sandbox' : '사용 가능') : '준비 중'}</dd></div>
              </dl>
              <p>결제 금액과 골드는 서버에서 다시 검증하며, 결제가 비활성화된 동안 주문이나 지급은 생성되지 않습니다.</p>
            </aside>
          </div>
        </section>

        <LegalAndBusiness />
      </main>

      {selected && storefront && (
        <div className="payment-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeModal();
        }}>
          <section className="payment-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
            <button ref={closeRef} className="payment-modal-close" type="button" aria-label="닫기" onClick={closeModal}>×</button>
            <p className="eyebrow">PURCHASE CONFIRMATION</p>
            <h2 id="payment-modal-title">구매 확인</h2>
            <dl>
              <div><dt>결제 금액</dt><dd>{formatNumber(selected.priceKrw)}원</dd></div>
              <div><dt>지급 예정 골드</dt><dd>{formatNumber(selected.goldAmount)} GOLD</dd></div>
              <div><dt>지급 대상</dt><dd>{purchaseTarget}</dd></div>
              <div><dt>환율</dt><dd>{formatNumber(storefront.policy.paymentStepKrw)}원 = {formatNumber(storefront.policy.paymentStepKrw * storefront.policy.goldPerKrw)} GOLD</dd></div>
            </dl>
            <p className="payment-modal-guide">결제 승인 금액을 서버 주문 금액과 다시 대조한 뒤에만 골드 지급 절차를 시작합니다.</p>
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
                disabled={busy || Boolean(storefront.enabled && (!accepted || auth !== 'authenticated'))}
                onClick={purchase}
              >
                {storefront.sandbox
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

function validatePaymentAmount(
  value: string,
  policy: PaymentStorefront['policy'] | null,
): AmountValidation {
  if (!value || !policy) return { valid: false, message: '' };
  const priceKrw = Number(value);
  if (!Number.isSafeInteger(priceKrw)) return { valid: false, message: '결제 금액은 정수로 입력해 주세요.' };
  if (priceKrw < policy.minPaymentKrw) {
    return { valid: false, message: `최소 결제 금액은 ${formatNumber(policy.minPaymentKrw)}원입니다.` };
  }
  if (priceKrw > policy.maxPaymentKrw) {
    return { valid: false, message: `최대 결제 금액은 ${formatNumber(policy.maxPaymentKrw)}원입니다.` };
  }
  if (priceKrw % policy.paymentStepKrw !== 0) {
    return { valid: false, message: `결제 금액은 ${formatNumber(policy.paymentStepKrw)}원 단위로 입력해 주세요.` };
  }
  return { valid: true, priceKrw };
}

function displayAmountInput(value: string) {
  if (!value) return '';
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? formatNumber(amount) : value;
}

function resolveCurrentGold(dashboard: PortalDashboard | null) {
  if (!dashboard) return '정보 확인 중';
  const rows = [
    ...(dashboard.summary ?? []),
    ...dashboard.systems.flatMap((system) => system.metrics ?? []),
  ];
  const gold = rows.find(([label]) => {
    const normalized = label.toLocaleLowerCase('ko-KR');
    return normalized.includes('골드') || normalized.includes('gold');
  });
  return gold?.[1] ?? '정보 없음';
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
      <article><h3>상품 공급</h3><p>결제 금액과 지급 예정 골드는 입력 화면과 구매 확인창에 표시됩니다.</p><p>{paymentLegalContent.supply}</p></article>
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
