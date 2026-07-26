CREATE TYPE "WebLoginRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'CONSUMED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "web_login_requests" (
    "id" TEXT NOT NULL,
    "userCodeHash" TEXT NOT NULL,
    "deviceSecretHash" TEXT NOT NULL,
    "status" "WebLoginRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBotUid" VARCHAR(8),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "web_login_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "web_sessions" (
    "id" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "webAccountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    CONSTRAINT "web_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "web_login_requests_userCodeHash_key" ON "web_login_requests"("userCodeHash");
CREATE UNIQUE INDEX "web_login_requests_deviceSecretHash_key" ON "web_login_requests"("deviceSecretHash");
CREATE INDEX "web_login_requests_expiresAt_idx" ON "web_login_requests"("expiresAt");
CREATE INDEX "web_login_requests_approvedBotUid_idx" ON "web_login_requests"("approvedBotUid");
CREATE INDEX "web_login_requests_status_idx" ON "web_login_requests"("status");
CREATE UNIQUE INDEX "web_sessions_sessionHash_key" ON "web_sessions"("sessionHash");
CREATE INDEX "web_sessions_webAccountId_idx" ON "web_sessions"("webAccountId");
CREATE INDEX "web_sessions_expiresAt_idx" ON "web_sessions"("expiresAt");
CREATE INDEX "web_sessions_revokedAt_idx" ON "web_sessions"("revokedAt");

ALTER TABLE "web_sessions"
ADD CONSTRAINT "web_sessions_webAccountId_fkey"
FOREIGN KEY ("webAccountId") REFERENCES "web_accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
