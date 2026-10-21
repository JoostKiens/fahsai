import { useQuery } from '@tanstack/react-query';
import type { WindReading } from '@thailand-aq/types';
import { useTimeStore } from '@/store/timeStore';
import { staleTimeForArray } from '@/utils/queryHelpers';
import { apiUrl, isNoData } from '@/lib/api';

export function useWind() {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const latestDateResolved = useTimeStore((s) => s.latestDateResolved);
  return useQuery({
    queryKey: ['weather-wind', selectedDate],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/weather/wind?date=${selectedDate}`));
      if (await isNoData(res)) return [];
      if (!res.ok) throw new Error(`wind fetch failed: ${res.status}`);
      return ((await res.json()) as { data: WindReading[] }).data;
    },
    staleTime: staleTimeForArray,
    enabled: latestDateResolved,
  });
}
