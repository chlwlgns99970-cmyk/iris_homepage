# 나테베 RPG Vercel 배포 준비

이 문서는 `apps/web`의 Vercel 배포와 VPS NestJS 공개 API 연결 절차를 설명합니다. 실제 Production 배포, GitHub 공개 저장소 생성, VPS 설정 변경은 사용자 승인 후 별도로 수행합니다.

## 1. 사전 준비

- 배포 대상: `apps/web`
- 배포 제외: `apps/api`, `iris_bot`, PostgreSQL, Redis, RPG JSON, 백업, incoming 원본
- 브라우저 경로: `https://<홈페이지 도메인>/api/...`
- Rewrite 대상: `https://<VPS API 도메인>/api/...`
- Node.js: Vercel Project Settings에서 `24.x`
- 패키지 관리자: 루트 `package.json`의 `pnpm@11.9.0`

VPS API에는 공인 HTTPS 인증서가 필요합니다. `http://` VPS 주소를 Production에 사용하면 빌드가 거부됩니다.

## 2. Git 저장소 준비

현재 `C:\iris_homepage`에는 `.git` 저장소와 원격 저장소가 없습니다. 저장소를 만들기로 승인한 뒤 프로젝트 루트에서 다음처럼 준비할 수 있습니다.

```powershell
cd C:\iris_homepage
git init -b main
git status
git check-ignore -v .env
```

GitHub 저장소 생성·공개 전환·push는 별도 승인을 받은 뒤 수행합니다. Vercel의 Production Branch는 GitHub에 실제로 생성된 기본 브랜치와 동일하게 설정합니다.

## 3. GitHub 업로드 시 제외 파일

`.gitignore`는 다음 항목을 제외합니다.

- `.env`, `.env.*` (`.env.example`만 예외)
- `node_modules`, `.pnpm-store`, `.next`, `dist`, `coverage`
- `logs`, `*.log`, `.vercel`
- `backups`, `incoming`, `data`, `*.dump`

실제 비밀번호·세션 비밀·내부 토큰이 들어간 파일은 커밋하지 않습니다. `.env.production`도 금지됩니다. Git 저장소가 아직 없어 기존 추적 파일 및 Git history의 비밀 노출 여부는 현재 검사할 수 없습니다.

## 4. Vercel 프로젝트 생성

1. Vercel Dashboard에서 사용할 Team을 선택합니다.
2. **Add New… → Project**를 선택합니다.
3. 승인된 비공개 Git 저장소를 Import합니다.
4. **Root Directory → Edit**에서 `apps/web`을 선택합니다.
5. **Include source files outside of the Root Directory in the Build Step**을 활성화합니다. 웹 소스가 외부 패키지를 import하지는 않지만, 루트의 `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json`으로 workspace와 pnpm 버전을 판별해야 합니다.
6. Framework Preset을 **Next.js**로 확인합니다.
7. Build Command를 `pnpm build`로 설정하거나 자동 감지된 동일 명령을 사용합니다.
8. Install Command는 Override하지 않고 자동 감지를 사용합니다.
9. Output Directory는 Override하지 않고 Next.js 기본값을 사용합니다.
10. Node.js Version은 `24.x`로 설정합니다.
11. Production Branch는 연결된 Git 저장소의 실제 기본 브랜치를 선택합니다.

## 5. Environment Variables

Production에만 다음 서버 측 변수를 등록합니다.

```text
VPS_API_ORIGIN=https://api.example.com
```

값은 경로·query·hash·인증정보가 없는 HTTPS Origin이어야 합니다. 변경 후 새 Production 배포 또는 Redeploy가 필요합니다.

다음 값은 Vercel에 등록하지 않습니다.

- `DATABASE_URL`, `REDIS_URL`
- `BOT_INTERNAL_API_URL`, `BOT_INTERNAL_API_TOKEN`
- `WEB_AUTH_INTERNAL_TOKEN`
- `SESSION_SECRET`, `TOKEN_HASH_SECRET`
- `IRIS_ACCOUNT_LINK_SECRET`
- `TOSS_SECRET_KEY` 및 운영 제어 토큰
- RPG 데이터 경로

`VPS_API_ORIGIN`을 `NEXT_PUBLIC_` 이름으로 만들지 않습니다. 같은 출처 Rewrite를 사용하므로 Production에는 `NEXT_PUBLIC_API_BASE_URL`도 등록하지 않습니다. `NEXT_PUBLIC_SITE_URL`은 현재 코드가 사용하지 않으므로 등록하지 않습니다.

