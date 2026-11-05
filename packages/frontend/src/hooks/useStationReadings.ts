import { useQuery } from '@tanstack/react-query';
import { useTimeStore } from '@/store/timeStore';
import { staleTimeForArray } from '@/utils/queryHelpers';
import { fetchApiData } from '@/lib/api';

export interface LatestMeasurement {
  stationId: string;
  stationName: string;
  lat: number;
  lng: number;
  country: string | null;
  provider: string | null;
  value: number;
  measuredAt: string;
}

export function fetchStationReadings(date: string): Promise<LatestMeasurement[]> {
  return fetchApiData<LatestMeasurement[]>(`/station-readings/latest?date=${date}`, 'aqi', []);
}

interface Options {
  /** A day of its own, for a page without the map; the map's selected day by default */
  date?: string;
  /** Whether to read at all; by default once the map has the latest date */
  enabled?: boolean;
}

export function useStationReadings({ date, enabled }: Options = {}) {
  const storeDate = useTimeStore((s) => s.selectedDate);
  const latestDateResolved = useTimeStore((s) => s.latestDateResolved);
  const selectedDate = date ?? storeDate;
  return useQuery({
    queryKey: ['aqi-latest', 'pm25', selectedDate],
    queryFn: () => fetchStationReadings(selectedDate),
    staleTime: staleTimeForArray,
    enabled: enabled ?? latestDateResolved,
  });
}
