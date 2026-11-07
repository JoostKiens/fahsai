import net from 'node:net';

// Node gives each address 250 ms to connect before it tries the next one. When the next one fails
// at once, the request fails with every error at that point. Railway has no IPv6 route, so a
// slow IPv4 handshake followed by an instant IPv6 `ENETUNREACH` gives exactly what the CAMS runs
// of 6 and 7 Nov logged: `connect ETIMEDOUT <ipv4>; connect ENETUNREACH <ipv6>` after 252 to
// 271 ms (JOO-136). Reproduced locally with a dead first address. That the Singapore-to-Europe
// handshake is slow is not proven. 2 s also covers one SYN retransmit (1 s). A healthy first
// address is unaffected.
const CONNECT_ATTEMPT_TIMEOUT_MS = 2_000;

export function allowSlowConnects(): void {
  net.setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT_MS);
}
