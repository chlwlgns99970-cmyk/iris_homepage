import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LegacyShopRedirect({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (typeof value === 'string') params.set(key, value);
  }
  const query = params.toString();
  redirect(`/membership${query ? `?${query}` : ''}`);
}
