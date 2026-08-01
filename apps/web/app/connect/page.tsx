'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  cancelDeviceAuth,
  completeDeviceAuth,
  getCurrentAuth,
  logout,
  pollDeviceAuth,
  restartDeviceAuth,
  startDeviceAuth,
  type DeviceStartResponse,
} from '@/lib/api';
import {
  AUTH_SESSION_BROWSER_NOTICE,
  AUTH_SESSION_PRIMARY_NOTICE,
} from '@/lib/auth-session-policy';

type ViewState = 'starting' | 'pending' | 'completing' | 'success' | 'expired' | 'cancelled' | 'logged_out' | 'error';

export default function ConnectPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<ViewState>('starting');
  const [deviceRequest, setDeviceRequest] = useState<DeviceStartResponse | null>(null);
  const [approvedUid, setApprovedUid] = useState('');
  const [message, setMessage] = useState('');
  const startedRef = useRef(false);
  const completingRef = useRef(false);
  const renewingRef = useRef(false);

  const clearRequest = useCallback(() => {
    setDeviceRequest(null);
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let active = true;

    async function initialize() {
      try {
        const current = await getCurrentAuth();
        if (!active) return;
        if (current.authenticated) {
          setApprovedUid(current.botUid);
          setView('success');
          return;
        }
      } catch {
        // 세션 확인이 불가능해도 새 인증 요청 생성을 시도합니다.
      }
      try {
        const created = await startDeviceAuth();
        if (!active) return;
        setDeviceRequest(created);
        setView('pending');
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : '웹 인증 요청을 시작하지 못했습니다.');
        setView('error');
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!deviceRequest) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (!active) return;
      if (Date.parse(deviceRequest!.expiresAt) <= Date.now()) {
        clearRequest();
        setView('expired');
        return;
      }
      try {
        const result = await pollDeviceAuth(deviceRequest!.requestId, deviceRequest!.deviceSecret);
        if (!active) return;
        if (result.status === 'approved') {
          if (completingRef.current) return;
          completingRef.current = true;
          setView('completing');
          try {
            const completed = await completeDeviceAuth(
              deviceRequest!.requestId,
              deviceRequest!.deviceSecret,
            );
            if (!active) return;
            clearRequest();
            setApprovedUid(completed.botUid);
            setView('success');
          } catch (error) {
            if (!active) return;
            completingRef.current = false;
            setMessage(error instanceof Error ? error.message : '로그인을 완료하지 못했습니다.');
            setView('error');
          }
          return;
        }
        if (result.status === 'expired' || result.status === 'consumed') {
          clearRequest();
          setView(result.status === 'expired' ? 'expired' : 'error');
          return;
        }
        if (result.status === 'cancelled') {
          clearRequest();
          setView('cancelled');
          return;
        }
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : '승인 상태를 확인하지 못했습니다.');
        setView('error');
        return;
      }
      timer = setTimeout(() => void poll(), 2000);
    }
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [clearRequest, deviceRequest]);

  async function renew() {
    if (renewingRef.current) return;
    if (!window.confirm('새 인증코드를 발급하면 기존 요청은 취소됩니다. 계속할까요?')) return;
    renewingRef.current = true;
    setView('starting');
    setMessage('');
    try {
      const created = await restartDeviceAuth();
      setDeviceRequest(created);
      setView('pending');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '새 인증 요청을 만들지 못했습니다.');
      setView('error');
    } finally {
      renewingRef.current = false;
    }
  }

  async function cancel() {
    if (deviceRequest) {
      try {
        await cancelDeviceAuth(deviceRequest.requestId, deviceRequest.deviceSecret);
      } catch {
        // 서버 응답과 관계없이 현재 탭의 브라우저 비밀값을 제거합니다.
      }
    }
    clearRequest();
    setView('cancelled');
  }

  async function copyCommand() {
    if (!deviceRequest) return;
    await navigator.clipboard.writeText(`/웹인증 ${deviceRequest.userCode}`);
    setMessage('인증 명령어를 복사했습니다.');
  }

  async function signOut() {
    try {
      await logout();
      setApprovedUid('');
      setView('logged_out');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '로그아웃하지 못했습니다.');
      setView('error');
    }
  }

  return (
    <>
      <meta name="referrer" content="no-referrer" />
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-logo">N</span>
          <span><b>나테베 RPG</b><small>FRIENDSHIP ADVENTURE</small></span>
        </Link>
        <button className="menu-button" type="button" aria-label="메뉴 열기" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>☰</button>
        <nav className={menuOpen ? 'open' : ''} aria-label="인증 페이지 메뉴">
          <Link href="/#dashboard" onClick={() => setMenuOpen(false)}>게임 대시보드</Link>
          <Link href="/#characters" onClick={() => setMenuOpen(false)}>내 캐릭터</Link>
          <Link href="/#gallery" onClick={() => setMenuOpen(false)}>일러스트</Link>
          <Link href="/#ranking" onClick={() => setMenuOpen(false)}>랭킹</Link>
        </nav>
        <Link className="account-button" href="/">홈으로</Link>
      </header>
      <main className="connect-page">
        <section className="connect-card" aria-live="polite">
          <p className="eyebrow">KAKAO DEVICE AUTH</p>
          <h1>카카오톡 계정 인증</h1>
          <p className="connect-muted">
            {AUTH_SESSION_PRIMARY_NOTICE}<br />{AUTH_SESSION_BROWSER_NOTICE}
          </p>
          {view === 'starting' && <p>안전한 인증 요청을 준비하고 있습니다.</p>}
          {view === 'pending' && deviceRequest && (
            <>
              <p>카카오톡에서 아래 명령어를 입력해 주세요.</p>
              <div className="connect-code">/웹인증 {deviceRequest.userCode}</div>
              <div className="connect-actions">
                <button className="button secondary" type="button" onClick={copyCommand}>인증번호 복사</button>
                <button className="button secondary" type="button" onClick={renew}>새 인증코드 발급</button>
              </div>
              <p className="connect-muted">카카오톡으로 돌아가거나 이 창을 닫아도 만료 전에는 같은 인증번호가 유지됩니다.</p>
              <button className="connect-cancel" type="button" onClick={cancel}>취소</button>
            </>
          )}
          {view === 'completing' && <p>보안 세션을 생성하고 있습니다.</p>}
          {view === 'success' && (
            <>
              <h2>로그인되었습니다.</h2>
              <p>현재 연결 UID: <b>{approvedUid}</b></p>
              <div className="connect-actions">
                <Link className="button primary" href="/">홈페이지로 이동</Link>
                <button className="button secondary" type="button" onClick={signOut}>로그아웃</button>
              </div>
            </>
          )}
          {view === 'expired' && <StateMessage title="인증 요청이 만료되었습니다." />}
          {view === 'cancelled' && <StateMessage title="인증 요청을 취소했습니다." />}
          {view === 'logged_out' && <StateMessage title="로그아웃되었습니다." />}
          {view === 'error' && <StateMessage title="웹 인증을 진행하지 못했습니다." detail={message} actionLabel="다시 시도" />}
          {message && view !== 'error' && <p className="connect-notice" role="status">{message}</p>}
        </section>
      </main>
    </>
  );
}

function StateMessage({
  title,
  detail,
  actionLabel = '새 인증 요청',
}: {
  title: string;
  detail?: string;
  actionLabel?: string;
}) {
  return (
    <>
      <h2>{title}</h2>
      {detail && <p>{detail}</p>}
      <a className="button primary" href="/connect">{actionLabel}</a>
    </>
  );
}
