import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTimeStore } from '@/store/timeStore';
import { fetchFires } from '@/hooks/useFires';
import { fetchStationReadings } from '@/hooks/useStationReadings';
import { fetchCamsGrid } from '@/hooks/useCamsGrid';
import { fetchWind } from '@/hooks/useWind';
import { BACKGROUND_QUERY_META } from '@/lib/queryErrors';
import { staleTimeForArray } from '@/utils/queryHelpers';

function shiftDate(date: string, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function usePrefetchAdjacentDates() {
  const queryClient = useQueryClient();
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const latestDate = useTimeStore((s) => s.latestDate);
  const latestDateResolved = useTimeStore((s) => s.latestDateResolved);

  useEffect(() => {
    if (!latestDateResolved) return;
    for (const offset of [-1, 1]) {
      const date = shiftDate(selectedDate, offset);
      if (date > latestDate) continue;

      void queryClient.prefetchQuery({
        queryKey: ['fires', date],
        queryFn: () => fetchFires(date),
        staleTime: staleTimeForArray,
        meta: BACKGROUND_QUERY_META,
      });

      void queryClient.prefetchQuery({
        queryKey: ['aqi-latest', 'pm25', date],
        queryFn: () => fetchStationReadings(date),
        staleTime: staleTimeForArray,
        meta: BACKGROUND_QUERY_META,
      });

      void queryClient.prefetchQuery({
        queryKey: ['cams-grid', date],
        queryFn: () => fetchCamsGrid(date),
        staleTime: Infinity,
        meta: BACKGROUND_QUERY_META,
      });

      void queryClient.prefetchQuery({
        queryKey: ['weather-wind', date],
        queryFn: () => fetchWind(date),
        staleTime: Infinity,
        meta: BACKGROUND_QUERY_META,
      });
    }
  }, [queryClient, selectedDate, latestDate, latestDateResolved]);
}
