import { useState, useCallback, useRef } from 'react';
import i18next from 'i18next';
import type { RateLimit } from '@thailand-aq/types';
import {
  parseApiError,
  parseStreamError,
  toRateLimit,
  withoutStreamError,
} from './utils.api-error';

const API = import.meta.env.VITE_API_BASE_URL;

interface ExplainOptions {
  stationId: string;
  lat: number;
  lng: number;
  date: string; // YYYY-MM-DD in BKK timezone — anchors the fire/peer/measurement windows
}

interface ExplainState {
  text: string;
  loading: boolean;
  phase: 'fetching' | 'thinking' | null;
  error: 'unavailable' | null;
  rateLimit: RateLimit | null;
}

const INITIAL: ExplainState = {
  text: '',
  loading: false,
  phase: null,
  error: null,
  rateLimit: null,
};

export function useExplain() {
  const [state, setState] = useState<ExplainState>(INITIAL);
  const controllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setState(INITIAL);
  }, []);

  const explain = useCallback(async ({ stationId, lat, lng, date }: ExplainOptions) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;

    setState({ text: '', loading: true, phase: 'fetching', error: null, rateLimit: null });

    let res: Response;
    try {
      res = await fetch(`${API}/api/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, lat, lng, date, lang: i18next.language }),
        signal,
      });
    } catch {
      if (signal.aborted) return;
      setState({ text: '', loading: false, phase: null, error: 'unavailable', rateLimit: null });
      return;
    }

    if (res.status === 429) {
      const error = parseApiError(await res.json().catch(() => null));
      setState({
        text: '',
        loading: false,
        phase: null,
        error: null,
        rateLimit: toRateLimit(error, Date.now()),
      });
      return;
    }
    if (!res.ok) {
      setState({ text: '', loading: false, phase: null, error: 'unavailable', rateLimit: null });
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      setState({ text: '', loading: false, phase: null, error: 'unavailable', rateLimit: null });
      return;
    }

    setState((prev) => ({ ...prev, phase: 'thinking' }));

    const decoder = new TextDecoder();
    let accumulated = '';
    let promptStripped = false;

    try {
      while (true) {
        if (signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });

        // Strip and log the debug prompt line emitted as the first chunk
        if (!promptStripped && accumulated.includes('\n')) {
          const nl = accumulated.indexOf('\n');
          const firstLine = accumulated.slice(0, nl);
          if (firstLine.startsWith('__PROMPT__')) {
            try {
              console.log(
                '[Explain prompt]\n',
                JSON.parse(firstLine.slice('__PROMPT__'.length)) as string,
              );
            } catch {}
            accumulated = accumulated.slice(nl + 1);
          }
          promptStripped = true;
        }

        // The error line a failed stream ends with is hidden here and read once the stream is done.
        setState({
          text: withoutStreamError(accumulated),
          loading: true,
          phase: 'thinking',
          error: null,
          rateLimit: null,
        });
      }

      const streamError = parseStreamError(accumulated);
      if (streamError?.code === 'rate_limited') {
        setState({
          text: '',
          loading: false,
          phase: null,
          error: null,
          rateLimit: toRateLimit(streamError, Date.now()),
        });
      } else if (streamError) {
        setState({ text: '', loading: false, phase: null, error: 'unavailable', rateLimit: null });
      }
    } finally {
      if (!signal.aborted) {
        setState((prev) => ({ ...prev, loading: false, phase: null }));
      }
    }
  }, []);

  return { ...state, explain, reset };
}
