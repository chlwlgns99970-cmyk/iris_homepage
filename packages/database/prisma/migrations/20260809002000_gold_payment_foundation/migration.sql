CREATE TYPE "PaymentOrderStatus" AS ENUM (
  'PENDING',
  'PAID',
  'FULFILLING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'REFUNDED'
);

CREATE TABLE "payment_orders" (
  "id" TEXT NOT NULL,
  "orderId" VARCHAR(64) NOT NULL,
  "webAccountId" TEXT NOT NULL,
  "productId" VARCHAR(30) NOT NULL,
  "priceKrw" INTEGER NOT NULL,
  "goldAmount" INTEGER NOT NULL,
  "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
  "provider" VARCHAR(30) NOT NULL,
  "providerPaymentKey" VARCHAR(191),
  "idempotencyKeyHash" VARCHAR(64),
  "goldBalanceAfter" BIGINT,
  "failureCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "fulfillmentStartedAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),

  CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_orders_orderId_key" ON "payment_orders"("orderId");
CREATE UNIQUE INDEX "payment_orders_providerPaymentKey_key" ON "payment_orders"("providerPaymentKey");
CREATE UNIQUE INDEX "payment_orders_idempotencyKeyHash_key" ON "payment_orders"("idempotencyKeyHash");
CREATE INDEX "payment_orders_webAccountId_createdAt_idx" ON "payment_orders"("webAccountId", "createdAt");
CREATE INDEX "payment_orders_status_createdAt_idx" ON "payment_orders"("status", "createdAt");

ALTER TABLE "payment_orders"
  ADD CONSTRAINT "payment_orders_webAccountId_fkey"
  FOREIGN KEY ("webAccountId") REFERENCES "web_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
