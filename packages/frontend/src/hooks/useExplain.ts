import { useState, useCallback, useRef } from 'react';
import i18next from 'i18next';

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
  error: 'quota_exceeded' | 'unavailable' | null;
  quotaExceeded: boolean;
}

const INITIAL: ExplainState = {
  text: '',
  loading: false,
  phase: null,
  error: null,
  quotaExceeded: false,
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

    setState({ text: '', loading: true, phase: 'fetching', error: null, quotaExceeded: false });

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
      setState({
        text: '',
        loading: false,
        phase: null,
        error: 'unavailable',
        quotaExceeded: false,
      });
      return;
    }

    if (res.status === 429) {
      setState({
        text: '',
        loading: false,
        phase: null,
        error: 'quota_exceeded',
        quotaExceeded: true,
      });
      return;
    }
    if (!res.ok) {
      setState({
        text: '',
        loading: false,
        phase: null,
        error: 'unavailable',
        quotaExceeded: false,
      });
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      setState({
        text: '',
        loading: false,
        phase: null,
        error: 'unavailable',
        quotaExceeded: false,
      });
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

        const hasError = accumulated.includes('[ERROR:');
        setState({
          text: accumulated,
          loading: !hasError,
          phase: hasError ? null : 'thinking',
          error: hasError ? 'unavailable' : null,
          quotaExceeded: false,
        });
        if (hasError) break;
      }
    } finally {
      if (!signal.aborted) {
        setState((prev) => ({ ...prev, loading: false, phase: null }));
      }
    }
  }, []);

  return { ...state, explain, reset };
}
