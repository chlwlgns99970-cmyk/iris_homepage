# 나테베 친목 RPG 홈페이지 — 풀스택 전환 1단계

Vercel에는 `apps/web`만 배포하며, VPS NestJS API와 같은 출처 `/api/*` Rewrite로 연결합니다. 실제 Production 배포 및 VPS 후속 설정은 [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md)를 따릅니다.

Next.js 웹은 공지·랭킹·UID 연결 화면을 제공하고 NestJS API만 호출합니다. PostgreSQL은 현재 공지 API와 향후 계정·감사 데이터를 위해 사용하며, Redis는 상태 확인과 향후 일회용 토큰·요청 제한을 위한 연결 기반입니다. 기존 사용자 데이터와 Iris 봇 데이터는 이 저장소의 디자인·보안 보완 작업에서 변경하지 않습니다.

현재 랭킹과 UID 연결은 Iris Provider 미구성 오류를 반환하고, 관리자 쓰기 API는 인증 오류로 차단됩니다. 실제 결제, 상품 판매 및 아이템 지급은 비활성화 상태이며 개발용 가짜 운영 데이터도 자동 생성하지 않습니다.

2단계 웹 인증은 `/connect`에서 브라우저 전용 비밀값과 공개 사용자 코드를 생성하고, 연결된 카카오톡 사용자가 `/웹인증 사용자코드`로 승인한 뒤 명시적으로 완료해야 세션 쿠키를 발급하는 디바이스 인증 방식입니다. 일반 홈페이지 링크만으로는 로그인되지 않습니다.

원본 `index.html`, `styles.css`, `app.js`를 제공받았으며, 해당 원본의 보라·분홍 게임 포털 디자인을 기준으로 Next.js 화면을 복원했습니다. 원본에 포함됐던 하드코딩 공지·랭킹·레이드 수치는 운영 데이터로 사용하지 않습니다.

## Windows PowerShell 실행

1. Node.js 20 이상을 확인합니다.

```powershell
node --version
```

2. `pnpm.cmd`를 확인합니다.

```powershell
pnpm.cmd --version
```

3. 환경변수 예시를 복사합니다. 운영에서는 비밀번호와 비밀값을 반드시 교체합니다.

```powershell
Copy-Item .env.example .env
```

4. Docker Desktop을 실행하고 상태를 확인합니다.

```powershell
docker version
```

5. PostgreSQL과 Redis를 시작합니다.

```powershell
docker compose up -d
docker compose ps
```

6. 의존성을 설치합니다.

```powershell
pnpm.cmd install
```

7. Prisma Client를 생성합니다.

```powershell
pnpm.cmd db:generate
```

8. 운영 DB 백업을 먼저 확인한 뒤 추가형 마이그레이션을 적용합니다.

```powershell
pnpm.cmd db:migrate
```

9. 웹과 API를 함께 실행합니다.

```powershell
pnpm.cmd dev
```

10. 브라우저에서 `http://localhost:3000`에 접속합니다.

11. API 상태를 확인합니다.

```powershell
Invoke-RestMethod http://localhost:3001/health
```

개별 실행은 `pnpm.cmd dev:web`과 `pnpm.cmd dev:api`를 사용합니다. 검사 명령은 `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd test:e2e`, `pnpm.cmd build`입니다.

## API 서버 바인딩

- Windows 로컬 개발은 `API_HOST=127.0.0.1`, `API_PORT=3001`을 사용합니다. `API_HOST`가 없을 때도 개발환경에 한해 loopback 주소를 기본값으로 사용합니다.
- 현재 Docker Compose는 PostgreSQL과 Redis만 실행하며 API 컨테이너는 실행하지 않습니다. 향후 API를 컨테이너에서 실행할 때만 컨테이너 환경에 `API_HOST=0.0.0.0`을 명시하고, 호스트 포트 공개 범위는 별도로 제한해야 합니다.
- 운영에서는 배포 프록시 구조에 맞는 `API_HOST`를 반드시 명시합니다. 같은 서버의 리버스 프록시만 접근한다면 `127.0.0.1`, 컨테이너 네트워크에서 접근해야 한다면 해당 컨테이너의 명시적인 바인딩 주소를 사용합니다.
- 운영·테스트 등 개발 이외 환경에서 `API_HOST`가 없으면 API 시작을 차단합니다.
- `API_PORT`는 1~65535 범위의 정수만 허용하며 잘못된 값이면 API 시작을 차단합니다.

