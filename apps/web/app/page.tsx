'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ApiError,
  getCurrentAuth,
  getPortalDashboard,
  getRanking,
  logout,
  type PortalCharacter,
  type PortalContent,
  type PortalDashboard,
  type PortalSystem,
} from '@/lib/api';
import {
  parseRankingRows,
  rankingFailureStatus,
  rankingResultStatus,
  type RankingRow,
  type RankingStatus,
} from '@/lib/ranking';
import { resolveAccountGender, resolveCharacterImage } from '@/lib/character-image';

const rankingTabs = [
  ['power', '전투력'],
  ['level', '레벨'],
  ['raid', '레이드'],
  ['tower', '탑'],
] as const;
type RankingType = (typeof rankingTabs)[number][0];
type AuthState = { status: 'loading' | 'guest' | 'authenticated'; botUid?: string };
type DashboardState =
  | { status: 'idle' | 'loading' | 'unconfigured' | 'not-found' | 'error' }
  | { status: 'success'; data: PortalDashboard };

const characterVisuals = {
  warrior: { label: '전사' },
  archer: { label: '궁수' },
  mage: { label: '마법사' },
} as const;

const galleryVisuals = [
  { id: 'premium', image: '/assets/premium-profile.webp', title: '프리미엄 일러스트', description: '고화질 원본과 프로필 이미지' },
  { id: 'rebirth', image: '/assets/rebirth.webp', title: '환생 일러스트', description: '환생 달성 기록' },
  { id: 'level100', image: '/assets/level100.webp', title: '레벨 100 일러스트', description: '성장 달성 기록' },
  { id: 'palace', image: '/assets/palace.webp', title: '왕궁 일러스트', description: '왕궁 달성 기록' },
] as const;

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [dashboard, setDashboard] = useState<DashboardState>({ status: 'idle' });
  const [selectedSystem, setSelectedSystem] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState('warrior');
  const [rankingType, setRankingType] = useState<RankingType>('power');
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [rankingStatus, setRankingStatus] = useState<RankingStatus>('loading');
  const [toast, setToast] = useState('');

  useEffect(() => {
    let active = true;
    getCurrentAuth()
      .then((result) => {
        if (!active) return;
        if (result.authenticated) setDashboard({ status: 'loading' });
        setAuth(result.authenticated
          ? { status: 'authenticated', botUid: result.botUid }
          : { status: 'guest' });
      })
      .catch(() => {
        if (active) setAuth({ status: 'guest' });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (auth.status !== 'authenticated') {
      return;
    }
    let active = true;
    getPortalDashboard()
      .then((data) => {
        if (!active) return;
        setDashboard({ status: 'success', data });
        setSelectedSystem(data.systems[0]?.id ?? '');
        setSelectedCharacter(
          data.characters?.find((character) => character.current)?.job
            ?? data.characters?.[0]?.job
            ?? 'warrior',
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        const status = error instanceof ApiError && error.code === 'PORTAL_USER_NOT_FOUND'
          ? 'not-found'
          : error instanceof ApiError && error.code === 'PORTAL_DASHBOARD_NOT_CONFIGURED'
            ? 'unconfigured'
            : 'error';
        setDashboard({ status });
      });
    return () => { active = false; };
  }, [auth.status]);

  useEffect(() => {
    let active = true;
    getRanking(rankingType)
      .then((response) => {
        if (!active) return;
        const result = parseRankingRows(response);
        if (!result.ok) {
          setRankingStatus('error');
          return;
        }
        setRankings(result.rows);
        setRankingStatus(rankingResultStatus(result.rows));
      })
      .catch((error: unknown) => {
        if (active) setRankingStatus(rankingFailureStatus(error));
      });
    return () => { active = false; };
  }, [rankingType]);

  async function signOut() {
    try {
      await logout();
      setAuth({ status: 'guest' });
      setDashboard({ status: 'idle' });
      setToast('로그아웃되었습니다.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : '로그아웃하지 못했습니다.');
    }
  }

  return (
    <>
      <Header
        auth={auth}
        menuOpen={menuOpen}
        closeMenu={() => setMenuOpen(false)}
        toggleMenu={() => setMenuOpen((open) => !open)}
        signOut={signOut}
      />
      <main id="home">
        <WorldHero authenticated={auth.status === 'authenticated'} />
        <DashboardSection
          auth={auth}
          state={dashboard}
          selectedSystem={selectedSystem}
          selectSystem={setSelectedSystem}
        />
        <CharacterSection
          state={dashboard}
          selected={selectedCharacter}
          select={setSelectedCharacter}
        />
        <GallerySection state={dashboard} />
        <PremiumSection />
        <RankingSection
          type={rankingType}
          rows={rankings}
          status={rankingStatus}
          setType={(type) => {
            setRankings([]);
            setRankingStatus('loading');
            setRankingType(type);
          }}
        />
      </main>
      <Footer />
      <div className={`toast ${toast ? 'show' : ''}`} role="status" onTransitionEnd={() => {
        if (toast) window.setTimeout(() => setToast(''), 1800);
      }}>{toast}</div>
    </>
  );
}

function Header({ auth, menuOpen, closeMenu, toggleMenu, signOut }: {
  auth: AuthState;
  menuOpen: boolean;
  closeMenu: () => void;
  toggleMenu: () => void;
  signOut: () => void;
}) {
  return (
    <header className="topbar">
      <a className="brand" href="#home" aria-label="홈으로 이동" onClick={closeMenu}>
        <span className="brand-logo">N</span>
        <span><b>나테베 RPG</b><small>FRIENDSHIP ADVENTURE</small></span>
      </a>
      <button className="menu-button" type="button" aria-label="메뉴 열기" aria-expanded={menuOpen} onClick={toggleMenu}>☰</button>
      <nav className={menuOpen ? 'open' : ''}>
        <a href="#dashboard" onClick={closeMenu}>게임 대시보드</a>
        <a href="#characters" onClick={closeMenu}>내 캐릭터</a>
        <a href="#gallery" onClick={closeMenu}>일러스트</a>
        <a href="#ranking" onClick={closeMenu}>랭킹</a>
      </nav>
      {auth.status === 'authenticated' ? (
        <div className="account-cluster">
          <span className="uid-chip"><i /> UID {auth.botUid}</span>
          <button className="account-button" type="button" onClick={signOut}>로그아웃</button>
        </div>
      ) : (
        <Link className="account-button" href="/connect">웹 인증</Link>
      )}
    </header>
  );
}

function WorldHero({ authenticated }: { authenticated: boolean }) {
  return (
    <section className="world-hero" aria-label="나테베 RPG 메인 이미지">
      <Image className="world-hero-image" src="/assets/rpg-world-main.webp" alt="전사, 궁수, 마법사가 함께 서 있는 나테베 RPG 세계관 일러스트" fill priority sizes="100vw" />
      <div className="world-shade" />
      <div className="world-copy">
        <p className="eyebrow">NATEBE RPG PORTAL</p>
        <h1>캐릭터부터 게임 현황까지<br /><span>한곳에서 확인하는 RPG 포털</span></h1>
        <p>봇의 게임 정보를 안전한 웹 인증 후<br />한눈에 확인하는 나테베 RPG 대시보드입니다.</p>
        <div className="world-actions">
          <a className="button primary" href="#dashboard">게임 현황 보기</a>
          <Link className="button glass" href={authenticated ? '#characters' : '/connect'}>
            {authenticated ? '내 캐릭터 보기' : '카카오톡 웹 인증'}
          </Link>
        </div>
      </div>
      <div className="world-status">
        <div><small>웹 인증</small><b><i /> {authenticated ? '연결됨' : '로그인 필요'}</b></div>
        <div><small>게임 데이터</small><b>{authenticated ? '확인 중' : '인증 후 제공'}</b></div>
        <div><small>레이드</small><b>API 연동 준비</b></div>
        <div><small>시즌</small><b>API 연동 준비</b></div>
      </div>
    </section>
  );
}

function DashboardSection({ auth, state, selectedSystem, selectSystem }: {
  auth: AuthState;
  state: DashboardState;
  selectedSystem: string;
  selectSystem: (id: string) => void;
}) {
  const systems = state.status === 'success' ? state.data.systems : [];
  const generatedAt = state.status === 'success' ? state.data.meta.generatedAt : '';
  const active = systems.find((system) => system.id === selectedSystem) ?? systems[0];
  return (
    <section className="dashboard-section" id="dashboard">
      <SectionHeading eyebrow="LIVE GAME DASHBOARD" title="내 게임 대시보드" description="카카오톡 RPG 데이터를 읽기 전용 화면으로 확인합니다.">
        <span className={`sync-chip ${state.status === 'success' ? 'live' : ''}`}><i /> {dashboardBadge(auth, state)}</span>
      </SectionHeading>
      {state.status === 'success' && state.data.summary && state.data.summary.length > 0 && (
        <div className="summary-grid">
          {state.data.summary.map(([label, value, detail]) => <Metric key={label} metric={[label, value, detail]} />)}
        </div>
      )}
      {auth.status !== 'authenticated' ? (
        <DashboardMessage title="개인 게임 데이터는 로그인 후 표시됩니다.">
          카카오톡에서 발급한 일회용 코드로 웹 인증을 완료해 주세요.
          <Link className="button primary" href="/connect">웹 인증 시작</Link>
        </DashboardMessage>
      ) : state.status === 'loading' ? (
        <DashboardMessage title="게임 데이터를 불러오는 중입니다.">잠시만 기다려 주세요.</DashboardMessage>
      ) : state.status === 'unconfigured' ? (
        <DashboardMessage title="게임 대시보드 연결 준비중">
          실제 RPG 데이터 공급자가 아직 연결되지 않았습니다. 가상 게임 수치는 표시하지 않습니다.
        </DashboardMessage>
      ) : state.status === 'not-found' ? (
        <DashboardMessage title="연결된 RPG 캐릭터 정보를 찾지 못했습니다.">
          카카오톡 계정의 RPG 가입 상태를 확인해 주세요.
        </DashboardMessage>
      ) : state.status === 'error' ? (
        <DashboardMessage title="게임 데이터를 불러오지 못했습니다.">잠시 후 다시 시도해 주세요.</DashboardMessage>
      ) : systems.length === 0 ? (
        <DashboardMessage title="등록된 게임 시스템 정보가 없습니다.">새 시스템은 API의 systems 배열에서 자동으로 표시됩니다.</DashboardMessage>
      ) : (
        <div className="dashboard-shell">
          <aside className="feature-nav">
            <div className="feature-nav-title"><b>게임 기능</b><small>기능을 눌러 상세 확인</small></div>
            <div className="feature-buttons">
              {systems.map((system) => (
                <button className={`feature-button ${active?.id === system.id ? 'active' : ''}`} type="button" key={system.id} onClick={() => selectSystem(system.id)}>
                  <span>{system.icon}</span>{system.title}
                </button>
              ))}
            </div>
          </aside>
          {active && <SystemPanel system={active} generatedAt={generatedAt} />}
        </div>
      )}
    </section>
  );
}

function SystemPanel({ system, generatedAt }: { system: PortalSystem; generatedAt: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(system.command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <section className="feature-panel" aria-live="polite">
      <div className="feature-panel-head">
        <div><span className="feature-icon">{system.icon}</span><div><small>{system.command}</small><h3>{system.title}</h3></div></div>
        <span className="data-badge">실제 API · 읽기 전용</span>
      </div>
      <p className="feature-description">{system.description}</p>
      {system.metrics.length > 0 && <div className="feature-metrics">{system.metrics.map((metric) => <Metric key={metric[0]} metric={metric} />)}</div>}
      <div className="feature-content"><SystemContent content={system.content} /></div>
      <div className="feature-footer">
        <span>동기화 · {formatTimestamp(generatedAt)}</span>
        <button className="command-copy" type="button" onClick={copy}>{copied ? '복사됨' : '카톡 명령어 복사'}</button>
      </div>
    </section>
  );
}

function SystemContent({ content }: { content: PortalContent }) {
  return (
    <div className="content-card">
      <div className="content-title"><h4>{content.title}</h4><span>서버 제공 데이터</span></div>
      {content.type === 'progress' && (
        <div className="progress-block">{content.rows.map(([label, percent, detail]) => (
          <div className="progress-row" key={label}><label>{label}</label><div className="progress-track"><i style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div><span>{detail ?? `${percent}%`}</span></div>
        ))}</div>
      )}
      {content.type === 'items' && (
        <div className="item-list">{content.rows.map(([icon, label, value]) => (
          <div className="item-row" key={`${label}-${value}`}><span className="item-icon">{icon}</span><b>{label}</b><strong>{value}</strong></div>
        ))}</div>
      )}
      {content.type === 'table' && (
        <div className="table-wrap"><table className="data-table"><thead><tr>{content.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{content.rows.map((row, index) => <tr key={index}>{row.map((value, cell) => <td key={`${cell}-${value}`}>{value}</td>)}</tr>)}</tbody></table></div>
      )}
    </div>
  );
}

function CharacterSection({ state, selected, select }: { state: DashboardState; selected: string; select: (job: string) => void }) {
  const characters = state.status === 'success' ? state.data.characters ?? [] : [];
  const accountGender = resolveAccountGender(characters);
  const selectedData = characters.find((character) => character.job === selected);
  return (
    <section className="character-section" id="characters">
      <SectionHeading eyebrow="MY CHARACTER SLOTS" title="내 캐릭터 슬롯" description="직업별 기본 외형과 실제 슬롯 데이터를 확인합니다.">
        <span className="collection-count">{characters.length ? `${characters.length}개 슬롯` : '슬롯 데이터 대기'}</span>
      </SectionHeading>
      <div className="character-grid">
        {(Object.entries(characterVisuals) as [keyof typeof characterVisuals, typeof characterVisuals[keyof typeof characterVisuals]][]).map(([job, visual]) => {
          const character = characters.find((item) => item.job === job);
          return (
            <article className={`character-card ${selected === job ? 'active' : ''}`} key={job}>
              <div className="character-image-wrap"><div className="character-art"><Image src={resolveCharacterImage(job, character?.gender ?? accountGender, 'card')} alt={`${visual.label} 기본 캐릭터`} fill sizes="(max-width: 620px) 82vw, 33vw" /></div><span className="slot-label">{visual.label.toUpperCase()}</span>{character && <span className="selected-mark">{character.current ? '현재 직업' : '보유 슬롯'}</span>}</div>
              <div className="character-card-body"><small>{visual.label} 기본 외형</small><h3>{character?.name ?? `나테베의 ${visual.label}`}</h3>
                {character ? <CharacterFacts character={character} /> : <p>실제 슬롯 정보가 연결되면 레벨·전투력·장비가 표시됩니다.</p>}
                <button type="button" onClick={() => select(job)}>{character ? '상세 보기' : '기본 외형 보기'}</button>
              </div>
            </article>
          );
        })}
      </div>
      <SelectedCharacter selected={selected} character={selectedData} accountGender={accountGender} />
    </section>
  );
}

function CharacterFacts({ character }: { character: PortalCharacter }) {
  return <p>{[character.level, character.power && `전투력 ${character.power}`, character.weapon].filter(Boolean).join(' · ')}</p>;
}

function SelectedCharacter({ selected, character, accountGender }: {
  selected: string;
  character?: PortalCharacter;
  accountGender: PortalCharacter['gender'];
}) {
  const key = selected in characterVisuals ? selected as keyof typeof characterVisuals : 'warrior';
  const visual = characterVisuals[key];
  const facts = [
    ['직업', visual.label], ['레벨', character?.level], ['전투력', character?.power],
    ['장착 무기', character?.weapon], ['환생', character?.rebirth], ['탑', character?.tower], ['레이드', character?.raid],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  return (
    <article className="selected-dashboard">
      <div className="selected-profile"><Image src={resolveCharacterImage(key, character?.gender ?? accountGender, 'profile')} alt={`${visual.label} 프로필`} width={66} height={66} /><div><small>{character ? '선택 캐릭터' : '기본 직업 소개'}</small><h3>{character?.name ?? `나테베의 ${visual.label}`}</h3><p>{character?.title ?? '게임 데이터 연결 시 상세정보가 표시됩니다.'}</p></div></div>
      <div className="selected-stats">{facts.map(([label, value]) => <div key={label}><small>{label}</small><b>{value}</b></div>)}</div>
    </article>
  );
}

function GallerySection({ state }: { state: DashboardState }) {
  const artworks = state.status === 'success' ? state.data.artworks ?? [] : [];
  return (
    <section className="section" id="gallery">
      <SectionHeading eyebrow="GROWTH ARCHIVE" title="일러스트 갤러리" description="제공된 일러스트 미리보기입니다. 소유·다운로드 권한은 서버 데이터로만 결정합니다.">
        <span className="collection-count">{artworks.length ? `보유 ${artworks.filter((art) => art.owned).length}개` : '소유 정보 연동 대기'}</span>
      </SectionHeading>
      <div className="gallery-grid">
        {galleryVisuals.map((visual) => {
          const ownership = artworks.find((art) => art.id === visual.id);
          return (
            <article className="gallery-card" key={visual.id}>
              <div className="art-thumb"><Image src={visual.image} alt={visual.title} fill sizes="(max-width: 620px) 100vw, 33vw" />{ownership?.owned && <span className="owned-badge">보유중</span>}</div>
              <div className="gallery-copy"><small>{visual.description}</small><h3>{ownership?.title ?? visual.title}</h3><p>{ownership?.owned ? (ownership.acquiredAt ?? '계정 귀속 일러스트') : '소유 정보는 로그인 데이터로 확인됩니다.'}</p></div>
              <button type="button" disabled>{ownership?.owned ? '다운로드 서버 검증 준비중' : '미리보기'}</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PremiumSection() {
  return (
    <section className="section premium-section" id="premium">
      <SectionHeading eyebrow="COSMETIC SUPPORT" title="프리미엄 일러스트" description="능력치·재화·아이템 변화 없이 캐릭터 이미지와 개인 사용권만 제공합니다.">
        <span className="cosmetic-chip">결제 연동 준비중</span>
      </SectionHeading>
      <div className="premium-grid">
        <article className="premium-visual"><Image src="/assets/basic-warrior-profile.webp" alt="무료 기본 일러스트" width={512} height={512} /><div><span>FREE</span><h3>기본 일러스트</h3><p>모든 유저에게 제공되는 직업별 기본 외형</p></div></article>
        <div className="compare-arrow">→</div>
        <article className="premium-visual paid-visual"><Image src="/assets/premium-profile.webp" alt="프리미엄 일러스트" width={512} height={512} /><div><span>PREMIUM</span><h3>후원 일러스트</h3><p>고화질 원본·프로필 이미지·개인 사용권</p></div></article>
        <article className="premium-info"><h3>내 캐릭터를 실제 프로필로</h3><ul><li>해당 UID에 서버 검증 후 귀속</li><li>대표 이미지와 성장 갤러리에 보관</li><li>개인 프로필과 개인 SNS 사용</li><li>고화질 원본과 1:1 프로필 이미지 제공</li></ul><button className="button primary" type="button" disabled>후원 시스템 준비중</button></article>
      </div>
      <div className="premium-wide-art"><Image src="/assets/premium-original.webp" alt="프리미엄 고화질 원본 예시" fill sizes="100vw" /></div>
      <div className="policy-box"><b>개인 사용권</b><p>개인 프로필·배경화면·개인 SNS에 사용할 수 있습니다. 재판매·양도·상품화·상업적 재배포는 허용되지 않습니다.</p></div>
    </section>
  );
}

function RankingSection({ type, rows, status, setType }: { type: RankingType; rows: RankingRow[]; status: RankingStatus; setType: (type: RankingType) => void }) {
  const podium = rows.slice(0, 3);
  const ordered = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
  return (
    <section className="section" id="ranking">
      <SectionHeading eyebrow="HALL OF FAME" title="명예의 전당">
        <div className="tabs" role="tablist">{rankingTabs.map(([id, label]) => <button className={`tab ${type === id ? 'active' : ''}`} role="tab" aria-selected={type === id} type="button" key={id} onClick={() => setType(id)}>{label}</button>)}</div>
      </SectionHeading>
      {status === 'success' ? <>
        <div className="podium">{ordered.map((row) => <article className={`podium-card ${row.rank === 1 ? 'first' : ''}`} key={`${row.rank}-${row.name}`}><div className="podium-rank">{row.rank}</div><h3>{row.name}</h3><p>{row.job} · {row.value}</p></article>)}</div>
        <div className="table-wrap"><table><thead><tr><th>순위</th><th>모험가</th><th>직업</th><th>{rankingTabs.find(([id]) => id === type)?.[1]}</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.rank}-${row.name}`}><td className="rank">{row.rank}</td><td><b>{row.name}</b></td><td>{row.job}</td><td>{row.value}</td></tr>)}</tbody></table></div>
      </> : <div className="ranking-message"><b>{rankingMessage(status)}</b>{status === 'unconfigured' && <p>실제 Iris 데이터 공급자 연결 전에는 가상 순위를 표시하지 않습니다.</p>}</div>}
    </section>
  );
}

function SectionHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children?: React.ReactNode }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</div>;
}

function Metric({ metric: [label, value, detail] }: { metric: [string, string, string?] }) {
  return <article className="metric-card"><small>{label}</small><b>{value}</b>{detail && <span>{detail}</span>}</article>;
}

function DashboardMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="dashboard-message"><Image src="/assets/rpg-world.webp" alt="" fill sizes="100vw" /><div><span className="data-badge">READ ONLY</span><h3>{title}</h3><p>{children}</p></div></div>;
}

function Footer() {
  return <footer><div><b>나테베 친목 RPG</b><p>카카오톡 친목방용 커뮤니티 게임 포털</p></div><div className="footer-links"><a href="#dashboard">게임 대시보드</a><a href="#characters">내 캐릭터</a><a href="#gallery">일러스트</a><a href="#ranking">랭킹</a></div><small>© 2026 NATEBE FRIENDSHIP RPG. ALL RIGHTS RESERVED.</small></footer>;
}

function dashboardBadge(auth: AuthState, state: DashboardState) {
  if (auth.status !== 'authenticated') return '웹 인증 필요';
  if (state.status === 'loading') return '데이터 확인 중';
  if (state.status === 'success') return '실제 API 연결';
  if (state.status === 'unconfigured') return 'API 연결 준비중';
  return '연결 상태 확인 필요';
}

function rankingMessage(status: RankingStatus) {
  if (status === 'loading') return '랭킹 정보를 불러오는 중입니다.';
  if (status === 'empty') return '등록된 랭킹 정보가 없습니다.';
  if (status === 'unconfigured') return '실제 Iris 데이터 공급자가 아직 연결되지 않았습니다.';
  return '랭킹 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '시간 정보 없음' : date.toLocaleString('ko-KR');
}
