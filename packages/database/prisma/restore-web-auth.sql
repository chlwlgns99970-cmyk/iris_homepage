-- Run OFFLINE, only against a restored authentication DB, before making it reachable.
-- A backup cannot prove which sessions were revoked after it was captured.
-- Preserve UID mappings and history; require fresh Iris approval for every restored session.
BEGIN;
UPDATE "web_sessions" SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP);
UPDATE "web_login_requests"
SET "status" = 'CANCELLED', "cancelledAt" = COALESCE("cancelledAt", CURRENT_TIMESTAMP)
WHERE "status" IN ('PENDING', 'APPROVED');
COMMIT;
