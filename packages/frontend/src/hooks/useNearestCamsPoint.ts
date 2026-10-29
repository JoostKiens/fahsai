import { useQuery } from '@tanstack/react-query';
import type { PM25GridPoint } from '@thailand-aq/types';
import { staleTimeForNullable } from '@/utils/queryHelpers';
import { fetchApiData } from '@/lib/api';

export function useNearestCamsPoint(date: string, lat: number | null, lng: number | null) {
  return useQuery({
    queryKey: ['cams-nearest', date, lat, lng],
    queryFn: () =>
      fetchApiData<PM25GridPoint | null>(
        `/cams/nearest?date=${date}&lat=${lat}&lng=${lng}`,
        'cams nearest',
        null,
      ),
    staleTime: staleTimeForNullable,
    enabled: lat !== null && lng !== null,
  });
}
