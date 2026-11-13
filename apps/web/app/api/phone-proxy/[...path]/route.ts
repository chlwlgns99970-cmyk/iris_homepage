import { forwardPhoneRequest } from '@/lib/phone-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function proxy(request: Request, context: {params: Promise<{path: string[]}>}) {
  const {path} = await context.params;
  return forwardPhoneRequest(request, '/api/' + path.join('/'));
}

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
