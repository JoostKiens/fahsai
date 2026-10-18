const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

// The tests delete rows from real tables, so never let them run against anything but a local stack.
export default function setup() {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('SUPABASE_URL is not set. Run `pnpm test:integration` from the repo root.');
  }
  const { hostname } = new URL(url);
  if (!LOCAL_HOSTS.includes(hostname)) {
    throw new Error(
      `Refusing to run integration tests against ${hostname}: they delete data. Use the local Supabase.`,
    );
  }
}
