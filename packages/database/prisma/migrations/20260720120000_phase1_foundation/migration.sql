-- Additive phase-1 migration. Back up the target database before applying.
CREATE TYPE "NoticeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'SUPER_ADMIN');
CREATE TYPE "WebAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TABLE "admins" ("id" TEXT PRIMARY KEY, "loginId" VARCHAR(100) NOT NULL UNIQUE, "passwordHash" TEXT, "role" "AdminRole" NOT NULL DEFAULT 'ADMIN', "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "notices" ("id" TEXT PRIMARY KEY, "type" VARCHAR(30) NOT NULL, "title" VARCHAR(120) NOT NULL, "summary" VARCHAR(240) NOT NULL, "content" TEXT NOT NULL, "status" "NoticeStatus" NOT NULL DEFAULT 'DRAFT', "publishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "createdByAdminId" TEXT REFERENCES "admins"("id") ON DELETE SET NULL);
CREATE TABLE "account_link_tokens" ("id" TEXT PRIMARY KEY, "tokenHash" TEXT NOT NULL UNIQUE, "botUid" VARCHAR(64) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "web_accounts" ("id" TEXT PRIMARY KEY, "botUid" VARCHAR(64) NOT NULL UNIQUE, "status" "WebAccountStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "lastLoginAt" TIMESTAMP(3));
CREATE TABLE "audit_logs" ("id" TEXT PRIMARY KEY, "actorType" VARCHAR(30) NOT NULL, "actorId" TEXT, "action" VARCHAR(100) NOT NULL, "targetType" VARCHAR(50) NOT NULL, "targetId" TEXT, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "notices_status_publishedAt_idx" ON "notices"("status", "publishedAt");
CREATE INDEX "account_link_tokens_botUid_idx" ON "account_link_tokens"("botUid");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
