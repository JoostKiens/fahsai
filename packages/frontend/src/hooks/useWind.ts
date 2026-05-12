import { useQuery } from '@tanstack/react-query';
import type { WeatherReading } from '@thailand-aq/types';
import { useTimeStore } from '../store/timeStore';

const API = import.meta.env.VITE_API_BASE_URL;

export function useWind() {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  return useQuery({
    queryKey: ['weather', selectedDate],
    queryFn: async () => {
      const res = await fetch(`${API}/api/weather?date=${selectedDate}`);
      if (!res.ok) throw new Error(`weather fetch failed: ${res.status}`);
      return ((await res.json()) as { data: WeatherReading[] }).data;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24h — matches daily cron cadence
  });
}
