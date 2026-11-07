import net from 'node:net';

// Node gives each address 250 ms to connect before it tries the next one. Railway has no IPv6
// route, so a slow IPv4 handshake followed by an instant IPv6 failure fails the whole request.
// 2 s also covers one SYN retransmit (1 s). A healthy first address is unaffected. See JOO-136.
const CONNECT_ATTEMPT_TIMEOUT_MS = 2_000;

export function allowSlowConnects(): void {
  net.setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT_MS);
}
