import { useQuery } from '@tanstack/react-query';
import { useTimeStore } from '@/store/timeStore';
import type { PM25GridColumns, PM25GridPoint } from '@thailand-aq/types';
import { staleTimeForArray } from '@/utils/queryHelpers';
import { parseCamsGridResponse } from '@/utils/camsColumns';
import { apiUrl, isNoData } from '@/lib/api';

export function useCamsGrid() {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const latestDateResolved = useTimeStore((s) => s.latestDateResolved);
  return useQuery({
    queryKey: ['cams-grid', selectedDate],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/cams?date=${selectedDate}`));
      if (await isNoData(res)) return [];
      if (!res.ok) throw new Error(`cams grid fetch failed: ${res.status}`);
      const { data } = (await res.json()) as { data: PM25GridColumns | PM25GridPoint[] };
      return parseCamsGridResponse(data);
    },
    staleTime: staleTimeForArray,
    enabled: latestDateResolved,
  });
}
