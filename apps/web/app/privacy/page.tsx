import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = {
  title: '개인정보처리방침 | 나테베 친목 RPG',
};

export default function PrivacyPolicyPage() {
  return <>
    <LegalHeader label="PRIVACY POLICY" />
    <main className="legal-page">
      <article className="legal-document">
        <header className="legal-document-header">
          <p className="eyebrow">PRIVACY POLICY</p>
          <h1>개인정보처리방침</h1>
          <p className="legal-business">오리진 스튜디오</p>
          <p className="legal-updated">최종 업데이트: 2026년 8월 9일</p>
        </header>

        <p>오리진 스튜디오(https://iris-homepage-web.vercel.app/)는 이용자의 개인정보를 중요하게 생각하며, 개인정보 보호를 위해 노력하고 있습니다.</p>
        <p>본 개인정보처리방침은 오리진 스튜디오가 이용자의 정보를 어떻게 수집하고, 이용하며, 보호하는지 설명합니다.</p>

        <section>
          <h2>1. 수집하는 정보</h2>
          <p>오리진 스튜디오는 이용자가 서비스 및 기능을 이용하거나 문의하는 과정에서 직접 제공하는 정보를 수집할 수 있습니다.</p>
          <p>또한 서비스 이용 과정에서 다음과 같은 이용 정보가 자동으로 수집될 수 있습니다.</p>
          <ul>
            <li>IP 주소</li>
            <li>브라우저 종류</li>
            <li>방문한 페이지</li>
            <li>서비스 이용 기록</li>
          </ul>
        </section>

        <section>
          <h2>2. 개인정보의 이용 목적</h2>
          <p>수집된 정보는 다음 목적을 위해 이용될 수 있습니다.</p>
          <ul>
            <li>서비스 제공 및 운영</li>
            <li>서비스 품질 개선</li>
            <li>이용자의 문의에 대한 답변</li>
            <li>서비스 이용 패턴 분석</li>
            <li>서비스의 안정적인 운영 및 보안</li>
          </ul>
        </section>

        <section>
          <h2>3. 쿠키(Cookie)</h2>
          <p>오리진 스튜디오는 이용자의 서비스 이용 경험을 향상하기 위해 쿠키를 사용할 수 있습니다.</p>
          <p>이용자는 브라우저 설정을 통해 쿠키의 저장을 허용하거나 거부할 수 있습니다.</p>
          <p>다만 쿠키 사용을 제한할 경우 일부 서비스 기능의 이용이 제한될 수 있습니다.</p>
        </section>

        <section>
          <h2>4. 제3자 서비스</h2>
          <p>오리진 스튜디오는 서비스 운영 및 이용 분석 등을 위해 외부 제3자 서비스를 사용할 수 있습니다.</p>
          <p>해당 제3자 서비스는 각 서비스 제공자의 개인정보처리방침에 따라 정보를 수집하거나 처리할 수 있습니다.</p>
        </section>

        <section>
          <h2>5. 개인정보의 보호</h2>
          <p>오리진 스튜디오는 이용자의 정보를 보호하기 위해 합리적인 기술적·관리적 보안 조치를 적용하고 있습니다.</p>
          <p>다만 인터넷을 통한 정보 전송 또는 전자적 저장 방식은 어떠한 경우에도 100%의 안전성을 보장할 수 없습니다.</p>
        </section>

        <section>
          <h2>6. 아동의 개인정보</h2>
          <p>오리진 스튜디오의 서비스는 만 13세 미만의 아동을 대상으로 제공되지 않습니다.</p>
          <p>오리진 스튜디오는 만 13세 미만 아동의 개인정보를 고의로 수집하지 않습니다.</p>
        </section>

        <section>
          <h2>7. 개인정보처리방침의 변경</h2>
          <p>오리진 스튜디오는 관련 법령, 서비스 내용 또는 운영 정책의 변경에 따라 본 개인정보처리방침을 수정할 수 있습니다.</p>
          <p>개인정보처리방침이 변경되는 경우 변경된 내용을 본 페이지를 통해 안내합니다.</p>
        </section>

        <section>
          <h2>8. 문의</h2>
          <p>본 개인정보처리방침과 관련하여 문의사항이 있는 경우 아래 이메일로 문의해 주세요.</p>
          <p>이메일:<br /><a className="legal-email" href="mailto:chlwlgns999@naver.com">chlwlgns999@naver.com</a></p>
        </section>
      </article>
    </main>
    <SiteFooter />
  </>;
}

function LegalHeader({ label }: { label: string }) {
  return <header className="topbar shop-topbar legal-topbar">
    <Link className="brand" href="/"><span className="brand-logo">N</span><span><b>나테베 RPG</b><small>{label}</small></span></Link>
    <nav><Link href="/">홈</Link><Link href="/shop">골드 상점</Link></nav>
    <Link className="account-button" href="/">홈으로</Link>
  </header>;
}
