import { useQuery } from '@tanstack/react-query';
import { useTimeStore } from '../store/timeStore';
import type { FirePoint } from '@thailand-aq/types';
import { staleTimeForArray } from '../utils/queryHelpers';

const API = import.meta.env.VITE_API_BASE_URL;

export function useFires() {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  return useQuery({
    queryKey: ['fires', selectedDate],
    queryFn: async () => {
      const res = await fetch(`${API}/api/fires?date=${selectedDate}`);
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`fires fetch failed: ${res.status}`);
      return ((await res.json()) as { data: FirePoint[] }).data;
    },
    staleTime: staleTimeForArray,
  });
}