## 6. Preview 정책

- `VPS_API_ORIGIN`은 기본적으로 Production 범위에만 등록합니다.
- Preview에 변수가 없으면 빌드는 성공하지만 `/api/*` Rewrite는 생성되지 않습니다.
- Preview는 운영 로그인·쿠키·RPG 데이터에 접근하지 않습니다.
- 별도의 HTTPS Staging API가 준비된 경우에만 Preview 범위에 그 Origin을 등록합니다.
- 운영 API Origin을 Preview 변수로 복사하지 않습니다.

## 7. Rewrite 구조

`apps/web/next.config.ts`는 다음 공개 경로만 전달합니다.

```text
/api/:path* → ${VPS_API_ORIGIN}/api/:path*
```

따라서 브라우저 주소에는 홈페이지 Origin만 보입니다. `/internal/*`, `/bot/*`, `/iris/*`, `/database/*`, `/redis/*` Rewrite는 없습니다. 외부 Rewrite 캐싱을 활성화하는 Vercel 헤더도 추가하지 않습니다.

## 8. Production 도메인과 VPS API 도메인

초기 홈페이지:

```text
https://<project>.vercel.app
```

최종 홈페이지 예:

```text
https://game.example.com
```

VPS 공개 API 예:

```text
https://api.example.com
```

코드에는 실제 도메인을 하드코딩하지 않습니다.

## 9. VPS API 요구사항

VPS 리버스 프록시는 다음 정책을 사용합니다.

- TCP 443 HTTPS만 공개
- `/api/*`만 NestJS `127.0.0.1:3001`로 전달
- `/internal/*` 외부 차단
- 포트 3001, 봇 포트 5000 직접 공개 금지
- PostgreSQL 5432, Redis 6379 공개 금지
- `/health` 공개 여부는 운영 정책으로 결정

VPS NestJS 비민감 환경 예시는 다음과 같습니다.

```env
NODE_ENV=production
API_HOST=127.0.0.1
API_PORT=3001
WEB_BASE_URL=https://game.example.com
CORS_ORIGINS=https://game.example.com
WEB_AUTH_ENABLED=true
PORTAL_ENABLED=true
BOT_INTERNAL_API_URL=http://127.0.0.1:5000
```

비밀값은 VPS 비밀 저장소에 별도로 설정하고 문서나 Git에 기록하지 않습니다. API 설정 변경 후 NestJS 서비스를 재시작합니다.

## 10. 쿠키 확인

현재 세션 쿠키 구현 조건:

- `HttpOnly=true`
- Production에서 `Secure=true`
- `SameSite=Lax`
- `Path=/`
- Domain 미지정
- `Max-Age`는 세션 만료시각과 연동

Production URL에서 다음 순서로 확인합니다.

1. `/connect`에서 인증 요청을 생성합니다.
2. 카카오톡 `/웹인증 사용자코드`로 승인합니다.
3. `/api/auth/device/complete` 응답에 `Set-Cookie`가 있는지 확인합니다.
4. 쿠키가 API 도메인이 아닌 홈페이지 도메인에 저장되는지 확인합니다.
5. 새로고침 후 `/api/auth/me`가 인증 상태를 유지하는지 확인합니다.
6. `/api/auth/logout`이 같은 쿠키 이름과 `Path=/`로 삭제하는지 확인합니다.
7. 카카오톡 인앱 브라우저에서도 같은 절차를 확인합니다.

개인 API Rewrite에 CDN 캐시 활성화 헤더를 추가하지 않습니다. `/api/portal/dashboard`의 VPS 응답은 `Cache-Control: private, no-store`를 유지합니다.

## 11. 카카오톡 웹 인증 확인

봇 VPS 환경변수의 공개 홈페이지 주소를 Production URL과 일치시킵니다.

```env
WEB_AUTH_PUBLIC_BASE_URL=https://game.example.com
```

초기 시험에는 `https://<project>.vercel.app`을 사용할 수 있습니다. 변경 후 봇 서비스를 재시작하고 `/웹인증` 안내 링크를 다시 확인합니다.

## 12. 캐릭터 이미지 확인

Production에서 다음 경로가 HTTP 200인지 확인합니다.

