import { useQuery } from '@tanstack/react-query';
import type { WindReading } from '@thailand-aq/types';
import { useTimeStore } from '@/store/timeStore';
import { staleTimeForArray } from '@/utils/queryHelpers';
import { fetchApiData } from '@/lib/api';

export function fetchWind(date: string): Promise<WindReading[]> {
  return fetchApiData<WindReading[]>(`/weather/wind?date=${date}`, 'wind', []);
}

export function useWind() {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const latestDateResolved = useTimeStore((s) => s.latestDateResolved);
  return useQuery({
    queryKey: ['weather-wind', selectedDate],
    queryFn: () => fetchWind(selectedDate),
    staleTime: staleTimeForArray,
    enabled: latestDateResolved,
  });
}
