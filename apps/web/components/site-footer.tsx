import Link from 'next/link';

type SiteFooterProps = {
  className?: string;
  compact?: boolean;
  showSectionLinks?: boolean;
};

export function SiteFooter({ className = '', compact = false, showSectionLinks = false }: SiteFooterProps) {
  const classes = ['site-footer', compact ? 'site-footer--compact' : '', className]
    .filter(Boolean)
    .join(' ');

  return <footer className={classes}>
    <div className="footer-brand"><b>나테베 친목 RPG</b><p>카카오톡 친목방용 커뮤니티 게임 포털</p></div>
    <div className="footer-links" role="navigation" aria-label="푸터 메뉴">
      {showSectionLinks && <>
        <Link href="/#dashboard">게임 대시보드</Link>
        <Link href="/#characters">내 캐릭터</Link>
        <Link href="/#gallery">일러스트</Link>
        <Link href="/#ranking">랭킹</Link>
        <Link href="/shop">골드 상점</Link>
      </>}
      <Link className="footer-legal-link" href="/privacy">개인정보처리방침</Link>
      <span className="footer-link-divider" aria-hidden="true">|</span>
      <Link className="footer-legal-link" href="/terms">이용약관</Link>
    </div>
    <small>© 2026 NATEBE FRIENDSHIP RPG. ALL RIGHTS RESERVED.</small>
  </footer>;
}
