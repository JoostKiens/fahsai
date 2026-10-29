import { useQuery } from '@tanstack/react-query';
import type { PowerPlantCollection } from '@thailand-aq/types';
import { fetchJson } from '@/lib/api';

export function usePowerPlants(enabled: boolean) {
  return useQuery({
    queryKey: ['power-plants'],
    queryFn: () => fetchJson<PowerPlantCollection>('/power-plants', 'power-plants'),
    staleTime: Infinity, // static dataset, never changes
    enabled,
  });
}