```text
/assets/rpg-world-main.webp
/assets/rpg-world.webp
/assets/characters/warrior-male.png
/assets/characters/warrior-female.png
/assets/characters/archer-male.png
/assets/characters/archer-female.png
/assets/characters/mage-male.png
/assets/characters/mage-female.png
```

Linux는 파일명 대소문자를 구분합니다. 소스의 URL과 `public/assets` 실제 이름이 정확히 일치해야 합니다.

## 13. 로컬 Rewrite 확인

운영 `.env`를 수정하지 않고 현재 PowerShell 프로세스에만 개발값을 지정합니다.

```powershell
cd C:\iris_homepage
$env:NODE_ENV='development'
$env:VPS_API_ORIGIN='http://127.0.0.1:3001'
pnpm.cmd --filter @natebe/web dev -- --port 3100
```

별도 PowerShell에서 확인합니다.

```powershell
Invoke-WebRequest http://localhost:3100/api/auth/me -UseBasicParsing
Invoke-WebRequest http://localhost:3100/api/portal/dashboard -UseBasicParsing
Invoke-WebRequest http://localhost:3100/internal/auth/device/approve -UseBasicParsing
```

앞의 두 요청은 VPS API 응답을 받아야 합니다. `/internal/...`은 Next.js 404여야 하며 VPS로 전달되면 안 됩니다. 실제 세션 쿠키 왕복은 웹 인증이 활성화된 격리 또는 운영 사전 환경에서 확인합니다.

## 14. 빌드 확인

프로젝트 루트에서 실행합니다.

```powershell
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd test
pnpm.cmd test:e2e
pnpm.cmd --filter @natebe/web build
```

Root Directory가 `apps/web`이어도 루트 lockfile과 workspace 정의를 사용하도록 외부 소스 포함 옵션을 유지합니다.

## 15. 배포 후 점검표

- `/`, `/connect`, 모바일 메뉴
- 메인 이미지와 캐릭터 이미지 6종
- `/api/auth/device/start`, poll, complete, cancel
- HttpOnly Secure 쿠키 발급과 새로고침 유지
- `/api/auth/me`, `/api/portal/dashboard`
- 실제 직업·레벨·골드·가방·장비·출석
- 일일 보스·주간 보스·레이드·탑·왕궁·칭호
- 로그아웃 후 개인 데이터 숨김
- `/internal/*` 외부 차단
- 개인 응답 `private, no-store`
- 브라우저 콘솔 오류 없음
- 카카오톡 인앱 브라우저
- 390px 화면 가로 넘침 없음

## 16. 사용자 정의 도메인 전환

1. Vercel Dashboard의 **Settings → Domains**에서 `game.example.com`을 추가합니다.
2. 안내된 DNS 레코드를 DNS 공급자에 설정합니다.
3. 인증서 발급과 Production Domain 연결 완료를 확인합니다.
4. VPS의 `WEB_BASE_URL`, `CORS_ORIGINS`를 새 도메인으로 변경합니다.
5. 봇의 `WEB_AUTH_PUBLIC_BASE_URL`을 새 도메인으로 변경합니다.
6. VPS API와 봇 서비스를 재시작합니다.
7. Vercel 환경변수를 변경했다면 Redeploy합니다.
8. 새 도메인에서 쿠키를 새로 발급합니다. 이전 도메인 쿠키는 자동 이전되지 않습니다.
9. `/웹인증` 링크와 모바일 인앱 브라우저를 다시 확인합니다.

## 17. 장애와 롤백

Vercel 빌드 실패 시 Dashboard의 Deployments에서 이전 정상 Production Deployment를 Promote하거나 Rollback합니다. VPS API와 DB는 변경하지 않습니다.

Rewrite 장애 시 `VPS_API_ORIGIN`, VPS 인증서, `/api/*` 공개 설정을 확인하고 환경변수 변경 후 Redeploy합니다. `/internal/*` 차단은 유지합니다.

코드 설정을 되돌릴 때는 서버를 중지하고 `before-vercel-deployment-*` 백업에서 `.gitignore`, `.env.example`, `README.md`, `apps/web/next.config.ts`를 개별 복원한 뒤 `pnpm.cmd typecheck`와 `pnpm.cmd build`를 실행합니다. 이번 작업은 DB 변경이 없으므로 DB 롤백은 필요하지 않습니다.