## API

- `GET /health`: PostgreSQL·Redis 실제 연결 상태
- `GET /api/notices?page=1&limit=10`: 공개 공지 목록(최대 50개)
- `GET /api/notices/:id`: 공개 공지 상세
- `GET /api/rankings?type=power|level|raid|tower`: 현재는 명시적인 미구성 오류
- `POST /api/auth/link/consume`: 현재는 명시적인 Iris 미구성 오류
- `/api/admin/notices`: POST/PATCH/DELETE 모두 인증 모듈 추가 전까지 차단

공지 본문은 React 텍스트 렌더링만 사용하며 HTML로 삽입하지 않습니다. Prisma의 매개변수화된 질의를 사용하고, DTO 검증·요청 필드 화이트리스트·Helmet·환경변수 기반 CORS를 적용합니다. 비밀키와 토큰 원문은 응답이나 로그에 출력하지 않습니다. 500번대 오류 로그에는 검증된 requestId와 쿼리 문자열을 제거한 pathname만 기록하며, 스택은 서버 로그에만 남고 사용자 응답에는 노출되지 않습니다.

## 운영 웹/API 주소와 세션 쿠키

- 개발환경에서 `NEXT_PUBLIC_API_BASE_URL`이 없으면 `http://localhost:3001`을 사용합니다.
- 운영환경에서 `NEXT_PUBLIC_API_BASE_URL`을 지정하면 해당 API 주소를 사용합니다.
- 운영환경에서 값이 비어 있으면 브라우저의 현재 Origin에 대한 `/api/...` 상대 경로를 사용합니다. 리버스 프록시가 같은 Origin에서 API 경로를 전달하도록 구성해야 합니다.
- 명시한 값은 `http://`, `https://` URL 또는 `/backend` 같은 단일 슬래시 상대 기준 경로여야 합니다. `javascript:`, `data:`, `//example.com`, 공백 및 잘못된 URL은 빌드 또는 시작 시 거부합니다.
- 운영환경에서 누락된 설정이 사용자 PC의 `localhost:3001`로 조용히 연결되지는 않습니다.
- 모든 웹 API 요청은 향후 보안 세션 쿠키를 위해 `credentials: include`를 사용합니다.
- `CORS_ORIGINS`에는 `https://example.com`과 같은 정확한 웹 Origin만 입력합니다. 경로와 `*` 와일드카드는 허용되지 않습니다.
- 운영환경에서 `CORS_ORIGINS`가 비어 있으면 API는 시작 단계에서 실패합니다.
- 서로 다른 사이트 간 쿠키를 사용할 경우 향후 세션 구현에서 `Secure`, `HttpOnly`, 적절한 `SameSite` 속성을 반드시 설정해야 합니다.
- 웹 인증을 활성화하려면 `WEB_AUTH_ENABLED=true`와 서로 다른 32자 이상의 `WEB_AUTH_INTERNAL_TOKEN`, `TOKEN_HASH_SECRET`, `SESSION_SECRET`을 설정합니다. 실제 비밀값은 README에 기록하지 않습니다.
- 세션 쿠키는 기본 `natebe_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`이며 운영환경에서는 `Secure`가 적용됩니다.
- 운영 리버스 프록시는 `/internal` 경로를 외부 인터넷에 전달하지 않아야 합니다.

## 데이터와 마이그레이션

초기 마이그레이션은 `notices`, `admins`, `account_link_tokens`, `web_accounts`, `audit_logs`를 추가합니다. 골드 결제 1차 마이그레이션은 기존 테이블과 데이터를 삭제하지 않고 `payment_orders`와 `PaymentOrderStatus` enum만 추가합니다. UID는 `web_accounts.botUid`에 그대로 보관하며 새 UID 발급 또는 변환 로직은 없습니다. 토큰은 원문이 아닌 해시만 저장합니다.

