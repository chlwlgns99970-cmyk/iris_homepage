'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MembershipProfileFrame } from '@/components/membership-profile-frame';
import { SiteFooter } from '@/components/site-footer';
import { getCurrentAuth, getPortalDashboard, logout, type PortalDashboard } from '@/lib/api';
import { resolveCharacterImage, resolvePortalCurrentJob, resolvePortalNickname } from '@/lib/character-image';
import { resolveMembershipEntitlement } from '@/lib/membership-features';
import { MEMBERSHIP_BENEFITS, MEMBERSHIP_COMPARISON, MEMBERSHIP_PRICE_KRW } from '@/lib/membership';
import { businessInformation } from '@/lib/payment-content';
import styles from '../shop/membership.module.css';

const jobLabels = { warrior: '전사', archer: '궁수', mage: '마법사', unknown: '직업 정보 없음' } as const;
type AuthState = 'loading' | 'guest' | 'authenticated';

export function OriginMembershipClient() {
  const [auth, setAuth] = useState<AuthState>('loading');
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    getCurrentAuth().then(async (session) => {
      if (!active) return;
      setAuth(session.authenticated ? 'authenticated' : 'guest');
      if (!session.authenticated) return;
      try {
        const portal = await getPortalDashboard();
        if (active) setDashboard(portal);
      } catch {
        if (active) setDashboard(null);
      }
    }).catch(() => { if (active) setAuth('guest'); });
    return () => { active = false; };
  }, []);

  const membership = resolveMembershipEntitlement(dashboard);
  const accountLabel = useMemo(() => {
    if (auth === 'loading') return '계정 정보를 확인하는 중입니다.';
    if (auth === 'guest') return '멤버십 가입은 웹 인증 후 이용할 수 있습니다.';
    if (!dashboard) return '로그인 계정 · 캐릭터 정보 확인 중';
    const nickname = resolvePortalNickname(dashboard) || '이름 없는 캐릭터';
    return `${nickname} · ${jobLabels[resolvePortalCurrentJob(dashboard)]}`;
  }, [auth, dashboard]);

  async function signOut() {
    await logout().catch(() => undefined);
    setAuth('guest');
    setDashboard(null);
    setNotice('');
  }

  return <>
    <MembershipHeader auth={auth} signOut={signOut} />
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="membership-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>NATEBE FRIENDSHIP RPG</p>
          <h1 id="membership-title">오리진 멤버십</h1>
          <strong className={styles.productType}>프리미엄 RPG 포털 월 이용권</strong>
          <p className={styles.heroLead}>웹 RPG 포털의 추가 기록·분석·프로필 기능을 이용할 수 있는 월 정액 멤버십입니다.</p>
          <div className={styles.heroTags} aria-label="멤버십 특징"><span>상세 랭킹 비교</span><span>전용 프로필 프레임</span><span>월 정액 서비스</span></div>
        </div>

        <article className={styles.membershipCard} aria-label="오리진 멤버십 상품">
          <div className={styles.cardGlow} aria-hidden="true" />
          <div className={styles.cardHeader}>
            <div className={styles.membershipMark} aria-hidden="true">O</div>
            <div><p>ORIGIN MEMBERSHIP</p><h2>오리진 멤버십</h2></div>
            <span className={styles.preparingBadge}>결제 준비 중</span>
          </div>
          <p className={styles.price}><span>월</span><strong>{formatNumber(MEMBERSHIP_PRICE_KRW)}원</strong></p>
          <strong className={styles.recurringLabel}>정식 오픈 시 매월 정기결제</strong>
          <p className={styles.cardDescription}>최초 결제일을 기준으로 매월 같은 날짜에 결제되는 방식으로 운영할 예정입니다. 해당 날짜가 없는 달의 처리 방식은 실제 PG 정책에 맞춰 추후 확정합니다.</p>
          <ul className={styles.cardBenefits}>
            {MEMBERSHIP_BENEFITS.map((benefit) => <li key={benefit.id}><span aria-hidden="true">✓</span><span>{benefit.title}</span><small>{benefit.availability}</small></li>)}
          </ul>
          <div className={styles.accountBox}>
            <small>{auth === 'authenticated' ? '현재 계정' : '가입 안내'}</small>
            <strong>{accountLabel}</strong>
            {auth === 'authenticated' && <span>{membership.active ? '멤버십 이용 중' : '현재 무료 회원'}</span>}
            {auth === 'guest' && <Link href="/connect">웹 인증하기</Link>}
          </div>
          <button className={styles.primaryCta} type="button" onClick={() => setNotice('오리진 멤버십 결제 시스템을 준비 중입니다. 정식 오픈 후 이용할 수 있습니다.')}>
            멤버십 시작하기
          </button>
          <p className={styles.paymentStatus}>현재 멤버십 결제 서비스는 준비 중이며 실제 청구는 발생하지 않습니다.</p>
          {notice && <p className={styles.notice} role="status">{notice}</p>}
        </article>
      </section>

      <section className={styles.section} id="membership-guide" aria-labelledby="guide-title">
        <SectionHeader eyebrow="SUBSCRIPTION GUIDE" title="멤버십 이용 안내" id="guide-title">정식 결제 오픈 전에 적용될 이용 조건을 투명하게 안내합니다.</SectionHeader>
        <div className={styles.guideGrid}>
          <GuideItem label="이용요금" value={`월 ${formatNumber(MEMBERSHIP_PRICE_KRW)}원`} />
          <GuideItem label="결제방식" value="정식 오픈 시 매월 정기결제" />
          <GuideItem label="결제일" value="최초 결제일 기준 매월 같은 날짜에 결제 예정" />
          <GuideItem label="결제일 예외" value="해당 날짜가 없는 달은 실제 PG 정책에 맞춰 추후 확정" />
          <GuideItem label="해지" value="멤버십 관리 화면에서 제공 예정" />
          <GuideItem label="해지 후" value="다음 결제일부터 추가 청구가 없도록 처리 예정" />
        </div>
        <p className={styles.disabledBillingNotice}>현재 정식 결제 기능은 준비 중이며 실제 청구는 발생하지 않습니다.</p>
      </section>

      <section className={styles.section} aria-labelledby="service-timing-title">
        <SectionHeader eyebrow="SERVICE START" title="서비스 제공 시점" id="service-timing-title">결제 승인과 프리미엄 기능 제공 시점을 구분해 안내합니다.</SectionHeader>
        <div className={styles.serviceTimingCard}>
          <strong>결제 승인 후 멤버십 권한 활성화</strong>
          <p>정식 결제 오픈 후 결제가 정상 승인되면 멤버십 권한이 활성화되며, 현재 이용 가능으로 표시된 프리미엄 기능을 사용할 수 있습니다.</p>
          <small>준비 중 또는 순차 제공 예정 기능은 구현과 검증이 완료된 뒤 별도로 제공합니다.</small>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="ready-features-title">
        <SectionHeader eyebrow="AVAILABLE BENEFITS" title="이용 가능" id="ready-features-title">실제 구현과 검증이 완료된 멤버십 전용 기능입니다.</SectionHeader>
        <div className={styles.readyFeatureGrid}>
          <article className={styles.readyFeatureCard}>
            <span className={styles.availableBadge}>이용 가능</span><h3>상세 랭킹 비교</h3>
            <p>실제 포털 랭킹에서 본인의 전체·직업별 순위와 바로 위·아래 사용자의 전투력·레벨 차이를 읽기 전용으로 계산합니다.</p>
            <div className={styles.rankingPreview} aria-label="상세 랭킹 비교 구성 미리보기"><span>전체 순위</span><span>직업별 순위</span><span>위·아래 차이</span></div>
          </article>
          <article className={styles.readyFeatureCard}>
            <span className={styles.availableBadge}>이용 가능</span><h3>멤버십 전용 프로필 프레임</h3>
            <p>보라·금색 프레임과 멤버십 배지를 제공하며 캐릭터 능력치, 전투력과 RPG 데이터에는 영향을 주지 않습니다.</p>
            <div className={styles.framePreview}><MembershipProfileFrame src={resolveCharacterImage('warrior', 'unknown', 'profile')} alt="멤버십 프로필 프레임 미리보기" active /><small>UI 미리보기 · 실제 권한 부여 아님</small></div>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="benefits-title">
        <SectionHeader eyebrow="UPCOMING BENEFITS" title="준비 중 및 순차 제공 예정" id="benefits-title">아직 이용할 수 없는 기능은 현재 제공 기능과 분리해 표시합니다.</SectionHeader>
        <div className={styles.benefitGrid}>
          {MEMBERSHIP_BENEFITS.filter((benefit) => benefit.availability !== '이용 가능').map((benefit) => <article className={styles.benefitCard} key={benefit.id}>
            <div className={styles.benefitTop}>
              <span className={styles.benefitIcon} aria-hidden="true">{benefit.icon}</span>
              <span className={`${styles.status} ${availabilityClass(benefit.availability)}`}>{benefit.availability}</span>
            </div>
            <h3>{benefit.title}</h3><p>{benefit.description}</p>
            <ul>{benefit.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>)}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="comparison-title">
        <SectionHeader eyebrow="PLAN COMPARISON" title="무료 회원과 멤버십 비교" id="comparison-title">현재 이용 범위와 준비 중·순차 제공 예정 범위를 명확하게 구분했습니다.</SectionHeader>
        <div className={styles.comparison} role="table" aria-label="무료 회원과 멤버십 비교">
          <div className={`${styles.comparisonRow} ${styles.comparisonHead}`} role="row"><span role="columnheader">기능</span><span role="columnheader">무료 회원</span><span role="columnheader">오리진 멤버십</span></div>
          {MEMBERSHIP_COMPARISON.map((row) => <div className={styles.comparisonRow} role="row" key={row.feature}>
            <strong role="cell">{row.feature}</strong><span role="cell" data-label="무료 회원">{row.free}</span><span role="cell" data-label="멤버십">{row.membership}</span>
          </div>)}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="cancellation-title">
        <SectionHeader eyebrow="CANCELLATION" title="멤버십 해지 안내" id="cancellation-title">아직 구현되지 않은 해지 기능을 현재 이용 가능한 것으로 안내하지 않습니다.</SectionHeader>
        <div className={styles.refundCard}><ul>
          <li>정식 오픈 후 멤버십 관리 화면에서 해지 기능을 제공할 예정입니다.</li>
          <li>해지를 완료하면 다음 정기결제일부터 추가 결제가 발생하지 않도록 처리할 예정입니다.</li>
          <li>이미 결제된 이용기간의 서비스는 정책에 따라 이용 가능 여부가 결정됩니다.</li>
          <li>구체적인 해지 정책은 정식 결제 오픈 전 이용약관에 고지합니다.</li>
        </ul></div>
      </section>

      <section className={styles.section} aria-labelledby="refund-title">
        <SectionHeader eyebrow="REFUND POLICY" title="환불 및 결제 취소 안내" id="refund-title">정식 결제 오픈 전에 확정될 환불 정책의 현재 안내입니다.</SectionHeader>
        <div className={styles.refundCard}><ul>
          <li>결제 취소 및 환불은 관련 법령, 실제 서비스 이용 여부, 결제수단 및 PG 정책에 따라 처리됩니다.</li>
          <li>실제 멤버십 이용이 시작된 이후에는 이용 내역에 따라 환불 가능 범위가 달라질 수 있습니다.</li>
          <li>중복 결제 또는 결제 오류 발생 시 고객센터로 문의할 수 있습니다.</li>
          <li>구체적인 환불 기준은 정식 결제 오픈 전 이용약관 및 멤버십 정책에 고지합니다.</li>
          <li>문의: 010-8339-3380 · <a href="mailto:chlwlgns999@naver.com">chlwlgns999@naver.com</a></li>
        </ul></div>
      </section>

      <section className={styles.section} aria-labelledby="customer-service-title">
        <SectionHeader eyebrow="CUSTOMER SERVICE" title="고객센터" id="customer-service-title">결제 오류, 중복 결제와 멤버십 이용 문의를 접수합니다.</SectionHeader>
        <article className={styles.customerServiceCard}>
          <div><small>운영</small><strong>오리진 스튜디오</strong></div>
          <div><small>고객센터</small><a href="tel:01083393380">010-8339-3380</a></div>
          <div><small>이메일</small><a href="mailto:chlwlgns999@naver.com">chlwlgns999@naver.com</a></div>
        </article>
      </section>

      <section className={styles.policySection} aria-labelledby="policy-title">
        <div>
          <p className={styles.eyebrow}>MEMBERSHIP POLICY</p><h2 id="policy-title">정책 문서와 고객 문의</h2>
          <p>나테베 친목 RPG 운영: 오리진 스튜디오<br />현재 정기결제는 비활성화되어 있습니다. 정식 오픈 전에 정기결제 주기, 해지 방법과 환불 기준을 이용약관과 멤버십 정책에 명확히 고지합니다.</p>
          <nav className={styles.policyLinks} aria-label="정책 문서"><Link href="/privacy">개인정보처리방침</Link><Link href="/terms">이용약관</Link><Link href="#membership-guide">멤버십 이용 안내</Link><Link href="/payment/history">멤버십 결제 내역</Link></nav>
        </div>
        <BusinessInformation />
      </section>
    </main>
    <SiteFooter />
  </>;
}

