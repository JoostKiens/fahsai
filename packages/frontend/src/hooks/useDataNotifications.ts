import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useFires } from './useFires';
import { useAQI } from './useAQI';
import { useWind } from './useWind';
import { useCamsGrid } from './useCamsGrid';
import { useLatestDate } from './useLatestDate';
import { useTimeStore } from '../store/timeStore';

type ToastId = string | number;

export function useDataNotifications() {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const { data: latestDate } = useLatestDate();
  const fires = useFires();
  const aqi = useAQI();
  const wind = useWind();
  const cams = useCamsGrid();

  const firesId = useRef<ToastId | null>(null);
  const stationId = useRef<ToastId | null>(null);
  const atmosphericId = useRef<ToastId | null>(null);

  // True once the scrubber has settled: selectedDate is within the valid range anchored to latestDate.
  // While selectedDate > latestDate the 300ms debounce is still in-flight and queries are fetching
  // for the wrong date — suppress toasts until the date stabilises.
  const isSettled = !!latestDate && selectedDate <= latestDate;

  // Dismiss all active gap toasts when the date changes
  useEffect(() => {
    if (firesId.current !== null) {
      toast.dismiss(firesId.current);
      firesId.current = null;
    }
    if (stationId.current !== null) {
      toast.dismiss(stationId.current);
      stationId.current = null;
    }
    if (atmosphericId.current !== null) {
      toast.dismiss(atmosphericId.current);
      atmosphericId.current = null;
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!isSettled || !fires.isSuccess || firesId.current !== null) return;
    if (fires.data.length === 0) {
      firesId.current = toast('No fire detections for this date', {
        description: 'Cloud cover likely blocked the satellite view.',
        duration: Infinity,
      });
    }
  }, [isSettled, fires.isSuccess, fires.data]);

  useEffect(() => {
    if (!isSettled || !aqi.isSuccess || stationId.current !== null) return;
    if (aqi.data.length === 0) {
      stationId.current = toast('No station readings for this date', {
        description: 'Monitoring stations may not have submitted data yet.',
        duration: Infinity,
      });
    }
  }, [isSettled, aqi.isSuccess, aqi.data]);

  useEffect(() => {
    if (!isSettled || !wind.isSuccess || !cams.isSuccess || atmosphericId.current !== null) return;
    if (wind.data.length === 0 && cams.data.length === 0) {
      atmosphericId.current = toast('No atmospheric data for this date', {
        description: "Wind and PM2.5 model data hasn't been ingested for this date yet.",
        duration: Infinity,
      });
    }
  }, [isSettled, wind.isSuccess, wind.data, cams.isSuccess, cams.data]);
}
