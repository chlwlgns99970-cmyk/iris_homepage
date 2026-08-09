import type { PaymentStorefront } from '@/lib/api';

const GOLD_PER_KRW = 2_000;
const previewPricesKrw = [1_000, 3_000, 5_000, 10_000, 30_000, 50_000] as const;

const disabledPreviewStorefront: PaymentStorefront = {
  enabled: false,
  provider: 'disabled',
  sandbox: false,
  fulfillmentEnabled: false,
  rate: { krw: 1, gold: GOLD_PER_KRW },
  products: previewPricesKrw.map((priceKrw) => ({
    id: `GOLD_${priceKrw}` as PaymentStorefront['products'][number]['id'],
    name: `${(priceKrw * GOLD_PER_KRW).toLocaleString('en-US')} 골드`,
    priceKrw,
    goldAmount: priceKrw * GOLD_PER_KRW,
  })),
};

export function GET() {
  return Response.json(disabledPreviewStorefront, {
    headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' },
  });
}
