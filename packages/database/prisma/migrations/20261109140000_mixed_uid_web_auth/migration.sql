-- Widen only; retain existing approvals, sessions, account mappings and revocations.
ALTER TABLE "web_login_requests" ALTER COLUMN "approvedBotUid" TYPE VARCHAR(9);

-- Phone profile: hashed request counters in the existing PostgreSQL database.
CREATE TABLE "web_rate_limits" (
  "key" VARCHAR(160) PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "web_rate_limits_expiresAt_idx" ON "web_rate_limits"("expiresAt");
