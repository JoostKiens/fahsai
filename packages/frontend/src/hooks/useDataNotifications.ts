import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useFires } from './useFires';
import { useAQI } from './useAQI';
import { useWind } from './useWind';
import { useCamsGrid } from './useCamsGrid';
import { useTimeStore, selectIsSettled } from '../store/timeStore';

type ToastId = string | number;

export function useDataNotifications() {
  const isSettled = useTimeStore(selectIsSettled);
  const fires = useFires();
  const aqi = useAQI();
  const wind = useWind();
  const cams = useCamsGrid();

  const firesId = useRef<ToastId | null>(null);
  const stationId = useRef<ToastId | null>(null);
  const windId = useRef<ToastId | null>(null);
  const camsId = useRef<ToastId | null>(null);

  const selectedDate = useTimeStore((s) => s.selectedDate);

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
    if (windId.current !== null) {
      toast.dismiss(windId.current);
      windId.current = null;
    }
    if (camsId.current !== null) {
      toast.dismiss(camsId.current);
      camsId.current = null;
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!isSettled || !fires.isSuccess || firesId.current !== null) return;
    if (fires.data.length === 0) {
      firesId.current = toast('No fire detections for this date', { duration: Infinity });
    }
  }, [isSettled, fires.isSuccess, fires.data]);

  useEffect(() => {
    if (!isSettled || !aqi.isSuccess || stationId.current !== null) return;
    if (aqi.data.length === 0) {
      stationId.current = toast('No station readings for this date', { duration: Infinity });
    }
  }, [isSettled, aqi.isSuccess, aqi.data]);

  useEffect(() => {
    if (!isSettled || !wind.isSuccess || windId.current !== null) return;
    if (wind.data.length === 0) {
      windId.current = toast('No wind data for this date', { duration: Infinity });
    }
  }, [isSettled, wind.isSuccess, wind.data]);

  useEffect(() => {
    if (!isSettled || !cams.isSuccess || camsId.current !== null) return;
    if (cams.data.length === 0) {
      camsId.current = toast('No PM2.5 model data for this date', { duration: Infinity });
    }
  }, [isSettled, cams.isSuccess, cams.data]);
}