운영 적용 전에는 반드시 PostgreSQL 네이티브 백업을 만드세요. 이번 마이그레이션은 새 테이블/enum 추가뿐이므로 롤백이 꼭 필요하면 서버를 중지하고 마이그레이션 전 DB 백업을 복원하는 것이 안전합니다. 운영에서 수동 `DROP`으로 되돌리지 마세요.

## 운영 주의사항

- 환경변수 예시 파일의 실제 위치는 `C:\iris_homepage\.env.example`입니다. 이를 `.env`로 복사한 뒤 실제 비밀번호와 비밀값을 별도로 설정하며, 비밀값을 README나 Git에 기록하지 않습니다.
- `.env`를 커밋하거나 외부에 노출하지 않습니다.
- `CORS_ORIGINS`에는 허용할 웹 출처만 쉼표로 구분해 설정합니다.
- `docker compose down`은 named volume을 보존하지만 `docker compose down -v`는 PostgreSQL과 Redis 볼륨을 삭제하므로 사용하지 마세요.
- Redis에는 향후 임시 상태만 저장하고 결제·주문·지급의 최종 상태는 PostgreSQL에 저장해야 합니다.
- 클라이언트 금액을 신뢰하지 않고, 가격 조회·주문번호 생성·결제 승인은 서버가 맡아야 합니다. 승인과 지급 상태를 분리하고 주문번호·결제키 중복 및 중복 지급을 차단하며 지급 재처리를 지원해야 합니다.
- 골드 상점은 `/shop`, 본인 주문 내역은 `/payment/history`, 결과 화면은 `/payment/success`와 `/payment/fail`입니다.
- 결제 공급자는 기본 `PAYMENT_PROVIDER=disabled`이며 실제 결제와 지급은 활성화하지 않았습니다. `mock` provider는 `NODE_ENV=test`에서만 허용되고 운영에서 설정하면 API가 시작을 거부합니다.
- 서버 상품 정의만 가격의 단일 소스로 사용하며 공식 환율은 `1 KRW = 2,000 GOLD`입니다. 브라우저가 보낸 `price`, `amount`, `gold`, `quantity`는 ValidationPipe에서 거부됩니다.
- 실제 PG 승인과 주문 금액 검증 전에는 봇 지급 API를 호출하지 않습니다. 지급 내부 API와 토큰은 포털 조회 API와 분리하고 루프백 주소만 허용합니다.
- Iris URL/토큰이 없으므로 가상의 API나 함수로 연결하지 않았습니다.
- 자동 seed가 없으므로 예시 데이터가 운영 공지나 랭킹으로 노출되지 않습니다.

## 확인된 백업

다음 폴더는 `C:\iris_homepage\backups`에서 실제 존재를 확인했습니다.

- 풀스택 전환 전 기록: `before-fullstack-phase1-20260720-235225` (`BACKUP-MANIFEST.md`)
- 원본 디자인 복원 전 백업: `before-original-design-restore-20260725-031845`
- API 오류 메시지 수정 전 백업: `before-api-error-message-20260725-031125`
- 운영 인증 보완 전 백업: `before-production-auth-hardening-20260725-131631`
- 최종 보안 수정 전 백업: `before-final-security-fix-20260725-134051`
- README 최종 수정 전 백업: `before-readme-final-fix-20260725-140002`
- RPG 대시보드 적용 전 백업: `before-rpg-dashboard-design-20260725-201528`
- E2E 종료 처리 수정 전 백업: `before-e2e-shutdown-fix-20260725-205034`

백업 파일은 이동하거나 삭제하지 않습니다.

## 롤백

롤백 전에 개발 서버에서 `Ctrl+C`를 눌러 웹과 API를 중지합니다. PostgreSQL과 Redis도 중지해야 한다면 볼륨을 보존하는 다음 명령만 사용합니다.

```powershell
docker compose down
```

### A. 웹 디자인 복원 롤백

원본 디자인 복원 단계만 되돌릴 때 다음 두 파일을 실제 백업 구조에서 복원합니다. 해당 단계에서 API 클라이언트를 되돌릴 필요가 없다면 `api.ts`는 복원하지 않습니다.

