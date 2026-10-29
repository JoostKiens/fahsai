import { useQuery } from '@tanstack/react-query';
import { useTimeStore } from '@/store/timeStore';
import type { FirePoint } from '@thailand-aq/types';
import { staleTimeForArray } from '@/utils/queryHelpers';
import { fetchApiData } from '@/lib/api';

export function fetchFires(date: string): Promise<FirePoint[]> {
  return fetchApiData<FirePoint[]>(`/fires?date=${date}`, 'fires', []);
}

export function useFires() {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const latestDateResolved = useTimeStore((s) => s.latestDateResolved);
  return useQuery({
    queryKey: ['fires', selectedDate],
    queryFn: () => fetchFires(selectedDate),
    staleTime: staleTimeForArray,
    enabled: latestDateResolved,
  });
}
