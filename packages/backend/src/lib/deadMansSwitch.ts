const PING_TIMEOUT_MS = 10_000;

// Dead-man's switch for the pipeline-health job (Healthchecks.io): a missing ping alerts, which
// catches what the job can't report itself, such as Railway not running anything. /fail alerts at
// once, independently of Rollbar. A failed ping is only logged: the missing ping is the alert.
// No imports on purpose: the job's error path must reach this even when the DB client can't load.
export async function pingDeadMansSwitch({
  pingUrl,
  hasFailed,
}: {
  pingUrl: string;
  hasFailed: boolean;
}): Promise<void> {
  try {
    await fetch(hasFailed ? `${pingUrl}/fail` : pingUrl, {
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[pipeline-health] dead-man's-switch ping failed", err);
  }
}
