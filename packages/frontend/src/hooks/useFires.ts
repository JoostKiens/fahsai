import { useQuery } from '@tanstack/react-query';
import { useTimeStore } from '@/store/timeStore';
import type { FirePoint } from '@thailand-aq/types';
import { staleTimeForArray } from '@/utils/queryHelpers';
import { apiUrl, isNoData } from '@/lib/api';

export function useFires() {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const latestDateResolved = useTimeStore((s) => s.latestDateResolved);
  return useQuery({
    queryKey: ['fires', selectedDate],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/fires?date=${selectedDate}`));
      if (await isNoData(res)) return [];
      if (!res.ok) throw new Error(`fires fetch failed: ${res.status}`);
      return ((await res.json()) as { data: FirePoint[] }).data;
    },
    staleTime: staleTimeForArray,
    enabled: latestDateResolved,
  });
}
