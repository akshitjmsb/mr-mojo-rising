import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LegacySearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const entries = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }

  redirect(query.size > 0 ? `/?${query.toString()}` : "/");
}
