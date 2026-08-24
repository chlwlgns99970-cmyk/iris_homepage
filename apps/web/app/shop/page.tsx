'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { getCurrentAuth, getPortalDashboard, logout, type PortalDashboard } from '@/lib/api';
import { resolvePortalCurrentJob, resolvePortalNickname } from '@/lib/character-image';
import { MEMBERSHIP_BENEFITS, MEMBERSHIP_COMPARISON, MEMBERSHIP_PRICE_KRW } from '@/lib/membership';
import { businessInformation } from '@/lib/payment-content';
import styles from './membership.module.css';

const jobLabels = { warrior: '전사', archer: '궁수', mage: '마법사', unknown: '직업 정보 없음' } as const;
type AuthState = 'loading' | 'guest' | 'authenticated';

export default function OriginMembershipPage() {
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
          <p className={styles.eyebrow}>ORIGIN MEMBERSHIP</p>
          <h1 id="membership-title">오리진 멤버십</h1>
          <p className={styles.heroLead}>게임 플레이는 그대로, 더 깊은 기록과 편리한 웹 포털 기능을 멤버십으로 이용하세요.</p>
          <div className={styles.heroTags} aria-label="멤버십 특징"><span>프리미엄 기록</span><span>성장 분석</span><span>프로필 꾸미기</span></div>
        </div>

        <article className={styles.membershipCard} aria-label="오리진 멤버십 상품">
          <div className={styles.cardGlow} aria-hidden="true" />
          <div className={styles.cardHeader}>
            <div className={styles.membershipMark} aria-hidden="true">O</div>
            <div><p>ORIGIN MEMBERSHIP</p><h2>오리진 멤버십</h2></div>
            <span className={styles.preparingBadge}>오픈 준비 중</span>
          </div>
          <p className={styles.price}><strong>{formatNumber(MEMBERSHIP_PRICE_KRW)}원</strong><span>/ 월</span></p>
          <p className={styles.cardDescription}>프리미엄 RPG 포털 기능을 위한 월간 서비스 이용권입니다.</p>
          <ul className={styles.cardBenefits}>
            {MEMBERSHIP_BENEFITS.map((benefit) => <li key={benefit.id}><span aria-hidden="true">✓</span><span>{benefit.title}</span><small>{benefit.availability}</small></li>)}
          </ul>
          <div className={styles.accountBox}>
            <small>{auth === 'authenticated' ? '현재 계정' : '가입 안내'}</small>
            <strong>{accountLabel}</strong>
            {auth === 'guest' && <Link href="/connect">웹 인증하기</Link>}
          </div>
          <button className={styles.primaryCta} type="button" onClick={() => setNotice('오리진 멤버십 결제 시스템을 준비 중입니다. 정식 오픈 후 이용할 수 있습니다.')}>
            멤버십 시작하기
          </button>
          <p className={styles.paymentStatus}>현재 결제 시스템 준비 중 · 실제 결제는 진행되지 않습니다.</p>
          {notice && <p className={styles.notice} role="status">{notice}</p>}
        </article>
      </section>

      <section className={styles.section} aria-labelledby="benefits-title">
        <SectionHeader eyebrow="MEMBERSHIP BENEFITS" title="멤버십으로 확장되는 포털 경험" id="benefits-title">
          전용 기능은 실제 개발 일정에 맞춰 순차적으로 제공됩니다.
        </SectionHeader>
        <div className={styles.benefitGrid}>
          {MEMBERSHIP_BENEFITS.map((benefit) => <article className={styles.benefitCard} key={benefit.id}>
            <div className={styles.benefitTop}>
              <span className={styles.benefitIcon} aria-hidden="true">{benefit.icon}</span>
              <span className={`${styles.status} ${benefit.availability === '준비 중' ? styles.statusPreparing : styles.statusPlanned}`}>{benefit.availability}</span>
            </div>
            <h3>{benefit.title}</h3><p>{benefit.description}</p>
            <ul>{benefit.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>)}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="comparison-title">
        <SectionHeader eyebrow="PLAN COMPARISON" title="무료 회원과 멤버십 비교" id="comparison-title">
          현재 제공 범위와 향후 멤버십 제공 예정 범위를 구분했습니다.
        </SectionHeader>
        <div className={styles.comparison} role="table" aria-label="무료 회원과 멤버십 비교">
          <div className={`${styles.comparisonRow} ${styles.comparisonHead}`} role="row"><span role="columnheader">기능</span><span role="columnheader">무료 회원</span><span role="columnheader">오리진 멤버십</span></div>
          {MEMBERSHIP_COMPARISON.map((row) => <div className={styles.comparisonRow} role="row" key={row.feature}>
            <strong role="cell">{row.feature}</strong><span role="cell" data-label="무료 회원">{row.free}</span><span role="cell" data-label="멤버십">{row.membership}</span>
          </div>)}
        </div>
      </section>

      <section className={styles.policySection} aria-labelledby="policy-title">
        <div>
          <p className={styles.eyebrow}>MEMBERSHIP POLICY</p><h2 id="policy-title">이용조건과 결제 정책</h2>
          <p>현재 멤버십 가입과 정기결제는 비활성화되어 있습니다. 정식 오픈 전에 멤버십 이용조건, 정기결제 주기, 해지 방법과 환불 기준을 별도 정책으로 명확히 안내합니다.</p>
          <nav className={styles.policyLinks} aria-label="정책 문서"><Link href="/privacy">개인정보처리방침</Link><Link href="/terms">이용약관</Link><Link href="/payment/history">이전 결제 내역</Link></nav>
        </div>
        <BusinessInformation />
      </section>
    </main>
    <SiteFooter />
  </>;
}

function SectionHeader({ eyebrow, title, id, children }: { eyebrow: string; title: string; id: string; children: React.ReactNode }) {
  return <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>{eyebrow}</p><h2 id={id}>{title}</h2></div><p>{children}</p></header>;
}

function MembershipHeader({ auth, signOut }: { auth: AuthState; signOut: () => void }) {
  return <header className="topbar shop-topbar">
    <Link className="brand" href="/"><span className="brand-logo">N</span><span><b>나테베 RPG</b><small>ORIGIN MEMBERSHIP</small></span></Link>
    <nav><Link href="/">홈</Link><Link href="/shop">오리진 멤버십</Link></nav>
    {auth === 'authenticated' ? <button className="account-button" type="button" onClick={signOut}>로그아웃</button> : <Link className="account-button" href="/connect">웹 인증</Link>}
  </header>;
}

function BusinessInformation() {
  return <article className={styles.businessCard}><h3>사업자 정보</h3><dl>
    {businessInformation.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{label === '이메일' ? <a href={`mailto:${value}`}>{value}</a> : value}</dd></div>)}
  </dl></article>;
}

function formatNumber(value: number) { return new Intl.NumberFormat('ko-KR').format(value); }
