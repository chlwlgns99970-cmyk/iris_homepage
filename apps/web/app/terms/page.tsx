import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = {
  title: '이용약관 | 나테베 친목 RPG',
};

export default function TermsPage() {
  return <>
    <header className="topbar shop-topbar legal-topbar">
      <Link className="brand" href="/"><span className="brand-logo">N</span><span><b>나테베 RPG</b><small>TERMS OF USE</small></span></Link>
      <nav><Link href="/">홈</Link><Link href="/shop">골드 상점</Link></nav>
      <Link className="account-button" href="/">홈으로</Link>
    </header>
    <main className="legal-page">
      <article className="legal-document">
        <header className="legal-document-header">
          <p className="eyebrow">TERMS OF USE</p>
          <h1>이용약관</h1>
          <p className="legal-business">오리진 스튜디오</p>
          <p className="legal-updated">최종 업데이트: 2026년 8월 9일</p>
        </header>

        <p>오리진 스튜디오가 운영하는<br /><Link className="legal-inline-link" href="/">https://iris-homepage-web.vercel.app/</Link><br />서비스를 이용하시기 전에 본 이용약관을 주의 깊게 읽어주시기 바랍니다.</p>

        <section>
          <h2>1. 약관의 동의</h2>
          <p>오리진 스튜디오의 서비스에 접속하거나 서비스를 이용하는 경우, 이용자는 본 이용약관의 내용을 확인하고 이에 동의한 것으로 간주됩니다.</p>
          <p>본 약관에 동의하지 않는 경우 서비스 이용을 중단해 주세요.</p>
        </section>

        <section>
          <h2>2. 서비스 이용</h2>
          <p>이용자는 오리진 스튜디오가 제공하는 서비스와 기능을 개인적 목적 또는 허용된 범위의 상업적 목적으로 이용할 수 있습니다.</p>
          <p>이용자는 다음과 같은 행위를 해서는 안 됩니다.</p>
          <ul>
            <li>서비스를 불법적인 목적으로 이용하는 행위</li>
            <li>서비스의 정상적인 운영을 방해하는 행위</li>
            <li>시스템이나 서버에 비정상적인 접근을 시도하는 행위</li>
            <li>서비스의 기능을 악용하는 행위</li>
            <li>관련 법령을 위반하는 행위</li>
          </ul>
        </section>

        <section>
          <h2>3. 지식재산권</h2>
          <p>오리진 스튜디오가 제공하는 서비스의 콘텐츠, 기능, 구성 및 관련 요소에 대한 권리는 오리진 스튜디오 또는 정당한 권리자에게 있습니다.</p>
          <p>해당 콘텐츠와 기능은 저작권 및 기타 관련 지식재산권 법령에 의해 보호될 수 있습니다.</p>
          <p>이용자는 오리진 스튜디오 또는 정당한 권리자의 허가 없이 이를 무단 복제, 배포, 수정 또는 상업적으로 이용해서는 안 됩니다.</p>
        </section>

        <section>
          <h2>4. 면책 사항</h2>
          <p>오리진 스튜디오의 서비스와 기능은 현재 제공 가능한 상태를 기준으로 제공됩니다.</p>
          <p>오리진 스튜디오는 법률상 허용되는 범위 내에서 서비스의 결과, 정확성, 완전성, 지속적인 이용 가능성 등에 대해 별도의 보증을 하지 않습니다.</p>
          <p>서비스의 점검, 장애, 네트워크 문제, 외부 서비스의 문제 또는 기타 불가피한 사유로 서비스 이용이 일시적으로 제한될 수 있습니다.</p>
        </section>

        <section>
          <h2>5. 책임의 제한</h2>
          <p>법률상 허용되는 범위 내에서 오리진 스튜디오는 이용자의 서비스 이용으로 인해 발생하는 간접적, 부수적 또는 결과적 손해에 대해 책임을 부담하지 않을 수 있습니다.</p>
          <p>다만 오리진 스튜디오의 고의 또는 중대한 과실로 인해 발생한 손해 등 관련 법령상 책임을 제한할 수 없는 경우에는 해당 법령이 적용됩니다.</p>
        </section>

        <section>
          <h2>6. 이용약관의 변경</h2>
          <p>오리진 스튜디오는 관련 법령의 변경, 서비스 내용의 변경 또는 운영 정책의 변경 등에 따라 본 이용약관을 수정할 수 있습니다.</p>
          <p>이용약관이 변경되는 경우 변경된 내용을 본 페이지를 통해 안내합니다.</p>
          <p>변경된 이용약관 시행 이후에도 서비스를 계속 이용하는 경우, 관련 법령에서 달리 정하지 않는 범위에서 변경된 약관에 동의한 것으로 볼 수 있습니다.</p>
        </section>

        <section>
          <h2>7. 준거법</h2>
          <p>본 이용약관은 대한민국의 관련 법령에 따라 해석되고 적용됩니다.</p>
          <p>본 약관에서 정하지 않은 사항은 관련 법령 및 일반적인 상관례에 따릅니다.</p>
        </section>

        <section>
          <h2>8. 문의</h2>
          <p>본 이용약관과 관련하여 문의사항이 있는 경우 아래 이메일로 문의해 주세요.</p>
          <p>이메일:<br /><a className="legal-email" href="mailto:chlwlgns999@naver.com">chlwlgns999@naver.com</a></p>
        </section>
      </article>
    </main>
    <SiteFooter />
  </>;
}
