import i18next from 'i18next';
import { toast } from 'sonner';
import { HttpError } from '@/lib/api';
import { rollbar } from '@/lib/rollbar';

const LOAD_FAILED_TOAST_ID = 'load-failed';
const reportedMessages = new Set<string>();

// For every query that still fails after its retries. Such a failure used to leave nothing behind:
// the map stayed empty with no message. One toast covers all of them, whatever number of queries
// fail together. Rollbar hears about answers the API gave (not a dropped connection), once per
// message per page load, so an outage does not use up its quota.
export function handleQueryError(error: unknown): void {
  toast.error(i18next.t('toast.loadFailed'), { id: LOAD_FAILED_TOAST_ID });
  if (!(error instanceof HttpError) || reportedMessages.has(error.message)) return;
  reportedMessages.add(error.message);
  rollbar?.error(error);
}
