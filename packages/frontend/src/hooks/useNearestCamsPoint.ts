import { useQuery } from '@tanstack/react-query';
import type { PM25GridPoint } from '@thailand-aq/types';
import { staleTimeForNullable } from '@/utils/queryHelpers';
import { apiUrl, isNoData } from '@/lib/api';

export function useNearestCamsPoint(date: string, lat: number | null, lng: number | null) {
  return useQuery({
    queryKey: ['cams-nearest', date, lat, lng],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/cams/nearest?date=${date}&lat=${lat}&lng=${lng}`));
      if (await isNoData(res)) return null;
      if (!res.ok) throw new Error(`cams nearest fetch failed: ${res.status}`);
      return ((await res.json()) as { data: PM25GridPoint }).data;
    },
    staleTime: staleTimeForNullable,
    enabled: lat !== null && lng !== null,
  });
}
