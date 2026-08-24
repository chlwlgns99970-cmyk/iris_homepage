import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';

export default function PaymentSuccessPage() {
  return <PaymentResultShell eyebrow="MEMBERSHIP PAYMENT" title="멤버십 결제 시스템을 준비 중입니다.">
    <div className="payment-state">현재 실제 결제와 청구는 발생하지 않습니다.<br />정식 오픈 후 멤버십 페이지에서 안내하겠습니다.</div>
  </PaymentResultShell>;
}

function PaymentResultShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <><header className="topbar shop-topbar"><Link className="brand" href="/"><span className="brand-logo">N</span><span><b>나테베 친목 RPG</b><small>PAYMENT</small></span></Link><Link className="account-button" href="/membership">멤버십으로</Link></header><main className="payment-page"><section className="payment-page-card payment-result-card"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children}<div className="payment-page-actions"><Link className="button glass" href="/">게임 대시보드로 돌아가기</Link><Link className="button primary" href="/membership">멤버십으로 돌아가기</Link></div></section></main><SiteFooter /></>;
}
