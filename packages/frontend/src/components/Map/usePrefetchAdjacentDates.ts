import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FirePoint, WindReading, PM25GridColumns, PM25GridPoint } from '@thailand-aq/types';
import { useTimeStore } from '@/store/timeStore';
import type { LatestMeasurement } from '@/hooks';
import { staleTimeForArray } from '@/utils/queryHelpers';
import { parseCamsGridResponse } from '@/utils/camsColumns';
import { apiUrl, isNoData } from '@/lib/api';

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
        queryFn: async () => {
          const res = await fetch(apiUrl(`/fires?date=${date}`));
          if (await isNoData(res)) return [];
          if (!res.ok) throw new Error(`fires fetch failed: ${res.status}`);
          return ((await res.json()) as { data: FirePoint[] }).data;
        },
        staleTime: staleTimeForArray,
      });

      void queryClient.prefetchQuery({
        queryKey: ['aqi-latest', 'pm25', date],
        queryFn: async () => {
          const res = await fetch(apiUrl(`/station-readings/latest?date=${date}`));
          if (await isNoData(res)) return [];
          if (!res.ok) throw new Error(`aqi fetch failed: ${res.status}`);
          return ((await res.json()) as { data: LatestMeasurement[] }).data;
        },
        staleTime: staleTimeForArray,
      });

      void queryClient.prefetchQuery({
        queryKey: ['cams-grid', date],
        queryFn: async () => {
          const res = await fetch(apiUrl(`/cams?date=${date}`));
          if (await isNoData(res)) return [];
          if (!res.ok) throw new Error(`cams grid fetch failed: ${res.status}`);
          const { data } = (await res.json()) as { data: PM25GridColumns | PM25GridPoint[] };
          return parseCamsGridResponse(data);
        },
        staleTime: Infinity,
      });

      void queryClient.prefetchQuery({
        queryKey: ['weather-wind', date],
        queryFn: async () => {
          const res = await fetch(apiUrl(`/weather/wind?date=${date}`));
          if (!res.ok) throw new Error(`wind fetch failed: ${res.status}`);
          return ((await res.json()) as { data: WindReading[] }).data;
        },
        staleTime: Infinity,
      });
    }
  }, [queryClient, selectedDate, latestDate, latestDateResolved]);
}
