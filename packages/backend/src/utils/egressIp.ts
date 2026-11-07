import { describeFetchError } from './fetchError.js';

const EGRESS_IP_URL = 'https://api.ipify.org';
const EGRESS_IP_TIMEOUT_MS = 5_000;
// IPv4 or IPv6 text. Anything else (an HTML error page with status 200) is not logged as an address.
const IP_ADDRESS = /^[0-9a-f:.]{3,45}$/i;

// Open-Meteo limits calls per IP. The IP a run leaves from shows whether it changes between
// runs or is shared with other Railway customers (JOO-135). Never throws: a failed lookup
// must not stop an ingest.
export async function logEgressIp(): Promise<void> {
  try {
    const res = await fetch(EGRESS_IP_URL, { signal: AbortSignal.timeout(EGRESS_IP_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim();
    if (!IP_ADDRESS.test(text)) {
      throw new Error(`unexpected response ${JSON.stringify(text.slice(0, 40))}`);
    }
    console.log(`[egress-ip] ${text}`);
  } catch (err) {
    const cause = describeFetchError(err);
    console.warn(
      `[egress-ip] lookup failed: ${err instanceof Error ? err.message : String(err)}${cause ? ` (${cause})` : ''}`,
    );
  }
}
