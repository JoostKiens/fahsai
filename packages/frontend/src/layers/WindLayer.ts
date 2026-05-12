import { PathLayer } from 'deck.gl';
import type { Layer } from 'deck.gl';
import type { WeatherReading } from '@thailand-aq/types';

const ARROW_COLOR: [number, number, number, number] = [180, 215, 255, 180];
const ARROW_WIDTH = 1.5; // pixels
const CALM_THRESHOLD = 0.5; // km/h — skip effectively-zero winds

// wind_direction_deg is meteorological FROM-direction; add 180° to get travel direction.
function travelRad(d: WeatherReading): number {
  return (((d.wind_direction_deg + 180) % 360) * Math.PI) / 180;
}

function arrowTip(d: WeatherReading): [number, number] {
  const rad = travelRad(d);
  const len = Math.min((d.wind_speed_kmh / 50) * 1.0, 1.2);
  return [d.lng + Math.sin(rad) * len, d.lat + Math.cos(rad) * len];
}

export function createWindLayer(
  data: WeatherReading[],
  opacity: number,
  beforeId?: string,
): Layer[] {
  const active = data.filter((d) => d.wind_speed_kmh >= CALM_THRESHOLD);

  const shared = {
    opacity,
    getColor: ARROW_COLOR,
    widthUnits: 'pixels' as const,
    getWidth: ARROW_WIDTH,
    parameters: { depthCompare: 'always' as const },
    pickable: false,
    ...({ beforeId } as object),
  };

  const shafts = new PathLayer<WeatherReading>({
    id: 'wind-shafts',
    data: active,
    getPath: (d) => [[d.lng, d.lat], arrowTip(d)],
    ...shared,
  });

  const heads = new PathLayer<WeatherReading>({
    id: 'wind-heads',
    data: active,
    getPath: (d) => {
      const rad = travelRad(d);
      const tip = arrowTip(d);
      const headLen = Math.min((d.wind_speed_kmh / 50) * 1.0, 1.2) * 0.35;
      const leftAngle = rad + Math.PI - Math.PI / 6;
      const rightAngle = rad + Math.PI + Math.PI / 6;
      const left: [number, number] = [
        tip[0] + Math.sin(leftAngle) * headLen,
        tip[1] + Math.cos(leftAngle) * headLen,
      ];
      const right: [number, number] = [
        tip[0] + Math.sin(rightAngle) * headLen,
        tip[1] + Math.cos(rightAngle) * headLen,
      ];
      return [left, tip, right];
    },
    ...shared,
  });

  return [shafts, heads];
}
