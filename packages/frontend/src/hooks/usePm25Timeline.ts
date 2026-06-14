import { useQuery } from '@tanstack/react-query';
import type { PM25DailySummary } from '@thailand-aq/types';
import { useTimeStore } from '@/store/timeStore';
import { dayToDate, useEffectiveScrubberDays } from '@/store/uiStore';
import { staleTimeForArray } from '@/utils/queryHelpers';

const API = import.meta.env.VITE_API_BASE_URL;

// Daily p95 PM2.5 across the scrubber's date range, used to draw the gradient line chart.
// Returns a Map<date, pm25> for O(1) per-day lookup; the raw array is what
// TanStack caches so staleTimeForArray can treat the historical series as immutable.
export function usePm25Timeline() {
  const latestDate = useTimeStore((s) => s.latestDate);
  const scrubberDays = useEffectiveScrubberDays();
  const start = dayToDate(0, latestDate, scrubberDays);
  const end = latestDate;

  return useQuery({
    queryKey: ['cams-summary', start, end],
    queryFn: async () => {
      const res = await fetch(`${API}/api/cams/summary?start=${start}&end=${end}`, {
        cache: 'no-cache',
      });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`cams summary fetch failed: ${res.status}`);
      return ((await res.json()) as { data: PM25DailySummary[] }).data;
    },
    select: (data) => new Map(data.map((d) => [d.date, d.pm25])),
    staleTime: staleTimeForArray,
  });
}