```powershell
Copy-Item 'C:\iris_homepage\backups\before-original-design-restore-20260725-031845\page.tsx' 'C:\iris_homepage\apps\web\app\page.tsx' -Force
Copy-Item 'C:\iris_homepage\backups\before-original-design-restore-20260725-031845\globals.css' 'C:\iris_homepage\apps\web\app\globals.css' -Force
pnpm.cmd typecheck
pnpm.cmd build
pnpm.cmd dev
```

### B. 최종 보안 수정 롤백

최종 보안 수정 단계에서 변경한 기존 파일을 개별 복원합니다.

```powershell
Copy-Item 'C:\iris_homepage\backups\before-final-security-fix-20260725-134051\.env.example' 'C:\iris_homepage\.env.example' -Force
Copy-Item 'C:\iris_homepage\backups\before-final-security-fix-20260725-134051\README.md' 'C:\iris_homepage\README.md' -Force
Copy-Item 'C:\iris_homepage\backups\before-final-security-fix-20260725-134051\apps\api\src\main.ts' 'C:\iris_homepage\apps\api\src\main.ts' -Force
Copy-Item 'C:\iris_homepage\backups\before-final-security-fix-20260725-134051\apps\api\src\common\api-exception.filter.ts' 'C:\iris_homepage\apps\api\src\common\api-exception.filter.ts' -Force
Copy-Item 'C:\iris_homepage\backups\before-final-security-fix-20260725-134051\apps\api\src\common\api-exception.filter.spec.ts' 'C:\iris_homepage\apps\api\src\common\api-exception.filter.spec.ts' -Force
Copy-Item 'C:\iris_homepage\backups\before-final-security-fix-20260725-134051\apps\api\src\common\web-api-client.spec.ts' 'C:\iris_homepage\apps\api\src\common\web-api-client.spec.ts' -Force
Copy-Item 'C:\iris_homepage\backups\before-final-security-fix-20260725-134051\apps\web\app\page.tsx' 'C:\iris_homepage\apps\web\app\page.tsx' -Force
Copy-Item 'C:\iris_homepage\backups\before-final-security-fix-20260725-134051\apps\web\lib\api.ts' 'C:\iris_homepage\apps\web\lib\api.ts' -Force
Copy-Item 'C:\iris_homepage\backups\before-final-security-fix-20260725-134051\apps\web\lib\ranking.ts' 'C:\iris_homepage\apps\web\lib\ranking.ts' -Force
Remove-Item 'C:\iris_homepage\apps\api\src\common\server-config.ts'
Remove-Item 'C:\iris_homepage\apps\api\src\common\server-config.spec.ts'
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
```

### C. DB 롤백

원본 디자인 복원, 운영 인증 보완 및 최종 보안 수정은 DB·Prisma·마이그레이션·Docker Compose를 변경하지 않았습니다. 이 작업들만 되돌릴 때 PostgreSQL 백업 복원은 필요하지 않습니다.

DB 마이그레이션 자체를 되돌려야 할 때만 마이그레이션 전에 별도로 생성한 PostgreSQL 네이티브 백업을 사용합니다. 운영 DB에서 수동 `DROP`을 실행하지 마세요. `docker compose down -v`는 PostgreSQL과 Redis 볼륨을 삭제하므로 사용하지 마세요.

### D. RPG 대시보드 및 E2E 종료 수정 롤백

RPG 대시보드 적용 전에는 `apps\web\public` 폴더가 존재하지 않았습니다. 다른 작업이 같은 폴더에 파일을 추가했을 수 있으므로 `assets` 폴더 전체를 삭제하지 말고, 이번 단계에서 추가한 다음 13개 파일만 확인 후 개별 처리합니다.

