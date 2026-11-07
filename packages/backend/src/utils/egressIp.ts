import { describeFetchError } from './fetchError.js';

const EGRESS_IP_URL = 'https://api.ipify.org';
const EGRESS_IP_TIMEOUT_MS = 5_000;

// Open-Meteo limits calls per IP. The IP a run leaves from shows whether it changes between
// runs or is shared with other Railway customers (JOO-135). Never throws: a failed lookup
// must not stop an ingest.
export async function logEgressIp(): Promise<void> {
  try {
    const res = await fetch(EGRESS_IP_URL, { signal: AbortSignal.timeout(EGRESS_IP_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`[egress-ip] ${(await res.text()).trim()}`);
  } catch (err) {
    const cause = describeFetchError(err);
    console.warn(
      `[egress-ip] lookup failed: ${err instanceof Error ? err.message : String(err)}${cause ? ` (${cause})` : ''}`,
    );
  }
}