function availabilityClass(availability: string) {
  if (availability === '이용 가능') return styles.statusAvailable;
  if (availability === '준비 중') return styles.statusPreparing;
  return styles.statusPlanned;
}

function GuideItem({ label, value }: { label: string; value: string }) {
  return <article><small>{label}</small><strong>{value}</strong></article>;
}

function SectionHeader({ eyebrow, title, id, children }: { eyebrow: string; title: string; id: string; children: React.ReactNode }) {
  return <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>{eyebrow}</p><h2 id={id}>{title}</h2></div><p>{children}</p></header>;
}

function MembershipHeader({ auth, signOut }: { auth: AuthState; signOut: () => void }) {
  return <header className="topbar shop-topbar">
    <Link className="brand" href="/"><span className="brand-logo">N</span><span><b>나테베 친목 RPG</b><small>ORIGIN MEMBERSHIP</small></span></Link>
    <nav><Link href="/">홈</Link><Link href="/membership">멤버십</Link></nav>
    {auth === 'authenticated' ? <button className="account-button" type="button" onClick={signOut}>로그아웃</button> : <Link className="account-button" href="/connect">웹 인증</Link>}
  </header>;
}

function BusinessInformation() {
  return <article className={styles.businessCard}><h3>사업자 정보</h3><dl>
    {businessInformation.map(([label, value]) => <div key={label}><dt>{label === '고객문의 연락처' ? '고객센터' : label}</dt><dd>{label === '이메일' ? <a href={`mailto:${value}`}>{value}</a> : label === '고객문의 연락처' ? <a href={`tel:${value.replaceAll('-', '')}`}>{value}</a> : value}</dd></div>)}
  </dl></article>;
}

function formatNumber(value: number) { return new Intl.NumberFormat('ko-KR').format(value); }
