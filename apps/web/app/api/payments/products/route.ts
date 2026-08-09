import type { PaymentStorefront } from '@/lib/api';

const disabledPreviewStorefront: PaymentStorefront = {
  enabled: false,
  provider: 'disabled',
  sandbox: false,
  fulfillmentEnabled: false,
  policy: {
    minPaymentKrw: 100,
    maxPaymentKrw: 50_000,
    paymentStepKrw: 100,
    goldPerKrw: 2_000,
  },
};

export function GET() {
  return Response.json(disabledPreviewStorefront, {
    headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' },
  });
}
