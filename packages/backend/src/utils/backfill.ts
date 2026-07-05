export async function forEachPage<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number,
  onPage: (page: T[]) => void,
): Promise<void> {
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    onPage(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
}

export async function fetchAllPages<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number,
): Promise<T[]> {
  const all: T[] = [];
  await forEachPage(buildQuery, pageSize, (page) => all.push(...page));
  return all;
}

export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export function parseDateFlag(flag: string, label: string): string {
  const val = process.argv.find((a) => a.startsWith(`--${flag}=`))?.slice(flag.length + 3);
  if (!val) {
    console.error(`${label} --${flag} is required (YYYY-MM-DD)`);
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    console.error(`${label} --${flag}: invalid format "${val}" — expected YYYY-MM-DD`);
    process.exit(1);
  }
  return val;
}
