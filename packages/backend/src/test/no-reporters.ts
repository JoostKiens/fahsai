import type { ErrorReporters } from '../lib/error-handler.js';

// For route tests that need the central error handler but not Rollbar.
export const noReporters: ErrorReporters = {
  reportError: () => undefined,
  reportWarning: () => undefined,
};
