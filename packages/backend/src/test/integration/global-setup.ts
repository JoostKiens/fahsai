// Keep in sync with [api] port in supabase/config.toml. Not just "any localhost": other local
// Supabase stacks (e.g. a demo copy of this schema) are often running next to this one.
const LOCAL_API_ORIGIN = 'http://127.0.0.1:54421';

// The tests delete rows from real tables, so never let them run against anything but the stack
// started by scripts/test-integration.sh.
export function setup() {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('SUPABASE_URL is not set. Run `pnpm test:integration` from the repo root.');
  }
  if (new URL(url).origin !== LOCAL_API_ORIGIN) {
    throw new Error(
      `Refusing to run integration tests against ${url}: they delete data. Expected ${LOCAL_API_ORIGIN}, the stack from scripts/test-integration.sh.`,
    );
  }
}