```powershell
$dashboardAssets = @(
  'basic-archer-profile.webp',
  'basic-archer.webp',
  'basic-mage-profile.webp',
  'basic-mage.webp',
  'basic-warrior-profile.webp',
  'basic-warrior.webp',
  'level100.webp',
  'palace.webp',
  'premium-original.webp',
  'premium-profile.webp',
  'rebirth.webp',
  'rpg-world-main.webp',
  'rpg-world.webp'
)

foreach ($asset in $dashboardAssets) {
  $assetPath = Join-Path 'C:\iris_homepage\apps\web\public\assets' $asset
  if (Test-Path -LiteralPath $assetPath) {
    Remove-Item -LiteralPath $assetPath
  }
}
```

E2E 종료 수정만 되돌릴 때는 서버를 중지한 뒤 기존 파일을 백업에서 복원하고, 이 단계에서 추가된 환경 초기화 파일만 제거합니다.

```powershell
Copy-Item -LiteralPath 'C:\iris_homepage\backups\before-e2e-shutdown-fix-20260725-205034\apps\api\test\app.e2e-spec.ts' -Destination 'C:\iris_homepage\apps\api\test\app.e2e-spec.ts' -Force
Copy-Item -LiteralPath 'C:\iris_homepage\backups\before-e2e-shutdown-fix-20260725-205034\apps\api\test\jest-e2e.json' -Destination 'C:\iris_homepage\apps\api\test\jest-e2e.json' -Force
Remove-Item -LiteralPath 'C:\iris_homepage\apps\api\test\e2e-env.ts'
pnpm.cmd typecheck
pnpm.cmd test:e2e
```

이 롤백에는 DB 복원이나 Docker 볼륨 삭제가 필요하지 않습니다.

## 디렉터리

```text
apps/web           Next.js App Router 웹
apps/api           NestJS API와 e2e 테스트
packages/database  Prisma 스키마와 추가형 마이그레이션
packages/shared    공유 API 형식
backups             수정 전 상태 기록
```

## 골드 결제 1차 기반

운영 결제는 비활성입니다. 실제 PG사와 공개 client key, 서버 secret, 승인·취소 API 계약이 확정된 뒤 `PaymentProvider` adapter만 추가합니다. PG secret, RPG 지급 토큰, DB 비밀번호는 `NEXT_PUBLIC_*`에 넣지 않습니다.

```env
PAYMENT_PROVIDER=disabled
PAYMENT_FULFILLMENT_ENABLED=false
RPG_PAYMENT_INTERNAL_API_URL=http://127.0.0.1:5000
RPG_PAYMENT_INTERNAL_API_TOKEN=
RPG_PAYMENT_INTERNAL_API_TIMEOUT_MS=5000
```

주문 상태는 `pending → paid → fulfilling → completed` 순서입니다. `orderId`, `providerPaymentKey`, `idempotencyKeyHash`가 각각 unique이며, 동일 주문 지급은 봇의 `payment.gold_fulfillment` operation ID로 다시 차단합니다. 지급 오류는 `fulfilling` 상태와 실패 코드로 남기고 `completed`로 바꾸지 않습니다. 환불은 자동화하지 않았으며 지급 여부와 골드 사용 여부, PG 취소 가능 여부를 운영자가 확인한 뒤 별도 승인 절차로 처리해야 합니다.
# 로그인 사용자 RPG 대시보드

`GET /api/portal/dashboard`는 기존 HttpOnly 세션을 검증한 뒤 세션에 연결된 UID만
봇의 읽기 전용 내부 API로 전달합니다. 브라우저가 UID를 지정할 수 없으며, 성공 응답만
짧게 캐시되고 브라우저 응답에는 `Cache-Control: private, no-store`가 적용됩니다.

```env
PORTAL_ENABLED=false
BOT_INTERNAL_API_URL=
BOT_INTERNAL_API_TOKEN=
PORTAL_REQUEST_TIMEOUT_MS=3000
PORTAL_MAX_RESPONSE_BYTES=524288
PORTAL_CACHE_TTL_MS=3000
```

봇과 홈페이지 양쪽의 `BOT_INTERNAL_API_TOKEN`에는 동일한 32자 이상 전용 비밀값을
설정하되 세션, 웹 인증, 데이터 서명 또는 운영 제어 토큰을 재사용하지 않습니다.
기본값은 비활성화이며 실제 결제와 RPG 쓰기 기능은 포함하지 않습니다.
