// fetch() rejects with TypeError('fetch failed') and puts the real failure in `cause`.
// With IPv4+IPv6 (happy eyeballs) that cause is an AggregateError holding one error per
// address tried. Each inner message names its address, e.g. "connect ETIMEDOUT 1.2.3.4:443"
// or undici's "Connect Timeout Error (attempted address: 1.2.3.4:443, timeout: 10000ms)".
// Never throws: callers use it inside catch blocks and retry handlers.
export function describeFetchError(err: unknown): string | undefined {
  const cause = err instanceof Error ? err.cause : undefined;
  if (!(cause instanceof Error)) return undefined;
  const inner: unknown[] = cause instanceof AggregateError ? cause.errors : [cause];
  return inner
    .map((e) => {
      if (!(e instanceof Error)) return String(e);
      return e.message || ((e as { code?: string }).code ?? e.name);
    })
    .join('; ');
}
